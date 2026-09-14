-- Keep extension-owned objects out of the exposed public schema. Existing
-- indexes retain their operator-class dependencies when the extension moves.
alter extension pg_trgm set schema extensions;

-- Cover composite ownership foreign keys so deletes from parent jobs/records
-- do not require full scans as import history grows.
create index import_records_owned_job_idx
  on public.import_records (import_job_id, user_id);

create index import_provenance_owned_job_idx
  on public.import_provenance (import_job_id, user_id);

create index import_provenance_owned_record_idx
  on public.import_provenance (import_record_id, import_job_id, user_id);
