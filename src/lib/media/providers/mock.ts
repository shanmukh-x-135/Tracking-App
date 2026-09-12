import { allMedia } from "@/data/media";
import type { CatalogMedia, CatalogProvider } from "@/lib/media/types";
import type { Media } from "@/types/media";

function normalizeMock(item: Media): CatalogMedia {
  const base = {
    providerId: item.id, provider: "mock" as const, mediaType: item.mediaType, title: item.title,
    originalTitle: item.originalTitle, description: item.description, posterUrl: item.posterUrl,
    backdropUrl: item.backdropUrl, releaseYear: item.releaseYear, genres: item.genres,
    communityRating: item.averageRating,
  };
  switch (item.mediaType) {
    case "movie": return { ...base, mediaType: "movie", releaseDate: item.releaseDate, runtimeMinutes: item.runtime, director: item.director };
    case "tv": return { ...base, mediaType: "tv", seasonCount: item.seasons, episodeCount: item.episodeCount, network: item.network };
    case "game": return { ...base, mediaType: "game", releaseDate: item.releaseDate, platforms: item.platforms, developer: item.developer, publisher: item.publisher };
    case "book": return { ...base, mediaType: "book", releaseDate: item.publicationDate, authors: item.authors, pageCount: item.pageCount, isbn: item.isbn };
  }
}

export const mockCatalogProvider: CatalogProvider = {
  name: "mock",
  async search(query) {
    const normalizedQuery = query.trim().toLowerCase();
    return allMedia
      .filter((item) => `${item.title} ${item.creators.join(" ")}`.toLowerCase().includes(normalizedQuery))
      .map(normalizeMock)
      .slice(0, 20);
  },
  async getById(providerId, mediaType) {
    const item = allMedia.find((candidate) => candidate.id === providerId && (!mediaType || candidate.mediaType === mediaType));
    return item ? normalizeMock(item) : null;
  },
};
