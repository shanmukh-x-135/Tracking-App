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
  const settled = await Promise.allSettled(providers.flatMap((provider) => mediaTypes.map(async (mediaType) => ({ provider: provider.name, items: await provider.discover?.(mediaType) ?? [] }))));
  const items: CatalogMedia[] = [];
  const failures: CatalogSearchResult["failures"] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") items.push(...result.value.items);
    else failures.push({ provider: "tmdb", message: "A discovery source is temporarily unavailable." });
  }
  return { items, failures };
}

export function isMediaProvider(value: string): value is MediaProvider {
  return value === "tmdb" || value === "igdb" || value === "googlebooks" || value === "mock";
}
