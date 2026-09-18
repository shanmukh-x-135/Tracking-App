import "server-only";
import { getPublicEnvironment, getServerEnvironment } from "@/lib/config/env";
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

export async function getWatchAvailability(identity: ProviderIdentity, country: string, providers = configuredCatalogProviders()): Promise<WatchAvailability | null> {
  if (identity.provider !== "tmdb" || (identity.mediaType !== "movie" && identity.mediaType !== "tv")) return null;
  return providers.find((provider) => provider.name === identity.provider)?.getWatchAvailability?.(identity.providerId, identity.mediaType, country) ?? null;
}

export async function discoverCatalog(providers = configuredCatalogProviders()): Promise<CatalogSearchResult> {
  const mediaTypes = ["movie", "tv", "game", "book"] as const;
  const outcomes = await Promise.all(providers.map(async (provider) => {
    try {
      const sections = provider.discoverSections
        ? await provider.discoverSections()
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
