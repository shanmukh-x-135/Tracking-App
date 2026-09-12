create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in (
    'letterboxd', 'backloggd', 'serializd', 'fable',
    'generic_movies', 'generic_series', 'generic_games', 'generic_books'
  )),
  status text not null default 'uploaded' check (status in (
    'uploaded', 'parsing', 'needs_review', 'ready', 'importing', 'completed',
    'failed', 'cancelled', 'undoing', 'undone', 'partially_undone'
  )),
  conflict_policy text not null default 'review' check (conflict_policy in ('keep_mosaic', 'use_imported', 'review')),
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  total_records integer not null default 0 check (total_records >= 0),
  matched_records integer not null default 0 check (matched_records >= 0),
  ambiguous_records integer not null default 0 check (ambiguous_records >= 0),
  skipped_records integer not null default 0 check (skipped_records >= 0),
  failed_records integer not null default 0 check (failed_records >= 0),
  duplicate_records integer not null default 0 check (duplicate_records >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms bigint check (duration_ms is null or duration_ms >= 0),
  error_summary text check (error_summary is null or char_length(error_summary) <= 2000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  constraint import_jobs_dates check (completed_at is null or started_at is null or completed_at >= started_at)
);

create index import_jobs_user_created_idx on public.import_jobs (user_id, created_at desc, id);
create index import_jobs_user_status_idx on public.import_jobs (user_id, status, updated_at desc);
create index import_jobs_file_idx on public.import_jobs (user_id, source, file_sha256);
create trigger import_jobs_set_updated_at before update on public.import_jobs
for each row execute function private.set_updated_at();

create table public.import_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  import_job_id uuid not null,
  source_record_key text not null check (char_length(source_record_key) between 1 and 512),
  media_type text not null check (media_type in ('movie', 'tv', 'game', 'book')),
  source_title text not null check (char_length(btrim(source_title)) between 1 and 500),
  source_year smallint check (source_year is null or source_year between 1000 and 9999),
  source_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(source_metadata) = 'object'),
  normalized_payload jsonb not null check (jsonb_typeof(normalized_payload) = 'object'),
  resolution_status text not null default 'pending' check (resolution_status in (
    'pending', 'matched', 'ambiguous', 'manual', 'unmatched', 'skipped', 'failed', 'imported'
  )),
  resolved_media_id uuid references public.media_items(id) on delete set null,
  confidence text check (confidence is null or confidence in ('exact', 'high', 'medium', 'ambiguous', 'unmatched')),
  candidate_payload jsonb not null default '[]'::jsonb check (jsonb_typeof(candidate_payload) = 'array'),
  error_summary text check (error_summary is null or char_length(error_summary) <= 2000),
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (id, import_job_id, user_id),
  unique (import_job_id, source_record_key),
  constraint import_records_owned_job foreign key (import_job_id, user_id)
    references public.import_jobs(id, user_id) on delete cascade,
  constraint import_records_resolution check (
    (resolution_status in ('matched', 'manual', 'imported') and resolved_media_id is not null)
    or resolution_status not in ('matched', 'manual', 'imported')
  )
);

create index import_records_user_created_idx on public.import_records (user_id, created_at desc, id);
create index import_records_job_resolution_idx on public.import_records (import_job_id, resolution_status, id);
create index import_records_resolved_media_idx on public.import_records (resolved_media_id) where resolved_media_id is not null;
create trigger import_records_set_updated_at before update on public.import_records
for each row execute function private.set_updated_at();

create table public.import_provenance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  import_job_id uuid not null,
  import_record_id uuid not null,
  source text not null check (source in (
    'letterboxd', 'backloggd', 'serializd', 'fable',
    'generic_movies', 'generic_series', 'generic_games', 'generic_books'
  )),
  source_record_key text not null check (char_length(source_record_key) between 1 and 512),
  target_kind text not null check (target_kind in (
    'library_entry', 'rating', 'review', 'movie_watch_log', 'episode_watch_log',
    'episode_rating', 'game_playthrough', 'book_reading', 'list', 'list_item'
  )),
  target_row_id uuid not null,
  imported_fingerprint text not null check (imported_fingerprint ~ '^[0-9a-f]{64}$'),
  applied_snapshot jsonb not null check (jsonb_typeof(applied_snapshot) = 'object'),
  target_updated_at timestamptz,
  undo_status text not null default 'active' check (undo_status in (
    'active', 'removed', 'preserved_modified', 'missing', 'failed'
  )),
  undone_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, source, source_record_key, target_kind),
  constraint import_provenance_owned_job foreign key (import_job_id, user_id)
    references public.import_jobs(id, user_id) on delete cascade,
  constraint import_provenance_owned_record foreign key (import_record_id, import_job_id, user_id)
    references public.import_records(id, import_job_id, user_id) on delete cascade
);

create index import_provenance_job_idx on public.import_provenance (import_job_id, id);
create index import_provenance_record_idx on public.import_provenance (import_record_id);
create index import_provenance_target_idx on public.import_provenance (target_kind, target_row_id);

alter table public.import_jobs enable row level security;
alter table public.import_records enable row level security;
alter table public.import_provenance enable row level security;

create policy import_jobs_owner_all on public.import_jobs for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy import_records_owner_all on public.import_records for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy import_provenance_owner_all on public.import_provenance for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.import_jobs, public.import_records, public.import_provenance to authenticated;
