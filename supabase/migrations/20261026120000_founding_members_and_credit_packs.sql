-- Founding Member subscriptions are marked from Stripe subscription metadata so
-- the first 100 paying subscribers can be counted without trusting the browser.
alter table public.subscriptions add column founding_member boolean not null default false;
create index subscriptions_founding_member_idx on public.subscriptions(founding_member) where founding_member;

-- One-time report packs. Each verified, paid Checkout session grants credits
-- exactly once; credits never expire and extend the free managed allowance.
create table public.report_credit_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_session_id text not null unique,
  credits integer not null check (credits > 0 and credits <= 100),
  amount_total bigint,
  currency text,
  created_at timestamptz not null default now()
);
create index report_credit_grants_user_idx on public.report_credit_grants(user_id);
alter table public.report_credit_grants enable row level security;
revoke all on public.report_credit_grants from public, anon, authenticated;
grant select, insert, update, delete on public.report_credit_grants to service_role;

-- Free accounts receive three starter reports plus any purchased credits, all
-- counted in the same lifetime free bucket. Pro and complimentary behaviour is
-- unchanged; purchased credits wait in the free bucket while Pro is active.
create or replace function public.get_managed_entitlement(p_user_id uuid) returns jsonb
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
  v_purchased integer;
begin
  select * into s from public.subscriptions where user_id = p_user_id;
  if not found then raise exception 'subscription_not_found'; end if;
  select * into g from public.complimentary_pro_grants where user_id = p_user_id;
  select coalesce(sum(credits), 0)::integer into v_purchased
  from public.report_credit_grants where user_id = p_user_id;
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
    v_plan := 'free'; v_limit := 3 + v_purchased; v_period := date '1970-01-01';
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
    'purchasedReports', v_purchased,
    'foundingMember', s.founding_member,
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
