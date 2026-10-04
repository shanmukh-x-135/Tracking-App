import { createProviderKey } from "@/lib/media/identity";
import { calculateBookProgress, mediaKey } from "@/lib/persistence/domain";
import type { CatalogMedia } from "@/lib/media/types";
import type { MosaicState } from "@/lib/persistence/types";

export type MosaicPeriod = { kind: "all"; label: "All time" } | { kind: "year"; year: number; label: string };
export type MosaicMediaType = "movie" | "series" | "game" | "book";

export interface MosaicTile {
  key: string;
  mediaType: MosaicMediaType;
  providerId: string;
  title: string;
  artwork?: string;
  href: string;
  activity: { firstActivityAt?: string; lastActivityAt?: string; eventCount: number; progress?: number; completed?: boolean };
  userSignals: { rating?: number; favorite?: true; rewatchCount?: number };
  providerMetadata: { year?: number; genres?: string[] };
  /** Bounded visual area only, never a preference or taste score. */
  visualWeight: number;
}

export interface MosaicSnapshot {
  period: MosaicPeriod;
  generatedAt: string;
  totals: { storiesRepresented: number; byMediaType: Record<MosaicMediaType, number>; movieWatchLogs: number };
  tiles: MosaicTile[];
}

interface ActivitySeed { media: CatalogMedia; occurredAt: string; isRewatch?: boolean; progress?: number; completed?: boolean; }

export function periodFor(input?: string | null): MosaicPeriod {
  if (!input || input === "all") return { kind: "all", label: "All time" };
  if (/^\d{4}$/.test(input) && Number(input) >= 1900 && Number(input) <= 2100) return { kind: "year", year: Number(input), label: input };
  throw new Error("The requested Mosaic period is invalid.");
}

export function deriveProfileMovieCount(state: MosaicState): number {
  return state.movieWatches.length;
}

function mediaType(media: CatalogMedia): MosaicMediaType { return media.mediaType === "tv" ? "series" : media.mediaType; }
function mediaHref(media: CatalogMedia): string {
  const type = media.mediaType === "tv" ? "series" : media.mediaType;
  return `/${type}/${encodeURIComponent(createProviderKey({ provider: media.provider, mediaType: media.mediaType, providerId: media.providerId }))}`;
}
function withinPeriod(value: string, period: MosaicPeriod): boolean { return period.kind === "all" || value.slice(0, 4) === String(period.year); }
function boundedWeight(events: number, rewatchCount: number, favorite: boolean, rating?: number): number {
  // Activity has the largest effect; optional signals are small enrichments.
  return Math.min(2.25, Number((1 + Math.min(events - 1, 6) * .14 + Math.min(rewatchCount, 3) * .1 + (favorite ? .12 : 0) + (rating && rating >= 4 ? .08 : 0)).toFixed(2)));
}

/**
 * The sole representation projector for Your Mosaic. Inclusion is activity-led:
 * library status, ratings, and favourites enrich an existing tile but never create one.
 */
export function deriveMosaicSnapshot(state: MosaicState, period: MosaicPeriod = periodFor(), generatedAt = new Date().toISOString()): MosaicSnapshot {
  const activity: ActivitySeed[] = [
    ...state.movieWatches.map((watch) => ({ media: watch.media, occurredAt: watch.watchedAt, isRewatch: watch.isRewatch })),
    // A series tile requires explicit watched episodes; a watching status alone is never enough.
    ...state.episodeWatches.map((watch) => ({ media: watch.series, occurredAt: watch.watchedAt, isRewatch: watch.isRewatch })),
    ...state.gamePlaythroughs.filter((item) => item.playtimeMinutes > 0 || (item.progressPercent ?? 0) > 0).map((item) => ({ media: item.media, occurredAt: item.updatedAt, progress: item.progressPercent, completed: item.status === "completed" })),
    ...state.bookReadings.map((item) => ({ item, progress: calculateBookProgress(item.currentPage, item.totalPages, item.progressPercent) })).filter(({ progress }) => progress !== undefined && progress > 0).map(({ item, progress }) => ({ media: item.media, occurredAt: item.updatedAt, progress, completed: item.status === "finished" })),
  ].filter((event) => withinPeriod(event.occurredAt, period));
  const grouped = new Map<string, ActivitySeed[]>();
  for (const event of activity) grouped.set(mediaKey(event.media), [...(grouped.get(mediaKey(event.media)) ?? []), event]);
  const byMediaType: Record<MosaicMediaType, number> = { movie: 0, series: 0, game: 0, book: 0 };
  const tiles = [...grouped.entries()].map(([key, events]) => {
    const media = events[0].media;
    const library = state.library.find((entry) => mediaKey(entry.media) === key);
    const rating = state.ratings.find((entry) => entry.mediaKey === key)?.value;
    const rewatchCount = events.filter((event) => event.isRewatch).length;
    const dated = events.map((event) => event.occurredAt).sort();
    const progress = events.map((event) => event.progress).filter((value): value is number => value !== undefined).at(-1);
    const completed = events.some((event) => event.completed);
    const type = mediaType(media);
    byMediaType[type] += 1;
    return {
      key, mediaType: type, providerId: media.providerId, title: media.title, artwork: media.posterUrl ?? media.backdropUrl,
      href: mediaHref(media), activity: { firstActivityAt: dated[0], lastActivityAt: dated.at(-1), eventCount: events.length, ...(progress === undefined ? {} : { progress }), ...(completed ? { completed: true } : {}) },
      userSignals: { ...(rating === undefined ? {} : { rating }), ...(library?.isFavorite ? { favorite: true } : {}), ...(rewatchCount ? { rewatchCount } : {}) },
      providerMetadata: { ...(media.releaseYear === undefined ? {} : { year: media.releaseYear }), ...(media.genres.length ? { genres: media.genres } : {}) },
      visualWeight: boundedWeight(events.length, rewatchCount, Boolean(library?.isFavorite), rating),
    } satisfies MosaicTile;
  }).sort((first, second) => (second.activity.lastActivityAt ?? "").localeCompare(first.activity.lastActivityAt ?? "") || first.key.localeCompare(second.key));
  return { period, generatedAt, totals: { storiesRepresented: tiles.length, byMediaType, movieWatchLogs: deriveProfileMovieCount(state) }, tiles };
}
