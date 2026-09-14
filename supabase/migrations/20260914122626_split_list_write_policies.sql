-- The visibility policies already cover owner reads. Keep write authorization
-- explicit so authenticated SELECTs do not evaluate two permissive policies.
drop policy lists_owner_all on public.lists;

create policy lists_owner_insert on public.lists for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy lists_owner_update on public.lists for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy lists_owner_delete on public.lists for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy list_items_owner_all on public.list_items;

create policy list_items_owner_insert on public.list_items for insert to authenticated
with check (exists (
  select 1 from public.lists
  where lists.id = list_items.list_id
    and lists.user_id = (select auth.uid())
));

create policy list_items_owner_update on public.list_items for update to authenticated
using (exists (
  select 1 from public.lists
  where lists.id = list_items.list_id
    and lists.user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.lists
  where lists.id = list_items.list_id
    and lists.user_id = (select auth.uid())
));

create policy list_items_owner_delete on public.list_items for delete to authenticated
using (exists (
  select 1 from public.lists
  where lists.id = list_items.list_id
    and lists.user_id = (select auth.uid())
));
