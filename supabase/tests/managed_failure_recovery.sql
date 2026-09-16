-- All synthetic data rolls back. Run after managed_failure_recovery migration.
begin;
do $$
declare
  v_user uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_report record;
  v_retry record;
  v_ai bigint;
  v_snapshot jsonb;
  v_historical record;
begin
  insert into auth.users(id,email,email_confirmed_at) values
    (v_user,'managed-recovery-test@example.invalid',now()),
    (v_other,'managed-recovery-other@example.invalid',now());
  select * into v_report from public.reserve_managed_report(v_user,'recovery-test-device',false);
  if v_report.plan <> 'free' or v_report.used <> 1 then raise exception 'free starter reservation failed'; end if;
  begin
    perform public.reserve_managed_report(v_user,'recovery-test-device',false);
    raise exception 'pending report did not hold credit';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'managed_report_quota_exhausted' then raise; end if;
  end;
  v_ai := public.begin_managed_ai_request(v_user, v_report.report_id, 'chat');
  update public.ai_requests set outcome='failed', requested_model='gpt-5.5',
    effective_model='gpt-5.6-terra', provider='gateway', http_status=403,
    error_code='model_access_denied', duration_ms=400 where id=v_ai;
  update public.reports set status='failed' where id=v_report.report_id;
  select * into v_retry from public.reserve_managed_report(v_user,'recovery-test-device',false);
  if v_retry.used <> 1 or v_retry.report_id = v_report.report_id then raise exception 'failed starter was not released'; end if;
  begin
    perform public.begin_managed_ai_request(v_other, v_retry.report_id, 'chat');
    raise exception 'cross-account AI access permitted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'invalid_report_reservation' then raise; end if;
  end;
  begin
    perform public.begin_managed_ai_request(v_user, v_report.report_id, 'chat');
    raise exception 'released failed report still permits AI';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'invalid_report_reservation' then raise; end if;
  end;
  v_snapshot := public.administrator_dashboard('', 'all', 1, 1, v_user);
  if not exists(select 1 from jsonb_array_elements(v_snapshot->'activity') a
    where a->>'id'=v_report.report_id::text and (a->>'allowance_released')::boolean
      and a->'last_ai_error'->>'code'='model_access_denied') then raise exception 'admin diagnostics missing'; end if;
  update public.reports set status='complete' where id=v_retry.report_id;
  begin
    perform public.reserve_managed_report(v_user,'recovery-test-device',false);
    raise exception 'successful starter did not consume credit';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'managed_report_quota_exhausted' then raise; end if;
  end;
  update public.subscriptions set plan='pro',status='active' where user_id=v_user;
  select * into v_retry from public.reserve_managed_report(v_user,'recovery-test-device',false);
  if v_retry.report_limit <> 20 or v_retry.used <> 1 then raise exception 'Pro allowance incorrect'; end if;
  update public.reports set status='failed' where id=v_retry.report_id;
  select * into v_retry from public.reserve_managed_report(v_user,'recovery-test-device',false);
  if v_retry.used <> 1 then raise exception 'Pro failure counted against allowance'; end if;
  update public.reports set status='failed' where id=v_retry.report_id;
  begin
    perform public.reserve_managed_report(v_user,'recovery-test-device',false);
    raise exception 'unbounded failure retries allowed';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'managed_report_retry_limited' then raise; end if;
  end;
  -- Confirm both original August users can reserve a replacement starter.
  for v_historical in select distinct user_id from public.reports
    where status='failed' and created_at >= '2026-08-24' and created_at < '2026-08-27' loop
    select * into v_retry from public.reserve_managed_report(v_historical.user_id,'historical-recovery-test',false);
    if v_retry.plan <> 'free' or v_retry.used <> 1 then raise exception 'historical starter recovery failed'; end if;
  end loop;
  if has_function_privilege('authenticated','public.begin_managed_ai_request(uuid,uuid,text)','execute')
    or has_function_privilege('anon','public.reserve_managed_report(uuid,text,boolean)','execute') then
    raise exception 'privileged functions exposed';
  end if;
end;
$$;
rollback;
