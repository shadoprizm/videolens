-- Release allowance for all failed reports, including historical starter failures.
-- Keep the report/quota period and audit history intact; a library upload still has a NULL period.
-- Store operational diagnostics only: never prompts, media, response bodies or raw error messages.
alter table public.ai_requests
  add column outcome text check(outcome in ('succeeded', 'failed')),
  add column requested_model text,
  add column effective_model text,
  add column provider text check(provider in ('openai', 'gateway')),
  add column http_status integer check(http_status between 100 and 599),
  add column error_code text,
  add column fallback_used boolean not null default false,
  add column duration_ms integer check(duration_ms >= 0);

create or replace function public.reserve_managed_report(
  p_user_id uuid,
  p_device_id text,
  p_cloud_save boolean default false
)
returns table (report_id uuid, plan text, used integer, report_limit integer, period_start date)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_subscription public.subscriptions%rowtype;
  v_plan text;
  v_limit integer;
  v_period date;
  v_used integer;
  v_report_id uuid;
begin
  if p_user_id is null or length(trim(coalesce(p_device_id, ''))) < 8 then
    raise exception using errcode = '22023', message = 'invalid_reservation';
  end if;

  insert into public.subscriptions (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select * into v_subscription
  from public.subscriptions
  where user_id = p_user_id
  for update;

  if v_subscription.plan = 'pro' and v_subscription.status in ('active', 'trialing') then
    v_plan := 'pro';
    v_limit := 20;
    v_period := date_trunc('month', now() at time zone 'UTC')::date;
  else
    v_plan := 'free';
    v_limit := 1;
    v_period := date '1970-01-01';
  end if;

  select count(*)::integer into v_used
  from public.reports
  where user_id = p_user_id and quota_period_start = v_period
    and status in ('pending', 'complete');

  if v_used >= v_limit then
    raise exception using errcode = 'P0001', message = 'managed_report_quota_exhausted';
  end if;

  -- Failed attempts release credits, but repeated failures must not create an unbounded retry loop.
  if (select count(*) from public.reports where user_id = p_user_id
      and quota_period_start is not null and status = 'failed'
      and created_at >= now() - interval '1 hour') >= 3 then
    raise exception using errcode = 'P0001', message = 'managed_report_retry_limited';
  end if;

  insert into public.reports (user_id, device_id, quota_period_start, cloud_saved, report_data)
  values (p_user_id, trim(p_device_id), v_period, false, null)
  returning id into v_report_id;

  return query select v_report_id, v_plan, v_used + 1, v_limit, v_period;
end;
$$;


create function public.begin_managed_ai_request(
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
  values (p_report_id, p_user_id, p_kind) returning id into v_request_id;
  return v_request_id;
end;
$$;


revoke all on function public.begin_managed_ai_request(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.begin_managed_ai_request(uuid, uuid, text) to service_role;

create or replace function private.administrator_dashboard(
  p_query text, p_membership text, p_page integer, p_activity_page integer, p_user_id uuid
) returns jsonb language sql stable security definer set search_path = '' as $$
with members as (
  select u.id, u.email, u.created_at, u.last_sign_in_at, u.email_confirmed_at is not null as verified,
    coalesce(s.plan, 'free') as plan, coalesce(s.status, 'none') as subscription_status,
    s.current_period_end, coalesce(s.cancel_at_period_end, false) as cancel_at_period_end,
    case
      when lower(trim(u.email)) = 'ratelle.ja@gmail.com' and u.email_confirmed_at is not null then 'complimentary'
      when s.plan = 'pro' and s.status = 'trialing' then 'trial'
      when s.plan = 'pro' and s.status = 'active' and s.stripe_subscription_id is not null then 'paid'
      when s.plan = 'pro' and s.status = 'active' then 'complimentary'
      else 'free'
    end as membership,
    coalesce(r.scans, 0) as scans, coalesce(r.managed_scans, 0) as managed_scans, coalesce(r.library_uploads, 0) as library_uploads, coalesce(r.scans_this_month, 0) as scans_this_month, r.last_scan_at
  from auth.users u
  left join public.subscriptions s on s.user_id = u.id
  left join lateral (
    select count(*) as scans, count(*) filter(where quota_period_start is not null) as managed_scans, count(*) filter(where quota_period_start is null) as library_uploads, max(created_at) as last_scan_at,
      count(*) filter(where quota_period_start = date_trunc('month', now() at time zone 'UTC')::date) as scans_this_month
    from public.reports where user_id = u.id
  ) r on true
  where u.deleted_at is null
), filtered_members as (
  select * from members where
    (p_query = '' or position(lower(p_query) in lower(coalesce(email, ''))) > 0)
    and (p_membership = 'all' or membership = p_membership)
), activity as (
  select r.id, r.user_id, m.email, r.title, r.source_type, r.mode, r.status,
    r.cloud_saved, r.created_at, r.completed_at,
    case when r.quota_period_start is null then 'Library upload' else 'Managed scan' end as kind,
    (r.quota_period_start is not null and r.status = 'failed') as allowance_released,
    (select count(*) from public.ai_requests where report_id = r.id) as ai_request_count,
    (select count(*) from public.ai_requests where report_id = r.id and fallback_used) as recovered_requests,
    (select jsonb_build_object('stage', a.kind, 'code', a.error_code, 'httpStatus', a.http_status,
      'model', a.effective_model, 'at', a.created_at)
      from public.ai_requests a where a.report_id = r.id and a.outcome = 'failed'
      order by a.created_at desc, a.id desc limit 1) as last_ai_error
  from public.reports r join members m on m.id = r.user_id
  where (p_user_id is null or r.user_id = p_user_id)
), member_page as (
  select * from filtered_members order by created_at desc, id
  limit 50 offset (greatest(1, least(p_page, 100000)) - 1) * 50
), activity_page as (
  select * from activity order by created_at desc, id
  limit 50 offset (greatest(1, least(p_activity_page, 100000)) - 1) * 50
)
select jsonb_build_object(
  'generatedAt', now(),
  'summary', (select jsonb_build_object(
    'members', count(*), 'paid', count(*) filter(where membership = 'paid'),
    'free', count(*) filter(where membership = 'free'),
    'trial', count(*) filter(where membership = 'trial'),
    'complimentary', count(*) filter(where membership = 'complimentary'),
    'active30Days', count(*) filter(where last_sign_in_at >= now() - interval '30 days')
  ) from members),
  'scans', (select jsonb_build_object('total', count(*) filter(where quota_period_start is not null),
    'libraryUploads', count(*) filter(where quota_period_start is null),
    'last30Days', count(*) filter(where quota_period_start is not null and created_at >= now() - interval '30 days'),
    'complete', count(*) filter(where quota_period_start is not null and status = 'complete'),
    'failed', count(*) filter(where quota_period_start is not null and status = 'failed'),
    'pending', count(*) filter(where quota_period_start is not null and status = 'pending')) from public.reports),
  'members', coalesce((select jsonb_agg(to_jsonb(m)) from member_page m), '[]'::jsonb),
  'memberCount', (select count(*) from filtered_members),
  'activity', coalesce((select jsonb_agg(to_jsonb(a)) from activity_page a), '[]'::jsonb),
  'activityCount', (select count(*) from activity),
  'sources', coalesce((select jsonb_agg(to_jsonb(s)) from (
    select coalesce(source_type, 'Not reported') as label, count(*) as count
    from public.reports group by source_type order by count(*) desc limit 12
  ) s), '[]'::jsonb),
  'modes', coalesce((select jsonb_agg(to_jsonb(m)) from (
    select coalesce(mode, 'Not reported') as label, count(*) as count
    from public.reports group by mode order by count(*) desc limit 12
  ) m), '[]'::jsonb),
  'daily', (select jsonb_agg(to_jsonb(d)) from (
    select days.day::date as day, count(r.id) as count
    from generate_series((now() at time zone 'UTC')::date - 13,
      (now() at time zone 'UTC')::date, interval '1 day') days(day)
    left join public.reports r on r.quota_period_start is not null and r.created_at >= days.day at time zone 'UTC'
      and r.created_at < (days.day + interval '1 day') at time zone 'UTC'
    group by days.day order by days.day
  ) d)
);
$$;
