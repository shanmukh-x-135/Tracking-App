import type { ProviderIdentity } from "@/lib/media/identity";
import type { CatalogMedia } from "@/lib/media/types";
import type { MediaType } from "@/types/media";

export type ImportSource = "letterboxd" | "backloggd" | "serializd" | "serializd_normalized_v1" | "fable" | "generic_movies" | "generic_series" | "generic_games" | "generic_books";
export type ImportConflictPolicy = "keep_mosaic" | "use_imported" | "review";
export type MatchConfidence = "exact" | "high" | "medium" | "ambiguous" | "unmatched";

export interface ImportRowError {
  row: number;
  field?: string;
  message: string;
}

interface ImportRecordBase {
  source: ImportSource;
  sourceRecordKey: string;
  mediaType: MediaType;
  title: string;
  originalTitle?: string;
  year?: number;
  rating?: number;
  review?: string;
  providerIdentity?: ProviderIdentity;
  sourceMetadata: Record<string, string>;
}

export interface ImportListContext {
  sourceListKey: string;
  title: string;
  description?: string;
  position: number;
  note?: string;
}

export interface MovieImportRecord extends ImportRecordBase {
  mediaType: "movie";
  recordKind?: "library" | "history" | "list_item";
  status?: "watchlist" | "watched";
  watchedDate?: string;
  isRewatch?: boolean;
  tags?: string[];
  list?: ImportListContext;
}

export interface SeriesImportRecord extends ImportRecordBase {
  mediaType: "tv";
  status?: "watchlist" | "watching" | "completed" | "paused" | "dropped";
  recordKind?: "show_state" | "season_state" | "event";
  targetType?: "show" | "season" | "episode";
  tmdbSeasonId?: number;
  seasonState?: "completed" | "watchlist";
  stateFacts?: Record<string, boolean | null>;
  isFavorite?: boolean;
  defaultImport?: boolean;
  isRewatch?: boolean;
  isLog?: boolean;
  containsSpoilers?: boolean;
  tags?: string[];
  sourceCreatedAt?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeTitle?: string;
  episodeProviderId?: string;
  watchedDate?: string;
}

export interface GameImportRecord extends ImportRecordBase {
  mediaType: "game";
  status?: "backlog" | "playing" | "paused" | "completed" | "dropped";
  platform?: string;
  startedAt?: string;
  completedAt?: string;
  playtimeMinutes?: number;
  progressPercent?: number;
}

export interface BookImportRecord extends ImportRecordBase {
  mediaType: "book";
  status?: "want_to_read" | "reading" | "paused" | "finished" | "dnf";
  author?: string;
  startedAt?: string;
  finishedAt?: string;
  currentPage?: number;
  totalPages?: number;
}

export type NormalizedImportRecord = MovieImportRecord | SeriesImportRecord | GameImportRecord | BookImportRecord;

export interface ParseResult {
  records: NormalizedImportRecord[];
  errors: ImportRowError[];
  duplicateCount: number;
  warnings: string[];
  normalizedSummary?: Record<string, number>;
}

export interface ImportParser {
  readonly source: ImportSource;
  accepts(filename: string, mimeType?: string): boolean;
  parse(contents: Uint8Array, filename: string): ParseResult;
}

export interface MatchCandidate {
  media: CatalogMedia;
  score: number;
  reasons: string[];
}

export interface MatchResult {
  confidence: MatchConfidence;
  resolved?: CatalogMedia;
  candidates: MatchCandidate[];
}

export type ReconciliationDecision = "accepted" | "review" | "skipped";

export interface ReconciliationRow {
  record: NormalizedImportRecord;
  match: MatchResult;
  decision: ReconciliationDecision;
  selected?: CatalogMedia;
}

export interface ImportPreviewCounts {
  total: number;
  automaticMatches: number;
  needsReview: number;
  unmatched: number;
  libraryEntries: number;
  ratings: number;
  reviews: number;
  movieWatches: number;
  episodeWatches: number;
  gamePlaythroughs: number;
  bookReadings: number;
  lists: number;
  duplicates: number;
  invalid: number;
  skipped: number;
}

export interface ImportPreview {
  jobId?: string;
  source: ImportSource;
  filename: string;
  rows: ReconciliationRow[];
  counts: ImportPreviewCounts;
  errors: ImportRowError[];
  warnings: string[];
  normalizedSummary?: Record<string, number>;
}
