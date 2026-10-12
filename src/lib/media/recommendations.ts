import type { CatalogMedia } from "@/lib/media/types";
import { mediaKey } from "@/lib/persistence/domain";
import type { MosaicState } from "@/lib/persistence/types";
import type { MediaType } from "@/types/media";

export const maxRecommendationSeeds = 3;
const perSeed = 12;
/** A seed the user rated this low (out of 5) did not land, so it never explains a recommendation. */
const dislikedAtOrBelow = 2;

export interface RecommendationSeed {
  media: CatalogMedia;
  watchedAt: string;
}

export interface Recommendation {
  seed: CatalogMedia;
  items: CatalogMedia[];
}

/**
 * Seeds come only from event-level watch history: logged movie watches and logged episodes. Library
 * statuses, progress timestamps, games and books are never treated as something the user watched. Only
 * providers with native recommendations (TMDB; the mock catalog in mock mode) can seed. Most recent first,
 * one seed per title, at most `limit` seeds so the request count stays bounded.
 */
export function recommendationSeeds(state: MosaicState, type: MediaType | null, limit = maxRecommendationSeeds): RecommendationSeed[] {
  if (type === "game" || type === "book") return [];
  const disliked = new Set(state.ratings.filter((rating) => rating.value <= dislikedAtOrBelow).map((rating) => rating.mediaKey));
  const events = [
    ...state.movieWatches.map((watch) => ({ media: watch.media, watchedAt: watch.watchedAt })),
    ...state.episodeWatches.map((watch) => ({ media: watch.series, watchedAt: watch.watchedAt })),
  ]
    .filter(({ media }) => (media.provider === "tmdb" || media.provider === "mock") && (media.mediaType === "movie" || media.mediaType === "tv"))
    .filter(({ media }) => !type || media.mediaType === type)
    .filter(({ media }) => !disliked.has(mediaKey(media)))
    .sort((first, second) => second.watchedAt.localeCompare(first.watchedAt));
  const seeds = new Map<string, RecommendationSeed>();
  for (const event of events) if (!seeds.has(mediaKey(event.media))) seeds.set(mediaKey(event.media), event);
  return [...seeds.values()].slice(0, limit);
}

/**
 * Pairs each seed with the provider's recommendations for it. Titles the user already tracks or has
 * watched are left out (their records are untouched), a title appears under the first seed that suggested
 * it, and seeds with nothing new are dropped. `results[i]` is null when seed i's request failed.
 */
export function buildRecommendations(seeds: RecommendationSeed[], results: ReadonlyArray<CatalogMedia[] | null>, state: MosaicState): Recommendation[] {
  const excluded = new Set([
    ...state.library.map((entry) => mediaKey(entry.media)),
    ...state.movieWatches.map((watch) => mediaKey(watch.media)),
    ...state.episodeWatches.map((watch) => mediaKey(watch.series)),
    ...seeds.map((seed) => mediaKey(seed.media)),
  ]);
  return seeds.flatMap((seed, index) => {
    const items: CatalogMedia[] = [];
    for (const item of results[index] ?? []) {
      const key = mediaKey(item);
      if (excluded.has(key)) continue;
      excluded.add(key);
      items.push(item);
    }
    return items.length ? [{ seed: seed.media, items: items.slice(0, perSeed) }] : [];
  });
}
