begin;
do $$
declare
  owner_id uuid := gen_random_uuid(); other_id uuid := gen_random_uuid();
  stale_id uuid; active_id uuid; recent_ai_id uuid; other_report uuid; library_id uuid; completed_id uuid;
begin
  insert into auth.users(id,email,email_confirmed_at) values
    (owner_id,'stale-fixture@example.invalid',now()),(other_id,'stale-other@example.invalid',now());
  insert into public.reports(user_id,device_id,quota_period_start,created_at,updated_at)
    values(owner_id,'stale-test-device','1970-01-01',now()-interval '2 hours',now()-interval '2 hours') returning id into stale_id;
  insert into public.reports(user_id,device_id,quota_period_start) values(owner_id,'recent-test-device','1970-01-01') returning id into active_id;
  insert into public.reports(user_id,device_id,quota_period_start,created_at,updated_at)
    values(owner_id,'recent-ai-device','1970-01-01',now()-interval '2 hours',now()-interval '2 hours') returning id into recent_ai_id;
  insert into public.ai_requests(report_id,user_id,kind) values(recent_ai_id,owner_id,'chat');
  insert into public.reports(user_id,device_id,quota_period_start,created_at,updated_at)
    values(other_id,'other-test-device','1970-01-01',now()-interval '2 hours',now()-interval '2 hours') returning id into other_report;
  insert into public.reports(user_id,device_id,created_at,updated_at)
    values(owner_id,'library-test-device',now()-interval '2 hours',now()-interval '2 hours') returning id into library_id;
  insert into public.reports(user_id,device_id,quota_period_start,status,created_at,updated_at)
    values(owner_id,'complete-test-device','1970-01-01','complete',now()-interval '2 hours',now()-interval '2 hours') returning id into completed_id;
  if public.release_stale_managed_reports(owner_id) <> 1 then raise exception 'wrong expired count'; end if;
  if not exists(select 1 from public.reports where id=stale_id and status='failed' and failure_code='interrupted') then raise exception 'stale reservation retained'; end if;
  if exists(select 1 from public.reports where id in (active_id,recent_ai_id,other_report,library_id) and status<>'pending') then raise exception 'active, foreign or library record changed'; end if;
  if not exists(select 1 from public.reports where id=completed_id and status='complete') then raise exception 'completed report changed'; end if;
  if public.release_stale_managed_reports(owner_id) <> 0 then raise exception 'expiry not idempotent'; end if;
  if has_function_privilege('anon','public.release_stale_managed_reports(uuid)','execute') or has_function_privilege('authenticated','public.release_stale_managed_reports(uuid)','execute') then raise exception 'expiry publicly executable'; end if;
end;
$$;
rollback;
