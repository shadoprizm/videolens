-- Follow the existing protected administrator RPC pattern. Auth users stay inaccessible to service_role directly.
create or replace function private.administrator_conversion_dashboard(p_days integer default 7)
returns jsonb language sql stable security definer set search_path='' as $$
with cohort as (
  select u.id, u.email, u.created_at, u.email_confirmed_at is not null as verified,
    u.last_sign_in_at, exists(select 1 from public.analytics_exclusions x where x.user_id=u.id) as excluded
  from auth.users u
  where u.created_at >= now() - make_interval(days=>case when p_days in (7,14,30) then p_days else 7 end)
    and lower(coalesce(u.email,'')) <> 'ratelle.ja@gmail.com'
), member as (
  select c.*,
    (select count(*) from public.reports r where r.user_id=c.id and r.quota_period_start is not null) as attempts,
    (select count(*) from public.reports r where r.user_id=c.id and r.quota_period_start is not null and r.status='complete') as completed,
    (select count(*) from public.reports r where r.user_id=c.id and r.quota_period_start is not null and r.status='failed') as failed,
    (select min(r.completed_at) from public.reports r where r.user_id=c.id and r.quota_period_start is not null and r.status='complete') as first_report_at,
    exists(select 1 from public.activation_events a where a.user_id=c.id and a.event='account_connected') as connected,
    exists(select 1 from public.checkout_sessions s where s.user_id=c.id) or exists(select 1 from public.activation_events a where a.user_id=c.id and a.event='checkout_started') as checkout_created,
    exists(select 1 from public.payment_receipts p where p.user_id=c.id and p.status='paid' and p.amount_paid>0) as paid,
    greatest(c.last_sign_in_at, (select max(r.created_at) from public.reports r where r.user_id=c.id), (select max(j.created_at) from public.journey_events j where j.user_id=c.id), (select max(a.created_at) from public.activation_events a where a.user_id=c.id)) as last_observed_at,
    exists(select 1 from public.journey_events j where j.user_id=c.id and j.created_at>=c.created_at+interval '1 day' and j.created_at<c.created_at+interval '7 days')
      or exists(select 1 from public.reports r where r.user_id=c.id and r.quota_period_start is not null and r.created_at>=c.created_at+interval '1 day' and r.created_at<c.created_at+interval '7 days') as returned_week
  from cohort c
), included as (select * from member where not excluded)
select jsonb_build_object(
  'generatedAt',now(),'days',p_days,'measurementStartedAt',(select min(created_at) from public.journey_events),
  'summary', (select jsonb_build_object(
    'signups',count(*),'verified',count(*) filter(where verified),'connected',count(*) filter(where connected),
    'attempted',count(*) filter(where attempts>0),'completed',count(*) filter(where completed>0),'failedOnly',count(*) filter(where failed>0 and completed=0),
    'checkoutCreated',count(*) filter(where checkout_created),'paidMembers',count(*) filter(where paid),
    'verifiedWithoutAttempt',count(*) filter(where verified and attempts=0),
    'reportThenCheckout',count(*) filter(where exists(select 1 from public.checkout_sessions s where s.user_id=included.id and s.created_at>=included.first_report_at)),
    'retentionEligible',count(*) filter(where created_at<=now()-interval '7 days' and created_at>=(select min(created_at) from public.journey_events)),
    'returnedWeek',count(*) filter(where returned_week and created_at<=now()-interval '7 days' and created_at>=(select min(created_at) from public.journey_events)),
    'medianMinutesToReport',percentile_cont(0.5) within group(order by extract(epoch from(first_report_at-created_at))/60) filter(where first_report_at is not null)
  ) from included),
  'revenue',coalesce((select jsonb_agg(row_to_json(v)) from (select p.currency,sum(p.amount_paid) as amount_paid,count(*) as invoices from public.payment_receipts p join included c on c.id=p.user_id where p.status='paid' and p.amount_paid>0 group by p.currency) v),'[]'::jsonb),
  'events',coalesce((select jsonb_agg(row_to_json(v)) from (select j.event,count(distinct j.user_id) as members from public.journey_events j join included c on c.id=j.user_id group by j.event order by j.event) v),'[]'::jsonb),
  'sources',coalesce((select jsonb_agg(row_to_json(v)) from (select r.source_type,r.mode,r.status,count(*) as count from public.reports r join included c on c.id=r.user_id where r.quota_period_start is not null group by r.source_type,r.mode,r.status) v),'[]'::jsonb),
  'failures',coalesce((select jsonb_agg(row_to_json(v)) from (select r.id,r.user_id,c.email,r.source_type,r.mode,r.failure_stage,r.failure_code,r.created_at,exists(select 1 from public.reports retry where retry.user_id=r.user_id and retry.status='complete' and retry.created_at>r.created_at) as recovered from public.reports r join included c on c.id=r.user_id where r.quota_period_start is not null and r.status='failed' order by r.created_at desc limit 50) v),'[]'::jsonb),
  'members',coalesce((select jsonb_agg(row_to_json(v)) from (select * from member order by created_at desc limit 100) v),'[]'::jsonb)
);
$$;
revoke all on function private.administrator_conversion_dashboard(integer) from public,anon,authenticated;
grant execute on function private.administrator_conversion_dashboard(integer) to service_role;
create or replace function public.administrator_conversion_dashboard(p_days integer default 7)
returns jsonb language sql stable security invoker set search_path='' as $$
 select private.administrator_conversion_dashboard(p_days);
$$;
revoke all on function public.administrator_conversion_dashboard(integer) from public,anon,authenticated;
grant execute on function public.administrator_conversion_dashboard(integer) to service_role;
