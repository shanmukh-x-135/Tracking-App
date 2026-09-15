import type { ProviderIdentity } from "@/lib/media/identity";
import type { CatalogMedia } from "@/lib/media/types";

export interface FranchiseDefinition {
  slug: string;
  title: string;
  overview: string;
  items: ProviderIdentity[];
}

// Cross-provider franchises are curated identities, not title guesses. Add an
// item only after its provider identity and relationship have been verified.
export const franchises: FranchiseDefinition[] = [{
  slug: "dune",
  title: "Dune",
  overview: "A curated path through Frank Herbert’s desert world across books and films.",
  items: [
    { provider: "mock", mediaType: "book", providerId: "dune" },
    { provider: "mock", mediaType: "movie", providerId: "dune-part-two" },
    { provider: "tmdb", mediaType: "movie", providerId: "438631" },
    { provider: "tmdb", mediaType: "movie", providerId: "693134" },
  ],
}];

export function franchiseForMedia(media: CatalogMedia): FranchiseDefinition | undefined {
  return franchises.find((franchise) => franchise.items.some((item) => item.provider === media.provider && item.mediaType === media.mediaType && item.providerId === media.providerId));
}

export function franchiseBySlug(slug: string): FranchiseDefinition | undefined {
  return franchises.find((franchise) => franchise.slug === slug);
}
