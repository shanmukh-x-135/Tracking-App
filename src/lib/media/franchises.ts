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
}, {
  slug: "the-witcher",
  title: "The Witcher",
  overview: "A curated path through Andrzej Sapkowski’s Continent across screen stories and games.",
  items: [
    { provider: "tmdb", mediaType: "tv", providerId: "71912" },
    { provider: "tmdb", mediaType: "movie", providerId: "1203329" },
    { provider: "igdb", mediaType: "game", providerId: "1942" },
  ],
}, {
  slug: "wizarding-world",
  title: "Wizarding World",
  overview: "A curated collection of Wizarding World films, television, and games.",
  items: [
    { provider: "tmdb", mediaType: "movie", providerId: "671" },
    { provider: "tmdb", mediaType: "movie", providerId: "674" },
    { provider: "tmdb", mediaType: "tv", providerId: "224377" },
    { provider: "igdb", mediaType: "game", providerId: "136625" },
  ],
}, {
  slug: "star-wars",
  title: "Star Wars",
  overview: "A curated collection from a galaxy far, far away across films, series, and games.",
  items: [
    { provider: "tmdb", mediaType: "movie", providerId: "11" },
    { provider: "tmdb", mediaType: "movie", providerId: "140607" },
    { provider: "tmdb", mediaType: "tv", providerId: "4194" },
    { provider: "igdb", mediaType: "game", providerId: "74701" },
  ],
}, {
  slug: "middle-earth",
  title: "Middle-earth",
  overview: "A curated collection of Middle-earth films, series, and games.",
  items: [
    { provider: "tmdb", mediaType: "movie", providerId: "120" },
    { provider: "tmdb", mediaType: "movie", providerId: "122" },
    { provider: "tmdb", mediaType: "tv", providerId: "84773" },
    { provider: "igdb", mediaType: "game", providerId: "3025" },
  ],
}];

export function franchiseForMedia(media: CatalogMedia): FranchiseDefinition | undefined {
  return franchises.find((franchise) => franchise.items.some((item) => item.provider === media.provider && item.mediaType === media.mediaType && item.providerId === media.providerId));
}

export function franchiseBySlug(slug: string): FranchiseDefinition | undefined {
  return franchises.find((franchise) => franchise.slug === slug);
}
