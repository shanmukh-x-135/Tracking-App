import type { CatalogMedia, CatalogSeries } from "@/lib/media/types";
import { mediaKey } from "@/lib/persistence/domain";
import type { LibraryStatus, MosaicState } from "@/lib/persistence/types";
import { deriveSeriesProgress } from "@/lib/tv/series-progress";

export type CurrentMediaKind = "series" | "game" | "book";

export interface CurrentMediaItem {
  kind: CurrentMediaKind;
  media: CatalogMedia;
  status: "watching" | "playing" | "reading";
  label: string;
  detail: string;
  progress?: number;
  occurredAt: string;
}

export function importedSeriesStatus(facts: Record<string, boolean | null> | undefined): LibraryStatus | undefined {
  if (!facts) return undefined;
  if (facts.currently_watching) return "watching";
  if (facts.paused) return "paused";
  if (facts.dropped) return "dropped";
  if (facts.finished) return "completed";
  if (facts.watchlisted) return "watchlist";
  // The normalized source explicitly distinguishes historical viewing from an
  // active status. Keep history out of this screen-oriented projection.
  if (facts.watched_any) return "watched";
  return undefined;
}

export function deriveSeriesCurrentStatus(state: MosaicState, series: CatalogSeries): { status?: LibraryStatus; updatedAt?: string } {
  const key = mediaKey(series);
  const library = state.library.find((item) => mediaKey(item.media) === key);
  const imported = state.seriesStates.find((item) => mediaKey(item.series) === key);
  const importedStatus = importedSeriesStatus(imported?.facts);
  return { status: importedStatus ?? library?.status, updatedAt: imported?.updatedAt ?? library?.updatedAt };
}

function bookProgress(currentPage?: number, totalPages?: number, percentage?: number): number | undefined {
  if (percentage !== undefined) return percentage;
  return totalPages && totalPages > 0 ? Math.round(((currentPage ?? 0) / totalPages) * 100) : undefined;
}

/**
 * The sole source of resumable media for Home, Profile, and Library.
 * Historical logs contribute recency and progress but never activate media.
 */
export function deriveCurrentMedia(state: MosaicState, options: { limit?: number } = {}): CurrentMediaItem[] {
  const candidates = new Map<string, CurrentMediaItem>();
  const add = (item: CurrentMediaItem): void => {
    const key = mediaKey(item.media);
    const current = candidates.get(key);
    if (!current || item.occurredAt > current.occurredAt || (item.occurredAt === current.occurredAt && item.kind.localeCompare(current.kind) < 0)) candidates.set(key, item);
  };

  const seriesByKey = new Map<string, CatalogSeries>();
  for (const entry of state.library) if (entry.media.mediaType === "tv") seriesByKey.set(mediaKey(entry.media), entry.media);
  for (const seriesState of state.seriesStates) if (seriesState.series.mediaType === "tv") seriesByKey.set(mediaKey(seriesState.series), seriesState.series);
  for (const series of seriesByKey.values()) {
    const current = deriveSeriesCurrentStatus(state, series);
    if (current.status !== "watching") continue;
    const progress = deriveSeriesProgress(state, series);
    const label = progress.nextEpisode ? `Next · S${String(progress.nextEpisode.seasonNumber).padStart(2, "0")}E${String(progress.nextEpisode.episodeNumber).padStart(2, "0")}` : "Continue watching";
    const detail = progress.eligibleEpisodes === undefined ? "Episode total unavailable" : `${progress.watchedEpisodes} / ${progress.eligibleEpisodes} released episodes`;
    add({ kind: "series", media: series, status: "watching", label, detail, progress: progress.eligibleEpisodes === undefined ? undefined : progress.progress, occurredAt: current.updatedAt ?? "" });
  }
  for (const reading of state.bookReadings) {
    if (reading.status !== "reading") continue;
    const progress = bookProgress(reading.currentPage, reading.totalPages, reading.progressPercent);
    add({ kind: "book", media: reading.media, status: "reading", label: reading.totalPages ? `${reading.currentPage ?? 0} / ${reading.totalPages} pages` : "Reading", detail: "Update progress", progress, occurredAt: reading.updatedAt });
  }
  for (const playthrough of state.gamePlaythroughs) {
    if (playthrough.status !== "playing") continue;
    add({ kind: "game", media: playthrough.media, status: "playing", label: playthrough.platform ? `Playing on ${playthrough.platform}` : "Playing", detail: `${Math.round(playthrough.playtimeMinutes / 6) / 10}h played`, progress: playthrough.progressPercent, occurredAt: playthrough.updatedAt });
  }
  const ranked = [...candidates.values()].sort((first, second) => second.occurredAt.localeCompare(first.occurredAt) || first.kind.localeCompare(second.kind) || first.media.title.localeCompare(second.media.title) || mediaKey(first.media).localeCompare(mediaKey(second.media)));
  return options.limit === undefined ? ranked : ranked.slice(0, options.limit);
}
