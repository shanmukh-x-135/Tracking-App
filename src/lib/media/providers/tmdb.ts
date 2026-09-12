import type { CatalogMedia, CatalogProvider } from "@/lib/media/types";
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
  networks?: Array<{ name: string }>;
  credits?: { crew?: Array<{ job: string; name: string }> };
}

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
  };
  return {
    ...base, mediaType, seasonCount: item.number_of_seasons, episodeCount: item.number_of_episodes,
    network: item.networks?.[0]?.name,
  };
}

export class TmdbProvider implements CatalogProvider {
  readonly name = "tmdb" as const;
  constructor(private readonly token: string | undefined, private readonly fetcher: typeof fetch = fetch) {}

  private async request<T>(path: string): Promise<T> {
    if (!this.token) throw new ProviderUnavailableError(this.name);
    return providerJson<T>(this.name, await this.fetcher(`${apiBase}${path}`, {
      headers: { Authorization: `Bearer ${this.token}`, accept: "application/json" },
      next: { revalidate: 3600 },
    }));
  }

  async search(query: string): Promise<CatalogMedia[]> {
    const data = await this.request<{ results?: TmdbMedia[] }>(`/search/multi?query=${encodeURIComponent(query)}&include_adult=false&language=en-US&page=1`);
    return (data.results ?? []).map((item) => normalizeTmdb(item)).filter((item): item is CatalogMedia => item !== null).slice(0, 10);
  }

  async getById(providerId: string, mediaType?: "movie" | "tv" | "game" | "book"): Promise<CatalogMedia | null> {
    if (mediaType !== "movie" && mediaType !== "tv") return null;
    const item = await this.request<TmdbMedia>(`/${mediaType}/${encodeURIComponent(providerId)}?append_to_response=credits&language=en-US`);
    return normalizeTmdb(item, mediaType);
  }
}
