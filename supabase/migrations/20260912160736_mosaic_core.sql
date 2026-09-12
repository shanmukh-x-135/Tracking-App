create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text not null,
  bio text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_normalized check (
    username = lower(btrim(username))
    and username ~ '^[a-z0-9_]{3,30}$'
  ),
  constraint profiles_display_name_length check (char_length(display_name) between 1 and 80),
  constraint profiles_bio_length check (bio is null or char_length(bio) <= 500)
);

create index profiles_username_search_idx on public.profiles using gin (username gin_trgm_ops);

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  generated_username text;
  generated_display_name text;
begin
  generated_username := 'user_' || replace(substr(new.id::text, 1, 13), '-', '');
  generated_display_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Mosaic member'
  );

  insert into public.profiles (id, username, display_name, avatar_url)
  values (new.id, generated_username, left(generated_display_name, 80), new.raw_user_meta_data ->> 'avatar_url')
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function private.handle_new_user() from public, anon, authenticated;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function private.set_updated_at();

create trigger on_auth_user_created after insert on auth.users
for each row execute function private.handle_new_user();

create table public.media_items (
  id uuid primary key default gen_random_uuid(),
  media_type text not null check (media_type in ('movie', 'tv', 'game', 'book')),
  provider text not null check (provider in ('tmdb', 'igdb', 'googlebooks', 'mock')),
  external_id text not null check (char_length(external_id) between 1 and 255),
  title text not null check (char_length(title) between 1 and 500),
  original_title text,
  poster_url text,
  backdrop_url text,
  release_date date,
  release_year smallint check (release_year is null or release_year between 1000 and 9999),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, media_type, external_id),
  constraint media_items_provider_domain check (
    (provider = 'tmdb' and media_type in ('movie', 'tv'))
    or (provider = 'igdb' and media_type = 'game')
    or (provider = 'googlebooks' and media_type = 'book')
    or provider = 'mock'
  )
);

create index media_items_title_search_idx on public.media_items using gin (title gin_trgm_ops);
create index media_items_type_release_idx on public.media_items (media_type, release_year desc);
create trigger media_items_set_updated_at before update on public.media_items
for each row execute function private.set_updated_at();

create table public.library_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  media_id uuid not null references public.media_items(id) on delete cascade,
  status text not null check (status in (
    'watchlist', 'watched', 'watching', 'backlog', 'playing', 'reading',
    'want_to_read', 'paused', 'completed', 'finished', 'dropped', 'dnf'
  )),
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, media_id)
);

create index library_entries_user_status_idx on public.library_entries (user_id, status, updated_at desc);
create index library_entries_media_id_idx on public.library_entries (media_id);
create trigger library_entries_set_updated_at before update on public.library_entries
for each row execute function private.set_updated_at();

create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  media_id uuid not null references public.media_items(id) on delete cascade,
  rating numeric(2,1) not null check (rating between 0.5 and 5 and mod(rating * 2, 1) = 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, media_id)
);

create index ratings_media_id_idx on public.ratings (media_id, created_at desc);
create trigger ratings_set_updated_at before update on public.ratings
for each row execute function private.set_updated_at();

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  media_id uuid not null references public.media_items(id) on delete cascade,
  rating_id uuid references public.ratings(id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 10000),
  contains_spoilers boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, media_id)
);

create index reviews_media_created_idx on public.reviews (media_id, created_at desc);
create index reviews_rating_id_idx on public.reviews (rating_id);
create trigger reviews_set_updated_at before update on public.reviews
for each row execute function private.set_updated_at();

create table public.lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  visibility text not null default 'public' check (visibility in ('public', 'unlisted', 'private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lists_user_updated_idx on public.lists (user_id, updated_at desc);
create index lists_public_updated_idx on public.lists (updated_at desc) where visibility = 'public';
create trigger lists_set_updated_at before update on public.lists
for each row execute function private.set_updated_at();

create table public.list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists(id) on delete cascade,
  media_id uuid not null references public.media_items(id) on delete cascade,
  position integer not null check (position >= 0),
  note text check (note is null or char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  unique (list_id, media_id),
  unique (list_id, position)
);

create index list_items_media_id_idx on public.list_items (media_id);

alter table public.profiles enable row level security;
alter table public.media_items enable row level security;
alter table public.library_entries enable row level security;
alter table public.ratings enable row level security;
alter table public.reviews enable row level security;
alter table public.lists enable row level security;
alter table public.list_items enable row level security;

create policy profiles_public_read on public.profiles for select to anon, authenticated using (true);
create policy profiles_owner_update on public.profiles for update to authenticated
using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy media_items_public_read on public.media_items for select to anon, authenticated using (true);
create policy media_items_authenticated_insert on public.media_items for insert to authenticated
with check ((select auth.uid()) is not null);

create policy library_entries_owner_all on public.library_entries for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy ratings_public_read on public.ratings for select to anon, authenticated using (true);
create policy ratings_owner_insert on public.ratings for insert to authenticated with check ((select auth.uid()) = user_id);
create policy ratings_owner_update on public.ratings for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ratings_owner_delete on public.ratings for delete to authenticated using ((select auth.uid()) = user_id);

create policy reviews_public_read on public.reviews for select to anon, authenticated using (true);
create policy reviews_owner_insert on public.reviews for insert to authenticated with check ((select auth.uid()) = user_id);
create policy reviews_owner_update on public.reviews for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy reviews_owner_delete on public.reviews for delete to authenticated using ((select auth.uid()) = user_id);

create policy lists_visible_read on public.lists for select to anon, authenticated
using (visibility in ('public', 'unlisted') or (select auth.uid()) = user_id);
create policy lists_owner_all on public.lists for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy list_items_visible_read on public.list_items for select to anon, authenticated
using (exists (
  select 1 from public.lists
  where lists.id = list_items.list_id
  and (lists.visibility in ('public', 'unlisted') or lists.user_id = (select auth.uid()))
));
create policy list_items_owner_all on public.list_items for all to authenticated
using (exists (select 1 from public.lists where lists.id = list_items.list_id and lists.user_id = (select auth.uid())))
with check (exists (select 1 from public.lists where lists.id = list_items.list_id and lists.user_id = (select auth.uid())));

grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.media_items, public.ratings, public.reviews, public.lists, public.list_items to anon, authenticated;
grant update on public.profiles to authenticated;
grant insert on public.media_items to authenticated;
grant select, insert, update, delete on public.library_entries, public.ratings, public.reviews, public.lists, public.list_items to authenticated;
