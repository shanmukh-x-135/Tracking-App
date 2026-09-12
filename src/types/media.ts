export type MediaType = "movie" | "tv" | "game" | "book";

export interface MediaBase {
  id: string;
  mediaType: MediaType;
  title: string;
  originalTitle?: string;
  posterUrl: string;
  backdropUrl?: string;
  releaseYear: number;
  genres: string[];
  description: string;
  averageRating: number;
  ratingCount: number;
  popularity?: number;
  creators: string[];
  franchise?: string;
  displayDuration?: string;
}

export interface Movie extends MediaBase {
  mediaType: "movie";
  runtime: number;
  director: string;
  releaseDate: string;
}

export interface TvSeries extends MediaBase {
  mediaType: "tv";
  seasons: number;
  episodeCount: number;
  status: "returning" | "ended" | "limited";
  network: string;
  currentSeason?: number;
  nextEpisode?: string;
}

export interface Game extends MediaBase {
  mediaType: "game";
  platforms: string[];
  developer: string;
  publisher: string;
  estimatedPlaytime?: number;
  releaseDate: string;
}

export interface Book extends MediaBase {
  mediaType: "book";
  authors: string[];
  pageCount: number;
  publicationDate: string;
  isbn?: string;
  series?: string;
}

export type Media = Movie | TvSeries | Game | Book;

export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  bio?: string;
}

export interface Rating { id: string; userId: string; mediaId: string; value: number; scope: "media" | "season" | "episode"; createdAt: string; }
export interface Review { id: string; user: User; mediaId: string; rating: number; body: string; isSpoiler: boolean; likes: number; comments: number; createdAt: string; }

export type MediaLog =
  | { id: string; mediaId: string; mediaType: "movie"; watchedAt: string; isRewatch: boolean; rating?: number }
  | { id: string; mediaId: string; mediaType: "tv"; episodeId: string; watchedAt: string; rating?: number }
  | { id: string; mediaId: string; mediaType: "game"; status: "backlog" | "playing" | "paused" | "completed" | "dropped"; platform?: string; playtimeMinutes?: number; rating?: number }
  | { id: string; mediaId: string; mediaType: "book"; status: "want" | "reading" | "paused" | "finished" | "dnf"; page?: number; rating?: number };

export interface MediaList { id: string; title: string; description: string; owner: User; mediaIds: string[]; isPrivate: boolean; }
export type ActivityKind = "rated_movie" | "watched_episode" | "completed_game" | "updated_book_progress" | "reviewed_media" | "created_list";
export interface ActivityItem { id: string; kind: ActivityKind; user: User; media?: Media; rating?: number; excerpt?: string; createdAt: string; }
