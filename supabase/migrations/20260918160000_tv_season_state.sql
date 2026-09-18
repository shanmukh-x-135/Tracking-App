-- Season state is deliberately distinct from episode history. A bulk or
-- imported completion can be represented without manufacturing episode rows
-- or precise timestamps that the source did not provide.
create table public.tv_season_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  series_media_id uuid not null references public.media_items(id) on delete cascade,
  season_number integer not null check (season_number >= 0),
  state text not null check (state in ('watching', 'completed', 'paused', 'dropped')),
  provenance text not null default 'explicit_episode' check (provenance in ('explicit_episode', 'bulk_season', 'imported_state')),
  completed_on date,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, series_media_id, season_number)
);

create index tv_season_states_user_updated_idx
  on public.tv_season_states (user_id, updated_at desc);
create index tv_season_states_series_idx
  on public.tv_season_states (series_media_id, season_number);

create trigger tv_season_states_set_updated_at before update on public.tv_season_states
for each row execute function private.set_updated_at();

alter table public.tv_season_states enable row level security;

create policy tv_season_states_owner_all on public.tv_season_states for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.tv_season_states to authenticated;
