-- Library-only uploads do not reserve AI credits. Existing reservations retain their quota period.
alter table public.reports alter column quota_period_start drop not null;
alter table public.reports add column local_report_id text;
alter table public.reports add column local_updated_at timestamptz;
create unique index reports_user_local_id_idx on public.reports(user_id, local_report_id);

-- API authenticates the account and validates the payload. Only the trusted service can call this.
create function public.upload_library_report(p_user_id uuid, p_report jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid;
  v_managed uuid;
  v_updated timestamptz := (p_report->>'updatedAt')::timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select id into v_id from public.reports
    where user_id = p_user_id and local_report_id = p_report->>'localId';
  if v_id is null and p_report->>'managedReportId' is not null then
    select id into v_managed from public.reports
      where id = (p_report->>'managedReportId')::uuid and user_id = p_user_id
      and status = 'complete' and quota_period_start is not null;
    v_id := v_managed;
  end if;
  v_id := coalesce(v_id, gen_random_uuid());
  insert into public.reports(id, user_id, device_id, title, source_type, mode, status,
    quota_period_start, cloud_saved, report_data, created_at, updated_at, completed_at,
    local_report_id, local_updated_at)
  values (v_id, p_user_id, 'library-upload', p_report->>'title', p_report->>'sourceType',
    p_report->>'mode', 'complete', null, true, p_report->'reportData',
    (p_report->>'createdAt')::timestamptz, now(), (p_report->>'createdAt')::timestamptz,
    p_report->>'localId', v_updated)
  on conflict (id) do update set
    title = excluded.title, source_type = excluded.source_type, mode = excluded.mode,
    cloud_saved = true, report_data = excluded.report_data, updated_at = now(),
    local_report_id = excluded.local_report_id, local_updated_at = excluded.local_updated_at
  where reports.user_id = p_user_id
    and (reports.local_updated_at is null or reports.local_updated_at <= v_updated);
  return v_id;
end;
$$;
revoke all on function public.upload_library_report(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.upload_library_report(uuid, jsonb) to service_role;

-- Uploading a library report must never grant access to managed AI.
create or replace function public.record_managed_ai_request(
  p_user_id uuid,
  p_report_id uuid,
  p_kind text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.reports%rowtype;
  v_used integer;
  v_limit integer;
begin
  if p_kind not in ('chat', 'transcription') then
    raise exception using errcode = '22023', message = 'invalid_ai_request_kind';
  end if;

  select * into v_report
  from public.reports
  where id = p_report_id and user_id = p_user_id
  for update;

  if not found or v_report.quota_period_start is null or v_report.status not in ('pending', 'complete') then
    raise exception using errcode = 'P0001', message = 'invalid_report_reservation';
  end if;

  v_limit := case when p_kind = 'chat' then 90 else 45 end;
  select count(*)::integer into v_used
  from public.ai_requests
  where report_id = p_report_id and kind = p_kind;

  if v_used >= v_limit then
    raise exception using errcode = 'P0001', message = 'managed_ai_request_limit_exhausted';
  end if;

  insert into public.ai_requests (report_id, user_id, kind)
  values (p_report_id, p_user_id, p_kind);
  return true;
end;
$$;
