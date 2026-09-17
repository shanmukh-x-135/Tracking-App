alter table public.profiles
  add column watch_region text check (watch_region is null or watch_region ~ '^[A-Z]{2}$');

comment on column public.profiles.watch_region is 'ISO 3166-1 alpha-2 region used for TMDB/JustWatch availability.';
