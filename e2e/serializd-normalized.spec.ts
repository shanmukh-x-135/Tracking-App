import { expect, test } from "@playwright/test";
import { parseSerializdNormalizedJson } from "../src/lib/imports/serializd-normalized-parser";
import { resolveSerializdRecords } from "../src/lib/imports/serializd-resolution";
import { previewCounts } from "../src/lib/imports/reconciliation";
import type { CatalogSeries } from "../src/lib/media/types";

const date = "2020-01-02T03:04:05Z";
const source = {
  schema: "mosaic.serializd.normalized-export", schema_version: 1, generated_at_utc: date, source: {}, profile: { country_code: "IN", favorite_shows: [] }, summary: {}, validation_targets: {},
  shows: [{ tmdb_id: 100, title: null, favorite: false, status: { watched_any: true, watchlisted: true, currently_watching: false, paused: false, dropped: false, finished: null }, status_dates: { currently_watching_added_at: null, paused_added_at: null, dropped_added_at: null }, watched_season_ids: [200], watchlist_season_ids: [], stats: { episodes_counted: null, time_spent_minutes: null } }],
  season_states: [{ tmdb_show_id: 100, show_title: null, tmdb_season_id: 200, season_number: null, state: "watched", date_added: date }],
  events: [1, 2].map((id) => ({ source_record_id: id, target_type: "episode", tmdb_show_id: 100, show_title: null, tmdb_season_id: 200, season_number: null, episode_number: 1, created_at: "2025-01-01T00:00:00Z", occurred_at: date, rating_serializd_10: 9, rating_mosaic_5: 4.5, liked: true, review_text: null, contains_spoiler: false, is_rewatch: id === 2, is_log: true, tags: [], default_import: true, duplicate_group_id: null })),
  duplicate_groups: [], lists: { owned: [], liked: [], collaborative: [], pinned: [] }, social_snapshot: {}, import_guidance: {},
};
const media: CatalogSeries = { provider: "tmdb", providerId: "100", mediaType: "tv", title: "Synthetic normalized series", genres: [], seasons: [{ providerId: "200", seasonNumber: 1 }] };

test("normalized JSON recognition, explicit favorites, refresh, historical rewatches and undo", async ({ page, request }) => {
  const invalid = await request.post("/api/me/imports/preview", { headers: { "x-import-source": "serializd_normalized_v1", "x-file-name": "invalid.json", "content-type": "application/json" }, data: { ...source, schema_version: 99 } });
  expect(invalid.status()).toBe(422);
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/signup");
  await page.getByLabel("Display name").fill("Synthetic Import Tester");
  await page.getByLabel("Email").fill("synthetic-import@example.com");
  await page.getByLabel("Password").fill("storykeeper");
  await page.getByRole("button", { name: "Create account" }).click();
  // Provider transport is deterministic; parser, resolver and storage remain real.
  await page.route("**/api/me/imports/preview", async (route) => {
    const parsed = parseSerializdNormalizedJson(Buffer.from(route.request().postData() ?? ""));
    const rows = await resolveSerializdRecords(parsed.records, { show: async () => media, episodes: async () => [{ id: "300", seasonNumber: 1, episodeNumber: 1, title: "Synthetic pilot" }] });
    await route.fulfill({ json: { source: "serializd_normalized_v1", filename: "synthetic.json", rows, counts: previewCounts(rows), errors: parsed.errors, warnings: parsed.warnings, normalizedSummary: parsed.normalizedSummary } });
  });
  await page.goto("/settings/data");
  await page.getByRole("button", { name: /Serializd JSON/ }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "synthetic.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(source)) });
  await page.getByRole("button", { name: "Preview import" }).click();
  await expect(page.getByRole("heading", { name: "Recognized: Mosaic Serializd Normalized Export v1" })).toBeVisible();
  await page.getByLabel("Import explicit show favorites (never event likes)").uncheck();
  for (const width of [1440, 1280, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: `artifacts/serializd-preview-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.reload();
  await page.getByRole("button", { name: "Import selected records" }).click();
  await expect(page.getByRole("heading", { name: "Your history is home." })).toBeVisible();
  await page.goto("/activity");
  await expect(page.getByText("Synthetic normalized series").first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("Rewatched S01E01", { exact: false })).toBeVisible();
  await page.goto("/settings/data");
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByText("undone", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
