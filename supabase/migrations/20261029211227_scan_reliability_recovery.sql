-- A disconnected browser must not hold a member's allowance indefinitely.
-- Preserve history; expire only managed reservations idle for more than an hour.
alter table public.reports drop constraint reports_failure_code_check;
alter table public.reports add constraint reports_failure_code_check check
  (failure_code is null or failure_code in ('permission','source','network','authentication','rate_limit','analysis','interrupted'));

create or replace function public.release_stale_managed_reports(p_user_id uuid default null)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_count integer;
begin
  with stale as (
    select r.id from public.reports r
    where r.status = 'pending' and r.quota_period_start is not null
      and (p_user_id is null or r.user_id = p_user_id)
      and greatest(r.created_at, r.updated_at,
        coalesce((select max(a.created_at + coalesce(a.duration_ms, 0) * interval '1 millisecond')
          from public.ai_requests a where a.report_id = r.id), r.created_at)) < now() - interval '1 hour'
    for update of r skip locked
  )
  update public.reports r set status = 'failed', failure_code = 'interrupted',
    failure_stage = null, -- client stage is unknown; do not invent a root cause
    updated_at = now(), completed_at = now()
  from stale where r.id = stale.id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.release_stale_managed_reports(uuid) from public, anon, authenticated;
grant execute on function public.release_stale_managed_reports(uuid) to service_role;

create or replace function private.administrator_dashboard(
  p_query text, p_membership text, p_page integer, p_activity_page integer, p_user_id uuid
) returns jsonb language sql stable security definer set search_path = '' as $$
with members as (
  select u.id, u.email, u.created_at, u.last_sign_in_at, u.email_confirmed_at is not null as verified,
    coalesce(e.value->>'plan', 'free') as plan, coalesce(e.value->>'subscriptionStatus', 'none') as subscription_status,
    e.value->'complimentary' as complimentary,
    s.current_period_end, coalesce(s.cancel_at_period_end, false) as cancel_at_period_end,
    case
      when lower(trim(u.email)) = 'ratelle.ja@gmail.com' and u.email_confirmed_at is not null then 'complimentary'
      when s.plan = 'pro' and s.status = 'trialing' then 'trial'
      when s.plan = 'pro' and s.status = 'active' and s.stripe_subscription_id is not null then 'paid'
      when s.plan = 'pro' and s.status = 'active' then 'complimentary'
      when e.value->'complimentary'->>'state' = 'active' then 'complimentary'
      else 'free'
    end as membership,
    coalesce(r.scans, 0) as scans, coalesce(r.managed_scans, 0) as managed_scans, coalesce(r.library_uploads, 0) as library_uploads, coalesce(r.scans_this_month, 0) as scans_this_month, r.last_scan_at
  from auth.users u
  left join public.subscriptions s on s.user_id = u.id
  left join lateral (select public.get_managed_entitlement(u.id) as value where s.user_id is not null) e on true
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
    r.cloud_saved, r.created_at, r.completed_at, r.failure_stage, r.failure_code,
    case when r.quota_period_start is null then 'Library upload' else 'Managed scan' end as kind,
    (r.quota_period_start is not null and r.status = 'failed') as allowance_released,
    (select count(*) from public.ai_requests where report_id = r.id) as ai_request_count,
    (select count(*) from public.ai_requests where report_id = r.id and outcome = 'succeeded') as ai_succeeded,
    (select count(*) from public.ai_requests where report_id = r.id and outcome = 'failed') as ai_failed,
    coalesce((select jsonb_agg(x) from (select kind,effective_model as model,count(*) as requests from public.ai_requests where report_id=r.id and effective_model is not null group by kind,effective_model) x),'[]'::jsonb) as ai_models,
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
;
