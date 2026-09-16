-- Goodwill access is independent of Stripe. A pending offer is activated only
-- by a newly reserved managed scan completing successfully after the grant.
create table public.complimentary_pro_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  campaign text not null,
  granted_at timestamptz not null default now(),
  activated_at timestamptz,
  expires_at timestamptz,
  activation_report_id uuid,
  apology_sent_at timestamptz,
  apology_message_id text,
  reminder_sent_at timestamptz,
  reminder_message_id text,
  constraint complimentary_dates check (
    (activated_at is null and expires_at is null and activation_report_id is null)
    or (activated_at is not null and expires_at is not null and expires_at = activated_at + interval '720 hours'
      and activation_report_id is not null)
  )
);
alter table public.complimentary_pro_grants enable row level security;
revoke all on public.complimentary_pro_grants from public, anon, authenticated;
grant select, insert, update, delete on public.complimentary_pro_grants to service_role;

alter table public.reports add column complimentary_grant_id uuid
  references public.complimentary_pro_grants(id) on delete set null;
create index reports_complimentary_grant_idx on public.reports(complimentary_grant_id)
  where complimentary_grant_id is not null;

create function public.activate_complimentary_pro() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if old.status = 'pending' and new.status = 'complete' and new.quota_period_start is not null then
    -- The same per-account lock also serializes quota reservations.
    perform 1 from public.subscriptions where user_id = new.user_id for update;
    update public.complimentary_pro_grants
    set activated_at = now(),
        expires_at = now() + interval '720 hours',
        activation_report_id = new.id
    where user_id = new.user_id and activated_at is null and new.created_at >= granted_at;
  end if;
  return new;
end;
$$;
revoke all on function public.activate_complimentary_pro() from public, anon, authenticated;
grant execute on function public.activate_complimentary_pro() to service_role;
create trigger activate_complimentary_pro_after_scan
after update of status on public.reports
for each row execute function public.activate_complimentary_pro();

-- One source of truth for both browsers, account display, and atomic reservations.
-- Expiry is evaluated on every request; it never depends on a scheduled downgrade.
create function public.get_managed_entitlement(p_user_id uuid) returns jsonb
language plpgsql volatile security invoker set search_path = '' as $$
declare
  s public.subscriptions%rowtype;
  g public.complimentary_pro_grants%rowtype;
  v_subscription_pro boolean;
  v_billing boolean;
  v_gift_active boolean;
  v_plan text;
  v_limit integer;
  v_period date;
  v_period_end timestamptz;
  v_grant uuid;
  v_used integer;
begin
  select * into s from public.subscriptions where user_id = p_user_id;
  if not found then raise exception 'subscription_not_found'; end if;
  select * into g from public.complimentary_pro_grants where user_id = p_user_id;
  v_subscription_pro := s.plan = 'pro' and s.status in ('active','trialing');
  v_billing := s.stripe_subscription_id is not null
    and s.status not in ('none','canceled','incomplete_expired');
  v_gift_active := coalesce(g.activated_at <= now() and g.expires_at > now(), false);
  if v_subscription_pro then
    v_plan := 'pro'; v_limit := 20;
    v_period := date_trunc('month', now() at time zone 'UTC')::date;
    v_period_end := (v_period + interval '1 month') at time zone 'UTC';
  elsif v_gift_active then
    v_plan := 'pro'; v_limit := 20;
    v_period := (g.activated_at at time zone 'UTC')::date;
    v_period_end := g.expires_at;
    v_grant := g.id;
  else
    v_plan := 'free'; v_limit := 1; v_period := date '1970-01-01';
  end if;
  select count(*)::integer into v_used from public.reports
  where user_id = p_user_id and status in ('pending','complete')
    and ((v_grant is not null and complimentary_grant_id = v_grant)
      or (v_grant is null and complimentary_grant_id is null and quota_period_start = v_period));
  return jsonb_build_object(
    'plan', v_plan,
    'subscriptionStatus', case when v_grant is not null then 'complimentary' else s.status end,
    'managedReportsUsed', v_used, 'managedReportsLimit', v_limit,
    'managedReportsRemaining', greatest(0,v_limit-v_used),
    'periodEndsAt', v_period_end,
    'cancelAtPeriodEnd', v_subscription_pro and s.cancel_at_period_end,
    'canUseManagedAi', v_used < v_limit,
    'hasBillingSubscription', v_billing,
    'canUpgrade', not v_subscription_pro and not v_billing and (g.id is null or g.activated_at is not null),
    'billingStartsAt', case when v_billing and s.status = 'trialing' then s.current_period_end else null end,
    'complimentary', case when g.id is null then null else jsonb_build_object(
      'state', case when g.activated_at is null then 'pending' when v_gift_active then 'active' else 'expired' end,
      'activatedAt', g.activated_at, 'expiresAt', g.expires_at) end,
    'quotaPeriodStart', v_period, 'quotaGrantId', v_grant
  );
end;
$$;
revoke all on function public.get_managed_entitlement(uuid) from public, anon, authenticated;
grant execute on function public.get_managed_entitlement(uuid) to service_role;

create or replace function public.reserve_managed_report(
  p_user_id uuid, p_device_id text, p_cloud_save boolean default false
)
returns table (report_id uuid, plan text, used integer, report_limit integer, period_start date)
language plpgsql security invoker set search_path = '' as $$
declare
  e jsonb;
  v_report_id uuid;
begin
  if p_user_id is null or length(trim(coalesce(p_device_id,''))) < 8 then
    raise exception using errcode = '22023', message = 'invalid_reservation';
  end if;
  insert into public.subscriptions(user_id) values(p_user_id) on conflict(user_id) do nothing;
  perform 1 from public.subscriptions where user_id = p_user_id for update;
  e := public.get_managed_entitlement(p_user_id);
  if not (e->>'canUseManagedAi')::boolean then
    raise exception using errcode = 'P0001', message = 'managed_report_quota_exhausted';
  end if;
  if (select count(*) from public.reports where user_id = p_user_id
      and quota_period_start is not null and status = 'failed'
      and created_at >= now() - interval '1 hour') >= 3 then
    raise exception using errcode = 'P0001', message = 'managed_report_retry_limited';
  end if;
  insert into public.reports(user_id,device_id,quota_period_start,complimentary_grant_id,cloud_saved,report_data)
  values(p_user_id,trim(p_device_id),(e->>'quotaPeriodStart')::date,(e->>'quotaGrantId')::uuid,false,null)
  returning id into v_report_id;
  return query select v_report_id,e->>'plan',(e->>'managedReportsUsed')::integer+1,
    (e->>'managedReportsLimit')::integer,(e->>'quotaPeriodStart')::date;
end;
$$;

-- Include pending/active/expired offers in the existing protected dashboard.
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
