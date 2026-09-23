import { z } from "zod";
import type { ParseResult, SeriesImportRecord } from "@/lib/imports/types";

const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const timestamp = z.iso.datetime({ offset: true });
const title = z.string().max(500).nullable();
const seasonNumber = z.number().int().nonnegative().nullable();
const facts = z.object({ watched_any: z.boolean(), watchlisted: z.boolean(), currently_watching: z.boolean(), paused: z.boolean(), dropped: z.boolean(), finished: z.boolean().nullable() });
const show = z.object({
  tmdb_id: id, title, favorite: z.boolean(), status: facts,
  status_dates: z.object({ currently_watching_added_at: timestamp.nullable(), paused_added_at: timestamp.nullable(), dropped_added_at: timestamp.nullable() }),
  watched_season_ids: z.array(id).max(1000), watchlist_season_ids: z.array(id).max(1000),
  premiere_date: z.iso.date().nullable().optional(), banner_path: z.string().nullable().optional(),
  num_seasons: z.number().int().nonnegative().nullable().optional(), num_episodes: z.number().int().nonnegative().nullable().optional(),
  stats: z.object({ episodes_counted: z.number().int().nonnegative().nullable(), time_spent_minutes: z.number().int().nonnegative().nullable() }),
});
const season = z.object({ tmdb_show_id: id, show_title: title, tmdb_season_id: id, season_number: seasonNumber, state: z.enum(["watched", "watchlist"]), date_added: timestamp.nullable() });
const event = z.object({
  source_record_id: id, target_type: z.enum(["show", "season", "episode"]), tmdb_show_id: id, show_title: title,
  tmdb_season_id: id.nullable(), season_number: seasonNumber, episode_number: z.number().int().positive().nullable(),
  created_at: timestamp, occurred_at: timestamp,
  rating_serializd_10: z.number().int().min(1).max(10).nullable(),
  rating_mosaic_5: z.number().min(0.5).max(5).multipleOf(0.5).nullable(),
  liked: z.boolean(), review_text: z.string().max(10000).nullable(), contains_spoiler: z.boolean(),
  is_rewatch: z.boolean(), is_log: z.boolean(), tags: z.array(z.string().max(200)).max(100),
  default_import: z.boolean(), duplicate_group_id: z.string().min(1).max(200).nullable(),
}).superRefine((value, ctx) => {
  const valid = value.target_type === "show"
    ? value.tmdb_season_id === null && value.season_number === null && value.episode_number === null
    : value.tmdb_season_id !== null && (value.target_type === "episode" ? value.episode_number !== null : value.episode_number === null);
  if (!valid) ctx.addIssue({ code: "custom", message: "Impossible event target combination." });
  if (value.rating_serializd_10 !== null && value.rating_mosaic_5 !== value.rating_serializd_10 / 2) ctx.addIssue({ code: "custom", message: "Source and normalized ratings disagree." });
});
const group = z.object({
  duplicate_group_id: z.string().min(1).max(200),
  target: z.object({ type: z.enum(["show", "season", "episode"]), tmdb_show_id: id, tmdb_season_id: id.nullable().optional(), episode_number: z.number().int().positive().nullable().optional() }),
  canonical_source_record_id: id, source_record_ids: z.array(id).min(2).max(1000), reason: z.string().max(2000),
});
const metadata = z.record(z.string(), z.unknown());

/** Version identity and every writable field are strict; optional metadata is retained. */
export const serializdNormalizedExportV1Schema = z.object({
  schema: z.literal("mosaic.serializd.normalized-export"), schema_version: z.literal(1), generated_at_utc: timestamp,
  source: metadata, profile: z.object({ country_code: z.string().regex(/^[A-Z]{2}$/).nullable(), favorite_shows: z.array(z.object({ tmdb_show_id: id, title })).max(1000) }).passthrough(),
  summary: metadata, validation_targets: metadata,
  shows: z.array(show).max(20000), season_states: z.array(season).max(20000), events: z.array(event).max(20000), duplicate_groups: z.array(group).max(20000),
  lists: z.object({ owned: z.array(z.unknown()).max(20000), liked: z.array(z.unknown()).max(20000), collaborative: z.array(z.unknown()).max(20000), pinned: z.array(z.unknown()).max(20000) }),
  social_snapshot: metadata, import_guidance: metadata,
}).superRefine((value, ctx) => {
  if (value.shows.length + value.season_states.length + value.events.length > 20000) ctx.addIssue({ code: "custom", message: "Exports may contain at most 20,000 writable records." });
  const seasonKeys = value.season_states.map((item) => `${item.tmdb_show_id}:${item.tmdb_season_id}:${item.state}`);
  if (new Set(seasonKeys).size !== seasonKeys.length) ctx.addIssue({ code: "custom", message: "Repeated season state identity." });
  const shows = new Set(value.shows.map((item) => item.tmdb_id));
  if (shows.size !== value.shows.length) ctx.addIssue({ code: "custom", message: "Repeated show identity." });
  const events = new Map(value.events.map((item) => [item.source_record_id, item]));
  if (events.size !== value.events.length) ctx.addIssue({ code: "custom", message: "Repeated event source ID." });
  const groups = new Map(value.duplicate_groups.map((item) => [item.duplicate_group_id, item]));
  if (groups.size !== value.duplicate_groups.length) ctx.addIssue({ code: "custom", message: "Repeated duplicate group ID." });
  for (const item of [...value.season_states, ...value.events]) if (!shows.has(item.tmdb_show_id)) ctx.addIssue({ code: "custom", message: "Target refers to an absent show." });
  for (const item of value.duplicate_groups) {
    const members = item.source_record_ids.map((recordId) => events.get(recordId));
    if (new Set(item.source_record_ids).size !== members.length || !item.source_record_ids.includes(item.canonical_source_record_id) || members.some((member) => !member || member.duplicate_group_id !== item.duplicate_group_id || member.target_type !== item.target.type || member.tmdb_show_id !== item.target.tmdb_show_id || (member.tmdb_season_id ?? null) !== (item.target.tmdb_season_id ?? null) || (member.episode_number ?? null) !== (item.target.episode_number ?? null) || member.is_rewatch || member.default_import !== (member.source_record_id === item.canonical_source_record_id))) ctx.addIssue({ code: "custom", message: "Inconsistent duplicate group." });
  }
  for (const item of value.events) if (item.duplicate_group_id && !groups.get(item.duplicate_group_id)?.source_record_ids.includes(item.source_record_id)) ctx.addIssue({ code: "custom", message: "Event is absent from its duplicate group." });
});

export type SerializdNormalizedExportV1 = z.infer<typeof serializdNormalizedExportV1Schema>;

export function parseSerializdNormalizedJson(contents: Uint8Array): ParseResult {
  const failed = (message: string): ParseResult => ({ records: [], errors: [{ row: 0, message }], duplicateCount: 0, warnings: [] });
  if (contents.byteLength > 12 * 1024 * 1024) return failed("Import files must be 12 MB or smaller.");
  let raw: unknown;
  try { raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(contents)); } catch { return failed("The file must contain valid UTF-8 JSON."); }
  const stack: { value: unknown; depth: number }[] = [{ value: raw, depth: 0 }];
  let visited = 0;
  while (stack.length) {
    const entry = stack.pop()!;
    if (++visited > 250000 || entry.depth > 32) return failed("JSON nesting or record complexity exceeds the safe parsing limit.");
    if (entry.value && typeof entry.value === "object") {
      for (const value of Object.values(entry.value)) stack.push({ value, depth: entry.depth + 1 });
    }
  }
  const parsed = serializdNormalizedExportV1Schema.safeParse(raw);
  if (!parsed.success) return { ...failed("Invalid normalized Serializd export."), errors: parsed.error.issues.slice(0, 50).map((issue) => ({ row: 0, field: issue.path.join("."), message: issue.message })) };
  const data = parsed.data;
  const favoriteIds = new Set(data.profile.favorite_shows.map((item) => item.tmdb_show_id));
  const base = (showId: number, sourceTitle: string | null, key: string, original: unknown): SeriesImportRecord => ({ source: "serializd_normalized_v1", sourceRecordKey: `serializd_normalized_v1:${key}`, mediaType: "tv", title: sourceTitle ?? `TMDB show ${showId}`, providerIdentity: { provider: "tmdb", mediaType: "tv", providerId: String(showId) }, sourceMetadata: { original: JSON.stringify(original) } });
  const records: SeriesImportRecord[] = data.shows.map((item) => ({
    ...base(item.tmdb_id, item.title, `show:${item.tmdb_id}`, item), recordKind: "show_state", stateFacts: item.status,
    // Serializd's watched_any is historical evidence, not a resumable state.
    // Only its explicit current-state flags may place a show in Continue.
    status: item.status.currently_watching ? "watching" : item.status.paused ? "paused" : item.status.dropped ? "dropped" : item.status.finished ? "completed" : item.status.watchlisted ? "watchlist" : item.status.watched_any ? "watched" : undefined,
    isFavorite: item.favorite || favoriteIds.has(item.tmdb_id),
  }));
  for (const item of data.season_states) records.push({ ...base(item.tmdb_show_id, item.show_title, `season:${item.tmdb_show_id}:${item.tmdb_season_id}:${item.state}:${item.date_added ?? "undated"}`, item), recordKind: "season_state", targetType: "season", tmdbSeasonId: item.tmdb_season_id, seasonNumber: item.season_number ?? undefined, seasonState: item.state === "watched" ? "completed" : "watchlist", sourceCreatedAt: item.date_added ?? undefined });
  for (const item of data.events) records.push({ ...base(item.tmdb_show_id, item.show_title, `event:${item.source_record_id}`, item), recordKind: "event", targetType: item.target_type, tmdbSeasonId: item.tmdb_season_id ?? undefined, seasonNumber: item.season_number ?? undefined, episodeNumber: item.episode_number ?? undefined, watchedDate: item.occurred_at, sourceCreatedAt: item.created_at, rating: item.rating_mosaic_5 ?? undefined, review: item.review_text ?? undefined, containsSpoilers: item.contains_spoiler, tags: item.tags, isRewatch: item.is_rewatch, isLog: item.is_log, defaultImport: item.default_import });
  const normalizedSummary = {
    distinct_show_ids: data.shows.length, show_titles_resolved_from_capture: data.shows.filter((item) => item.title !== null).length, show_titles_unresolved_but_tmdb_ids_preserved: data.shows.filter((item) => item.title === null).length,
    watched_shows: data.shows.filter((item) => item.status.watched_any).length, watchlisted_shows: data.shows.filter((item) => item.status.watchlisted).length, currently_watching_shows: data.shows.filter((item) => item.status.currently_watching).length, paused_shows: data.shows.filter((item) => item.status.paused).length, dropped_shows: data.shows.filter((item) => item.status.dropped).length,
    watched_season_records: data.season_states.filter((item) => item.state === "watched").length, watchlist_season_records: data.season_states.filter((item) => item.state === "watchlist").length,
    source_event_records: data.events.length, default_import_event_records: data.events.filter((item) => item.default_import).length, duplicate_candidate_groups: data.duplicate_groups.length, duplicate_extra_records_disabled_by_default: data.events.filter((item) => !item.default_import && item.duplicate_group_id).length,
    explicit_rewatch_records: data.events.filter((item) => item.is_rewatch).length, rated_records: data.events.filter((item) => item.rating_mosaic_5 !== null).length, liked_records: data.events.filter((item) => item.liked).length, text_review_records: data.events.filter((item) => Boolean(item.review_text)).length,
    show_event_records: data.events.filter((item) => item.target_type === "show").length,
    season_event_records: data.events.filter((item) => item.target_type === "season").length,
    episode_event_records: data.events.filter((item) => item.target_type === "episode").length,
    unsupported_season_ratings: data.events.filter((item) => item.target_type === "season" && item.rating_mosaic_5 !== null).length,
  };
  const warnings = ["Recognized: Mosaic Serializd Normalized Export v1. This is a prepared interchange file, not a native Serializd export.", "Event likes, source profile, aggregate statistics, and social snapshot are retained as metadata; they do not create favorites, identity changes, or diary rows."];
  if (normalizedSummary.unsupported_season_ratings) warnings.push(`${normalizedSummary.unsupported_season_ratings} season ratings have no Mosaic equivalent and will be preserved only in source metadata, not converted to show ratings.`);
  for (const [key, count] of Object.entries(normalizedSummary)) if (typeof data.summary[key] === "number" && data.summary[key] !== count) warnings.push(`Summary mismatch for ${key}: computed ${count}, source ${data.summary[key]}.`);
  if (Object.values(data.lists).some((items) => items.length)) warnings.push("Source lists are retained in metadata but are unsupported by normalized-v1 apply.");
  // Retain all informational top-level sections once, rather than on every event.
  if (records[0]) records[0].sourceMetadata.exportContext = JSON.stringify({ source: data.source, profile: data.profile, summary: data.summary, validation_targets: data.validation_targets, duplicate_groups: data.duplicate_groups, lists: data.lists, social_snapshot: data.social_snapshot, import_guidance: data.import_guidance });
  return { records, errors: [], duplicateCount: normalizedSummary.duplicate_extra_records_disabled_by_default, warnings, normalizedSummary };
}
