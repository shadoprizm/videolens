-- Free accounts now receive three managed starter reports in total instead of
-- one. Pro, complimentary and billing behaviour are unchanged; only the free
-- allowance constant moves. Reservations continue to read this function, so
-- the extension, the account page and the quota lock all see the same number.
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
    v_plan := 'free'; v_limit := 3; v_period := date '1970-01-01';
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
