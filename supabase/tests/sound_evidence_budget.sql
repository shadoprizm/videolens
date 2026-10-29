-- All synthetic accounts and requests roll back; no member data is modified.
begin;
do $$
declare
  v_user uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_report record;
  v_id bigint;
begin
  insert into auth.users(id,email,email_confirmed_at) values
    (v_user,'sound-budget-test@example.invalid',now()),
    (v_other,'sound-other-test@example.invalid',now());
  select * into v_report from public.reserve_managed_report(v_user,'sound-test-device',false);
  for i in 1..20 loop
    v_id := public.begin_managed_ai_request(v_user,v_report.report_id,'sound');
  end loop;
  begin
    perform public.begin_managed_ai_request(v_user,v_report.report_id,'sound');
    raise exception 'sound budget was not enforced';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'managed_ai_request_limit_exhausted' then raise; end if;
  end;
  -- Sound has a separate budget: visuals and speech retain their headroom.
  perform public.begin_managed_ai_request(v_user,v_report.report_id,'chat');
  perform public.begin_managed_ai_request(v_user,v_report.report_id,'transcription');
  begin
    perform public.begin_managed_ai_request(v_other,v_report.report_id,'sound');
    raise exception 'cross-account sound request permitted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'invalid_report_reservation' then raise; end if;
  end;
  if has_function_privilege('anon','public.begin_managed_ai_request(uuid,uuid,text)','EXECUTE')
    or has_function_privilege('authenticated','public.begin_managed_ai_request(uuid,uuid,text)','EXECUTE') then
    raise exception 'sound budget RPC exposed';
  end if;
end;
$$;
rollback;
