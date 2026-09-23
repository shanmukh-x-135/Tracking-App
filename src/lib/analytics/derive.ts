import { projectActivity } from "@/lib/activity/projection";
import { deriveCurrentMedia } from "@/lib/current-media/projection";
import { deriveSeriesCurrentStatus } from "@/lib/current-media/projection";
import { mediaKey } from "@/lib/persistence/domain";
import type { MosaicState } from "@/lib/persistence/types";
import type { CatalogSeries } from "@/lib/media/types";

export interface MosaicAnalytics {
  generatedAt: string;
  mediaMix: { movie: number; tv: number; game: number; book: number };
  ratingDistribution: { value: number; count: number }[];
  movie: { watches: number; rewatches: number; uniqueMovies: number };
  tv: {
    /** Distinct episode identities with an explicit watch log. Rewatches do not inflate this. */
    uniqueEpisodesWatched: number;
    /** All explicit episode diary events, including rewatches. */
    episodeWatchLogs: number;
    episodeRewatches: number;
    /** Bulk/imported season state is intentionally separate from dated episode history. */
    completedSeasons: number;
    showsInProgress: number;
  };
  game: { completedPlaythroughs: number; playtimeMinutes: number };
  book: { finished: number; pagesRead: number };
  monthlyActivity: { month: string; count: number }[];
}

export interface TvMetrics {
  uniqueEpisodesWatched: number;
  episodeWatchLogs: number;
  episodeRewatches: number;
  completedSeasons: number;
  showsInProgress: number;
  seriesStatuses: { watching: number; paused: number; completed: number; dropped: number; watchlist: number };
}

/**
 * TV imports can contain a mixture of dated episode diary entries and bulk
 * season state. Keep those concepts separate: a rewatch is another history
 * event, while bulk completion never invents episode-level history.
 */
export function deriveTvMetrics(state: MosaicState): TvMetrics {
  const episodeIdentity = (watch: MosaicState["episodeWatches"][number]) => `${watch.series.provider}:${watch.series.providerId}:${watch.seasonNumber}:${watch.episodeNumber}`;
  const inProgressSeries = deriveCurrentMedia(state).filter(({ kind }) => kind === "series");
  const series = new Map<string, CatalogSeries>();
  for (const item of state.library) if (item.media.mediaType === "tv") series.set(mediaKey(item.media), item.media);
  for (const item of state.seriesStates) if (item.series.mediaType === "tv") series.set(mediaKey(item.series), item.series);
  const seriesStatuses = { watching: 0, paused: 0, completed: 0, dropped: 0, watchlist: 0 };
  for (const item of series.values()) {
    const status = deriveSeriesCurrentStatus(state, item).status;
    if (status && status in seriesStatuses) seriesStatuses[status as keyof typeof seriesStatuses] += 1;
  }
  return {
    uniqueEpisodesWatched: new Set(state.episodeWatches.map(episodeIdentity)).size,
    episodeWatchLogs: state.episodeWatches.length,
    episodeRewatches: state.episodeWatches.filter(({ isRewatch }) => isRewatch).length,
    completedSeasons: state.seasonStates.filter(({ state: status }) => status === "completed").length,
    showsInProgress: inProgressSeries.length,
    seriesStatuses,
  };
}

/** Rebuildable analytics derived only from normalized current/history state. */
export function deriveAnalytics(state: MosaicState, generatedAt = new Date().toISOString()): MosaicAnalytics {
  const events = projectActivity(state);
  const months = new Map<string, number>();
  for (const event of events) {
    const month = event.occurredAt.slice(0, 7);
    months.set(month, (months.get(month) ?? 0) + 1);
  }
  return {
    generatedAt,
    mediaMix: { movie: state.movieWatches.length, tv: deriveTvMetrics(state).uniqueEpisodesWatched, game: state.gamePlaythroughs.length, book: state.bookReadings.length },
    ratingDistribution: [1, 2, 3, 4, 5].map((value) => ({ value, count: state.ratings.filter((rating) => Math.round(rating.value) === value).length })),
    movie: { watches: state.movieWatches.length, rewatches: state.movieWatches.filter(({ isRewatch }) => isRewatch).length, uniqueMovies: new Set(state.movieWatches.map(({ media }) => `${media.provider}:${media.providerId}`)).size },
    tv: deriveTvMetrics(state),
    game: { completedPlaythroughs: state.gamePlaythroughs.filter(({ status }) => status === "completed").length, playtimeMinutes: state.gamePlaythroughs.reduce((total, item) => total + item.playtimeMinutes, 0) },
    book: { finished: state.bookReadings.filter(({ status }) => status === "finished").length, pagesRead: state.bookReadings.reduce((total, item) => total + (item.currentPage ?? 0), 0) },
    monthlyActivity: [...months.entries()].sort(([first], [second]) => first.localeCompare(second)).map(([month, count]) => ({ month, count })),
  };
}
