import assert from "node:assert/strict";
import test from "node:test";
import Module from "node:module";
import { applyMutation } from "../src/lib/persistence/domain";
import { emptyMosaicState } from "../src/lib/persistence/types";
import { persistenceMutationSchema } from "../src/lib/persistence/validation";
import type { CatalogMovie, CatalogSeries } from "../src/lib/media/types";

const movie: CatalogMovie = { provider: "mock", providerId: "keep", mediaType: "movie", title: "Keep", genres: [] };
const series: CatalogSeries = { provider: "mock", providerId: "show", mediaType: "tv", title: "Show", genres: [] };

// "server-only" is resolved by Next's bundler; map it to Next's empty stub so Node can load the live module.
const moduleWithResolver = Module as unknown as { _resolveFilename(request: string, ...rest: unknown[]): string };
const resolve = moduleWithResolver._resolveFilename;
moduleWithResolver._resolveFilename = function (request: string, ...rest: unknown[]) {
  return resolve.call(this, request === "server-only" ? "next/dist/compiled/server-only/empty.js" : request, ...rest);
};
const loadLive = () => import("../src/lib/persistence/supabase-state");

/** Records every Supabase call the live persistence layer makes. */
function recordingClient() {
  const calls: { table: string; op: string; args: unknown[] }[] = [];
  const builder = (table: string) => {
    const chain: Record<string, unknown> = {};
    const record = (op: string) => (...args: unknown[]) => { calls.push({ table, op, args }); return chain; };
    for (const op of ["select", "eq", "order", "insert", "delete"]) chain[op] = record(op);
    chain.upsert = record("upsert");
    chain.maybeSingle = async () => ({ data: table === "media_items" ? { id: "media-1" } : null, error: null });
    chain.single = async () => ({ data: { id: "media-1" }, error: null });
    chain.then = (resolve: (value: { error: null }) => unknown) => resolve({ error: null });
    return chain;
  };
  return { calls, client: { from: (table: string) => builder(table) } };
}

test("live library.upsert leaves is_favorite untouched unless it is explicitly set", async () => {
  const { applySupabaseMutation } = await loadLive();
  const { calls, client } = recordingClient();
  await applySupabaseMutation(client as never, "user-1", { type: "library.upsert", media: movie, status: "watched" });
  const upsert = calls.find((call) => call.table === "library_entries" && call.op === "upsert")!;
  assert.deepEqual(upsert.args[0], { user_id: "user-1", media_id: "media-1", status: "watched" });
  assert.deepEqual(upsert.args[1], { onConflict: "user_id,media_id" });

  const explicit = recordingClient();
  await applySupabaseMutation(explicit.client as never, "user-1", { type: "library.upsert", media: movie, status: "watched", isFavorite: false });
  assert.equal((explicit.calls.find((call) => call.op === "upsert")!.args[0] as { is_favorite?: boolean }).is_favorite, false);
});

test("add-if-untracked never overwrites a tracked entry, while explicit upserts still do", async () => {
  // Live: the add becomes ON CONFLICT DO NOTHING; owner and status validation are unchanged.
  const { applySupabaseMutation } = await loadLive();
  const { calls, client } = recordingClient();
  await applySupabaseMutation(client as never, "user-1", { type: "library.upsert", media: movie, status: "watchlist", onlyIfUntracked: true });
  const upsert = calls.find((call) => call.table === "library_entries" && call.op === "upsert")!;
  assert.deepEqual(upsert.args[0], { user_id: "user-1", media_id: "media-1", status: "watchlist" });
  assert.deepEqual(upsert.args[1], { onConflict: "user_id,media_id", ignoreDuplicates: true });
  await assert.rejects(applySupabaseMutation(recordingClient().client as never, "user-1", { type: "library.upsert", media: movie, status: "backlog", onlyIfUntracked: true }), /does not apply/);

  // Mock: same semantics through the shared domain reducer.
  let state = applyMutation(emptyMosaicState(), { type: "library.upsert", media: movie, status: "watched", isFavorite: true }, "2026-09-01T00:00:00.000Z");
  state = applyMutation(state, { type: "library.upsert", media: movie, status: "watchlist", onlyIfUntracked: true });
  assert.deepEqual(state.library.map(({ status, isFavorite, updatedAt }) => [status, isFavorite, updatedAt]), [["watched", true, "2026-09-01T00:00:00.000Z"]]);
  state = applyMutation(state, { type: "library.upsert", media: series, status: "watchlist", onlyIfUntracked: true });
  assert.equal(state.library.length, 2);
  state = applyMutation(state, { type: "library.upsert", media: movie, status: "watchlist" });
  assert.equal(state.library.find((entry) => entry.media.providerId === "keep")!.status, "watchlist");

  // The server schema keeps the flag instead of stripping it.
  const parsed = persistenceMutationSchema.parse({ type: "library.upsert", media: movie, status: "watchlist", onlyIfUntracked: true });
  assert.equal((parsed as { onlyIfUntracked?: boolean }).onlyIfUntracked, true);
});

test("live library.remove deletes only the caller's library row, never history", async () => {
  const { applySupabaseMutation } = await loadLive();
  const { calls, client } = recordingClient();
  await applySupabaseMutation(client as never, "user-1", { type: "library.remove", media: movie });
  const touched = calls.filter((call) => call.op === "delete").map((call) => call.table);
  assert.deepEqual(touched, ["library_entries"]);
  const filters = calls.filter((call) => call.table === "library_entries" && call.op === "eq").map((call) => call.args);
  assert.deepEqual(filters, [["user_id", "user-1"], ["media_id", "media-1"]]);
});

test("mock persistence keeps the favourite and history in the same situations", () => {
  let state = emptyMosaicState();
  state = applyMutation(state, { type: "library.upsert", media: series, status: "completed", isFavorite: true });
  state = applyMutation(state, { type: "episode.log", series, seasonNumber: 1, episodeNumber: 1, watchedAt: "2026-09-01T00:00:00.000Z" });
  state = applyMutation(state, { type: "library.upsert", media: series, status: "paused" });
  assert.equal(state.library[0].isFavorite, true);
  assert.equal(state.library[0].status, "paused");
  state = applyMutation(state, { type: "movie.log", media: movie, watchedAt: "2026-09-02", isRewatch: false });
  state = applyMutation(state, { type: "library.remove", media: movie });
  state = applyMutation(state, { type: "library.remove", media: series });
  assert.equal(state.library.length, 0);
  assert.equal(state.movieWatches.length, 1);
  assert.equal(state.episodeWatches.length, 1);
});
