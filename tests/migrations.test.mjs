import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const core = readFileSync("supabase/migrations/20260912160736_mosaic_core.sql", "utf8");
const tracking = readFileSync("supabase/migrations/20260912160738_mosaic_domain_tracking.sql", "utf8");
const sql = `${core}\n${tracking}`;

const protectedTables = [
  "profiles", "media_items", "library_entries", "ratings", "reviews", "lists", "list_items",
  "movie_watch_logs", "tv_episodes", "episode_watch_logs", "episode_ratings", "game_playthroughs", "book_readings",
];

test("every exposed Mosaic table enables row level security", () => {
  for (const table of protectedTables) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
});

test("write policies derive ownership from auth.uid", () => {
  const writePolicies = sql.match(/create policy[\s\S]*?;/gi) ?? [];
  const ownedWrites = writePolicies.filter((policy) => /for (all|insert|update|delete)/i.test(policy));
  assert.ok(ownedWrites.length > 0);
  for (const policy of ownedWrites) {
    assert.match(policy, /auth\.uid\(\)/i);
  }
});

test("cross-media list ordering and provider identity are constrained", () => {
  assert.match(core, /unique \(provider, media_type, external_id\)/i);
  assert.match(core, /unique \(list_id, position\)/i);
  assert.doesNotMatch(core, /movie_lists|game_lists|book_lists/i);
});
