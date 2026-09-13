create or replace function public.undo_import_job(p_import_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  provenance public.import_provenance%rowtype;
  current_row jsonb;
  current_fingerprint text;
  removed_count integer := 0;
  preserved_count integer := 0;
  missing_count integer := 0;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.import_jobs job
    where job.id = p_import_job_id and job.user_id = current_user_id
      and job.status in ('completed', 'failed', 'partially_undone')
  ) then raise exception 'Import job cannot be undone'; end if;

  update public.import_jobs set status = 'undoing' where id = p_import_job_id and user_id = current_user_id;
  for provenance in
    select item.* from public.import_provenance item
    where item.import_job_id = p_import_job_id and item.user_id = current_user_id and item.undo_status = 'active'
    order by case item.target_kind
      when 'list_item' then 1 when 'movie_watch_log' then 2 when 'episode_watch_log' then 2
      when 'episode_rating' then 2 when 'game_playthrough' then 2 when 'book_reading' then 2
      when 'review' then 3 when 'rating' then 3 when 'library_entry' then 4 when 'list' then 5 else 6 end,
      item.created_at desc
    for update
  loop
    if coalesce((provenance.applied_snapshot ->> 'created')::boolean, false) is not true then
      update public.import_provenance set undo_status = 'preserved_modified', undone_at = now() where id = provenance.id;
      preserved_count := preserved_count + 1;
      continue;
    end if;

    current_row := null;
    case provenance.target_kind
      when 'library_entry' then select to_jsonb(item) into current_row from public.library_entries item where item.id = provenance.target_row_id and item.user_id = current_user_id;
      when 'rating' then select to_jsonb(item) into current_row from public.ratings item where item.id = provenance.target_row_id and item.user_id = current_user_id;
      when 'review' then select to_jsonb(item) into current_row from public.reviews item where item.id = provenance.target_row_id and item.user_id = current_user_id;
      when 'movie_watch_log' then select to_jsonb(item) into current_row from public.movie_watch_logs item where item.id = provenance.target_row_id and item.user_id = current_user_id;
      when 'episode_watch_log' then select to_jsonb(item) into current_row from public.episode_watch_logs item where item.id = provenance.target_row_id and item.user_id = current_user_id;
      when 'episode_rating' then select to_jsonb(item) into current_row from public.episode_ratings item where item.id = provenance.target_row_id and item.user_id = current_user_id;
      when 'game_playthrough' then select to_jsonb(item) into current_row from public.game_playthroughs item where item.id = provenance.target_row_id and item.user_id = current_user_id;
      when 'book_reading' then select to_jsonb(item) into current_row from public.book_readings item where item.id = provenance.target_row_id and item.user_id = current_user_id;
      when 'list' then select to_jsonb(item) into current_row from public.lists item where item.id = provenance.target_row_id and item.user_id = current_user_id;
      when 'list_item' then
        select to_jsonb(item) into current_row from public.list_items item
        join public.lists list on list.id = item.list_id
        where item.id = provenance.target_row_id and list.user_id = current_user_id;
      else current_row := null;
    end case;

    if current_row is null then
      update public.import_provenance set undo_status = 'missing', undone_at = now() where id = provenance.id;
      missing_count := missing_count + 1;
      continue;
    end if;
    current_fingerprint := encode(extensions.digest(jsonb_build_object('created', true, 'applied', current_row)::text, 'sha256'), 'hex');
    if current_fingerprint <> provenance.imported_fingerprint then
      update public.import_provenance set undo_status = 'preserved_modified', undone_at = now() where id = provenance.id;
      preserved_count := preserved_count + 1;
      continue;
    end if;

    case provenance.target_kind
      when 'library_entry' then delete from public.library_entries where id = provenance.target_row_id and user_id = current_user_id;
      when 'rating' then delete from public.ratings where id = provenance.target_row_id and user_id = current_user_id;
      when 'review' then delete from public.reviews where id = provenance.target_row_id and user_id = current_user_id;
      when 'movie_watch_log' then delete from public.movie_watch_logs where id = provenance.target_row_id and user_id = current_user_id;
      when 'episode_watch_log' then delete from public.episode_watch_logs where id = provenance.target_row_id and user_id = current_user_id;
      when 'episode_rating' then delete from public.episode_ratings where id = provenance.target_row_id and user_id = current_user_id;
      when 'game_playthrough' then delete from public.game_playthroughs where id = provenance.target_row_id and user_id = current_user_id;
      when 'book_reading' then delete from public.book_readings where id = provenance.target_row_id and user_id = current_user_id;
      when 'list' then delete from public.lists where id = provenance.target_row_id and user_id = current_user_id;
      when 'list_item' then
        delete from public.list_items item using public.lists list
        where item.id = provenance.target_row_id and list.id = item.list_id and list.user_id = current_user_id;
      else null;
    end case;
    update public.import_provenance set undo_status = 'removed', undone_at = now() where id = provenance.id;
    removed_count := removed_count + 1;
  end loop;

  update public.import_jobs set
    status = case when preserved_count > 0 then 'partially_undone' else 'undone' end,
    completed_at = now()
  where id = p_import_job_id and user_id = current_user_id;
  return jsonb_build_object('removed', removed_count, 'preserved', preserved_count, 'missing', missing_count);
end;
$$;

revoke execute on function public.undo_import_job(uuid) from public, anon;
grant execute on function public.undo_import_job(uuid) to authenticated;
