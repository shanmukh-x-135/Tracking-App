import "server-only";
import { getPublicEnvironment, getServerEnvironment } from "@/lib/config/env";
import { GoogleBooksProvider } from "@/lib/media/providers/google-books";
import { IgdbProvider } from "@/lib/media/providers/igdb";
import { mockCatalogProvider } from "@/lib/media/providers/mock";
import { TmdbProvider } from "@/lib/media/providers/tmdb";
import { aggregateProviderSearch } from "@/lib/media/search";
import type { CatalogMedia, CatalogProvider, CatalogSearchResult, MediaProvider } from "@/lib/media/types";
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

export function isMediaProvider(value: string): value is MediaProvider {
  return value === "tmdb" || value === "igdb" || value === "googlebooks" || value === "mock";
}
