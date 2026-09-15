import "server-only";
import { getPublicEnvironment, getServerEnvironment } from "@/lib/config/env";
import { GoogleBooksProvider } from "@/lib/media/providers/google-books";
import { IgdbProvider } from "@/lib/media/providers/igdb";
import { mockCatalogProvider } from "@/lib/media/providers/mock";
import { TmdbProvider } from "@/lib/media/providers/tmdb";
import { aggregateProviderSearch } from "@/lib/media/search";
import type { CatalogEpisode, CatalogMedia, CatalogProvider, CatalogSearchResult, MediaProvider } from "@/lib/media/types";
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
  const provider = providers.find((candidate) => candidate.name === identity.provider);
  return provider?.getSeasonEpisodes?.(identity.providerId, seasonNumber) ?? [];
}

export async function discoverCatalog(providers = configuredCatalogProviders()): Promise<CatalogSearchResult> {
  const mediaTypes = ["movie", "tv", "game", "book"] as const;
  const outcomes = await Promise.all(providers.flatMap((provider) => mediaTypes.map(async (mediaType) => {
    try { return { provider: provider.name, items: await provider.discover?.(mediaType) ?? [], failed: false }; }
    catch { return { provider: provider.name, items: [] as CatalogMedia[], failed: true }; }
  })));
  const items: CatalogMedia[] = [];
  const failures: CatalogSearchResult["failures"] = [];
  for (const outcome of outcomes) {
    items.push(...outcome.items);
    if (outcome.failed && !failures.some((failure) => failure.provider === outcome.provider)) {
      failures.push({ provider: outcome.provider, message: "Discovery is temporarily unavailable." });
    }
  }
  return { items, failures };
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
