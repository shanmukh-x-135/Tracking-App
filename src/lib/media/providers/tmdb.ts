import type { CatalogDiscoverySection, CatalogEpisode, CatalogMedia, CatalogProvider, WatchAvailability, WatchProvider, WatchProviderKind } from "@/lib/media/types";
import { providerJson, ProviderUnavailableError } from "@/lib/media/providers/errors";

const apiBase = "https://api.themoviedb.org/3";
const imageBase = "https://image.tmdb.org/t/p";

interface TmdbGenre { id: number; name: string }
export interface TmdbMedia {
  id: number;
  media_type?: "movie" | "tv" | "person";
  title?: string;
  original_title?: string;
  name?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  genres?: TmdbGenre[];
  genre_ids?: number[];
  runtime?: number;
  number_of_seasons?: number;
  number_of_episodes?: number;
  networks?: Array<{ name: string; logo_path?: string | null }>;
  production_companies?: Array<{ name: string; logo_path?: string | null }>;
  seasons?: Array<{ id?: number; season_number?: number }>;
  credits?: { crew?: Array<{ job: string; name: string }> };
}

interface TmdbSeasonEpisode {
  id: number;
  episode_number?: number;
  name?: string;
  overview?: string;
  still_path?: string | null;
  air_date?: string;
  runtime?: number | null;
}

interface TmdbSeason { episodes?: TmdbSeasonEpisode[] }
interface TmdbWatchProvider { provider_id?: number; provider_name?: string; logo_path?: string | null }
interface TmdbWatchResults { results?: Record<string, { link?: string; flatrate?: TmdbWatchProvider[]; free?: TmdbWatchProvider[]; ads?: TmdbWatchProvider[]; rent?: TmdbWatchProvider[]; buy?: TmdbWatchProvider[] }> }

const genreNames: Record<number, string> = {
  12: "Adventure", 14: "Fantasy", 16: "Animation", 18: "Drama", 27: "Horror",
  28: "Action", 35: "Comedy", 36: "History", 53: "Thriller", 80: "Crime",
  878: "Science Fiction", 9648: "Mystery", 10749: "Romance", 10765: "Sci-Fi & Fantasy",
};

function image(path: string | null | undefined, size: "w500" | "w1280"): string | undefined {
  return path ? `${imageBase}/${size}${path}` : undefined;
}

export function normalizeTmdb(item: TmdbMedia, forcedType?: "movie" | "tv"): CatalogMedia | null {
  const mediaType = forcedType ?? item.media_type;
  if (mediaType !== "movie" && mediaType !== "tv") return null;
  const releaseDate = mediaType === "movie" ? item.release_date : item.first_air_date;
  const genres = item.genres?.map((genre) => genre.name)
    ?? item.genre_ids?.map((id) => genreNames[id]).filter((name): name is string => Boolean(name))
    ?? [];
  const base = {
    providerId: String(item.id), provider: "tmdb" as const, mediaType,
    title: mediaType === "movie" ? item.title || "Untitled movie" : item.name || "Untitled series",
    originalTitle: mediaType === "movie" ? item.original_title : item.original_name,
    description: item.overview || undefined, posterUrl: image(item.poster_path, "w500"),
    backdropUrl: image(item.backdrop_path, "w1280"), releaseDate: releaseDate || undefined,
    releaseYear: releaseDate && /^\d{4}/.test(releaseDate) ? Number(releaseDate.slice(0, 4)) : undefined,
    genres, communityRating: item.vote_average || undefined,
  };
  if (mediaType === "movie") return {
    ...base, mediaType, runtimeMinutes: item.runtime,
    director: item.credits?.crew?.find((person) => person.job === "Director")?.name,
    studio: item.production_companies?.[0]?.name,
    studioLogoUrl: image(item.production_companies?.[0]?.logo_path, "w500"),
  };
  return {
    ...base, mediaType, seasonCount: item.number_of_seasons, episodeCount: item.number_of_episodes,
    seasonNumbers: item.seasons?.map((season) => season.season_number).filter((number): number is number => Number.isInteger(number)),
    seasons: item.seasons?.flatMap((season) => Number.isInteger(season.id) && Number.isInteger(season.season_number) ? [{ providerId: String(season.id), seasonNumber: season.season_number! }] : []),
    network: item.networks?.[0]?.name, networkLogoUrl: image(item.networks?.[0]?.logo_path, "w500"),
  };
}

export class TmdbProvider implements CatalogProvider {
  readonly name = "tmdb" as const;
  constructor(private readonly token: string | undefined, private readonly fetcher: typeof fetch = fetch) {}

  private async request<T>(path: string): Promise<T> {
    if (!this.token) throw new ProviderUnavailableError(this.name);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await this.fetcher(`${apiBase}${path}`, {
          headers: { Authorization: `Bearer ${this.token}`, accept: "application/json" },
          next: { revalidate: 3600 },
          signal: AbortSignal.timeout(15000),
        });
        if ((response.status === 429 || response.status >= 500) && attempt < 2) {
          await response.body?.cancel();
          await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
          continue;
        }
        return await providerJson<T>(this.name, response);
      } catch (error) {
        // Invalid IDs and permission failures are not transient.
        if (error instanceof ProviderUnavailableError || attempt === 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
    throw new ProviderUnavailableError(this.name);
  }

  async search(query: string): Promise<CatalogMedia[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return [];
    // Page one can be dominated by people and localized aliases. Looking one page
    // further keeps normal searches useful without an unbounded provider crawl.
    const pages = await Promise.all([1, 2].map((page) => this.request<{ results?: TmdbMedia[] }>(`/search/multi?query=${encodeURIComponent(normalizedQuery)}&include_adult=false&language=en-US&page=${page}`)));
    const comparableQuery = normalizedQuery.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("en").replace(/[^a-z0-9]+/g, " ").trim();
    const items = pages.flatMap((page) => page.results ?? []).map((item) => normalizeTmdb(item)).filter((item): item is CatalogMedia => item !== null);
    return [...new Map(items.map((item) => [`${item.mediaType}:${item.providerId}`, item])).values()]
      .sort((first, second) => {
        const score = (item: CatalogMedia) => [item.title, item.originalTitle].filter(Boolean).some((title) => title!.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("en").replace(/[^a-z0-9]+/g, " ").trim() === comparableQuery) ? 1 : 0;
        return score(second) - score(first);
      }).slice(0, 20);
  }

  async getById(providerId: string, mediaType?: "movie" | "tv" | "game" | "book"): Promise<CatalogMedia | null> {
    if (mediaType !== "movie" && mediaType !== "tv") return null;
    const item = await this.request<TmdbMedia>(`/${mediaType}/${encodeURIComponent(providerId)}?append_to_response=credits&language=en-US`);
    return normalizeTmdb(item, mediaType);
  }

  async getSeasonEpisodes(providerId: string, seasonNumber: number): Promise<CatalogEpisode[]> {
    if (!Number.isInteger(seasonNumber) || seasonNumber < 0) return [];
    const season = await this.request<TmdbSeason>(`/tv/${encodeURIComponent(providerId)}/season/${seasonNumber}?language=en-US`);
    return (season.episodes ?? [])
      .filter((episode) => Number.isInteger(episode.episode_number) && (episode.episode_number ?? 0) >= 0)
      .sort((first, second) => (first.episode_number ?? 0) - (second.episode_number ?? 0))
      .map((episode) => ({
        id: String(episode.id), seasonNumber, episodeNumber: episode.episode_number ?? 0,
        title: episode.name?.trim() || `Episode ${episode.episode_number}`,
        overview: episode.overview?.trim() || undefined,
        stillUrl: image(episode.still_path, "w500"), airDate: episode.air_date || undefined,
        runtimeMinutes: episode.runtime ?? undefined,
      }));
  }

  async getWatchAvailability(providerId: string, mediaType: "movie" | "tv", country: string): Promise<WatchAvailability | null> {
    if (!/^[A-Z]{2}$/.test(country)) return null;
    const payload = await this.request<TmdbWatchResults>(`/${mediaType}/${encodeURIComponent(providerId)}/watch/providers`);
    const region = payload.results?.[country];
    if (!region) return null;
    const groups: Array<[WatchProviderKind, TmdbWatchProvider[] | undefined]> = [["flatrate", region.flatrate], ["free", region.free], ["ads", region.ads], ["rent", region.rent], ["buy", region.buy]];
    const providers: WatchProvider[] = groups.flatMap(([kind, items]) => (items ?? []).flatMap((item) => item.provider_id && item.provider_name ? [{ id: item.provider_id, name: item.provider_name, logoUrl: image(item.logo_path, "w500"), kind }] : []));
    return { country, link: region.link, providers };
  }

  async discover(mediaType: "movie" | "tv" | "game" | "book"): Promise<CatalogMedia[]> {
    if (mediaType !== "movie" && mediaType !== "tv") return [];
    const data = await this.request<{ results?: TmdbMedia[] }>(`/trending/${mediaType}/week?language=en-US`);
    return (data.results ?? []).map((item) => normalizeTmdb(item, mediaType)).filter((item): item is CatalogMedia => item !== null).slice(0, 12);
  }

  async discoverSections(): Promise<CatalogDiscoverySection[]> {
    const definitions = [
      ["movie-trending", "Trending now", "movie", "/trending/movie/week?language=en-US"],
      ["movie-popular", "Popular movies", "movie", "/movie/popular?language=en-US&page=1"],
      ["movie-now-playing", "Now playing", "movie", "/movie/now_playing?language=en-US&page=1"],
      ["movie-upcoming", "Upcoming movies", "movie", "/movie/upcoming?language=en-US&page=1"],
      ["movie-top-rated", "Top rated movies", "movie", "/movie/top_rated?language=en-US&page=1"],
      ["tv-trending", "Trending series", "tv", "/trending/tv/week?language=en-US"],
      ["tv-popular", "Popular series", "tv", "/tv/popular?language=en-US&page=1"],
      ["tv-on-the-air", "Currently airing", "tv", "/tv/on_the_air?language=en-US&page=1"],
      ["tv-top-rated", "Top rated series", "tv", "/tv/top_rated?language=en-US&page=1"],
    ] as const;
    const settled = await Promise.allSettled(definitions.map(async ([id, label, mediaType, path]) => {
      const data = await this.request<{ results?: TmdbMedia[] }>(path);
      return { id: `tmdb-${id}`, label, mediaType, items: (data.results ?? []).map((item) => normalizeTmdb(item, mediaType)).filter((item): item is CatalogMedia => item !== null).slice(0, 12) } satisfies CatalogDiscoverySection;
    }));
    return settled.map((outcome, index) => outcome.status === "fulfilled" ? outcome.value : {
      id: `tmdb-${definitions[index][0]}`, label: definitions[index][1], mediaType: definitions[index][2], items: [], error: "This provider section is temporarily unavailable.",
    });
  }

  async related(media: CatalogMedia): Promise<CatalogMedia[]> {
    if (media.provider !== this.name || (media.mediaType !== "movie" && media.mediaType !== "tv")) return [];
    const data = await this.request<{ results?: TmdbMedia[] }>(`/${media.mediaType}/${encodeURIComponent(media.providerId)}/recommendations?language=en-US&page=1`);
    return (data.results ?? []).map((item) => normalizeTmdb(item, media.mediaType)).filter((item): item is CatalogMedia => item !== null && item.providerId !== media.providerId).slice(0, 12);
  }
}
