import { z } from "zod";
import { activityLabel, projectActivity } from "@/lib/activity/projection";
import { deriveProfileStats, statsYears } from "@/lib/analytics/stats";
import { projectContinueItems, deriveSeriesCurrentStatus } from "@/lib/current-media/projection";
import { projectLibraryEntries } from "@/lib/library/projection";
import { parseProviderKey, type ProviderIdentity } from "@/lib/media/identity";
import type { CatalogMedia, CatalogSearchResult, MediaProvider } from "@/lib/media/types";
import { calculateBookProgress, mediaKey } from "@/lib/persistence/domain";
import type { MosaicState } from "@/lib/persistence/types";
import { deriveSeriesProgress } from "@/lib/tv/series-progress";
import { assistantLimits } from "@/lib/assistant/contract";
import type { RefTable } from "@/lib/assistant/references";

/**
 * Read-only tools. Every handler is a pure projection of the caller's own
 * already-loaded state or a catalog lookup; none receives a user id, a
 * database client, or any mutation function.
 */
export interface ToolContext {
  getState(): Promise<MosaicState>;
  catalog: {
    search(query: string): Promise<CatalogSearchResult>;
    getItem(identity: ProviderIdentity): Promise<CatalogMedia | null>;
    related(media: CatalogMedia): Promise<CatalogSearchResult>;
  };
  refs: RefTable;
  now: Date;
}

export interface ToolResult { data: Record<string, unknown>; scope: string }

export interface AssistantTool {
  name: string;
  label: string;
  description: string;
  schema: z.ZodType;
  run(ctx: ToolContext, input: never): Promise<ToolResult>;
}

const mediaType = z.enum(["movie", "tv", "game", "book"]);
const status = z.enum(["watchlist", "watched", "watching", "completed", "paused", "dropped", "backlog", "playing", "want_to_read", "reading", "finished", "dnf"]);
const ref = z.string().trim().min(2).max(260).describe("A ref id such as \"r3\" from an earlier tool result, or a provider key");
const isoDate = z.iso.date();
const limit = (max: number) => z.number().int().min(1).max(max).optional();

const providerLabels: Record<MediaProvider, string> = { tmdb: "TMDB", igdb: "IGDB", googlebooks: "Google Books", mock: "Mosaic sample catalog" };
const mediumNames = { movie: "movies", tv: "series", game: "games", book: "books" } as const;

/** Untrusted text (catalog titles, list titles) is flattened and capped before a model sees it. */
function clean(value: string | undefined, max = 120): string | undefined {
  if (!value) return undefined;
  const text = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const day = (value: string | undefined) => value?.slice(0, 10);

/** Every title the user's own records mention, keyed by provider identity. */
function trackedMedia(state: MosaicState): Map<string, CatalogMedia> {
  const index = new Map<string, CatalogMedia>();
  const add = (media: CatalogMedia) => { if (!index.has(mediaKey(media))) index.set(mediaKey(media), media); };
  state.library.forEach(({ media }) => add(media));
  state.movieWatches.forEach(({ media }) => add(media));
  state.episodeWatches.forEach(({ series }) => add(series));
  state.seasonStates.forEach(({ series }) => add(series));
  state.tvHistory.forEach(({ series }) => add(series));
  state.gamePlaythroughs.forEach(({ media }) => add(media));
  state.bookReadings.forEach(({ media }) => add(media));
  state.reviews.forEach(({ media }) => add(media));
  state.lists.forEach(({ items }) => items.forEach(({ media }) => add(media)));
  return index;
}

function latest<T extends { media: CatalogMedia; updatedAt: string }>(items: T[], key: string): { record?: T; count: number } {
  const matching = items.filter((item) => mediaKey(item.media) === key).sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
  return { record: matching[0], count: matching.length };
}

function resolveKey(ctx: ToolContext, value: string): string | undefined {
  const fromRef = ctx.refs.keyOf(value.trim());
  if (fromRef) return fromRef;
  return parseProviderKey(value.trim()) ? value.trim() : undefined;
}

function yourRef(ctx: ToolContext, media: CatalogMedia, facts: Record<string, string | number | boolean | null> = {}): string {
  return ctx.refs.add(media, "your_mosaic", { facts });
}

const libraryQuery = {
  name: "library_query",
  label: "Checking your library",
  description: "List titles in the user's Library, optionally filtered by medium, status (watchlist, watched, watching, completed, paused, dropped, backlog, playing, want_to_read, reading, finished, dnf) or favourites. Returns the user's own status, rating and progress.",
  schema: z.object({ mediaType: mediaType.optional(), status: status.optional(), favoritesOnly: z.boolean().optional(), sort: z.enum(["updated", "title", "rating", "release"]).optional(), limit: limit(25) }).strict(),
  async run(ctx: ToolContext, input: { mediaType?: z.infer<typeof mediaType>; status?: z.infer<typeof status>; favoritesOnly?: boolean; sort?: "updated" | "title" | "rating" | "release"; limit?: number }) {
    const state = await ctx.getState();
    const media = trackedMedia(state);
    const entries = projectLibraryEntries(state, { mediaType: input.mediaType, status: input.status, sort: input.sort }).filter((entry) => !input.favoritesOnly || entry.isFavorite);
    const items = entries.slice(0, input.limit ?? 10).map((entry) => {
      const facts = { status: entry.status, userRating: entry.userRating, favourite: entry.isFavorite };
      return { ref: yourRef(ctx, media.get(entry.id)!, facts), title: clean(entry.title), mediaType: entry.mediaType, year: entry.releaseYear ?? null, ...facts, progress: entry.progress ?? null };
    });
    const scope = ["Library", input.favoritesOnly ? "favourites" : undefined, input.status, input.mediaType ? mediumNames[input.mediaType] : "all media", `${entries.length} ${entries.length === 1 ? "title" : "titles"}`].filter(Boolean).join(" · ");
    return { data: { total: entries.length, items }, scope };
  },
};

const continueItems = {
  name: "continue_items",
  label: "Checking what you're in the middle of",
  description: "Series the user is watching, books they are reading and games they are playing, with progress. Book and game dates are when the record was last updated, not a session date.",
  schema: z.object({ limit: limit(10) }).strict(),
  async run(ctx: ToolContext, input: { limit?: number }) {
    const state = await ctx.getState();
    const media = trackedMedia(state);
    const items = projectContinueItems(state, { limit: input.limit ?? 6 }).map((item) => ({
      ref: yourRef(ctx, media.get(item.id)!, { status: item.status }),
      title: clean(item.title), mediaType: item.mediaType, status: item.status, progress: item.progress,
      lastActivityOn: day(item.lastActivityAt ?? undefined) ?? null,
      dateKind: item.mediaType === "series" ? "event" : "last_updated",
    }));
    return { data: { items }, scope: `In progress · ${items.length} ${items.length === 1 ? "title" : "titles"}` };
  },
};

const titleProgress = {
  name: "title_progress",
  label: "Checking your progress",
  description: "The user's own status, rating and progress for one title: watch dates for movies, last logged episode for series, current page for books, playtime for games.",
  schema: z.object({ ref }).strict(),
  async run(ctx: ToolContext, input: { ref: string }) {
    const key = resolveKey(ctx, input.ref);
    if (!key) return { data: { error: "Unknown title reference." }, scope: "Title progress · unknown title" };
    const state = await ctx.getState();
    const media = trackedMedia(state).get(key);
    if (!media) return { data: { tracked: false, note: "This title is not in the user's records." }, scope: "Title progress · not tracked" };
    const entry = projectLibraryEntries(state).find((item) => item.id === key);
    const userRating = state.ratings.find((rating) => rating.mediaKey === key)?.value ?? null;
    const base = { tracked: true, title: clean(media.title), mediaType: media.mediaType, libraryStatus: entry?.status ?? null, userRating };
    let detail: Record<string, unknown> = {};
    if (media.mediaType === "movie") {
      const watches = state.movieWatches.filter((watch) => mediaKey(watch.media) === key).sort((first, second) => second.watchedAt.localeCompare(first.watchedAt));
      detail = { watchCount: watches.length, rewatchCount: watches.filter((watch) => watch.isRewatch).length, lastWatchedOn: day(watches[0]?.watchedAt) ?? null, dateKind: "event" };
    } else if (media.mediaType === "tv") {
      const progress = deriveSeriesProgress(state, media);
      const lastEpisode = state.episodeWatches.filter((watch) => mediaKey(watch.series) === key).sort((first, second) => second.watchedAt.localeCompare(first.watchedAt))[0];
      detail = {
        derivedStatus: deriveSeriesCurrentStatus(state, media).status ?? null,
        watchedEpisodes: progress.watchedEpisodes,
        totalEpisodes: progress.eligibleEpisodes ?? null,
        percent: progress.eligibleEpisodes === undefined ? null : progress.progress,
        nextEpisode: progress.nextEpisode ?? null,
        lastLoggedEpisode: lastEpisode ? { season: lastEpisode.seasonNumber, episode: lastEpisode.episodeNumber, title: clean(lastEpisode.episodeTitle), watchedOn: day(lastEpisode.watchedAt), dateKind: "event" } : null,
      };
    } else if (media.mediaType === "book") {
      const { record, count } = latest(state.bookReadings, key);
      detail = record ? {
        readingStatus: record.status, currentPage: record.currentPage ?? null, totalPages: record.totalPages ?? null,
        percent: calculateBookProgress(record.currentPage, record.totalPages, record.progressPercent) ?? null,
        lastUpdatedOn: day(record.updatedAt), dateKind: "last_updated", recordCount: count,
        note: "Progress is from the most recently updated reading record. Mosaic does not record reading sessions or a finish date.",
      } : { note: "No reading progress recorded." };
    } else {
      const { record, count } = latest(state.gamePlaythroughs, key);
      detail = record ? {
        playthroughStatus: record.status, platform: clean(record.platform, 60) ?? null, playtimeMinutes: record.playtimeMinutes, percent: record.progressPercent ?? null,
        lastUpdatedOn: day(record.updatedAt), dateKind: "last_updated", recordCount: count,
        note: "Progress is from the most recently updated playthrough record; records are never added together. Mosaic does not record play sessions or a completion date.",
      } : { note: "No playthrough recorded." };
    }
    const id = yourRef(ctx, media, { status: (detail.derivedStatus as string | undefined) ?? base.libraryStatus, userRating });
    return { data: { ref: id, ...base, ...detail }, scope: `Progress · ${clean(media.title, 60)}` };
  },
};

const activityQuery = {
  name: "activity_query",
  label: "Checking your activity",
  description: "The user's logged activity, newest first, optionally within a date range (YYYY-MM-DD, inclusive) and medium. Movie and episode items are dated events. Game and book items only say when the record was last updated (dateKind last_updated); they are not sessions.",
  schema: z.object({ from: isoDate.optional(), to: isoDate.optional(), mediaType: mediaType.optional(), limit: limit(50) }).strict()
    .refine((value) => !value.from || !value.to || value.from <= value.to, "from must be on or before to")
    .refine((value) => !value.from || !value.to || (Date.parse(value.to) - Date.parse(value.from)) / 86_400_000 <= 400, "The range can span at most 400 days"),
  async run(ctx: ToolContext, input: { from?: string; to?: string; mediaType?: z.infer<typeof mediaType>; limit?: number }) {
    const state = await ctx.getState();
    const events = projectActivity(state).filter((event) => {
      const date = event.occurredAt.slice(0, 10);
      return (!input.mediaType || event.mediaType === input.mediaType) && (!input.from || date >= input.from) && (!input.to || date <= input.to);
    });
    const counts = { movie: 0, tv: 0, game: 0, book: 0 };
    events.forEach((event) => { counts[event.mediaType] += 1; });
    const items = events.slice(0, input.limit ?? 20).map((event) => ({
      ref: yourRef(ctx, event.media), title: clean(event.media.title), mediaType: event.mediaType, what: activityLabel(event),
      date: event.occurredAt.slice(0, 10), dateKind: event.mediaType === "game" || event.mediaType === "book" ? "last_updated" : "event",
      rating: event.rating ?? null,
    }));
    const range = input.from || input.to ? `${input.from ?? "start"} to ${input.to ?? "today"}` : "all time";
    return { data: { total: events.length, counts, items }, scope: `Activity · ${range}${input.mediaType ? ` · ${mediumNames[input.mediaType]}` : ""} · ${events.length} items` };
  },
};

const ratingsQuery = {
  name: "ratings_query",
  label: "Checking your ratings",
  description: "The user's own personal ratings (0.5 to 5 stars). Never community or catalog scores.",
  schema: z.object({ mediaType: mediaType.optional(), min: z.number().min(0.5).max(5).optional(), max: z.number().min(0.5).max(5).optional(), order: z.enum(["highest", "lowest"]).optional(), limit: limit(25) }).strict(),
  async run(ctx: ToolContext, input: { mediaType?: z.infer<typeof mediaType>; min?: number; max?: number; order?: "highest" | "lowest"; limit?: number }) {
    const state = await ctx.getState();
    const media = trackedMedia(state);
    const rated = state.ratings.flatMap((rating) => {
      const item = media.get(rating.mediaKey);
      return item && (!input.mediaType || item.mediaType === input.mediaType) && rating.value >= (input.min ?? 0) && rating.value <= (input.max ?? 5) ? [{ item, value: rating.value }] : [];
    }).sort((first, second) => (input.order === "lowest" ? first.value - second.value : second.value - first.value) || first.item.title.localeCompare(second.item.title));
    const items = rated.slice(0, input.limit ?? 10).map(({ item, value }) => ({ ref: yourRef(ctx, item, { userRating: value }), title: clean(item.title), mediaType: item.mediaType, year: item.releaseYear ?? null, userRating: value }));
    return { data: { total: rated.length, items }, scope: `Your ratings · ${input.mediaType ? mediumNames[input.mediaType] : "all media"} · ${rated.length} rated` };
  },
};

const statsSummary = {
  name: "stats_summary",
  label: "Checking your stats",
  description: "Counts from the user's records for all time or one calendar year. Movie and series counts are dated logs; game and book counts are current statuses regardless of year.",
  schema: z.object({ year: z.number().int().min(1900).max(2100).optional() }).strict(),
  async run(ctx: ToolContext, input: { year?: number }) {
    const state = await ctx.getState();
    const years = statsYears(state);
    if (input.year !== undefined && !years.includes(input.year)) return { data: { availableYears: years, note: "No dated movie or series logs in that year." }, scope: `Stats · ${input.year} · no data` };
    const stats = deriveProfileStats(state, input.year === undefined ? { kind: "all" } : { kind: "year", year: input.year });
    return {
      data: {
        period: input.year ?? "all time", availableYears: years,
        movies: { watchLogs: stats.movie.watchLogs, uniqueTitles: stats.movie.uniqueTitles, rewatchLogs: stats.movie.rewatchLogs },
        series: { episodeLogs: stats.series.episodeLogs, uniqueEpisodes: stats.series.uniqueEpisodes, shows: stats.series.shows, statuses: stats.series.status },
        games: { statuses: stats.game.statuses, recordedPlaytimeMinutes: stats.game.recordedPlaytimeMinutes, note: "Current statuses, not limited to the period." },
        books: { statuses: stats.book.statuses, note: "Current statuses, not limited to the period." },
        ratings: { count: stats.ratings.count, average: stats.ratings.average ?? null },
        topGenres: Object.fromEntries(Object.entries(stats.genres).map(([medium, value]) => [medium, value.top.slice(0, 3).map((genre) => clean(genre.name, 40))])),
      },
      scope: `Stats · ${input.year ?? "all time"}`,
    };
  },
};

const listQuery = {
  name: "list_query",
  label: "Checking your lists",
  description: "The user's saved lists. Without listId, returns each list's id, title and item count. With a listId from this tool, returns that list's titles in order.",
  schema: z.object({ listId: z.string().regex(/^l\d{1,4}$/).optional(), limit: limit(25) }).strict(),
  async run(ctx: ToolContext, input: { listId?: string; limit?: number }) {
    const state = await ctx.getState();
    if (!input.listId) {
      const lists = state.lists.map((list, index) => ({ listId: `l${index + 1}`, title: clean(list.title, 80), visibility: list.visibility, itemCount: list.items.length }));
      return { data: { lists }, scope: `Lists · ${lists.length} saved` };
    }
    const list = state.lists[Number(input.listId.slice(1)) - 1];
    if (!list) return { data: { error: "Unknown listId. Call list_query without listId first." }, scope: "Lists · unknown list" };
    const items = list.items.slice(0, input.limit ?? 15).map((item) => ({ ref: yourRef(ctx, item.media), title: clean(item.media.title), mediaType: item.media.mediaType, year: item.media.releaseYear ?? null, position: item.position }));
    return { data: { title: clean(list.title, 80), itemCount: list.items.length, items }, scope: `List · ${clean(list.title, 40)} · ${list.items.length} titles` };
  },
};

function catalogItem(ctx: ToolContext, tracked: Map<string, CatalogMedia>, state: MosaicState, media: CatalogMedia, extra: { reason?: string; seed?: string } = {}) {
  const inLibrary = tracked.has(mediaKey(media));
  const status = inLibrary ? state.library.find((entry) => mediaKey(entry.media) === mediaKey(media))?.status ?? null : null;
  const id = inLibrary ? yourRef(ctx, media, { status }) : ctx.refs.add(media, "catalog", { reason: extra.reason, seed: extra.seed, facts: { source: providerLabels[media.provider] } });
  const creators = media.mediaType === "book" ? media.authors : media.mediaType === "movie" ? [media.director] : media.mediaType === "game" ? [media.developer] : [media.network];
  return {
    ref: id, title: clean(media.title), mediaType: media.mediaType, year: media.releaseYear ?? null,
    genres: media.genres.slice(0, 4).map((genre) => clean(genre, 40)), by: creators.filter(Boolean).slice(0, 2).map((name) => clean(name, 60)),
    source: providerLabels[media.provider], inLibrary, userStatus: status,
  };
}

const catalogSearch = {
  name: "catalog_search",
  label: "Searching the catalog",
  description: "Search the movie, series, game and book catalogs by title, author, theme or keywords. Results are catalog facts, not things the user has watched, read or played (unless inLibrary is true).",
  schema: z.object({ query: z.string().trim().min(2).max(100), mediaType: mediaType.optional(), limit: limit(8) }).strict(),
  async run(ctx: ToolContext, input: { query: string; mediaType?: z.infer<typeof mediaType>; limit?: number }) {
    const [state, result] = await Promise.all([ctx.getState(), ctx.catalog.search(input.query)]);
    const tracked = trackedMedia(state);
    const items = result.items.filter((item) => !input.mediaType || item.mediaType === input.mediaType).slice(0, input.limit ?? 5).map((item) => catalogItem(ctx, tracked, state, item));
    return { data: { items, unavailableSources: result.failures.map((failure) => failure.provider) }, scope: `Catalog search${input.mediaType ? ` · ${mediumNames[input.mediaType]}` : ""} · ${items.length} results` };
  },
};

const relatedTitles = {
  name: "related_titles",
  label: "Finding related titles",
  description: "Catalog titles related to one title (same medium, from that catalog's own recommendations). Titles the user already tracks are left out.",
  schema: z.object({ ref, limit: limit(8) }).strict(),
  async run(ctx: ToolContext, input: { ref: string; limit?: number }) {
    const key = resolveKey(ctx, input.ref);
    const identity = key ? parseProviderKey(key) : null;
    if (!key || !identity) return { data: { error: "Unknown title reference." }, scope: "Related · unknown title" };
    const state = await ctx.getState();
    const tracked = trackedMedia(state);
    const seed = tracked.get(key) ?? await ctx.catalog.getItem(identity).catch(() => null);
    if (!seed) return { data: { error: "That title is unavailable in the catalog." }, scope: "Related · unavailable" };
    const seedRef = tracked.has(key) ? yourRef(ctx, seed) : ctx.refs.add(seed, "catalog", { facts: { source: providerLabels[seed.provider] } });
    const result = await ctx.catalog.related(seed);
    const unique = [...new Map(result.items.map((item) => [mediaKey(item), item])).values()];
    const items = unique.filter((item) => mediaKey(item) !== key && !tracked.has(mediaKey(item))).slice(0, input.limit ?? 6)
      .map((item) => catalogItem(ctx, tracked, state, item, { reason: `Related to ${clean(seed.title, 80)} on ${providerLabels[item.provider]}`, seed: seedRef }));
    return { data: { seed: seedRef, items, unavailableSources: result.failures.map((failure) => failure.provider) }, scope: `Related to ${clean(seed.title, 40)} · ${items.length} titles` };
  },
};

export const assistantTools: AssistantTool[] = [libraryQuery, continueItems, titleProgress, activityQuery, ratingsQuery, statsSummary, listQuery, catalogSearch, relatedTitles] as AssistantTool[];

/** OpenAI-format tool definitions sent to the model on every call. */
export function toolDefinitions(tools = assistantTools) {
  return tools.map((tool) => {
    const parameters = z.toJSONSchema(tool.schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
    delete parameters.$schema;
    // `format` already says "date"; the generated date regex only costs tokens. Zod still validates.
    for (const property of Object.values((parameters.properties ?? {}) as Record<string, Record<string, unknown>>)) if (property.format) delete property.pattern;
    return { type: "function" as const, function: { name: tool.name, description: tool.description, parameters } };
  });
}

/**
 * Validates arguments and runs one tool. Unknown tools, unparsable JSON and
 * schema violations never execute; the model receives a short error instead.
 */
export async function executeTool(ctx: ToolContext, name: string, rawArguments: string, tools = assistantTools): Promise<{ ok: boolean; content: string; scope?: string; label: string }> {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) return { ok: false, content: JSON.stringify({ error: `Unknown tool ${clean(name, 40)}.` }), label: "Checking" };
  let parsedJson: unknown;
  try { parsedJson = rawArguments.trim() ? JSON.parse(rawArguments) : {}; }
  catch { return { ok: false, content: JSON.stringify({ error: "Arguments were not valid JSON." }), label: tool.label }; }
  const parsed = tool.schema.safeParse(parsedJson);
  if (!parsed.success) return { ok: false, content: JSON.stringify({ error: "Invalid arguments.", issues: parsed.error.issues.slice(0, 4).map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`) }), label: tool.label };
  const result = await tool.run(ctx, parsed.data as never);
  return { ok: true, content: capJson(result.data), scope: result.scope, label: tool.label };
}

/** Keeps a tool result within budget by dropping trailing list items, never by cutting JSON mid-value. */
export function capJson(data: Record<string, unknown>, maxBytes: number = assistantLimits.toolResultBytes): string {
  let text = JSON.stringify(data);
  if (text.length <= maxBytes) return text;
  const copy = structuredClone(data) as Record<string, unknown>;
  const lists = Object.values(copy).filter((value): value is unknown[] => Array.isArray(value));
  while (text.length > maxBytes && lists.some((list) => list.length)) {
    lists.reduce((longest, list) => (list.length > longest.length ? list : longest)).pop();
    copy.truncated = true;
    text = JSON.stringify(copy);
  }
  return text.length <= maxBytes ? text : JSON.stringify({ error: "Result too large." });
}
