create or replace function private.add_import_provenance(
  p_user_id uuid,
  p_job_id uuid,
  p_record_id uuid,
  p_source text,
  p_source_record_key text,
  p_target_kind text,
  p_target_row_id uuid,
  p_snapshot jsonb,
  p_target_updated_at timestamptz default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.import_provenance (
    user_id, import_job_id, import_record_id, source, source_record_key,
    target_kind, target_row_id, imported_fingerprint, applied_snapshot, target_updated_at
  ) values (
    p_user_id, p_job_id, p_record_id, p_source, p_source_record_key,
    p_target_kind, p_target_row_id,
    encode(extensions.digest(p_snapshot::text, 'sha256'), 'hex'), p_snapshot, p_target_updated_at
  )
  on conflict (user_id, source, source_record_key, target_kind) do update set
    import_job_id = excluded.import_job_id,
    import_record_id = excluded.import_record_id,
    target_row_id = excluded.target_row_id,
    imported_fingerprint = excluded.imported_fingerprint,
    applied_snapshot = excluded.applied_snapshot,
    target_updated_at = excluded.target_updated_at,
    undo_status = 'active',
    undone_at = null;
$$;

revoke execute on function private.add_import_provenance(uuid, uuid, uuid, text, text, text, uuid, jsonb, timestamptz)
from public, anon, authenticated;

create or replace function public.apply_import_record(
  p_import_record_id uuid,
  p_selected_media jsonb,
  p_conflict_policy text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  source_record public.import_records%rowtype;
  source_name text;
  payload jsonb;
  v_media_id uuid;
  v_target_id uuid;
  v_list_id uuid;
  v_episode_id uuid;
  previous jsonb;
  applied jsonb;
  target_time timestamptz;
  changed boolean;
  changes integer := 0;
  conflicts integer := 0;
  source_list_key text;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if p_conflict_policy not in ('keep_mosaic', 'use_imported', 'review') then raise exception 'Invalid conflict policy'; end if;

  select records.* into source_record
  from public.import_records records
  join public.import_jobs jobs on jobs.id = records.import_job_id and jobs.user_id = records.user_id
  where records.id = p_import_record_id and records.user_id = current_user_id
    and jobs.status in ('needs_review', 'ready', 'importing', 'completed')
  for update of records;
  if not found then raise exception 'Import record not found'; end if;
  select jobs.source into source_name from public.import_jobs jobs
  where jobs.id = source_record.import_job_id and jobs.user_id = current_user_id;

  payload := source_record.normalized_payload;
  if p_selected_media ->> 'mediaType' <> source_record.media_type
    or nullif(p_selected_media ->> 'provider', '') is null
    or p_selected_media ->> 'provider' not in ('tmdb', 'igdb', 'googlebooks', 'mock')
    or nullif(btrim(p_selected_media ->> 'providerId'), '') is null
    or nullif(btrim(p_selected_media ->> 'title'), '') is null
  then raise exception 'Invalid selected media'; end if;

  insert into public.media_items as existing (
    media_type, provider, external_id, title, original_title, poster_url, backdrop_url,
    release_date, release_year, metadata
  ) values (
    p_selected_media ->> 'mediaType', p_selected_media ->> 'provider', p_selected_media ->> 'providerId',
    left(p_selected_media ->> 'title', 500), nullif(p_selected_media ->> 'originalTitle', ''),
    nullif(p_selected_media ->> 'posterUrl', ''), nullif(p_selected_media ->> 'backdropUrl', ''),
    nullif(p_selected_media ->> 'releaseDate', '')::date, (p_selected_media ->> 'releaseYear')::smallint,
    p_selected_media - array['mediaType','provider','providerId','title','originalTitle','posterUrl','backdropUrl','releaseDate','releaseYear']
  ) on conflict (provider, media_type, external_id) do update set
    poster_url = coalesce(existing.poster_url, excluded.poster_url),
    backdrop_url = coalesce(existing.backdrop_url, excluded.backdrop_url),
    metadata = case when existing.metadata = '{}'::jsonb then excluded.metadata else existing.metadata end
  returning id into v_media_id;

  if coalesce(payload ->> 'recordKind', '') <> 'list_item' then
    if nullif(payload ->> 'status', '') is not null then
      changed := false;
      select entry.id, to_jsonb(entry), entry.updated_at into v_target_id, previous, target_time
      from public.library_entries entry where entry.user_id = current_user_id and entry.media_id = v_media_id for update;
      if not found then
        insert into public.library_entries as inserted (user_id, media_id, status) values (current_user_id, v_media_id, payload ->> 'status')
        returning id, to_jsonb(inserted), updated_at into v_target_id, applied, target_time;
        applied := jsonb_build_object('created', true, 'applied', applied); changed := true;
      elsif previous ->> 'status' = payload ->> 'status' then null;
      else
        conflicts := conflicts + 1;
        if p_conflict_policy = 'use_imported' then
          update public.library_entries as updated set status = payload ->> 'status' where id = v_target_id
          returning jsonb_build_object('created', false, 'previous', previous, 'applied', to_jsonb(updated)), updated_at into applied, target_time;
          changed := true;
        end if;
      end if;
      if changed then
        perform private.add_import_provenance(current_user_id, source_record.import_job_id, source_record.id, source_name, source_record.source_record_key, 'library_entry', v_target_id, applied, target_time);
        changes := changes + 1;
      end if;
    end if;

    if nullif(payload ->> 'rating', '') is not null and coalesce(payload ->> 'recordKind', '') <> 'history' then
      changed := false;
      select item.id, to_jsonb(item), item.updated_at into v_target_id, previous, target_time
      from public.ratings item where item.user_id = current_user_id and item.media_id = v_media_id for update;
      if not found then
        insert into public.ratings as inserted (user_id, media_id, rating) values (current_user_id, v_media_id, (payload ->> 'rating')::numeric)
        returning id, jsonb_build_object('created', true, 'applied', to_jsonb(inserted)), updated_at into v_target_id, applied, target_time;
        changed := true;
      elsif (previous ->> 'rating')::numeric <> (payload ->> 'rating')::numeric then
        conflicts := conflicts + 1;
        if p_conflict_policy = 'use_imported' then
          update public.ratings as updated set rating = (payload ->> 'rating')::numeric where id = v_target_id
          returning jsonb_build_object('created', false, 'previous', previous, 'applied', to_jsonb(updated)), updated_at into applied, target_time;
          changed := true;
        end if;
      end if;
      if changed then
        perform private.add_import_provenance(current_user_id, source_record.import_job_id, source_record.id, source_name, source_record.source_record_key, 'rating', v_target_id, applied, target_time);
        changes := changes + 1;
      end if;
    end if;

    if nullif(payload ->> 'review', '') is not null and coalesce(payload ->> 'recordKind', '') <> 'history' then
      changed := false;
      select item.id, to_jsonb(item), item.updated_at into v_target_id, previous, target_time
      from public.reviews item where item.user_id = current_user_id and item.media_id = v_media_id for update;
      if not found then
        insert into public.reviews as inserted (user_id, media_id, body) values (current_user_id, v_media_id, left(payload ->> 'review', 10000))
        returning id, jsonb_build_object('created', true, 'applied', to_jsonb(inserted)), updated_at into v_target_id, applied, target_time;
        changed := true;
      elsif previous ->> 'body' <> payload ->> 'review' then
        conflicts := conflicts + 1;
        if p_conflict_policy = 'use_imported' then
          update public.reviews as updated set body = left(payload ->> 'review', 10000) where id = v_target_id
          returning jsonb_build_object('created', false, 'previous', previous, 'applied', to_jsonb(updated)), updated_at into applied, target_time;
          changed := true;
        end if;
      end if;
      if changed then
        perform private.add_import_provenance(current_user_id, source_record.import_job_id, source_record.id, source_name, source_record.source_record_key, 'review', v_target_id, applied, target_time);
        changes := changes + 1;
      end if;
    end if;
  end if;

  if source_record.media_type = 'movie' and (payload ->> 'recordKind' = 'history' or (payload ->> 'recordKind' is null and payload ? 'watchedDate')) then
    if not exists (select 1 from public.import_provenance where user_id = current_user_id and source = source_name and source_record_key = source_record.source_record_key and target_kind = 'movie_watch_log' and undo_status = 'active') then
      insert into public.movie_watch_logs as inserted (user_id, media_id, watched_at, is_rewatch, rating, review)
      values (current_user_id, v_media_id, (payload ->> 'watchedDate')::date, coalesce((payload ->> 'isRewatch')::boolean, false), (payload ->> 'rating')::numeric, nullif(payload ->> 'review', ''))
      returning id, jsonb_build_object('created', true, 'applied', to_jsonb(inserted)), updated_at into v_target_id, applied, target_time;
      perform private.add_import_provenance(current_user_id, source_record.import_job_id, source_record.id, source_name, source_record.source_record_key, 'movie_watch_log', v_target_id, applied, target_time);
      changes := changes + 1;
    end if;
  elsif source_record.media_type = 'tv' and payload ? 'seasonNumber' and payload ? 'episodeNumber' then
    insert into public.tv_episodes (series_media_id, provider, external_id, season_number, episode_number, title)
    values (v_media_id, p_selected_media ->> 'provider', 'import:' || (p_selected_media ->> 'providerId') || ':' || (payload ->> 'seasonNumber') || ':' || (payload ->> 'episodeNumber'), (payload ->> 'seasonNumber')::integer, (payload ->> 'episodeNumber')::integer, coalesce(nullif(payload ->> 'episodeTitle', ''), 'Episode ' || (payload ->> 'episodeNumber')))
    on conflict (series_media_id, season_number, episode_number) do update set title = excluded.title returning id into v_episode_id;
    if not exists (select 1 from public.import_provenance where user_id = current_user_id and source = source_name and source_record_key = source_record.source_record_key and target_kind = 'episode_watch_log' and undo_status = 'active') then
      insert into public.episode_watch_logs as inserted (user_id, episode_id, watched_at) values (current_user_id, v_episode_id, coalesce((payload ->> 'watchedDate')::timestamptz, now()))
      returning id, jsonb_build_object('created', true, 'applied', to_jsonb(inserted)), updated_at into v_target_id, applied, target_time;
      perform private.add_import_provenance(current_user_id, source_record.import_job_id, source_record.id, source_name, source_record.source_record_key, 'episode_watch_log', v_target_id, applied, target_time);
      changes := changes + 1;
    end if;
  elsif source_record.media_type = 'game' then
    if not exists (select 1 from public.import_provenance where user_id = current_user_id and source = source_name and source_record_key = source_record.source_record_key and target_kind = 'game_playthrough' and undo_status = 'active') then
      insert into public.game_playthroughs as inserted (user_id, media_id, status, platform, started_at, completed_at, playtime_minutes, progress_percent, rating)
      values (current_user_id, v_media_id, coalesce(payload ->> 'status', 'backlog'), nullif(payload ->> 'platform', ''), (payload ->> 'startedAt')::date, (payload ->> 'completedAt')::date, coalesce((payload ->> 'playtimeMinutes')::integer, 0), (payload ->> 'progressPercent')::numeric, (payload ->> 'rating')::numeric)
      returning id, jsonb_build_object('created', true, 'applied', to_jsonb(inserted)), updated_at into v_target_id, applied, target_time;
      perform private.add_import_provenance(current_user_id, source_record.import_job_id, source_record.id, source_name, source_record.source_record_key, 'game_playthrough', v_target_id, applied, target_time);
      changes := changes + 1;
    end if;
  elsif source_record.media_type = 'book' then
    if not exists (select 1 from public.import_provenance where user_id = current_user_id and source = source_name and source_record_key = source_record.source_record_key and target_kind = 'book_reading' and undo_status = 'active') then
      insert into public.book_readings as inserted (user_id, media_id, status, started_at, finished_at, current_page, total_pages, progress_percent, rating)
      values (current_user_id, v_media_id, coalesce(payload ->> 'status', 'want_to_read'), (payload ->> 'startedAt')::date, (payload ->> 'finishedAt')::date, (payload ->> 'currentPage')::integer, (payload ->> 'totalPages')::integer, case when payload ? 'currentPage' and payload ? 'totalPages' then round((payload ->> 'currentPage')::numeric / (payload ->> 'totalPages')::numeric * 100, 2) end, (payload ->> 'rating')::numeric)
      returning id, jsonb_build_object('created', true, 'applied', to_jsonb(inserted)), updated_at into v_target_id, applied, target_time;
      perform private.add_import_provenance(current_user_id, source_record.import_job_id, source_record.id, source_name, source_record.source_record_key, 'book_reading', v_target_id, applied, target_time);
      changes := changes + 1;
    end if;
  elsif source_record.media_type = 'movie' and payload ->> 'recordKind' = 'list_item' then
    source_list_key := payload #>> '{list,sourceListKey}';
    select provenance.target_row_id into v_list_id from public.import_provenance provenance
    where user_id = current_user_id and source = source_name and source_record_key = source_list_key and target_kind = 'list' and undo_status = 'active';
    if v_list_id is null or not exists (select 1 from public.lists item where item.id = v_list_id and item.user_id = current_user_id) then
      insert into public.lists as inserted (user_id, title, description, visibility)
      values (current_user_id, left(payload #>> '{list,title}', 120), left(coalesce(payload #>> '{list,description}', 'Imported from ' || initcap(source_name)), 2000), 'private')
      returning id, jsonb_build_object('created', true, 'applied', to_jsonb(inserted)), updated_at into v_list_id, applied, target_time;
      perform private.add_import_provenance(current_user_id, source_record.import_job_id, source_record.id, source_name, source_list_key, 'list', v_list_id, applied, target_time);
      changes := changes + 1;
    end if;
    if not exists (select 1 from public.import_provenance where user_id = current_user_id and source = source_name and source_record_key = source_record.source_record_key and target_kind = 'list_item' and undo_status = 'active')
      and not exists (select 1 from public.list_items item where item.list_id = v_list_id and item.media_id = v_media_id) then
      insert into public.list_items as inserted (list_id, media_id, position, note)
      values (v_list_id, v_media_id, coalesce((select max(item.position) + 1 from public.list_items item where item.list_id = v_list_id), 0), nullif(payload #>> '{list,note}', ''))
      returning id, jsonb_build_object('created', true, 'applied', to_jsonb(inserted)), null::timestamptz into v_target_id, applied, target_time;
      perform private.add_import_provenance(current_user_id, source_record.import_job_id, source_record.id, source_name, source_record.source_record_key, 'list_item', v_target_id, applied, target_time);
      changes := changes + 1;
    end if;
  end if;

  update public.import_records set resolution_status = 'imported', resolved_media_id = v_media_id, imported_at = now() where id = source_record.id;
  return jsonb_build_object('changes', changes, 'conflicts', conflicts, 'reimport', changes = 0);
end;
$$;

revoke execute on function public.apply_import_record(uuid, jsonb, text) from public, anon;
grant execute on function public.apply_import_record(uuid, jsonb, text) to authenticated;
