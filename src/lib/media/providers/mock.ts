import { allMedia } from "@/data/media";
import type { CatalogDiscoverySection, CatalogEpisode, CatalogMedia, CatalogProvider } from "@/lib/media/types";
import type { Media, TvSeries } from "@/types/media";

export function normalizeMock(item: Media): CatalogMedia {
  const base = {
    providerId: item.id, provider: "mock" as const, mediaType: item.mediaType, title: item.title,
    originalTitle: item.originalTitle, description: item.description, posterUrl: item.posterUrl,
    backdropUrl: item.backdropUrl, releaseYear: item.releaseYear, genres: item.genres,
    communityRating: item.averageRating,
  };
  switch (item.mediaType) {
    case "movie": return { ...base, mediaType: "movie", releaseDate: item.releaseDate, runtimeMinutes: item.runtime, director: item.director };
    case "tv": return { ...base, mediaType: "tv", seasonCount: item.seasons, episodeCount: item.episodeCount, seasonNumbers: Array.from({ length: item.seasons }, (_, index) => index + 1), network: item.network };
    case "game": return { ...base, mediaType: "game", releaseDate: item.releaseDate, platforms: item.platforms, developer: item.developer, publisher: item.publisher };
    case "book": return { ...base, mediaType: "book", releaseDate: item.publicationDate, authors: item.authors, pageCount: item.pageCount, isbn: item.isbn };
  }
}

export const mockCatalogProvider: CatalogProvider = {
  name: "mock",
  async search(query) {
    const normalizedQuery = query.trim().toLowerCase();
    return allMedia
      .filter((item) => `${item.title} ${item.creators.join(" ")} ${item.genres.join(" ")} ${item.description}`.toLowerCase().includes(normalizedQuery))
      .map(normalizeMock)
      .slice(0, 20);
  },
  async getById(providerId, mediaType) {
    const item = allMedia.find((candidate) => candidate.id === providerId && (!mediaType || candidate.mediaType === mediaType));
    return item ? normalizeMock(item) : null;
  },
  async getSeasonEpisodes(providerId, seasonNumber) {
    const item = allMedia.find((candidate): candidate is TvSeries => candidate.id === providerId && candidate.mediaType === "tv");
    if (!item || seasonNumber < 1 || seasonNumber > item.seasons) return [];
    const baseCount = Math.floor(item.episodeCount / item.seasons);
    const extra = item.episodeCount % item.seasons;
    const count = baseCount + (seasonNumber <= extra ? 1 : 0);
    return Array.from({ length: count }, (_, index): CatalogEpisode => ({
      id: `${item.id}-${seasonNumber}-${index + 1}`, seasonNumber, episodeNumber: index + 1,
      title: `Episode ${index + 1}`, overview: undefined, stillUrl: item.backdropUrl,
    }));
  },
  async discover(mediaType) {
    return allMedia.filter((item) => item.mediaType === mediaType).map(normalizeMock);
  },
  async discoverSections(): Promise<CatalogDiscoverySection[]> {
    return (["movie", "tv", "game", "book"] as const).map((mediaType) => ({
      id: `mock-${mediaType}`, mediaType, label: mediaType === "tv" ? "Series" : `${mediaType[0].toUpperCase()}${mediaType.slice(1)}s`,
      items: allMedia.filter((item) => item.mediaType === mediaType).map(normalizeMock),
    }));
  },
  async related(media) {
    return allMedia.filter((item) => item.id !== media.providerId && item.mediaType === media.mediaType).slice(0, 12).map(normalizeMock);
  },
};
