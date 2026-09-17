-- Run against a migrated database with a migration-capable connection.
-- All fixtures and their events are rolled back, including on normal success.
begin;
insert into auth.users(id,email,email_confirmed_at)
values ('f0510000-0000-4000-8000-000000000051','activation-regression@example.invalid',now());
insert into public.profiles(user_id,email)
values ('f0510000-0000-4000-8000-000000000051','activation-regression@example.invalid')
on conflict (user_id) do nothing;
set local role service_role;
insert into public.reports(id,user_id,device_id,quota_period_start,status)
values ('f0510000-0000-4000-8000-000000000052','f0510000-0000-4000-8000-000000000051','activation-regression',date '1970-01-01','pending');
update public.reports set status='failed' where id='f0510000-0000-4000-8000-000000000052';
update public.reports set status='failed' where id='f0510000-0000-4000-8000-000000000052';
do $$
begin
  if (select count(*) from public.activation_events where user_id='f0510000-0000-4000-8000-000000000051') <> 2 then
    raise exception 'Report transitions must record one start and one failure';
  end if;
  if not exists(select 1 from jsonb_array_elements(public.activation_funnel()->'events') e where e->>'event'='starter_failed' and (e->>'members')::int > 0) then
    raise exception 'Application role cannot aggregate recorded milestones';
  end if;
  if has_table_privilege('authenticated','public.activation_events','SELECT') or has_function_privilege('anon','public.activation_funnel()','EXECUTE') then
    raise exception 'Activation data must remain server-only';
  end if;
end $$;
rollback;
