create or replace function public.reorder_list_items(p_list_id uuid, p_item_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  existing_count integer;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.lists where id = p_list_id and user_id = current_user_id for update) then
    raise exception 'List not found';
  end if;
  if cardinality(p_item_ids) > 1000 or cardinality(p_item_ids) <> cardinality(array(select distinct unnest(p_item_ids))) then
    raise exception 'Invalid list order';
  end if;
  select count(*) into existing_count from public.list_items where list_id = p_list_id;
  if existing_count <> cardinality(p_item_ids)
    or exists (select 1 from unnest(p_item_ids) item_id where not exists (select 1 from public.list_items where id = item_id and list_id = p_list_id))
  then raise exception 'List order must include every item exactly once'; end if;

  update public.list_items set position = position + 1000000 where list_id = p_list_id;
  update public.list_items item set position = requested.position
  from (select item_id, ordinality::integer - 1 as position from unnest(p_item_ids) with ordinality as ordered(item_id, ordinality)) requested
  where item.id = requested.item_id and item.list_id = p_list_id;
  update public.lists set updated_at = now() where id = p_list_id and user_id = current_user_id;
end;
$$;

revoke execute on function public.reorder_list_items(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_list_items(uuid, uuid[]) to authenticated;
