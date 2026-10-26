-- Synthetic users only; every change rolls back.
begin;
do $$
declare
  u uuid := gen_random_uuid();
  other_u uuid := gen_random_uuid();
  r record;
  e jsonb;
begin
  insert into auth.users(id,email,email_confirmed_at) values
    (u,'credit-pack-test@example.invalid',now()),(other_u,'credit-pack-other@example.invalid',now());
  insert into public.subscriptions(user_id) values(u),(other_u);
  e := public.get_managed_entitlement(u);
  if (e->>'managedReportsLimit')::int <> 3 or (e->>'purchasedReports')::int <> 0 or (e->>'foundingMember')::boolean then
    raise exception 'starter allowance before purchase incorrect';
  end if;
  for i in 1..3 loop
    select * into r from public.reserve_managed_report(u,'credit-pack-device',false);
    update public.reports set status='complete' where id=r.report_id;
  end loop;
  begin
    perform public.reserve_managed_report(u,'credit-pack-device',false);
    raise exception 'starter allowed a fourth report without credits';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'managed_report_quota_exhausted' then raise; end if;
  end;
  insert into public.report_credit_grants(user_id,stripe_session_id,credits,amount_total,currency)
    values(u,'cs_test_credit_pack_one',5,500,'usd');
  -- A replayed webhook cannot grant the same session twice.
  insert into public.report_credit_grants(user_id,stripe_session_id,credits)
    values(u,'cs_test_credit_pack_one',5) on conflict (stripe_session_id) do nothing;
  e := public.get_managed_entitlement(u);
  if (e->>'managedReportsLimit')::int <> 8 or (e->>'managedReportsRemaining')::int <> 5 or (e->>'purchasedReports')::int <> 5 then
    raise exception 'purchased credits not applied exactly once: %', e;
  end if;
  if (public.get_managed_entitlement(other_u)->>'managedReportsLimit')::int <> 3 then raise exception 'credits crossed accounts'; end if;
  select * into r from public.reserve_managed_report(u,'credit-pack-device',false);
  if r.plan <> 'free' or r.used <> 4 or r.report_limit <> 8 then raise exception 'credit reservation incorrect'; end if;
  -- Credits wait while Pro is active and return after cancellation.
  update public.subscriptions set plan='pro',status='active',founding_member=true where user_id=u;
  e := public.get_managed_entitlement(u);
  if e->>'plan' <> 'pro' or (e->>'managedReportsLimit')::int <> 20 or not (e->>'foundingMember')::boolean then raise exception 'Pro entitlement changed by credits'; end if;
  update public.subscriptions set status='canceled' where user_id=u;
  e := public.get_managed_entitlement(u);
  if (e->>'managedReportsRemaining')::int <> 4 then raise exception 'credits did not persist after Pro: %', e; end if;
  if has_table_privilege('authenticated','public.report_credit_grants','insert')
    or has_table_privilege('authenticated','public.report_credit_grants','select')
    or has_table_privilege('anon','public.report_credit_grants','select') then
    raise exception 'credit ledger exposed to browser roles';
  end if;
end;
$$;
rollback;
