import type { CatalogEpisode } from "@/lib/media/types";

/** Provider responses may repeat an episode during localization or retries.
 * Coordinates are the stable identity within a season. */
export function normalizeSeasonEpisodes(episodes: CatalogEpisode[]): CatalogEpisode[] {
  return episodes
    .filter((episode, index, all) => episode.episodeNumber > 0 && all.findIndex((candidate) => candidate.id === episode.id || candidate.episodeNumber === episode.episodeNumber) === index)
    .sort((first, second) => first.episodeNumber - second.episodeNumber);
}
