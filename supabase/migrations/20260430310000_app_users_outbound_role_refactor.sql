-- 3-level outbound permission model
-- none   : no outbound permission
-- viewer : view only
-- worker : view + self execute
-- master : view + assign/reassign + execute any

alter table public.app_users
  add column if not exists outbound_role text not null default 'none';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_users_outbound_role_check'
      and conrelid = 'public.app_users'::regclass
  ) then
    alter table public.app_users
      add constraint app_users_outbound_role_check
      check (outbound_role in ('none', 'viewer', 'worker', 'master'));
  end if;
end $$;

-- Backfill from legacy outbound booleans (most permissive wins)
update public.app_users
set outbound_role = case
  when coalesce(can_outbound_execute_any, false)
    or coalesce(can_outbound_assign_handler, false)
    or coalesce(can_outbound_reassign_recall, false) then 'master'
  when coalesce(can_outbound_execute_self, false) then 'worker'
  when coalesce(can_outbound_view, false) then 'viewer'
  else 'none'
end;

-- Keep legacy columns synchronized for gradual app rollout compatibility
update public.app_users
set
  can_outbound_view = (outbound_role in ('viewer', 'worker', 'master')),
  can_outbound_execute_self = (outbound_role in ('worker', 'master')),
  can_outbound_assign_handler = (outbound_role = 'master'),
  can_outbound_reassign_recall = (outbound_role = 'master'),
  can_outbound_execute_any = (outbound_role = 'master');
