-- Administrator access is anchored to the verified Auth email, never editable metadata.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create function private.enforce_administrator_pro()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from auth.users where id = new.user_id
    and lower(trim(email)) = 'ratelle.ja@gmail.com' and email_confirmed_at is not null) then
    new.plan := 'pro';
    new.status := 'active';
    new.cancel_at_period_end := false;
    new.current_period_end := null;
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_administrator_pro() from public, anon, authenticated;
create trigger enforce_administrator_pro before insert or update on public.subscriptions
for each row execute function private.enforce_administrator_pro();

insert into public.subscriptions(user_id, plan, status)
select id, 'pro', 'active' from auth.users
where lower(trim(email)) = 'ratelle.ja@gmail.com' and email_confirmed_at is not null
on conflict(user_id) do update set plan = 'pro', status = 'active', updated_at = now();

-- Only the trusted server may read the cross-account snapshot. The definer
-- lives outside the exposed schema because last login belongs to auth.users.
create function private.administrator_dashboard(
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
    case when r.quota_period_start is null then 'Library upload' else 'Managed scan' end as kind
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
revoke all on function private.administrator_dashboard(text, text, integer, integer, uuid) from public, anon, authenticated;
grant execute on function private.administrator_dashboard(text, text, integer, integer, uuid) to service_role;

create function public.administrator_dashboard(
  p_query text default '', p_membership text default 'all', p_page integer default 1,
  p_activity_page integer default 1, p_user_id uuid default null
) returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.administrator_dashboard(p_query, p_membership, p_page, p_activity_page, p_user_id);
$$;
revoke all on function public.administrator_dashboard(text, text, integer, integer, uuid) from public, anon, authenticated;
grant execute on function public.administrator_dashboard(text, text, integer, integer, uuid) to service_role;
