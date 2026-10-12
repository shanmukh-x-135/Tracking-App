import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { RefTable, RefTextFilter, stripRefTokens } from "../src/lib/assistant/references";
import { capJson, executeTool, toolDefinitions, type ToolContext } from "../src/lib/assistant/tools";
import { assistantFixtureState, fixtureCatalog, injectionTitle } from "./fixtures/assistant-state";

function context(state = assistantFixtureState()) {
  const catalog = fixtureCatalog();
  const ctx: ToolContext = { getState: async () => state, catalog, refs: new RefTable(), now: new Date("2026-10-12T12:00:00.000Z") };
  return { ctx, catalog };
}

async function call(ctx: ToolContext, name: string, args: unknown) {
  const result = await executeTool(ctx, name, JSON.stringify(args));
  return { ...result, data: JSON.parse(result.content) };
}

test("tool definitions are strict objects the model can read", () => {
  const definitions = toolDefinitions();
  assert.deepEqual(definitions.map((tool) => tool.function.name), ["library_query", "continue_items", "title_progress", "activity_query", "ratings_query", "stats_summary", "list_query", "catalog_search", "related_titles"]);
  for (const tool of definitions) {
    assert.equal(tool.function.parameters.type, "object");
    assert.equal(tool.function.parameters.additionalProperties, false, tool.function.name);
    assert.ok(JSON.stringify(tool.function.parameters).length < 1200, `${tool.function.name} schema stays small`);
  }
});

test("library_query returns only the requested status, with the user's own facts as refs", async () => {
  const { ctx } = context();
  const { data, ok } = await call(ctx, "library_query", { status: "watchlist" });
  assert.ok(ok);
  assert.deepEqual(data.items.map((item: { title: string }) => item.title).sort(), ["Glass Orchard", "Low Tide", "Quiet Hours"]);
  const ref = ctx.refs.get(data.items[0].ref)!;
  assert.equal(ref.origin, "your_mosaic");
  assert.equal(ref.facts?.status, "watchlist");
  const favourites = await call(ctx, "library_query", { favoritesOnly: true, mediaType: "game" });
  assert.deepEqual(favourites.data.items.map((item: { title: string }) => item.title), ["Ember Rift"]);
});

test("invalid arguments, unknown tools and bad JSON never execute", async () => {
  const { ctx } = context();
  let loads = 0;
  ctx.getState = async () => { loads += 1; return assistantFixtureState(); };
  for (const [name, args] of [
    ["library_query", JSON.stringify({ limit: 500 })],
    ["library_query", JSON.stringify({ status: "loved" })],
    ["library_query", JSON.stringify({ userId: "someone-else" })],
    ["activity_query", JSON.stringify({ from: "2025-01-01", to: "2026-10-01" })],
    ["activity_query", JSON.stringify({ from: "2026-10-01", to: "2026-09-01" })],
    ["drop_table", "{}"],
    ["ratings_query", "{not json"],
  ] as const) {
    const result = await executeTool(ctx, name, args);
    assert.equal(result.ok, false, `${name} ${args}`);
    assert.ok(JSON.parse(result.content).error);
  }
  assert.equal(loads, 0, "no tool ran");
});

test("ratings are the user's own, never community scores", async () => {
  const { ctx } = context();
  const { data } = await call(ctx, "ratings_query", { mediaType: "movie", order: "highest" });
  assert.deepEqual(data.items.map((item: { title: string; userRating: number }) => [item.title, item.userRating]), [["Night Harbor", 5], ["Paper Moons", 4.5], ["A Dull Thing", 2]]);
  assert.ok(!JSON.stringify(data).includes("communityRating"));
});

test("game progress uses the latest record, reports duplicates and never sums or dates completion", async () => {
  const { ctx } = context();
  const { data } = await call(ctx, "title_progress", { ref: "mock:game:ember-rift" });
  assert.equal(data.playtimeMinutes, 245, "latest record, not 245 + 600");
  assert.equal(data.recordCount, 2);
  assert.equal(data.dateKind, "last_updated");
  assert.equal(data.lastUpdatedOn, "2026-10-01");
  assert.ok(!("completedOn" in data) && !("completed_at" in data));
});

test("contradictory library and playthrough statuses are both reported", async () => {
  const { ctx } = context();
  const { data } = await call(ctx, "title_progress", { ref: "mock:game:hollow-crown" });
  assert.equal(data.libraryStatus, "completed");
  assert.equal(data.playthroughStatus, "playing");
});

test("book progress uses pages; series progress uses dated episode events", async () => {
  const { ctx } = context();
  const bookResult = await call(ctx, "title_progress", { ref: "mock:book:salt-archive" });
  assert.deepEqual([bookResult.data.currentPage, bookResult.data.totalPages, bookResult.data.percent, bookResult.data.recordCount], [96, 304, 32, 1]);
  const seriesResult = await call(ctx, "title_progress", { ref: "mock:tv:northern-line" });
  assert.deepEqual(seriesResult.data.lastLoggedEpisode, { season: 1, episode: 3, title: "Chapter 3", watchedOn: "2026-10-02", dateKind: "event" });
  assert.deepEqual([seriesResult.data.watchedEpisodes, seriesResult.data.totalEpisodes], [3, 8]);
  const untracked = await call(ctx, "title_progress", { ref: "mock:movie:never-seen" });
  assert.equal(untracked.data.tracked, false);
});

test("activity marks game and book records as last-updated, not sessions", async () => {
  const { ctx } = context();
  const { data } = await call(ctx, "activity_query", { from: "2026-09-01", to: "2026-09-30" });
  const kinds = new Map(data.items.map((item: { title: string; dateKind: string }) => [item.title, item.dateKind]));
  assert.equal(kinds.get("Night Harbor"), "event");
  assert.equal(kinds.get("Northern Line"), "event");
  assert.equal(kinds.get("Hollow Crown"), "last_updated");
  assert.ok(!kinds.has("Ember Rift"), "October update is outside September");
  assert.equal(data.counts.movie, 2);
});

test("lists expose titles and items but never notes or descriptions", async () => {
  const { ctx } = context();
  const summary = await call(ctx, "list_query", {});
  assert.deepEqual(summary.data.lists, [{ listId: "l1", title: "Rainy day", visibility: "private", itemCount: 2 }]);
  const detail = await call(ctx, "list_query", { listId: "l1" });
  assert.deepEqual(detail.data.items.map((item: { title: string }) => item.title), ["Glass Orchard", "The Salt Archive"]);
  for (const result of [summary, detail]) assert.ok(!result.content.includes("PRIVATE"), "no note or description text");
  assert.equal((await call(ctx, "list_query", { listId: "l9" })).data.error !== undefined, true);
});

test("no tool output ever includes reviews, notes or descriptions", async () => {
  const { ctx } = context();
  const outputs = await Promise.all([
    call(ctx, "library_query", { limit: 25 }), call(ctx, "activity_query", { limit: 50 }), call(ctx, "title_progress", { ref: "mock:movie:dull-thing" }),
    call(ctx, "catalog_search", { query: "salt" }), call(ctx, "stats_summary", {}), call(ctx, "continue_items", {}),
  ]);
  for (const output of outputs) assert.ok(!/PRIVATE|description/i.test(output.content), output.content.slice(0, 120));
});

test("catalog results are labelled suggestions; tracked titles are recognised; injected text stays data", async () => {
  const { ctx } = context();
  const { data } = await call(ctx, "catalog_search", { query: "tide" });
  const night = data.items.find((item: { title: string }) => item.title === "Night Harbor");
  assert.equal(night.inLibrary, true);
  assert.equal(ctx.refs.get(night.ref)!.origin, "your_mosaic");
  const fresh = data.items.find((item: { title: string }) => item.title === "Tide Line");
  assert.equal(ctx.refs.get(fresh.ref)!.origin, "catalog");
  const injected = data.items.find((item: { title: string }) => item.title === injectionTitle.title);
  assert.equal(ctx.refs.get(injected.ref)!.origin, "catalog", "an instruction in a title is just a title");
});

test("related titles exclude tracked titles and carry a server-written reason and seed", async () => {
  const { ctx, catalog } = context();
  const { data } = await call(ctx, "related_titles", { ref: "mock:movie:night-harbor" });
  assert.deepEqual(data.items.map((item: { title: string }) => item.title), ["Tide Line"], "Paper Moons is tracked; duplicates dropped");
  const ref = ctx.refs.get(data.items[0].ref)!;
  assert.equal(ref.seed, data.seed);
  assert.match(ref.reason!, /Related to Night Harbor on Mosaic sample catalog/);
  assert.deepEqual(catalog.calls, ["related:night-harbor"]);
});

test("a ref id from an earlier tool result resolves for follow-up tools", async () => {
  const { ctx } = context();
  const list = await call(ctx, "library_query", { status: "reading" });
  const progress = await call(ctx, "title_progress", { ref: list.data.items[0].ref });
  assert.equal(progress.data.title, "The Salt Archive");
});

test("results over budget drop list items, never cut JSON", () => {
  const text = capJson({ items: Array.from({ length: 400 }, (_, index) => ({ title: `Title ${index}`, padding: "x".repeat(20) })) }, 2000);
  const parsed = JSON.parse(text);
  assert.ok(text.length <= 2000);
  assert.equal(parsed.truncated, true);
});

test("ref filter keeps known tokens across chunk boundaries and drops invented ones", () => {
  const known = new Set(["r1", "r2"]);
  const filter = new RefTextFilter((id) => known.has(id));
  const out = ["See [", "[r1", "]] and [[r9", "9]] or [[r2]].", " [[unfinished"].map((chunk) => filter.push(chunk)).join("") + filter.flush();
  assert.equal(out, "See [[r1]] and  or [[r2]]. ");
  assert.deepEqual(filter.cited, ["r1", "r2"]);
  assert.equal(stripRefTokens("Watch [[r3]] next"), "Watch  next");
});

test("ref table dedupes by title and upgrades a catalog sighting to the user's record", () => {
  const table = new RefTable();
  const media = assistantFixtureState().library[0].media;
  const first = table.add(media, "catalog", { reason: "x" });
  const second = table.add(media, "your_mosaic", { facts: { status: "watched" } });
  assert.equal(first, second);
  assert.equal(table.get(first)!.origin, "your_mosaic");
  assert.equal(table.get(first)!.reason, undefined);
});

test("the assistant modules cannot write: no mutation code is imported", () => {
  const directory = new URL("../src/lib/assistant/", import.meta.url);
  for (const file of readdirSync(directory)) {
    const source = readFileSync(new URL(file, directory), "utf8");
    assert.ok(!/applySupabaseMutation|applyMutation|applyMosaicMutation|persistence\/gateway|mock-gateway|live-gateway|supabase-state|\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/.test(source), file);
  }
});
