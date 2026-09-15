alter table public.movie_watch_logs
  add column viewing_context text check (viewing_context in ('theater', 'streaming', 'television', 'physical', 'digital', 'other')),
  add column streaming_service text check (streaming_service is null or char_length(streaming_service) <= 120);

comment on column public.movie_watch_logs.viewing_context is 'Optional context for a movie watch; historical and imported logs remain null when unknown.';
comment on column public.movie_watch_logs.streaming_service is 'Optional service name, meaningful only when viewing_context is streaming.';
