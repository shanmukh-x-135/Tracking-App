import "server-only";
import { cache } from "react";
import { mediaById } from "@/data/media";
import { getCatalogItem, getCatalogSeasonEpisodes } from "@/lib/media/catalog";
import { parseProviderKey } from "@/lib/media/identity";
import { normalizeMock } from "@/lib/media/providers/mock";
import { normalizeSeasonEpisodes } from "@/lib/tv/season-episodes";
import type { CatalogEpisode, CatalogMedia, CatalogSeries } from "@/lib/media/types";
import type { MediaType } from "@/types/media";

export const resolveDetailMedia = cache(async (id: string, mediaType: MediaType): Promise<CatalogMedia | null> => {
  let decodedId: string;
  try { decodedId = decodeURIComponent(id); } catch { return null; }
  const fixture = mediaById(decodedId);
  if (fixture?.mediaType === mediaType) return normalizeMock(fixture);
  const identity = parseProviderKey(decodedId);
  if (!identity || identity.mediaType !== mediaType) return null;
  try {
    return await getCatalogItem(identity);
  } catch {
    return null;
  }
});

export interface ResolvedSeriesSeason {
  series: CatalogSeries;
  seasonNumber: number;
  episodes: CatalogEpisode[];
}

/** Resolves one season server-side, so detail navigation never turns into a browser N+1 fetch. */
export const resolveSeriesSeason = cache(async (id: string, seasonNumber: number): Promise<ResolvedSeriesSeason | null> => {
  if (!Number.isInteger(seasonNumber) || seasonNumber < 0) return null;
  const media = await resolveDetailMedia(id, "tv");
  if (!media || media.mediaType !== "tv") return null;
  const knownSeasons = media.seasonNumbers ?? media.seasons?.map((season) => season.seasonNumber) ?? [];
  if (!knownSeasons.includes(seasonNumber)) return null;
  try {
    const episodes = await getCatalogSeasonEpisodes({ provider: media.provider, mediaType: "tv", providerId: media.providerId }, seasonNumber);
    return { series: media, seasonNumber, episodes: normalizeSeasonEpisodes(episodes) };
  } catch {
    return null;
  }
});

export const resolveSeriesEpisode = cache(async (id: string, seasonNumber: number, episodeNumber: number): Promise<(ResolvedSeriesSeason & { episode: CatalogEpisode; previous?: CatalogEpisode; next?: CatalogEpisode }) | null> => {
  const season = await resolveSeriesSeason(id, seasonNumber);
  if (!season || !Number.isInteger(episodeNumber) || episodeNumber < 1) return null;
  const index = season.episodes.findIndex((episode) => episode.episodeNumber === episodeNumber);
  if (index === -1) return null;
  return { ...season, episode: season.episodes[index], previous: season.episodes[index - 1], next: season.episodes[index + 1] };
});
