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
  studio?: string;
  studioLogoUrl?: string;
}

export interface CatalogSeries extends CatalogMediaBase {
  mediaType: "tv";
  seasonCount?: number;
  episodeCount?: number;
  /** Provider season numbers can include season 0 (specials). */
  seasonNumbers?: number[];
  network?: string;
  networkLogoUrl?: string;
}

/** A normalized TV episode. Provider payloads never reach presentation components. */
export interface CatalogEpisode {
  id: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  overview?: string;
  stillUrl?: string;
  airDate?: string;
  runtimeMinutes?: number;
}

export interface CatalogGame extends CatalogMediaBase {
  mediaType: "game";
  platforms: string[];
  developer?: string;
  publisher?: string;
  developerLogoUrl?: string;
  publisherLogoUrl?: string;
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
  getSeasonEpisodes?(providerId: string, seasonNumber: number): Promise<CatalogEpisode[]>;
  discover?(mediaType: MediaType): Promise<CatalogMedia[]>;
  discoverSections?(): Promise<CatalogDiscoverySection[]>;
  related?(media: CatalogMedia): Promise<CatalogMedia[]>;
}

export interface CatalogFailure {
  provider: MediaProvider | "profiles";
  message: string;
}

/** A provider-backed shelf with an honest source label. */
export interface CatalogDiscoverySection {
  id: string;
  label: string;
  mediaType: MediaType;
  items: CatalogMedia[];
  error?: string;
}

export interface CatalogSearchResult {
  items: CatalogMedia[];
  failures: CatalogFailure[];
  profiles?: CatalogProfile[];
  sections?: CatalogDiscoverySection[];
}

export interface CatalogProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
}
