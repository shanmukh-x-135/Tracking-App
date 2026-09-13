export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Row<T> = T & Record<string, unknown>;
type Insert<T> = Partial<T> & Record<string, unknown>;
type Update<T> = Partial<T> & Record<string, unknown>;

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
      import_jobs: { Row: Row<ImportJobRow>; Insert: Insert<ImportJobRow>; Update: Update<ImportJobRow>; Relationships: [] };
      import_records: { Row: Row<ImportRecordRow>; Insert: Insert<ImportRecordRow>; Update: Update<ImportRecordRow>; Relationships: [] };
      import_provenance: { Row: Row<ImportProvenanceRow>; Insert: Insert<ImportProvenanceRow>; Update: Update<ImportProvenanceRow>; Relationships: [] };
    };
    Views: Record<string, never>;
    Functions: {
      apply_import_record: { Args: { p_import_record_id: string; p_selected_media: Json; p_conflict_policy: string }; Returns: Json };
      undo_import_job: { Args: { p_import_job_id: string }; Returns: Json };
      reorder_list_items: { Args: { p_list_id: string; p_item_ids: string[] }; Returns: undefined };
    };
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
export interface ImportJobRow extends Timestamped { user_id: string; source: string; status: string; conflict_policy: string; original_filename: string; file_sha256: string; total_records: number; matched_records: number; ambiguous_records: number; skipped_records: number; failed_records: number; duplicate_records: number; started_at: string|null; completed_at: string|null; duration_ms: number|null; error_summary: string|null; metadata: Json }
export interface ImportRecordRow extends Timestamped { user_id: string; import_job_id: string; source_record_key: string; media_type: "movie"|"tv"|"game"|"book"; source_title: string; source_year: number|null; source_metadata: Json; normalized_payload: Json; resolution_status: string; resolved_media_id: string|null; confidence: string|null; candidate_payload: Json; error_summary: string|null; imported_at: string|null }
export interface ImportProvenanceRow { id: string; user_id: string; import_job_id: string; import_record_id: string; source: string; source_record_key: string; target_kind: string; target_row_id: string; imported_fingerprint: string; applied_snapshot: Json; target_updated_at: string|null; undo_status: string; undone_at: string|null; created_at: string }
