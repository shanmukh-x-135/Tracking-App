import { projectActivity } from "@/lib/activity/projection";
import type { MosaicState } from "@/lib/persistence/types";

export interface MosaicAnalytics {
  generatedAt: string;
  mediaMix: { movie: number; tv: number; game: number; book: number };
  ratingDistribution: { value: number; count: number }[];
  movie: { watches: number; rewatches: number; uniqueMovies: number };
  tv: { episodesWatched: number; showsProgressed: number };
  game: { completedPlaythroughs: number; playtimeMinutes: number };
  book: { finished: number; pagesRead: number };
  monthlyActivity: { month: string; count: number }[];
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
    mediaMix: { movie: state.movieWatches.length, tv: state.episodeWatches.length, game: state.gamePlaythroughs.length, book: state.bookReadings.length },
    ratingDistribution: [1, 2, 3, 4, 5].map((value) => ({ value, count: state.ratings.filter((rating) => Math.round(rating.value) === value).length })),
    movie: { watches: state.movieWatches.length, rewatches: state.movieWatches.filter(({ isRewatch }) => isRewatch).length, uniqueMovies: new Set(state.movieWatches.map(({ media }) => `${media.provider}:${media.providerId}`)).size },
    tv: { episodesWatched: state.episodeWatches.length, showsProgressed: new Set(state.episodeWatches.map(({ series }) => `${series.provider}:${series.providerId}`)).size },
    game: { completedPlaythroughs: state.gamePlaythroughs.filter(({ status }) => status === "completed").length, playtimeMinutes: state.gamePlaythroughs.reduce((total, item) => total + item.playtimeMinutes, 0) },
    book: { finished: state.bookReadings.filter(({ status }) => status === "finished").length, pagesRead: state.bookReadings.reduce((total, item) => total + (item.currentPage ?? 0), 0) },
    monthlyActivity: [...months.entries()].sort(([first], [second]) => first.localeCompare(second)).map(([month, count]) => ({ month, count })),
  };
}
