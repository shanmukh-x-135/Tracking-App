create table public.movie_watch_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  media_id uuid not null references public.media_items(id) on delete cascade,
  watched_at date not null,
  is_rewatch boolean not null default false,
  rating numeric(2,1) check (rating is null or (rating between 0.5 and 5 and mod(rating * 2, 1) = 0)),
  review text check (review is null or char_length(review) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index movie_watch_logs_user_date_idx on public.movie_watch_logs (user_id, watched_at desc);
create index movie_watch_logs_media_id_idx on public.movie_watch_logs (media_id);
create trigger movie_watch_logs_set_updated_at before update on public.movie_watch_logs
for each row execute function private.set_updated_at();

create table public.tv_episodes (
  id uuid primary key default gen_random_uuid(),
  series_media_id uuid not null references public.media_items(id) on delete cascade,
  provider text not null check (provider = 'tmdb'),
  external_id text not null,
  season_number integer not null check (season_number >= 0),
  episode_number integer not null check (episode_number > 0),
  title text not null,
  air_date date,
  runtime_minutes integer check (runtime_minutes is null or runtime_minutes > 0),
  still_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_id),
  unique (series_media_id, season_number, episode_number)
);

create index tv_episodes_series_order_idx on public.tv_episodes (series_media_id, season_number, episode_number);
create trigger tv_episodes_set_updated_at before update on public.tv_episodes
for each row execute function private.set_updated_at();

create table public.episode_watch_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  episode_id uuid not null references public.tv_episodes(id) on delete cascade,
  watched_at timestamptz not null default now(),
  is_rewatch boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index episode_watch_logs_user_date_idx on public.episode_watch_logs (user_id, watched_at desc);
create index episode_watch_logs_episode_id_idx on public.episode_watch_logs (episode_id);
create trigger episode_watch_logs_set_updated_at before update on public.episode_watch_logs
for each row execute function private.set_updated_at();

create table public.episode_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  episode_id uuid not null references public.tv_episodes(id) on delete cascade,
  rating numeric(2,1) not null check (rating between 0.5 and 5 and mod(rating * 2, 1) = 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, episode_id)
);

create index episode_ratings_episode_id_idx on public.episode_ratings (episode_id);
create trigger episode_ratings_set_updated_at before update on public.episode_ratings
for each row execute function private.set_updated_at();

create table public.game_playthroughs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  media_id uuid not null references public.media_items(id) on delete cascade,
  status text not null check (status in ('backlog', 'playing', 'paused', 'completed', 'dropped')),
  platform text,
  started_at date,
  completed_at date,
  playtime_minutes integer not null default 0 check (playtime_minutes >= 0),
  progress_percent numeric(5,2) check (progress_percent is null or progress_percent between 0 and 100),
  rating numeric(2,1) check (rating is null or (rating between 0.5 and 5 and mod(rating * 2, 1) = 0)),
  notes text check (notes is null or char_length(notes) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint game_playthroughs_dates check (completed_at is null or started_at is null or completed_at >= started_at)
);

create index game_playthroughs_user_updated_idx on public.game_playthroughs (user_id, updated_at desc);
create index game_playthroughs_media_id_idx on public.game_playthroughs (media_id);
create trigger game_playthroughs_set_updated_at before update on public.game_playthroughs
for each row execute function private.set_updated_at();

create table public.book_readings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  media_id uuid not null references public.media_items(id) on delete cascade,
  status text not null check (status in ('want_to_read', 'reading', 'paused', 'finished', 'dnf')),
  started_at date,
  finished_at date,
  current_page integer check (current_page is null or current_page >= 0),
  total_pages integer check (total_pages is null or total_pages > 0),
  progress_percent numeric(5,2) check (progress_percent is null or progress_percent between 0 and 100),
  rating numeric(2,1) check (rating is null or (rating between 0.5 and 5 and mod(rating * 2, 1) = 0)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint book_readings_pages check (current_page is null or total_pages is null or current_page <= total_pages),
  constraint book_readings_dates check (finished_at is null or started_at is null or finished_at >= started_at)
);

create index book_readings_user_updated_idx on public.book_readings (user_id, updated_at desc);
create index book_readings_media_id_idx on public.book_readings (media_id);
create trigger book_readings_set_updated_at before update on public.book_readings
for each row execute function private.set_updated_at();

alter table public.movie_watch_logs enable row level security;
alter table public.tv_episodes enable row level security;
alter table public.episode_watch_logs enable row level security;
alter table public.episode_ratings enable row level security;
alter table public.game_playthroughs enable row level security;
alter table public.book_readings enable row level security;

create policy movie_watch_logs_owner_all on public.movie_watch_logs for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy tv_episodes_public_read on public.tv_episodes for select to anon, authenticated using (true);
create policy tv_episodes_authenticated_insert on public.tv_episodes for insert to authenticated
with check ((select auth.uid()) is not null);

create policy episode_watch_logs_owner_all on public.episode_watch_logs for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy episode_ratings_public_read on public.episode_ratings for select to anon, authenticated using (true);
create policy episode_ratings_owner_insert on public.episode_ratings for insert to authenticated with check ((select auth.uid()) = user_id);
create policy episode_ratings_owner_update on public.episode_ratings for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy episode_ratings_owner_delete on public.episode_ratings for delete to authenticated using ((select auth.uid()) = user_id);
create policy game_playthroughs_owner_all on public.game_playthroughs for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy book_readings_owner_all on public.book_readings for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.movie_watch_logs, public.episode_watch_logs,
  public.episode_ratings, public.game_playthroughs, public.book_readings to authenticated;
grant select on public.tv_episodes to anon, authenticated;
grant insert on public.tv_episodes to authenticated;
