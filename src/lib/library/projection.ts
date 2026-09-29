import type { MediaProvider } from "@/lib/media/types";
import { calculateBookProgress, mediaKey } from "@/lib/persistence/domain";
import type { LibraryStatus, MosaicState } from "@/lib/persistence/types";
import { deriveSeriesProgress } from "@/lib/tv/series-progress";
import type { MediaType } from "@/types/media";

export type LibrarySort = "updated" | "title" | "rating" | "release";

export interface SeriesLibraryProgress {
  watchedEpisodes: number;
  totalEpisodes: number | null;
  percent: number | null;
  nextSeasonNumber?: number;
  nextEpisodeNumber?: number;
}

export interface BookLibraryProgress {
  currentPage: number | null;
  totalPages: number | null;
  percent: number | null;
}

export interface GameLibraryProgress {
  playtimeMinutes: number;
  percent: number | null;
}

export type LibraryProgress = SeriesLibraryProgress | BookLibraryProgress | GameLibraryProgress;

/** Stable, tile-ready mobile representation of a complete tracked library entry. */
export interface MobileLibraryEntry {
  id: string;
  mediaType: MediaType;
  provider: MediaProvider;
  providerId: string;
  title: string;
  posterUrl?: string;
  backdropUrl?: string;
  releaseYear?: number;
  status: LibraryStatus;
  userRating: number | null;
  isFavorite: boolean;
  updatedAt: string;
  progress?: LibraryProgress;
}

export interface LibraryProjectionOptions {
  mediaType?: MediaType;
  status?: LibraryStatus;
  sort?: LibrarySort;
}

function latestByMedia<T extends { media: { provider: MediaProvider; mediaType: MediaType; providerId: string }; updatedAt: string }>(items: T[], id: string): T | undefined {
  return items.filter((item) => `${item.media.provider}:${item.media.mediaType}:${item.media.providerId}` === id).sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))[0];
}

function compareEntries(first: MobileLibraryEntry, second: MobileLibraryEntry, sort: LibrarySort): number {
  if (sort === "title") return first.title.localeCompare(second.title) || first.id.localeCompare(second.id);
  if (sort === "rating") return (second.userRating ?? -1) - (first.userRating ?? -1) || second.updatedAt.localeCompare(first.updatedAt) || first.id.localeCompare(second.id);
  if (sort === "release") return (second.releaseYear ?? -1) - (first.releaseYear ?? -1) || second.updatedAt.localeCompare(first.updatedAt) || first.id.localeCompare(second.id);
  return second.updatedAt.localeCompare(first.updatedAt) || first.id.localeCompare(second.id);
}

export function projectLibraryEntries(state: MosaicState, options: LibraryProjectionOptions = {}): MobileLibraryEntry[] {
  const ratings = new Map(state.ratings.map((rating) => [rating.mediaKey, rating.value]));
  const entries = state.library.map((entry): MobileLibraryEntry => {
    const id = mediaKey(entry.media);
    const base = {
      id,
      mediaType: entry.media.mediaType,
      provider: entry.media.provider,
      providerId: entry.media.providerId,
      title: entry.media.title,
      posterUrl: entry.media.posterUrl,
      backdropUrl: entry.media.backdropUrl,
      releaseYear: entry.media.releaseYear,
      status: entry.status,
      userRating: ratings.get(id) ?? null,
      isFavorite: entry.isFavorite,
      updatedAt: entry.updatedAt,
    };
    if (entry.media.mediaType === "tv") {
      const progress = deriveSeriesProgress(state, entry.media);
      return {
        ...base,
        progress: {
          watchedEpisodes: progress.watchedEpisodes,
          totalEpisodes: progress.eligibleEpisodes ?? null,
          percent: progress.eligibleEpisodes === undefined ? null : progress.progress,
          ...(progress.nextEpisode ? { nextSeasonNumber: progress.nextEpisode.seasonNumber, nextEpisodeNumber: progress.nextEpisode.episodeNumber } : {}),
        },
      };
    }
    if (entry.media.mediaType === "book") {
      const reading = latestByMedia(state.bookReadings, id);
      if (!reading) return base;
      const percent = reading ? calculateBookProgress(reading.currentPage, reading.totalPages, reading.progressPercent) : undefined;
      return { ...base, progress: { currentPage: reading?.currentPage ?? null, totalPages: reading?.totalPages ?? null, percent: percent ?? null } };
    }
    if (entry.media.mediaType === "game") {
      const playthrough = latestByMedia(state.gamePlaythroughs, id);
      if (!playthrough) return base;
      return { ...base, progress: { playtimeMinutes: playthrough?.playtimeMinutes ?? 0, percent: playthrough?.progressPercent ?? null } };
    }
    return base;
  });
  return entries
    .filter((entry) => (!options.mediaType || entry.mediaType === options.mediaType) && (!options.status || entry.status === options.status))
    .sort((first, second) => compareEntries(first, second, options.sort ?? "updated"));
}
