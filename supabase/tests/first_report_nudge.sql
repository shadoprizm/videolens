-- Synthetic users only; every change rolls back.
begin;
do $$
declare
  cutoff timestamptz := now() - interval '30 days';
  idle uuid := gen_random_uuid();
  young uuid := gen_random_uuid();
  started uuid := gen_random_uuid();
  library uuid := gen_random_uuid();
  opted uuid := gen_random_uuid();
  paying uuid := gen_random_uuid();
  recent uuid := gen_random_uuid();
  n integer;
begin
  insert into auth.users(id,email,email_confirmed_at,created_at) values
    (idle,'nudge-idle@videolens-test.dev',now(),now()-interval '3 days'),
    (young,'nudge-young@videolens-test.dev',now(),now()-interval '47 hours'),
    (started,'nudge-started@videolens-test.dev',now(),now()-interval '5 days'),
    (library,'nudge-library@videolens-test.dev',now(),now()-interval '5 days'),
    (opted,'nudge-opted@videolens-test.dev',now(),now()-interval '5 days'),
    (paying,'nudge-paying@videolens-test.dev',now(),now()-interval '5 days'),
    (recent,'nudge-recent@videolens-test.dev',now(),now()-interval '5 days');
  -- A reserved starter report, and a library-only upload that reserved nothing.
  insert into public.reports(user_id,device_id,status,quota_period_start) values(started,'device-test','pending',date '1970-01-01');
  insert into public.reports(user_id,device_id,status,quota_period_start,cloud_saved,report_data) values(library,'library-upload','complete',null,true,'{}'::jsonb);
  insert into public.subscriptions(user_id,plan,status,stripe_subscription_id) values(paying,'pro','active','sub_nudge_test');
  insert into public.marketing_email_sends(user_id,campaign,message_id) values(recent,'founding_welcome','msg_nudge_test');
  perform public.marketing_candidates('first_report_nudge',cutoff,0);
  update public.marketing_preferences set opted_out_at=now() where user_id=opted;

  select count(*) into n from public.marketing_candidates('first_report_nudge',cutoff,500) c where c.email like 'nudge-%@videolens-test.dev';
  if n <> 2 then raise exception 'nudge should reach only idle 48-hour-old members (idle, library), got %', n; end if;
  if exists (select 1 from public.marketing_candidates('first_report_nudge',cutoff,500) c where c.user_id in (young,started,opted,paying,recent)) then
    raise exception 'nudge reached a young, active, opted-out, paying or just-emailed member';
  end if;

  insert into public.marketing_email_sends(user_id,campaign,message_id) values(idle,'first_report_nudge','msg_nudge_once');
  if exists (select 1 from public.marketing_candidates('first_report_nudge',cutoff,500) c where c.user_id = idle) then
    raise exception 'nudge repeated';
  end if;

  if has_function_privilege('authenticated','public.marketing_candidates(text,timestamptz,integer)','execute') then
    raise exception 'marketing candidates exposed to browser roles';
  end if;
  if not (select prosecdef from pg_proc where oid = 'public.marketing_candidates(text,timestamptz,integer)'::regprocedure) then
    raise exception 'marketing_candidates must stay security definer';
  end if;
  insert into public.journey_events(user_id,event,surface,event_key) values(idle,'web_app_clicked','website',repeat('a',64));
end;
$$;
-- The API calls this as service_role, which cannot read auth.users directly.
set local role service_role;
select count(*) from public.marketing_candidates('first_report_nudge', now(), 1);
reset role;
rollback;
