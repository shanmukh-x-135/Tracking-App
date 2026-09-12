type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Row<T> = T;
type Insert<T> = Partial<T>;
type Update<T> = Partial<T>;

export interface Database {
  public: {
    Tables: {
      profiles: { Row: Row<ProfileRow>; Insert: Insert<ProfileRow>; Update: Update<ProfileRow>; Relationships: [] };
      media_items: { Row: Row<MediaItemRow>; Insert: Insert<MediaItemRow>; Update: Update<MediaItemRow>; Relationships: [] };
      library_entries: { Row: Row<LibraryEntryRow>; Insert: Insert<LibraryEntryRow>; Update: Update<LibraryEntryRow>; Relationships: [] };
      ratings: { Row: Row<RatingRow>; Insert: Insert<RatingRow>; Update: Update<RatingRow>; Relationships: [] };
      reviews: { Row: Row<ReviewRow>; Insert: Insert<ReviewRow>; Update: Update<ReviewRow>; Relationships: [] };
      movie_watch_logs: { Row: Row<MovieWatchRow>; Insert: Insert<MovieWatchRow>; Update: Update<MovieWatchRow>; Relationships: [] };
      tv_episodes: { Row: Row<TvEpisodeRow>; Insert: Insert<TvEpisodeRow>; Update: Update<TvEpisodeRow>; Relationships: [] };
      episode_watch_logs: { Row: Row<EpisodeWatchRow>; Insert: Insert<EpisodeWatchRow>; Update: Update<EpisodeWatchRow>; Relationships: [] };
      episode_ratings: { Row: Row<EpisodeRatingRow>; Insert: Insert<EpisodeRatingRow>; Update: Update<EpisodeRatingRow>; Relationships: [] };
      game_playthroughs: { Row: Row<GamePlaythroughRow>; Insert: Insert<GamePlaythroughRow>; Update: Update<GamePlaythroughRow>; Relationships: [] };
      book_readings: { Row: Row<BookReadingRow>; Insert: Insert<BookReadingRow>; Update: Update<BookReadingRow>; Relationships: [] };
      lists: { Row: Row<ListRow>; Insert: Insert<ListRow>; Update: Update<ListRow>; Relationships: [] };
      list_items: { Row: Row<ListItemRow>; Insert: Insert<ListItemRow>; Update: Update<ListItemRow>; Relationships: [] };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

interface Timestamped { id: string; created_at: string; updated_at: string }
export interface ProfileRow extends Timestamped { username: string; display_name: string; bio: string | null; avatar_url: string | null }
export interface MediaItemRow extends Timestamped { media_type: "movie"|"tv"|"game"|"book"; provider: "tmdb"|"igdb"|"googlebooks"|"mock"; external_id: string; title: string; original_title: string|null; poster_url: string|null; backdrop_url: string|null; release_date: string|null; release_year: number|null; metadata: Json }
export interface LibraryEntryRow extends Timestamped { user_id: string; media_id: string; status: string; is_favorite: boolean }
export interface RatingRow extends Timestamped { user_id: string; media_id: string; rating: number }
export interface ReviewRow extends Timestamped { user_id: string; media_id: string; rating_id: string|null; body: string; contains_spoilers: boolean }
export interface MovieWatchRow extends Timestamped { user_id: string; media_id: string; watched_at: string; is_rewatch: boolean; rating: number|null; review: string|null }
export interface TvEpisodeRow extends Timestamped { series_media_id: string; provider: string; external_id: string; season_number: number; episode_number: number; title: string; air_date: string|null; runtime_minutes: number|null; still_url: string|null; metadata: Json }
export interface EpisodeWatchRow extends Timestamped { user_id: string; episode_id: string; watched_at: string; is_rewatch: boolean }
export interface EpisodeRatingRow extends Timestamped { user_id: string; episode_id: string; rating: number }
export interface GamePlaythroughRow extends Timestamped { user_id: string; media_id: string; status: string; platform: string|null; started_at: string|null; completed_at: string|null; playtime_minutes: number; progress_percent: number|null; rating: number|null; notes: string|null }
export interface BookReadingRow extends Timestamped { user_id: string; media_id: string; status: string; started_at: string|null; finished_at: string|null; current_page: number|null; total_pages: number|null; progress_percent: number|null; rating: number|null }
export interface ListRow extends Timestamped { user_id: string; title: string; description: string; visibility: "public"|"unlisted"|"private" }
export interface ListItemRow { id: string; list_id: string; media_id: string; position: number; note: string|null; created_at: string }
