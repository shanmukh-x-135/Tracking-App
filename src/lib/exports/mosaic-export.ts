import { strToU8, zipSync } from "fflate";
import type { AuthUser } from "@/lib/auth/types";
import type { CatalogMedia } from "@/lib/media/types";
import type { MosaicState } from "@/lib/persistence/types";

export const MOSAIC_EXPORT_VERSION = 2 as const;

export const exportSections = [
  "profile",
  "media",
  "library",
  "ratings",
  "reviews",
  "movie-watch-logs",
  "episode-watches",
  "episode-ratings",
  "game-playthroughs",
  "book-readings",
  "lists",
  "list-items",
] as const;

export type ExportSection = typeof exportSections[number];
type ExportValue = Record<string, unknown> | Record<string, unknown>[];

export interface MosaicExportData {
  profile: Record<string, unknown>;
  media: Record<string, unknown>[];
  library: Record<string, unknown>[];
  ratings: Record<string, unknown>[];
  reviews: Record<string, unknown>[];
  "movie-watch-logs": Record<string, unknown>[];
  "episode-watches": Record<string, unknown>[];
  "episode-ratings": Record<string, unknown>[];
  "game-playthroughs": Record<string, unknown>[];
  "book-readings": Record<string, unknown>[];
  lists: Record<string, unknown>[];
  "list-items": Record<string, unknown>[];
}

interface ExportManifest {
  mosaicExportVersion: typeof MOSAIC_EXPORT_VERSION;
  exportedAt: string;
  format: "mosaic-portable-data";
  files: string[];
}

function scalar(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// Spreadsheet applications interpret these prefixes as formulas. A leading
// apostrophe keeps the original value visible while preventing evaluation.
export function neutralizeSpreadsheetCell(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvCell(value: unknown): string {
  const safe = neutralizeSpreadsheetCell(scalar(value));
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function recordsToCsv(value: ExportValue): string {
  const records = Array.isArray(value) ? value : [value];
  const headers = [...new Set(records.flatMap((record) => Object.keys(record)))];
  if (headers.length === 0) return "";
  return `${headers.map(csvCell).join(",")}\r\n${records.map((record) => headers.map((header) => csvCell(record[header])).join(",")).join("\r\n")}\r\n`;
}

export function createMosaicExportArchive(data: MosaicExportData, exportedAt = new Date().toISOString()): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const section of exportSections) {
    files[`json/${section}.json`] = strToU8(`${JSON.stringify(data[section], null, 2)}\n`);
    files[`csv/${section}.csv`] = strToU8(recordsToCsv(data[section]));
  }
  const manifest: ExportManifest = {
    mosaicExportVersion: MOSAIC_EXPORT_VERSION,
    exportedAt,
    format: "mosaic-portable-data",
    files: Object.keys(files).sort(),
  };
  files["manifest.json"] = strToU8(`${JSON.stringify(manifest, null, 2)}\n`);
  return zipSync(files, { level: 6 });
}

export function mosaicExportFilename(date = new Date()): string {
  return `mosaic-export-v${MOSAIC_EXPORT_VERSION}-${date.toISOString().slice(0, 10)}.zip`;
}

export function mosaicDataFromState(profile: AuthUser, state: MosaicState): MosaicExportData {
  const media = new Map<string, Record<string, unknown>>();
  const mediaId = (item: CatalogMedia) => `${item.provider}:${item.mediaType}:${item.providerId}`;
  const remember = (item: CatalogMedia) => {
    media.set(mediaId(item), { id: mediaId(item), ...item });
  };
  state.library.forEach(({ media }) => remember(media));
  state.reviews.forEach(({ media }) => remember(media));
  state.movieWatches.forEach(({ media }) => remember(media));
  state.episodeWatches.forEach(({ series }) => remember(series));
  state.gamePlaythroughs.forEach(({ media }) => remember(media));
  state.bookReadings.forEach(({ media }) => remember(media));
  state.lists.forEach(({ items }) => items.forEach(({ media }) => remember(media)));

  return {
    profile: { id: profile.id, email: profile.email, username: null, displayName: profile.displayName, bio: null, avatarUrl: profile.avatarUrl ?? null, createdAt: null, updatedAt: null },
    media: [...media.values()],
    library: state.library.map((entry) => ({ mediaId: mediaId(entry.media), status: entry.status, isFavorite: entry.isFavorite, createdAt: null, updatedAt: entry.updatedAt })),
    ratings: state.ratings.map((rating) => ({ id: null, mediaId: rating.mediaKey, rating: rating.value, createdAt: null, updatedAt: rating.updatedAt })),
    reviews: state.reviews.map((review) => ({ id: review.id, mediaId: mediaId(review.media), body: review.body, containsSpoilers: review.containsSpoilers, rating: review.rating ?? null, createdAt: null, updatedAt: review.updatedAt })),
    "movie-watch-logs": state.movieWatches.map((watch) => ({ id: watch.id, mediaId: mediaId(watch.media), watchedAt: watch.watchedAt, isRewatch: watch.isRewatch, rating: watch.rating ?? null, review: watch.review ?? null, viewingContext: watch.viewingContext ?? null, streamingService: watch.streamingService ?? null, createdAt: null, updatedAt: null })),
    "episode-watches": state.episodeWatches.map((watch) => ({ id: watch.id, seriesMediaId: mediaId(watch.series), seasonNumber: watch.seasonNumber, episodeNumber: watch.episodeNumber, episodeTitle: watch.episodeTitle ?? null, watchedAt: watch.watchedAt, isRewatch: false, createdAt: null, updatedAt: null })),
    "episode-ratings": state.episodeWatches.flatMap((watch) => watch.rating === undefined ? [] : [{ id: null, seriesMediaId: mediaId(watch.series), seasonNumber: watch.seasonNumber, episodeNumber: watch.episodeNumber, rating: watch.rating, createdAt: null, updatedAt: null }]),
    "game-playthroughs": state.gamePlaythroughs.map((playthrough) => ({ id: playthrough.id, mediaId: mediaId(playthrough.media), status: playthrough.status, platform: playthrough.platform ?? null, startedAt: null, completedAt: null, playtimeMinutes: playthrough.playtimeMinutes, progressPercent: playthrough.progressPercent ?? null, rating: playthrough.rating ?? null, notes: null, createdAt: null, updatedAt: playthrough.updatedAt })),
    "book-readings": state.bookReadings.map((reading) => ({ id: reading.id, mediaId: mediaId(reading.media), status: reading.status, startedAt: null, finishedAt: null, currentPage: reading.currentPage ?? null, totalPages: reading.totalPages ?? null, progressPercent: reading.progressPercent ?? null, rating: reading.rating ?? null, createdAt: null, updatedAt: reading.updatedAt })),
    lists: state.lists.map(({ id, title, description, visibility, updatedAt }) => ({ id, title, description, visibility, createdAt: null, updatedAt })),
    "list-items": state.lists.flatMap((list) => list.items.map((item) => ({ id: item.id, listId: list.id, mediaId: mediaId(item.media), position: item.position, note: item.note ?? null, createdAt: null }))),
  };
}
