-- Sound operations have their own atomic per-report budget: 20 x <=60 seconds.
-- Keep existing clients and their chat/transcription quotas compatible.
alter table public.ai_requests drop constraint ai_requests_kind_check;
alter table public.ai_requests add constraint ai_requests_kind_check
  check (kind in ('chat', 'transcription', 'sound'));

create or replace function public.begin_managed_ai_request(
  p_user_id uuid,
  p_report_id uuid,
  p_kind text
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_report public.reports%rowtype;
  v_used integer;
  v_limit integer;
  v_request_id bigint;
begin
  if p_kind not in ('chat', 'transcription', 'sound') then
    raise exception using errcode = '22023', message = 'invalid_ai_request_kind';
  end if;

  select * into v_report
  from public.reports
  where id = p_report_id and user_id = p_user_id
  for update;

  if not found or v_report.quota_period_start is null or v_report.status not in ('pending', 'complete') then
    raise exception using errcode = 'P0001', message = 'invalid_report_reservation';
  end if;

  v_limit := case p_kind when 'chat' then 90 when 'transcription' then 45 else 20 end;
  select count(*)::integer into v_used
  from public.ai_requests
  where report_id = p_report_id and kind = p_kind;

  if v_used >= v_limit then
    raise exception using errcode = 'P0001', message = 'managed_ai_request_limit_exhausted';
  end if;

  insert into public.ai_requests (report_id, user_id, kind)
  values (p_report_id, p_user_id, p_kind) returning id into v_request_id;
  return v_request_id;
end;
$$;


revoke all on function public.begin_managed_ai_request(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.begin_managed_ai_request(uuid, uuid, text) to service_role;

