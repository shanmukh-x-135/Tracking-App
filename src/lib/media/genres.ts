import type { MediaType } from "@/types/media";

export interface ProviderGenre { id: number; name: string }

// Static copies of the providers' genre lists (verified against TMDB /genre/movie/list, /genre/tv/list
// and IGDB /genres on 2026-10-12). The IDs are stable; fetching them per request would add calls for no gain.
export const tmdbMovieGenres: readonly ProviderGenre[] = [
  { id: 28, name: "Action" }, { id: 12, name: "Adventure" }, { id: 16, name: "Animation" },
  { id: 35, name: "Comedy" }, { id: 80, name: "Crime" }, { id: 99, name: "Documentary" },
  { id: 18, name: "Drama" }, { id: 10751, name: "Family" }, { id: 14, name: "Fantasy" },
  { id: 36, name: "History" }, { id: 27, name: "Horror" }, { id: 10402, name: "Music" },
  { id: 9648, name: "Mystery" }, { id: 10749, name: "Romance" }, { id: 878, name: "Science Fiction" },
  { id: 10770, name: "TV Movie" }, { id: 53, name: "Thriller" }, { id: 10752, name: "War" }, { id: 37, name: "Western" },
];

export const tmdbTvGenres: readonly ProviderGenre[] = [
  { id: 10759, name: "Action & Adventure" }, { id: 16, name: "Animation" }, { id: 35, name: "Comedy" },
  { id: 80, name: "Crime" }, { id: 99, name: "Documentary" }, { id: 18, name: "Drama" },
  { id: 10751, name: "Family" }, { id: 10762, name: "Kids" }, { id: 9648, name: "Mystery" },
  { id: 10763, name: "News" }, { id: 10764, name: "Reality" }, { id: 10765, name: "Sci-Fi & Fantasy" },
  { id: 10766, name: "Soap" }, { id: 10767, name: "Talk" }, { id: 10768, name: "War & Politics" }, { id: 37, name: "Western" },
];

export const igdbGenres: readonly ProviderGenre[] = [
  { id: 2, name: "Point-and-click" }, { id: 4, name: "Fighting" }, { id: 5, name: "Shooter" }, { id: 7, name: "Music" },
  { id: 8, name: "Platform" }, { id: 9, name: "Puzzle" }, { id: 10, name: "Racing" }, { id: 11, name: "Real Time Strategy (RTS)" },
  { id: 12, name: "Role-playing (RPG)" }, { id: 13, name: "Simulator" }, { id: 14, name: "Sport" }, { id: 15, name: "Strategy" },
  { id: 16, name: "Turn-based strategy (TBS)" }, { id: 24, name: "Tactical" }, { id: 25, name: "Hack and slash/Beat 'em up" },
  { id: 26, name: "Quiz/Trivia" }, { id: 30, name: "Pinball" }, { id: 31, name: "Adventure" }, { id: 32, name: "Indie" },
  { id: 33, name: "Arcade" }, { id: 34, name: "Visual Novel" }, { id: 35, name: "Card & Board Game" }, { id: 36, name: "MOBA" },
];

export type GenreMediaType = "movie" | "tv" | "game";

export interface GenreCatalog {
  mediaType: GenreMediaType;
  provider: "tmdb" | "igdb";
  label: string;
  genres: readonly ProviderGenre[];
}

/** Books have none: Google Books' `subject:` filter returns empty results too often to be a working control. */
export const genreCatalogs: Record<GenreMediaType, GenreCatalog> = {
  movie: { mediaType: "movie", provider: "tmdb", label: "TMDB movie genres", genres: tmdbMovieGenres },
  tv: { mediaType: "tv", provider: "tmdb", label: "TMDB series genres", genres: tmdbTvGenres },
  game: { mediaType: "game", provider: "igdb", label: "IGDB game genres", genres: igdbGenres },
};

/** The genre list for a Discover tab. All browses movie genres, and says so in its label. */
export function genresFor(type: MediaType | null): GenreCatalog | undefined {
  return type === null ? genreCatalogs.movie : type === "book" ? undefined : genreCatalogs[type];
}

export function isGenreFor(mediaType: GenreMediaType, genreId: number): boolean {
  return genreCatalogs[mediaType].genres.some((genre) => genre.id === genreId);
}

/** Keeps a selected genre across a tab switch only when the new list has the same provider genre. */
export function genreAfterSwitch(genreId: number | undefined, from: MediaType | null, to: MediaType | null): number | undefined {
  const before = genresFor(from);
  const after = genresFor(to);
  if (genreId === undefined || !before || !after || before.provider !== after.provider) return undefined;
  return after.genres.some((genre) => genre.id === genreId) ? genreId : undefined;
}

/** Genre names by TMDB ID across movies and series (shared IDs carry the same name). */
export const tmdbGenreNames: Readonly<Record<number, string>> = Object.fromEntries([...tmdbMovieGenres, ...tmdbTvGenres].map(({ id, name }) => [id, name]));
