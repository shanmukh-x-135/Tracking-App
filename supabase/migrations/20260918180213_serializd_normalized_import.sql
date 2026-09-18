-- Extend the existing record-transactional import pipeline. Historical events
-- remain separate from season/show state; source dates never manufacture logs.
alter table public.import_jobs drop constraint import_jobs_source_check;
alter table public.import_jobs add constraint import_jobs_source_check check (source in ('letterboxd','backloggd','serializd','serializd_normalized_v1','fable','generic_movies','generic_series','generic_games','generic_books'));
alter table public.import_provenance drop constraint import_provenance_source_check;
alter table public.import_provenance add constraint import_provenance_source_check check (source in ('letterboxd','backloggd','serializd','serializd_normalized_v1','fable','generic_movies','generic_series','generic_games','generic_books'));
alter table public.import_provenance drop constraint import_provenance_target_kind_check;
alter table public.import_provenance add constraint import_provenance_target_kind_check check (target_kind in ('library_entry','rating','review','movie_watch_log','episode_watch_log','episode_rating','game_playthrough','book_reading','list','list_item','tv_series_state','tv_season_state','tv_history_log'));
alter table public.tv_season_states drop constraint tv_season_states_state_check;
alter table public.tv_season_states add constraint tv_season_states_state_check check (state in ('watchlist','watching','completed','paused','dropped'));
alter table public.episode_watch_logs
  add column rating numeric check (rating between 0.5 and 5 and mod(rating, 0.5) = 0),
  add column review text check (char_length(review) <= 10000),
  add column contains_spoilers boolean not null default false,
  add column tags jsonb not null default '[]'::jsonb check (jsonb_typeof(tags) = 'array');

create table public.tv_series_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  series_media_id uuid not null references public.media_items(id) on delete cascade,
  state_facts jsonb not null check (jsonb_typeof(state_facts) = 'object'),
  source_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(source_metadata) = 'object'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (user_id, series_media_id)
);
create index tv_series_states_series_idx on public.tv_series_states (series_media_id);
create trigger tv_series_states_set_updated_at before update on public.tv_series_states for each row execute function private.set_updated_at();
alter table public.tv_series_states enable row level security;
create policy tv_series_states_owner_all on public.tv_series_states for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.tv_series_states to authenticated;

create table public.tv_history_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  series_media_id uuid not null references public.media_items(id) on delete cascade,
  target_type text not null check (target_type in ('show','season')),
  season_number integer check (season_number >= 0),
  occurred_at timestamptz not null,
  is_rewatch boolean not null default false,
  rating numeric check (rating between 0.5 and 5 and mod(rating, 0.5) = 0),
  review text check (char_length(review) <= 10000),
  contains_spoilers boolean not null default false,
  tags jsonb not null default '[]'::jsonb check (jsonb_typeof(tags) = 'array'),
  source_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(source_metadata) = 'object'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((target_type = 'show' and season_number is null) or (target_type = 'season' and season_number is not null))
);
create index tv_history_logs_user_date_idx on public.tv_history_logs (user_id, occurred_at desc, id);
create index tv_history_logs_series_idx on public.tv_history_logs (series_media_id);
create trigger tv_history_logs_set_updated_at before update on public.tv_history_logs for each row execute function private.set_updated_at();
alter table public.tv_history_logs enable row level security;
create policy tv_history_logs_owner_all on public.tv_history_logs for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.tv_history_logs to authenticated;

-- Preserve the established Letterboxd/CSV path while dispatching the new adapter.
alter function public.apply_import_record(uuid,jsonb,text) rename to apply_import_record_legacy;
alter function public.apply_import_record_legacy(uuid,jsonb,text) set schema private;
revoke all on function private.apply_import_record_legacy(uuid,jsonb,text) from public,anon,authenticated;

create function public.apply_import_record(p_import_record_id uuid, p_selected_media jsonb, p_conflict_policy text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); r public.import_records%rowtype; source_name text; p jsonb;
  mid uuid; eid uuid; tid uuid; before_row jsonb; snapshot jsonb; kind text;
  changes integer := 0; conflicts integer := 0; created boolean;
  favorite_enabled boolean;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_conflict_policy not in ('keep_mosaic','use_imported','review') then raise exception 'Invalid conflict policy'; end if;
  -- Serialize same-owner application across jobs, including exact-file retries.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text, 0));
  select records.* into r from public.import_records records join public.import_jobs job on job.id = records.import_job_id and job.user_id = records.user_id
    where records.id = p_import_record_id and records.user_id = uid and job.status in ('ready','needs_review','importing','completed','failed') for update of records;
  if not found then raise exception 'Import record not found'; end if;
  select source into source_name from public.import_jobs where id = r.import_job_id and user_id = uid;
  if source_name <> 'serializd_normalized_v1' then return private.apply_import_record_legacy(p_import_record_id,p_selected_media,p_conflict_policy); end if;
  p := r.normalized_payload;
  select coalesce((metadata ->> 'importFavorites')::boolean,true) into favorite_enabled from public.import_jobs where id = r.import_job_id and user_id = uid;
  if not favorite_enabled then p := jsonb_set(p,'{isFavorite}','false'::jsonb); end if;
  if r.media_type is distinct from 'tv' or p_selected_media ->> 'provider' is distinct from 'tmdb' or p_selected_media ->> 'mediaType' is distinct from 'tv'
    or p_selected_media ->> 'providerId' is distinct from p #>> '{providerIdentity,providerId}'
    or nullif(btrim(p_selected_media ->> 'title'),'') is null then raise exception 'Exact TMDB identity required'; end if;
  if p ->> 'defaultImport' = 'false' then return jsonb_build_object('changes',0,'conflicts',0,'reimport',false); end if;
  if exists (select 1 from public.import_provenance where user_id = uid and source = source_name and source_record_key = r.source_record_key and undo_status in ('active','preserved_modified')) then
    return jsonb_build_object('changes',0,'conflicts',0,'reimport',true);
  end if;
  insert into public.media_items (media_type,provider,external_id,title,poster_url,backdrop_url,metadata)
    values ('tv','tmdb',p_selected_media ->> 'providerId',left(p_selected_media ->> 'title',500),p_selected_media ->> 'posterUrl',p_selected_media ->> 'backdropUrl',jsonb_build_object('catalog',p_selected_media))
    on conflict (provider,media_type,external_id) do nothing;
  select id into mid from public.media_items where provider = 'tmdb' and media_type = 'tv' and external_id = p_selected_media ->> 'providerId';

  if p ->> 'recordKind' = 'show_state' then
    select to_jsonb(item) into before_row from public.tv_series_states item where user_id = uid and series_media_id = mid for update;
    created := before_row is null;
    if created then
      insert into public.tv_series_states as item (user_id,series_media_id,state_facts,source_metadata) values (uid,mid,p -> 'stateFacts',r.source_metadata) returning id,to_jsonb(item) into tid,snapshot;
    elsif before_row -> 'state_facts' is distinct from p -> 'stateFacts' then
      conflicts := conflicts + 1;
      if p_conflict_policy = 'use_imported' then update public.tv_series_states as item set state_facts = p -> 'stateFacts',source_metadata = r.source_metadata where id = (before_row ->> 'id')::uuid returning id,to_jsonb(item) into tid,snapshot; end if;
    end if;
    if snapshot is not null then
      perform private.add_import_provenance(uid,r.import_job_id,r.id,source_name,r.source_record_key,'tv_series_state',tid,jsonb_build_object('created',created,'applied',snapshot)); changes := changes + 1;
    end if;
    snapshot := null;
    select to_jsonb(item) into before_row from public.library_entries item where user_id = uid and media_id = mid for update;
    created := before_row is null;
    if created then
      insert into public.library_entries as item (user_id,media_id,status,is_favorite) values (uid,mid,coalesce(p ->> 'status','watchlist'),coalesce((p ->> 'isFavorite')::boolean,false)) returning id,to_jsonb(item) into tid,snapshot;
    elsif before_row ->> 'status' is distinct from p ->> 'status' or (coalesce((p ->> 'isFavorite')::boolean,false) and before_row ->> 'is_favorite' = 'false') then
      conflicts := conflicts + 1;
      if p_conflict_policy = 'use_imported' then update public.library_entries as item set status = coalesce(p ->> 'status',status),is_favorite = is_favorite or coalesce((p ->> 'isFavorite')::boolean,false) where id = (before_row ->> 'id')::uuid returning id,to_jsonb(item) into tid,snapshot; end if;
    end if;
    if snapshot is not null then perform private.add_import_provenance(uid,r.import_job_id,r.id,source_name,r.source_record_key,'library_entry',tid,jsonb_build_object('created',created,'applied',snapshot)); changes := changes + 1; end if;
  elsif p ->> 'recordKind' = 'season_state' then
    if p ->> 'seasonNumber' is null then raise exception 'Resolved season required'; end if;
    select to_jsonb(item) into before_row from public.tv_season_states item where user_id = uid and series_media_id = mid and season_number = (p ->> 'seasonNumber')::integer for update;
    created := before_row is null;
    if created then
      insert into public.tv_season_states as item (user_id,series_media_id,season_number,state,provenance,metadata) values (uid,mid,(p ->> 'seasonNumber')::integer,p ->> 'seasonState','imported_state',jsonb_build_object('source',r.source_metadata,'date_added',p ->> 'sourceCreatedAt','tmdb_season_id',p -> 'tmdbSeasonId')) returning id,to_jsonb(item) into tid,snapshot;
    elsif before_row ->> 'state' is distinct from p ->> 'seasonState' then
      conflicts := conflicts + 1;
      if p_conflict_policy = 'use_imported' then update public.tv_season_states as item set state = p ->> 'seasonState',provenance = 'imported_state',metadata = r.source_metadata where id = (before_row ->> 'id')::uuid returning id,to_jsonb(item) into tid,snapshot; end if;
    end if;
    if snapshot is not null then perform private.add_import_provenance(uid,r.import_job_id,r.id,source_name,r.source_record_key,'tv_season_state',tid,jsonb_build_object('created',created,'applied',snapshot)); changes := changes + 1; end if;
  elsif p ->> 'recordKind' = 'event' then
    if p ->> 'watchedDate' is null then raise exception 'Historical event date required'; end if;
    if p ->> 'targetType' = 'episode' then
      if p ->> 'seasonNumber' is null or p ->> 'episodeNumber' is null or p ->> 'episodeProviderId' is null then raise exception 'Resolved episode required'; end if;
      insert into public.tv_episodes (series_media_id,provider,external_id,season_number,episode_number,title) values (mid,'tmdb',p ->> 'episodeProviderId',(p ->> 'seasonNumber')::integer,(p ->> 'episodeNumber')::integer,coalesce(p ->> 'episodeTitle','Episode ' || (p ->> 'episodeNumber'))) on conflict (series_media_id,season_number,episode_number) do nothing;
      select id into eid from public.tv_episodes where series_media_id = mid and season_number = (p ->> 'seasonNumber')::integer and episode_number = (p ->> 'episodeNumber')::integer;
      if p ->> 'isLog' = 'true' then
        insert into public.episode_watch_logs as item (user_id,episode_id,watched_at,is_rewatch,rating,review,contains_spoilers,tags) values (uid,eid,(p ->> 'watchedDate')::timestamptz,coalesce((p ->> 'isRewatch')::boolean,false),(p ->> 'rating')::numeric,p ->> 'review',coalesce((p ->> 'containsSpoilers')::boolean,false),coalesce(p -> 'tags','[]'::jsonb)) returning id,to_jsonb(item) into tid,snapshot;
        perform private.add_import_provenance(uid,r.import_job_id,r.id,source_name,r.source_record_key,'episode_watch_log',tid,jsonb_build_object('created',true,'applied',snapshot)); changes := changes + 1;
      end if;
    elsif p ->> 'targetType' in ('show','season') and p ->> 'isLog' = 'true' then
      insert into public.tv_history_logs as item (user_id,series_media_id,target_type,season_number,occurred_at,is_rewatch,rating,review,contains_spoilers,tags,source_metadata) values (uid,mid,p ->> 'targetType',(p ->> 'seasonNumber')::integer,(p ->> 'watchedDate')::timestamptz,coalesce((p ->> 'isRewatch')::boolean,false),case when p ->> 'targetType' = 'show' then (p ->> 'rating')::numeric end,p ->> 'review',coalesce((p ->> 'containsSpoilers')::boolean,false),coalesce(p -> 'tags','[]'::jsonb),r.source_metadata) returning id,to_jsonb(item) into tid,snapshot;
      perform private.add_import_provenance(uid,r.import_job_id,r.id,source_name,r.source_record_key,'tv_history_log',tid,jsonb_build_object('created',true,'applied',snapshot)); changes := changes + 1;
    end if;
    -- Season ratings have no product equivalent and remain in source provenance.
    if p ->> 'rating' is not null and p ->> 'targetType' in ('show','episode') then
      snapshot := null;
      if eid is not null then
        kind := 'episode_rating';
        select to_jsonb(item) into before_row from public.episode_ratings item where user_id = uid and episode_id = eid for update;
        created := before_row is null;
        if created then insert into public.episode_ratings as item (user_id,episode_id,rating) values (uid,eid,(p ->> 'rating')::numeric) returning id,to_jsonb(item) into tid,snapshot;
        elsif (before_row ->> 'rating')::numeric <> (p ->> 'rating')::numeric then conflicts := conflicts + 1; if p_conflict_policy = 'use_imported' then update public.episode_ratings as item set rating = (p ->> 'rating')::numeric where id = (before_row ->> 'id')::uuid returning id,to_jsonb(item) into tid,snapshot; end if; end if;
      else
        kind := 'rating';
        select to_jsonb(item) into before_row from public.ratings item where user_id = uid and media_id = mid for update;
        created := before_row is null;
        if created then insert into public.ratings as item (user_id,media_id,rating) values (uid,mid,(p ->> 'rating')::numeric) returning id,to_jsonb(item) into tid,snapshot;
        elsif (before_row ->> 'rating')::numeric <> (p ->> 'rating')::numeric then conflicts := conflicts + 1; if p_conflict_policy = 'use_imported' then update public.ratings as item set rating = (p ->> 'rating')::numeric where id = (before_row ->> 'id')::uuid returning id,to_jsonb(item) into tid,snapshot; end if; end if;
      end if;
      if snapshot is not null then perform private.add_import_provenance(uid,r.import_job_id,r.id,source_name,r.source_record_key,kind,tid,jsonb_build_object('created',created,'applied',snapshot)); changes := changes + 1; end if;
    end if;
    if nullif(p ->> 'review','') is not null and p ->> 'targetType' = 'show' then
      snapshot := null;
      select to_jsonb(item) into before_row from public.reviews item where user_id = uid and media_id = mid order by created_at limit 1 for update;
      created := before_row is null;
      if created then
        insert into public.reviews as item (user_id,media_id,body,contains_spoilers) values (uid,mid,p ->> 'review',coalesce((p ->> 'containsSpoilers')::boolean,false)) returning id,to_jsonb(item) into tid,snapshot;
      elsif before_row ->> 'body' is distinct from p ->> 'review' or (before_row ->> 'contains_spoilers')::boolean is distinct from coalesce((p ->> 'containsSpoilers')::boolean,false) then
        conflicts := conflicts + 1;
        if p_conflict_policy = 'use_imported' then update public.reviews as item set body = p ->> 'review',contains_spoilers = coalesce((p ->> 'containsSpoilers')::boolean,false) where id = (before_row ->> 'id')::uuid returning id,to_jsonb(item) into tid,snapshot; end if;
      end if;
      if snapshot is not null then perform private.add_import_provenance(uid,r.import_job_id,r.id,source_name,r.source_record_key,'review',tid,jsonb_build_object('created',created,'applied',snapshot)); changes := changes + 1; end if;
    end if;
  else raise exception 'Unsupported normalized record';
  end if;
  update public.import_records set resolution_status = 'imported',resolved_media_id = mid,imported_at = now() where id = r.id;
  return jsonb_build_object('changes',changes,'conflicts',conflicts,'reimport',changes = 0);
end;
$$;
revoke all on function public.apply_import_record(uuid,jsonb,text) from public,anon;
grant execute on function public.apply_import_record(uuid,jsonb,text) to authenticated;

alter function public.undo_import_job(uuid) rename to undo_import_job_legacy;
alter function public.undo_import_job_legacy(uuid) set schema private;
revoke all on function private.undo_import_job_legacy(uuid) from public,anon,authenticated;
create function public.undo_import_job(p_import_job_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); p public.import_provenance%rowtype; row_json jsonb; legacy jsonb; removed integer := 0; preserved integer := 0; missing integer := 0;
begin
  if uid is null or not exists (select 1 from public.import_jobs where id = p_import_job_id and user_id = uid and status in ('completed','failed','partially_undone')) then raise exception 'Import job cannot be undone'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text,0));
  for p in select * from public.import_provenance where import_job_id = p_import_job_id and user_id = uid and undo_status = 'active' and target_kind in ('tv_series_state','tv_season_state','tv_history_log') for update loop
    row_json := null;
    case p.target_kind
      when 'tv_series_state' then select to_jsonb(item) into row_json from public.tv_series_states item where id = p.target_row_id and user_id = uid;
      when 'tv_season_state' then select to_jsonb(item) into row_json from public.tv_season_states item where id = p.target_row_id and user_id = uid;
      when 'tv_history_log' then select to_jsonb(item) into row_json from public.tv_history_logs item where id = p.target_row_id and user_id = uid;
    end case;
    if row_json is null then update public.import_provenance set undo_status = 'missing',undone_at = now() where id = p.id; missing := missing + 1;
    elsif p.applied_snapshot ->> 'created' <> 'true' or encode(extensions.digest(jsonb_build_object('created',true,'applied',row_json)::text,'sha256'),'hex') <> p.imported_fingerprint then update public.import_provenance set undo_status = 'preserved_modified',undone_at = now() where id = p.id; preserved := preserved + 1;
    else
      case p.target_kind
        when 'tv_series_state' then delete from public.tv_series_states where id = p.target_row_id and user_id = uid;
        when 'tv_season_state' then delete from public.tv_season_states where id = p.target_row_id and user_id = uid;
        when 'tv_history_log' then delete from public.tv_history_logs where id = p.target_row_id and user_id = uid;
      end case;
      update public.import_provenance set undo_status = 'removed',undone_at = now() where id = p.id; removed := removed + 1;
    end if;
  end loop;
  legacy := private.undo_import_job_legacy(p_import_job_id);
  if preserved > 0 then update public.import_jobs set status = 'partially_undone' where id = p_import_job_id and user_id = uid; end if;
  return jsonb_build_object('removed',removed + (legacy ->> 'removed')::integer,'preserved',preserved + (legacy ->> 'preserved')::integer,'missing',missing + (legacy ->> 'missing')::integer);
end;
$$;
revoke all on function public.undo_import_job(uuid) from public,anon;
grant execute on function public.undo_import_job(uuid) to authenticated;
