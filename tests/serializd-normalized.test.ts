import assert from "node:assert/strict";
import test from "node:test";
import { parseSerializdNormalizedJson } from "@/lib/imports/serializd-normalized-parser";
import { resolveSerializdRecords } from "@/lib/imports/serializd-resolution";
import { applySerializdMockRecord } from "@/lib/imports/apply-serializd-mock";
import { emptyMosaicState } from "@/lib/persistence/types";
import type { CatalogSeries } from "@/lib/media/types";

const date = "2020-01-02T03:04:05Z";
const media: CatalogSeries = { provider: "tmdb", providerId: "100", mediaType: "tv", title: "Synthetic series", genres: [], seasons: [{ providerId: "200", seasonNumber: 1 }] };
function fixture() {
  return {
    schema: "mosaic.serializd.normalized-export", schema_version: 1, generated_at_utc: date,
    source: {}, profile: { country_code: "IN", favorite_shows: [] }, summary: {}, validation_targets: {},
    shows: [{ tmdb_id: 100, title: null, favorite: false, status: { watched_any: true, watchlisted: true, currently_watching: false, paused: false, dropped: false, finished: null }, status_dates: { currently_watching_added_at: null, paused_added_at: null, dropped_added_at: null }, watched_season_ids: [200], watchlist_season_ids: [], stats: { episodes_counted: null, time_spent_minutes: null } }],
    season_states: [{ tmdb_show_id: 100, show_title: null, tmdb_season_id: 200, season_number: null, state: "watched", date_added: date }],
    events: [1, 2].map((id) => ({ source_record_id: id, target_type: "episode", tmdb_show_id: 100, show_title: null, tmdb_season_id: 200, season_number: null, episode_number: 1, created_at: "2025-01-01T00:00:00Z", occurred_at: date, rating_serializd_10: 9, rating_mosaic_5: 4.5, liked: true, review_text: "A synthetic review", contains_spoiler: true, is_rewatch: id === 2, is_log: true, tags: ["test"], default_import: true, duplicate_group_id: null })),
    duplicate_groups: [], lists: { owned: [], liked: [], collaborative: [], pinned: [] }, social_snapshot: {}, import_guidance: {},
  };
}
function parse(value: unknown) { return parseSerializdNormalizedJson(new TextEncoder().encode(JSON.stringify(value))); }

test("normalized v1 preserves null titles, overlapping facts, historical dates and half-stars", () => {
  const result = parse(fixture());
  assert.deepEqual(result.errors, []);
  assert.equal(result.records.length, 4);
  const show = result.records[0];
  assert.equal(show.mediaType === "tv" && show.isFavorite, false, "event likes are not favorites");
  const season = result.records[1];
  assert.equal(season.mediaType === "tv" && season.seasonState, "completed");
  assert.equal(season.mediaType === "tv" && season.watchedDate, undefined, "date_added is not a watch date");
  assert.equal(result.records[2].rating, 4.5);
  assert.equal(result.records[2].mediaType === "tv" && result.records[2].watchedDate, date);
});

test("normalized timestamp parser preserves explicit UTC and non-UTC offsets", () => {
  for (const timestamp of [date, "2020-01-02T03:04:05+00:00", "2020-01-02T08:34:05+05:30", "2020-01-01T22:04:05-05:00"]) {
    const value = fixture();
    value.generated_at_utc = timestamp;
    value.events[0].occurred_at = timestamp;
    const parsed = parse(value);
    assert.deepEqual(parsed.errors, []);
    const event = parsed.records[2];
    assert.equal(event.mediaType === "tv" && event.watchedDate, timestamp);
    assert.equal(Date.parse(timestamp), Date.parse(date));
  }
  for (const timestamp of ["2020-01-02T03:04:05", "2020-02-30T03:04:05+00:00", "2020-01-02T03:04:05+05:60", "invalid"]) {
    const value = fixture(); value.events[0].occurred_at = timestamp;
    assert.ok(parse(value).errors.length);
  }
});

test("normalized schema rejects wrong versions, invalid ratings, absent IDs and impossible targets", () => {
  const wrongVersion = fixture(); wrongVersion.schema_version = 2;
  assert.ok(parse(wrongVersion).errors.length);
  const wrongRating = fixture(); wrongRating.events[0].rating_mosaic_5 = 4;
  assert.ok(parse(wrongRating).errors.length);
  const wrongTarget = fixture(); wrongTarget.events[0].target_type = "show";
  assert.ok(parse(wrongTarget).errors.length);
  const wrongShow = fixture(); wrongShow.events[0].tmdb_show_id = 999;
  assert.ok(parse(wrongShow).errors.length);
  assert.ok(parseSerializdNormalizedJson(new Uint8Array([255])).errors.length);
  const nested = fixture();
  nested.source = Array.from({ length: 40 }).reduce<Record<string, unknown>>((child) => ({ child }), {});
  assert.match(parse(nested).errors[0].message, /nesting/);
});

test("exact resolver caches provider requests and refuses inconsistent seasons without title fallback", async () => {
  let showCalls = 0; let seasonCalls = 0;
  const parsed = parse(fixture());
  const rows = await resolveSerializdRecords(parsed.records, {
    show: async () => { showCalls++; return media; },
    episodes: async () => { seasonCalls++; return [{ id: "300", seasonNumber: 1, episodeNumber: 1, title: "Synthetic pilot" }]; },
  });
  assert.equal(showCalls, 1); assert.equal(seasonCalls, 1);
  assert.ok(rows.every((row) => row.decision === "accepted"));
  const mismatch = fixture(); mismatch.season_states[0].tmdb_season_id = 999;
  const unmatched = await resolveSerializdRecords(parse(mismatch).records, { show: async () => media, episodes: async () => [] });
  assert.equal(unmatched[1].decision, "review");
});

test("historical rewatches remain distinct and re-import is idempotent without fabricated dates", async () => {
  const rows = await resolveSerializdRecords(parse(fixture()).records, { show: async () => media, episodes: async () => [{ id: "300", seasonNumber: 1, episodeNumber: 1, title: "Synthetic pilot" }] });
  const state = emptyMosaicState();
  for (const row of rows) if (row.record.mediaType === "tv") applySerializdMockRecord(state, row.record, media, "keep_mosaic", "2026-01-01T00:00:00Z");
  assert.equal(state.episodeWatches.length, 2);
  assert.equal(state.episodeWatches.filter((watch) => watch.isRewatch).length, 1);
  assert.equal(state.seasonStates[0].completedOn, undefined);
  for (const row of rows) if (row.record.mediaType === "tv") applySerializdMockRecord(state, row.record, media, "keep_mosaic", "2026-01-01T00:00:00Z");
  assert.equal(state.episodeWatches.length, 2);
  assert.equal(state.episodeWatches[0].rating, 4.5);
  assert.equal(state.episodeWatches[0].containsSpoilers, true);
});

test("canonical duplicate groups skip extras but never suppress a separate explicit rewatch", async () => {
  const value = fixture();
  const grouped = { ...value.events[0], duplicate_group_id: "synthetic-duplicate" };
  const extra = { ...grouped, source_record_id: 3, default_import: false };
  const duplicates = { ...value, events: [grouped, value.events[1], extra], duplicate_groups: [{ duplicate_group_id: "synthetic-duplicate", target: { type: "episode", tmdb_show_id: 100, tmdb_season_id: 200, episode_number: 1 }, canonical_source_record_id: 1, source_record_ids: [1, 3], reason: "Synthetic duplicate" }] };
  const parsed = parse(duplicates);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.duplicateCount, 1);
  const rows = await resolveSerializdRecords(parsed.records, { show: async () => media, episodes: async () => [{ id: "300", seasonNumber: 1, episodeNumber: 1, title: "Synthetic pilot" }] });
  assert.equal(rows.filter((row) => row.decision === "skipped").length, 1);
  assert.equal(rows.filter((row) => row.record.mediaType === "tv" && row.record.isRewatch && row.decision === "accepted").length, 1);
  duplicates.events[2].default_import = true;
  assert.ok(parse(duplicates).errors.length, "contradictory canonical flags are rejected");
});

test("provider outages and missing episodes are reviewable, never fuzzy matches", async () => {
  const parsed = parse(fixture());
  const outage = await resolveSerializdRecords(parsed.records, { show: async () => { throw new Error("Synthetic provider outage"); }, episodes: async () => [] });
  assert.ok(outage.every((row) => row.decision === "review" && !row.selected));
  const missing = await resolveSerializdRecords(parsed.records, { show: async () => media, episodes: async () => [] });
  assert.equal(missing[2].decision, "review");
  assert.equal(missing[0].decision, "accepted");
});
