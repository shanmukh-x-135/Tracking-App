import "server-only";
import { getPublicEnvironment, getServerEnvironment } from "@/lib/config/env";
import { genreCatalogs, type GenreMediaType } from "@/lib/media/genres";
import { fallbackRegion, isRegion, utcDay, type DiscoveryOptions } from "@/lib/media/region";
import { themeMediaTypes, themeSupports, type MediaTheme } from "@/lib/media/themes";
import type { MediaType } from "@/types/media";
import { GoogleBooksProvider } from "@/lib/media/providers/google-books";
import { IgdbProvider } from "@/lib/media/providers/igdb";
import { mockCatalogProvider } from "@/lib/media/providers/mock";
import { TmdbProvider } from "@/lib/media/providers/tmdb";
import { aggregateProviderSearch } from "@/lib/media/search";
import type { CatalogDiscoverySection, CatalogEpisode, CatalogMedia, CatalogProvider, CatalogSearchResult, MediaProvider, WatchAvailability } from "@/lib/media/types";
import type { ProviderIdentity } from "@/lib/media/identity";

export function liveCatalogProviders(): CatalogProvider[] {
  const environment = getServerEnvironment();
  return [
    new TmdbProvider(environment.tmdbToken),
    new IgdbProvider(environment.igdbClientId, environment.igdbClientSecret),
    new GoogleBooksProvider(environment.googleBooksApiKey),
  ];
}

export function configuredCatalogProviders(): CatalogProvider[] {
  return getPublicEnvironment().dataMode === "mock" ? [mockCatalogProvider] : liveCatalogProviders();
}

export async function searchCatalog(query: string, providers = configuredCatalogProviders()): Promise<CatalogSearchResult> {
  return aggregateProviderSearch(query, providers);
}

export async function getCatalogItem(identity: ProviderIdentity, providers = configuredCatalogProviders()): Promise<CatalogMedia | null> {
  if (identity.provider === "mock") return mockCatalogProvider.getById(identity.providerId, identity.mediaType);
  const provider = providers.find((candidate) => candidate.name === identity.provider);
  return provider?.getById(identity.providerId, identity.mediaType) ?? null;
}

export async function getCatalogSeasonEpisodes(identity: ProviderIdentity, seasonNumber: number, providers = configuredCatalogProviders()): Promise<CatalogEpisode[]> {
  if (identity.mediaType !== "tv") return [];
  // Detail routes can render the built-in catalog as a safe fallback when a live
  // provider is unavailable. Keep its episode endpoint available in that mode too.
  const provider = identity.provider === "mock" ? mockCatalogProvider : providers.find((candidate) => candidate.name === identity.provider);
  return provider?.getSeasonEpisodes?.(identity.providerId, seasonNumber) ?? [];
}

/** Fetch season data with bounded fan-out; provider fetches are cached independently. */
export async function getCatalogEpisodeRatings(identity: ProviderIdentity, seasonNumbers: number[], providers = configuredCatalogProviders()): Promise<CatalogEpisode[][]> {
  const uniqueSeasons = [...new Set(seasonNumbers)].filter((season) => Number.isInteger(season) && season >= 0).sort((first, second) => first - second);
  const results: CatalogEpisode[][] = [];
  for (let index = 0; index < uniqueSeasons.length; index += 4) {
    const batch = uniqueSeasons.slice(index, index + 4);
    const loaded = await Promise.all(batch.map((season) => getCatalogSeasonEpisodes(identity, season, providers).catch(() => [])));
    results.push(...loaded);
  }
  return results;
}

export async function getWatchAvailability(identity: ProviderIdentity, country: string, providers = configuredCatalogProviders()): Promise<WatchAvailability | null> {
  if (identity.provider !== "tmdb" || (identity.mediaType !== "movie" && identity.mediaType !== "tv")) return null;
  return providers.find((provider) => provider.name === identity.provider)?.getWatchAvailability?.(identity.providerId, identity.mediaType, country) ?? null;
}

export async function discoverCatalog(options: Partial<DiscoveryOptions> = {}, providers = configuredCatalogProviders()): Promise<CatalogSearchResult> {
  const resolved: DiscoveryOptions = { region: isRegion(options.region) ? options.region : fallbackRegion, today: options.today ?? utcDay() };
  const mediaTypes = ["movie", "tv", "game", "book"] as const;
  const outcomes = await Promise.all(providers.map(async (provider) => {
    try {
      const sections = provider.discoverSections
        ? await provider.discoverSections(resolved)
        : await Promise.all(mediaTypes.map(async (mediaType) => ({
          id: `${provider.name}-${mediaType}`, label: mediaType === "tv" ? "Series" : `${mediaType[0].toUpperCase()}${mediaType.slice(1)}s`, mediaType,
          items: await provider.discover?.(mediaType) ?? [],
        })));
      return { provider: provider.name, sections, failed: false };
    } catch {
      return { provider: provider.name, sections: [] as CatalogDiscoverySection[], failed: true };
    }
  }));
  const items: CatalogMedia[] = [];
  const sections: CatalogDiscoverySection[] = [];
  const failures: CatalogSearchResult["failures"] = [];
  for (const outcome of outcomes) {
    sections.push(...outcome.sections);
    items.push(...outcome.sections.flatMap((section) => section.items));
    if (outcome.failed && !failures.some((failure) => failure.provider === outcome.provider)) {
      failures.push({ provider: outcome.provider, message: "Discovery is temporarily unavailable." });
    }
  }
  return { items: [...new Map(items.map((item) => [`${item.provider}:${item.mediaType}:${item.providerId}`, item])).values()], failures, sections };
}

/** Native provider genre discovery: TMDB `with_genres` for movies/series, IGDB `genres` for games. */
export async function discoverGenre(mediaType: GenreMediaType, genreId: number, providers = configuredCatalogProviders()): Promise<CatalogSearchResult> {
  const source = genreCatalogs[mediaType].provider;
  const provider = providers.find((candidate) => candidate.name === source) ?? providers.find((candidate) => candidate.name === "mock");
  if (!provider?.discoverByGenre) return { items: [], failures: [{ provider: source, message: "Provider genre discovery is unavailable." }] };
  try {
    return { items: await provider.discoverByGenre(mediaType, genreId), failures: [] };
  } catch {
    return { items: [], failures: [{ provider: provider.name, message: "Provider genre discovery is temporarily unavailable." }] };
  }
}

const themeSources: Record<MediaType, MediaProvider> = { movie: "tmdb", tv: "tmdb", game: "igdb", book: "googlebooks" };

/**
 * Theme results per supported medium, queried in parallel (one request each) and deduplicated by provider
 * identity. All takes up to six per medium so one provider cannot crowd out the others. A failed medium is
 * reported in `failures`, never shown as an empty theme.
 */
export async function discoverTheme(theme: MediaTheme, mediaType: MediaType | null, providers = configuredCatalogProviders()): Promise<CatalogSearchResult & { unsupported: boolean }> {
  const mediaTypes = mediaType ? [mediaType].filter((type) => themeSupports(theme, type)) : themeMediaTypes(theme);
  if (!mediaTypes.length) return { items: [], failures: [], unsupported: true };
  const outcomes = await Promise.all(mediaTypes.map(async (type) => {
    const provider = providers.find((candidate) => candidate.name === themeSources[type]) ?? providers.find((candidate) => candidate.name === "mock");
    try {
      return { items: provider?.discoverByTheme ? await provider.discoverByTheme(type, theme) : [], failure: undefined };
    } catch {
      return { items: [], failure: { provider: provider?.name ?? themeSources[type], message: "Theme results are temporarily unavailable." } };
    }
  }));
  const items = outcomes.flatMap((outcome) => mediaType ? outcome.items : outcome.items.slice(0, 6));
  return {
    items: [...new Map(items.map((item) => [`${item.provider}:${item.mediaType}:${item.providerId}`, item])).values()].slice(0, 24),
    failures: outcomes.flatMap((outcome) => outcome.failure ? [outcome.failure] : []),
    unsupported: false,
  };
}

export async function relatedCatalog(media: CatalogMedia, providers = configuredCatalogProviders()): Promise<CatalogSearchResult> {
  const provider = providers.find((candidate) => candidate.name === media.provider);
  if (!provider?.related) return { items: [], failures: [] };
  try {
    return { items: await provider.related(media), failures: [] };
  } catch {
    return { items: [], failures: [{ provider: media.provider, message: "Related stories are temporarily unavailable." }] };
  }
}

export function isMediaProvider(value: string): value is MediaProvider {
  return value === "tmdb" || value === "igdb" || value === "googlebooks" || value === "mock";
}
