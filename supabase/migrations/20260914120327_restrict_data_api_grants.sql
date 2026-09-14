-- Hosted projects may automatically grant broad table privileges when a public
-- table is created. Reset Mosaic's Data API roles before applying the explicit
-- application contract below; RLS remains the row-level line of defense.
revoke all privileges on table
  public.profiles,
  public.media_items,
  public.library_entries,
  public.ratings,
  public.reviews,
  public.lists,
  public.list_items,
  public.movie_watch_logs,
  public.tv_episodes,
  public.episode_watch_logs,
  public.episode_ratings,
  public.game_playthroughs,
  public.book_readings,
  public.import_jobs,
  public.import_records,
  public.import_provenance
from anon, authenticated;

grant select on table
  public.profiles,
  public.media_items,
  public.ratings,
  public.reviews,
  public.lists,
  public.list_items,
  public.tv_episodes
to anon, authenticated;

grant update on table public.profiles to authenticated;
grant insert on table public.media_items, public.tv_episodes to authenticated;

grant select, insert, update, delete on table
  public.library_entries,
  public.ratings,
  public.reviews,
  public.lists,
  public.list_items,
  public.movie_watch_logs,
  public.episode_watch_logs,
  public.episode_ratings,
  public.game_playthroughs,
  public.book_readings,
  public.import_jobs,
  public.import_records,
  public.import_provenance
to authenticated;

revoke execute on function private.set_updated_at() from public, anon, authenticated;
