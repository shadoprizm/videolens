-- Synthetic users only; every change rolls back, including the successful scans.
begin;
do $$
declare
  u uuid := gen_random_uuid();
  other_u uuid := gen_random_uuid();
  g uuid;
  r record;
  first_r uuid;
  e jsonb;
  activated timestamptz;
  deadline timestamptz;
  snapshot jsonb;
begin
  insert into auth.users(id,email,email_confirmed_at) values
    (u,'complimentary-test@example.invalid',now()),(other_u,'complimentary-other@example.invalid',now());
  insert into public.subscriptions(user_id) values(u),(other_u);
  insert into public.complimentary_pro_grants(user_id,campaign,granted_at)
    values(u,'transactional-test',now()-interval '1 minute') returning id into g;
  e := public.get_managed_entitlement(u);
  if e->>'plan' <> 'free' or e->'complimentary'->>'state' <> 'pending'
    or (e->>'canUpgrade')::boolean or (e->>'managedReportsRemaining')::int <> 1 then
    raise exception 'pending offer must preserve the starter without starting Pro';
  end if;
  -- A library upload and an old completed scan cannot activate the offer.
  insert into public.reports(user_id,device_id,status,quota_period_start)
    values(u,'test-upload-device','complete',null);
  insert into public.reports(user_id,device_id,status,quota_period_start,created_at)
    values(u,'test-old-device','pending',date '2026-01-01',now()-interval '2 days') returning id into first_r;
  update public.reports set status='complete' where id=first_r;
  if (select activated_at from public.complimentary_pro_grants where id=g) is not null then
    raise exception 'historical scan or library upload activated offer';
  end if;
  select * into r from public.reserve_managed_report(u,'test-starter-device',false);
  update public.reports set status='failed' where id=r.report_id;
  if (public.get_managed_entitlement(u)->'complimentary'->>'state') <> 'pending' then
    raise exception 'failed scan activated offer';
  end if;
  select * into r from public.reserve_managed_report(u,'test-starter-device',false);
  first_r := r.report_id;
  update public.reports set status='complete',completed_at=now() where id=first_r;
  select activated_at,expires_at into activated,deadline from public.complimentary_pro_grants where id=g;
  if activated is null or deadline-activated <> interval '720 hours' then raise exception 'activation duration incorrect'; end if;
  e := public.get_managed_entitlement(u);
  if e->>'plan' <> 'pro' or e->'complimentary'->>'state' <> 'active'
    or (e->>'managedReportsRemaining')::int <> 20 or not (e->>'canUpgrade')::boolean
    or (e->>'hasBillingSubscription')::boolean then raise exception 'active offer entitlement incorrect'; end if;
  if public.get_managed_entitlement(other_u)->>'plan' <> 'free' then raise exception 'grant crossed accounts'; end if;
  update public.reports set status='complete' where id=first_r;
  for i in 1..20 loop
    select * into r from public.reserve_managed_report(u,'test-pro-device',false);
    if r.plan <> 'pro' or r.used <> i or r.report_limit <> 20 then raise exception 'grant allowance incorrect at %',i; end if;
    update public.reports set status='complete',completed_at=now() where id=r.report_id;
  end loop;
  if (select expires_at from public.complimentary_pro_grants where id=g) <> deadline then raise exception 'repeated completion extended offer'; end if;
  begin
    perform public.reserve_managed_report(u,'test-pro-device',false);
    raise exception 'grant allowed more than twenty reports';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'managed_report_quota_exhausted' then raise; end if;
  end;
  -- Failed reports release gift credits too.
  update public.reports set status='failed' where id=r.report_id;
  select * into r from public.reserve_managed_report(u,'test-pro-device',false);
  if r.used <> 20 then raise exception 'failed gift report did not release allowance'; end if;
  -- Gift usage stays in the same bucket even when activation is in a prior month.
  update public.complimentary_pro_grants set activated_at=now()-interval '20 days',expires_at=now()+interval '10 days' where id=g;
  if (public.get_managed_entitlement(u)->>'managedReportsRemaining')::int <> 0 then raise exception 'calendar change reset gift allowance'; end if;
  snapshot := public.administrator_dashboard('complimentary-test','complimentary',1,1,u);
  if (snapshot->>'memberCount')::int <> 1 then raise exception 'admin classification missing'; end if;
  -- Expiry is immediate, retains saved data, and cannot be reset by a late completion.
  update public.complimentary_pro_grants set activated_at=now()-interval '31 days',expires_at=now()-interval '1 day' where id=g;
  e := public.get_managed_entitlement(u);
  if e->>'plan' <> 'free' or e->'complimentary'->>'state' <> 'expired' then raise exception 'expiry not enforced'; end if;
  update public.reports set status='complete' where id=r.report_id;
  if public.get_managed_entitlement(u)->>'plan' <> 'free' then raise exception 'late completion restarted offer'; end if;
  if not exists(select 1 from public.reports where id=first_r and status='complete') then raise exception 'expiry deleted report'; end if;
  -- Stripe-paid and trial subscriptions take precedence and survive gift expiry.
  update public.subscriptions set plan='pro',status='trialing',stripe_subscription_id='sub_complimentary_sql_test',current_period_end=now()+interval '2 days' where user_id=u;
  e := public.get_managed_entitlement(u);
  if e->>'plan' <> 'pro' or not (e->>'hasBillingSubscription')::boolean or (e->>'canUpgrade')::boolean then raise exception 'paid trial was revoked'; end if;
  update public.subscriptions set status='active' where user_id=u;
  select * into r from public.reserve_managed_report(u,'test-paid-device',false);
  if r.plan <> 'pro' or r.used <> 1 then raise exception 'paid allowance consumed by gift reports'; end if;
  update public.subscriptions set status='canceled' where user_id=u;
  if public.get_managed_entitlement(u)->>'plan' <> 'free' then raise exception 'canceled paid subscription retained Pro'; end if;
  if has_table_privilege('authenticated','public.complimentary_pro_grants','insert')
    or has_table_privilege('anon','public.complimentary_pro_grants','select')
    or has_function_privilege('authenticated','public.get_managed_entitlement(uuid)','execute')
    or has_function_privilege('anon','public.activate_complimentary_pro()','execute') then
    raise exception 'privileged gift data/functions exposed';
  end if;
end;
$$;
rollback;
