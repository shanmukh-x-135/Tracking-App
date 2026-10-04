import type { CatalogMedia, CatalogSeries, MediaProvider } from "@/lib/media/types";
import { calculateBookProgress, mediaKey } from "@/lib/persistence/domain";
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

export interface SeriesContinueProgress {
  watchedEpisodes: number;
  /** `null` when Mosaic does not know the aired, non-special episode total. */
  totalEpisodes: number | null;
  /** `null` when there is no trustworthy denominator. */
  percent: number | null;
  nextSeasonNumber?: number;
  nextEpisodeNumber?: number;
}

export interface BookContinueProgress {
  currentPage: number | null;
  totalPages: number | null;
  /** `null` when neither a supplied percentage nor a page denominator is known. */
  percent: number | null;
}

export interface GameContinueProgress {
  percent: number | null;
  playtimeMinutes: number;
}

export type ContinueProgress = SeriesContinueProgress | BookContinueProgress | GameContinueProgress;

export type ContinueNextAction =
  | { type: "log_episode"; seasonNumber?: number; episodeNumber?: number }
  | { type: "update_book_progress" }
  | { type: "update_game_playthrough" };

/**
 * Stable, catalog-normalized representation for native clients. It contains no
 * presentation labels or persistence-row details, so clients never have to
 * recreate Mosaic's active-state or progress rules.
 */
export interface ContinueItem {
  id: string;
  mediaType: CurrentMediaKind;
  provider: MediaProvider;
  providerId: string;
  title: string;
  posterUrl?: string;
  backdropUrl?: string;
  status: CurrentMediaItem["status"];
  lastActivityAt: string | null;
  progress: ContinueProgress;
  nextAction: ContinueNextAction;
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
  for (const watch of state.episodeWatches) if (watch.series.mediaType === "tv") seriesByKey.set(mediaKey(watch.series), watch.series);
  for (const series of seriesByKey.values()) {
    const current = deriveSeriesCurrentStatus(state, series);
    const progress = deriveSeriesProgress(state, series);
    // Continue is an activity surface: a status alone is never enough. The
    // released denominator protects currently-airing shows from future episodes.
    if (!progress.eligibleEpisodes || progress.watchedEpisodes <= 0 || progress.watchedEpisodes >= progress.eligibleEpisodes) continue;
    if (["completed", "dropped", "watchlist", "paused", "watched"].includes(current.status ?? "")) continue;
    const label = progress.nextEpisode ? `Next · S${String(progress.nextEpisode.seasonNumber).padStart(2, "0")}E${String(progress.nextEpisode.episodeNumber).padStart(2, "0")}` : "Continue watching";
    const latestWatch = state.episodeWatches.filter((watch) => !watch.isRewatch && mediaKey(watch.series) === mediaKey(series)).sort((first, second) => second.watchedAt.localeCompare(first.watchedAt))[0];
    add({ kind: "series", media: series, status: "watching", label, detail: `${progress.watchedEpisodes} / ${progress.eligibleEpisodes} released episodes`, progress: progress.progress, occurredAt: latestWatch?.watchedAt ?? current.updatedAt ?? "" });
  }
  for (const reading of state.bookReadings) {
    const progress = calculateBookProgress(reading.currentPage, reading.totalPages, reading.progressPercent);
    if (progress === undefined || progress <= 0 || progress >= 100 || ["finished", "dnf"].includes(reading.status)) continue;
    const label = reading.totalPages ? `${reading.currentPage ?? 0} / ${reading.totalPages} pages` : `${progress}% read`;
    add({ kind: "book", media: reading.media, status: "reading", label, detail: "Reading progress", progress, occurredAt: reading.updatedAt });
  }
  for (const playthrough of state.gamePlaythroughs) {
    const hasPartialProgress = playthrough.progressPercent !== undefined
      ? playthrough.progressPercent > 0 && playthrough.progressPercent < 100
      : playthrough.playtimeMinutes > 0;
    if (!hasPartialProgress || ["completed", "dropped"].includes(playthrough.status)) continue;
    add({ kind: "game", media: playthrough.media, status: "playing", label: playthrough.platform ? `Playing on ${playthrough.platform}` : "Playing", detail: playthrough.progressPercent === undefined ? `${Math.round(playthrough.playtimeMinutes / 6) / 10}h played` : `${playthrough.progressPercent}% complete`, progress: playthrough.progressPercent, occurredAt: playthrough.updatedAt });
  }
  const ranked = [...candidates.values()].sort((first, second) => second.occurredAt.localeCompare(first.occurredAt) || first.kind.localeCompare(second.kind) || first.media.title.localeCompare(second.media.title) || mediaKey(first.media).localeCompare(mediaKey(second.media)));
  return options.limit === undefined ? ranked : ranked.slice(0, options.limit);
}

/** Projects the existing current-media state into the versioned mobile contract. */
export function projectContinueItems(state: MosaicState, options: { limit?: number } = {}): ContinueItem[] {
  return deriveCurrentMedia(state, options).map((item) => {
    const base = {
      id: mediaKey(item.media),
      mediaType: item.kind,
      provider: item.media.provider,
      providerId: item.media.providerId,
      title: item.media.title,
      posterUrl: item.media.posterUrl,
      backdropUrl: item.media.backdropUrl,
      status: item.status,
      lastActivityAt: item.occurredAt || null,
    };

    if (item.kind === "series" && item.media.mediaType === "tv") {
      const seriesProgress = deriveSeriesProgress(state, item.media);
      return {
        ...base,
        progress: {
          watchedEpisodes: seriesProgress.watchedEpisodes,
          totalEpisodes: seriesProgress.eligibleEpisodes ?? null,
          percent: seriesProgress.eligibleEpisodes === undefined ? null : seriesProgress.progress,
          ...(seriesProgress.nextEpisode ? {
            nextSeasonNumber: seriesProgress.nextEpisode.seasonNumber,
            nextEpisodeNumber: seriesProgress.nextEpisode.episodeNumber,
          } : {}),
        },
        nextAction: seriesProgress.nextEpisode
          ? { type: "log_episode" as const, seasonNumber: seriesProgress.nextEpisode.seasonNumber, episodeNumber: seriesProgress.nextEpisode.episodeNumber }
          : { type: "log_episode" as const },
      } satisfies ContinueItem;
    }

    if (item.kind === "book" && item.media.mediaType === "book") {
      const reading = state.bookReadings.find((candidate) => mediaKey(candidate.media) === base.id);
      const percent = reading ? calculateBookProgress(reading.currentPage, reading.totalPages, reading.progressPercent) : undefined;
      return {
        ...base,
        progress: {
          currentPage: reading?.currentPage ?? null,
          totalPages: reading?.totalPages ?? null,
          percent: percent ?? null,
        },
        nextAction: { type: "update_book_progress" },
      } satisfies ContinueItem;
    }

    const playthrough = state.gamePlaythroughs.find((candidate) => mediaKey(candidate.media) === base.id);
    return {
      ...base,
      progress: {
        percent: playthrough?.progressPercent ?? null,
        playtimeMinutes: playthrough?.playtimeMinutes ?? 0,
      },
      nextAction: { type: "update_game_playthrough" },
    } satisfies ContinueItem;
  });
}
