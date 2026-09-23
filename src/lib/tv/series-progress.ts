import type { CatalogSeries } from "@/lib/media/types";
import { mediaKey } from "@/lib/persistence/domain";
import type { MosaicState } from "@/lib/persistence/types";

export interface SeriesProgress {
  watchedEpisodes: number;
  eligibleEpisodes?: number;
  progress: number;
  nextEpisode?: { seasonNumber: number; episodeNumber: number };
}

function episodeKey(seasonNumber: number, episodeNumber: number): string {
  return `${seasonNumber}:${episodeNumber}`;
}

/**
 * Progress is a current-state calculation. Explicit logs and imported season
 * completion are intentionally not projected into one another as history.
 * Specials are tracked in their own season but omitted from the overall series
 * percentage because providers do not count them in a series episode total.
 */
export function deriveSeriesProgress(state: MosaicState, series: CatalogSeries): SeriesProgress {
  const key = mediaKey(series);
  const counts = series.seasonEpisodeCounts;
  const eligibleCounts = series.eligibleEpisodeCounts;
  const watched = new Set<string>();
  let latestCanonicalWatch: { seasonNumber: number; episodeNumber: number; watchedAt: string } | undefined;
  for (const watch of state.episodeWatches) {
    if (mediaKey(watch.series) !== key || watch.seasonNumber === 0 || watch.episodeNumber < 1 || (eligibleCounts && watch.episodeNumber > (eligibleCounts[watch.seasonNumber] ?? 0))) continue;
    watched.add(episodeKey(watch.seasonNumber, watch.episodeNumber));
    if (!watch.isRewatch && (!latestCanonicalWatch || watch.watchedAt > latestCanonicalWatch.watchedAt)) latestCanonicalWatch = watch;
  }
  for (const season of state.seasonStates) {
    if (mediaKey(season.series) !== key || season.state !== "completed" || season.seasonNumber === 0) continue;
    const count = eligibleCounts?.[season.seasonNumber] ?? counts?.[season.seasonNumber];
    if (!count) continue;
    for (let episodeNumber = 1; episodeNumber <= count; episodeNumber++) watched.add(episodeKey(season.seasonNumber, episodeNumber));
  }

  const eligibleEpisodes = series.eligibleEpisodeCount ?? series.episodeCount;
  const watchedEpisodes = eligibleEpisodes === undefined ? watched.size : Math.min(watched.size, eligibleEpisodes);
  const progress = eligibleEpisodes && eligibleEpisodes > 0 ? Math.min(100, Math.round((watchedEpisodes / eligibleEpisodes) * 100)) : 0;
  let nextEpisode: SeriesProgress["nextEpisode"];
  if (counts) {
    const seasonNumbers = Object.keys(eligibleCounts ?? counts).map(Number).filter((number) => number > 0).sort((first, second) => first - second);
    const candidatesBySeason = seasonNumbers.flatMap((seasonNumber) => Array.from({ length: (eligibleCounts ?? counts)[seasonNumber] }, (_, index) => ({ seasonNumber, episodeNumber: index + 1 })));
    const afterLatest = latestCanonicalWatch ? candidatesBySeason.filter((candidate) => candidate.seasonNumber > latestCanonicalWatch!.seasonNumber || (candidate.seasonNumber === latestCanonicalWatch!.seasonNumber && candidate.episodeNumber > latestCanonicalWatch!.episodeNumber)) : [];
    const candidates = afterLatest.length ? afterLatest : candidatesBySeason;
    for (const candidate of candidates) {
      const { seasonNumber, episodeNumber } = candidate;
      if (!watched.has(episodeKey(seasonNumber, episodeNumber))) {
        nextEpisode = { seasonNumber, episodeNumber };
        break;
      }
    }
  }
  return { watchedEpisodes, eligibleEpisodes, progress, nextEpisode };
}
