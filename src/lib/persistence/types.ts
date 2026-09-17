import type { CatalogMedia } from "@/lib/media/types";

export type LibraryStatus = "watchlist" | "watched" | "watching" | "completed" | "paused" | "dropped" | "backlog" | "playing" | "want_to_read" | "reading" | "finished" | "dnf";

export interface LibraryEntry {
  media: CatalogMedia;
  status: LibraryStatus;
  isFavorite: boolean;
  updatedAt: string;
}

export interface UserRating {
  mediaKey: string;
  value: number;
  updatedAt: string;
}

export interface UserReview {
  id: string;
  media: CatalogMedia;
  body: string;
  containsSpoilers: boolean;
  rating?: number;
  updatedAt: string;
}

export interface ListItem {
  id: string;
  media: CatalogMedia;
  position: number;
  note?: string;
}

export interface UserList {
  id: string;
  title: string;
  description: string;
  visibility: "public" | "unlisted" | "private";
  items: ListItem[];
  updatedAt: string;
}

export interface MovieWatch {
  id: string;
  media: CatalogMedia;
  watchedAt: string;
  isRewatch: boolean;
  rating?: number;
  review?: string;
  viewingContext?: MovieViewingContext;
  streamingService?: string;
}

export type MovieViewingContext = "theater" | "streaming" | "television" | "physical" | "digital" | "other";

export interface EpisodeWatch {
  id: string;
  series: CatalogMedia;
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle?: string;
  watchedAt: string;
  rating?: number;
}

export interface GamePlaythrough {
  id: string;
  media: CatalogMedia;
  status: "backlog" | "playing" | "paused" | "completed" | "dropped";
  platform?: string;
  playtimeMinutes: number;
  progressPercent?: number;
  rating?: number;
  updatedAt: string;
}

export interface BookReading {
  id: string;
  media: CatalogMedia;
  status: "want_to_read" | "reading" | "paused" | "finished" | "dnf";
  currentPage?: number;
  totalPages?: number;
  progressPercent?: number;
  rating?: number;
  updatedAt: string;
}

export interface MosaicState {
  watchRegion?: string;
  library: LibraryEntry[];
  ratings: UserRating[];
  reviews: UserReview[];
  lists: UserList[];
  movieWatches: MovieWatch[];
  episodeWatches: EpisodeWatch[];
  gamePlaythroughs: GamePlaythrough[];
  bookReadings: BookReading[];
}

export const emptyMosaicState = (): MosaicState => ({
  library: [], ratings: [], reviews: [], lists: [], movieWatches: [], episodeWatches: [], gamePlaythroughs: [], bookReadings: [],
});

export type SharedMutation =
  | { type: "settings.watchRegion"; value: string | null }
  | { type: "library.upsert"; media: CatalogMedia; status: LibraryStatus; isFavorite?: boolean }
  | { type: "library.remove"; media: CatalogMedia }
  | { type: "rating.set"; media: CatalogMedia; value: number | null }
  | { type: "review.save"; id?: string; media: CatalogMedia; body: string; containsSpoilers: boolean; rating?: number }
  | { type: "review.delete"; id: string }
  | { type: "list.create"; title: string; description: string; visibility: UserList["visibility"] }
  | { type: "list.add"; listId: string; media: CatalogMedia; note?: string }
  | { type: "list.update"; listId: string; title: string; description: string; visibility: UserList["visibility"] }
  | { type: "list.item.update"; listId: string; itemId: string; note: string }
  | { type: "list.item.remove"; listId: string; itemId: string }
  | { type: "list.reorder"; listId: string; itemIds: string[] };

export type DomainMutation =
  | { type: "movie.log"; media: CatalogMedia; watchedAt: string; isRewatch: boolean; rating?: number; review?: string; viewingContext?: MovieViewingContext; streamingService?: string }
  | { type: "movie.update"; watchId: string; media: CatalogMedia; watchedAt: string; isRewatch: boolean; rating?: number; review?: string; viewingContext?: MovieViewingContext; streamingService?: string }
  | { type: "movie.delete"; watchId: string }
  | { type: "episode.log"; series: CatalogMedia; seasonNumber: number; episodeNumber: number; episodeTitle?: string; watchedAt: string; rating?: number }
  | { type: "episode.unwatch"; series: CatalogMedia; seasonNumber: number; episodeNumber: number }
  | { type: "game.upsert"; media: CatalogMedia; playthroughId?: string; status: GamePlaythrough["status"]; platform?: string; playtimeMinutes: number; progressPercent?: number; rating?: number }
  | { type: "book.upsert"; media: CatalogMedia; readingId?: string; status: BookReading["status"]; currentPage?: number; totalPages?: number; progressPercent?: number; rating?: number };

export type PersistenceMutation = SharedMutation | DomainMutation;

export interface PersistenceGateway {
  load(userId: string): Promise<MosaicState>;
  mutate(userId: string, mutation: PersistenceMutation): Promise<MosaicState>;
}
