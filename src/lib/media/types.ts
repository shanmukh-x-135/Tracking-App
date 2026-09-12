import type { MediaType } from "@/types/media";

export type MediaProvider = "tmdb" | "igdb" | "googlebooks" | "mock";

interface CatalogMediaBase {
  providerId: string;
  provider: MediaProvider;
  mediaType: MediaType;
  title: string;
  originalTitle?: string;
  description?: string;
  posterUrl?: string;
  backdropUrl?: string;
  releaseDate?: string;
  releaseYear?: number;
  genres: string[];
  communityRating?: number;
}

export interface CatalogMovie extends CatalogMediaBase {
  mediaType: "movie";
  runtimeMinutes?: number;
  director?: string;
}

export interface CatalogSeries extends CatalogMediaBase {
  mediaType: "tv";
  seasonCount?: number;
  episodeCount?: number;
  network?: string;
}

export interface CatalogGame extends CatalogMediaBase {
  mediaType: "game";
  platforms: string[];
  developer?: string;
  publisher?: string;
}

export interface CatalogBook extends CatalogMediaBase {
  mediaType: "book";
  subtitle?: string;
  authors: string[];
  publisher?: string;
  pageCount?: number;
  isbn?: string;
}

export type CatalogMedia = CatalogMovie | CatalogSeries | CatalogGame | CatalogBook;

export interface CatalogProvider {
  readonly name: MediaProvider;
  search(query: string): Promise<CatalogMedia[]>;
  getById(providerId: string, mediaType?: MediaType): Promise<CatalogMedia | null>;
}

export interface CatalogFailure {
  provider: MediaProvider | "profiles";
  message: string;
}

export interface CatalogSearchResult {
  items: CatalogMedia[];
  failures: CatalogFailure[];
  profiles?: CatalogProfile[];
}

export interface CatalogProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
}
