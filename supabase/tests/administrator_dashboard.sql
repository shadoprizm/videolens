-- Run against a database with the migrations applied. Every test mutation rolls back.
begin;
do $$
declare
  v_admin uuid;
  v_other uuid := gen_random_uuid();
  v_snapshot jsonb;
  v_reservation record;
  v_managed_before integer;
begin
  select id into strict v_admin from auth.users
    where lower(trim(email)) = 'ratelle.ja@gmail.com' and email_confirmed_at is not null;
  update public.subscriptions set plan = 'free', status = 'canceled',
    cancel_at_period_end = true, current_period_end = now() where user_id = v_admin;
  if not exists(select 1 from public.subscriptions where user_id = v_admin
    and plan = 'pro' and status = 'active' and not cancel_at_period_end and current_period_end is null) then
    raise exception 'administrator downgrade protection failed';
  end if;
  -- An exhausted allowance still reports Pro; reserve only when allowance remains.
  if (select count(*) from public.reports where user_id = v_admin
    and quota_period_start = date_trunc('month', now() at time zone 'UTC')::date) < 20 then
    select * into v_reservation from public.reserve_managed_report(v_admin, 'admin-regression-check', false);
    if v_reservation.plan <> 'pro' or v_reservation.report_limit <> 20 then raise exception 'administrator quota failed'; end if;
  end if;
  insert into auth.users(id, email, email_confirmed_at)
    values(v_other, 'videolens-regression@example.invalid', now());
  insert into public.subscriptions(user_id) values(v_other);
  if not exists(select 1 from public.subscriptions where user_id = v_other and plan = 'free' and status = 'none') then
    raise exception 'ordinary user changed';
  end if;
  update public.subscriptions set plan = 'pro', status = 'active',
    stripe_subscription_id = 'test-admin-regression-sub' where user_id = v_other;
  v_snapshot := public.administrator_dashboard('videolens-regression', 'paid', 1, 1, null);
  if (v_snapshot->>'memberCount')::integer <> 1 then raise exception 'paid filter failed'; end if;
  update public.subscriptions set status = 'trialing' where user_id = v_other;
  v_snapshot := public.administrator_dashboard('videolens-regression', 'trial', 1, 1, null);
  if (v_snapshot->>'memberCount')::integer <> 1 then raise exception 'trial filter failed'; end if;
  update public.subscriptions set status = 'canceled' where user_id = v_other;
  v_snapshot := public.administrator_dashboard('videolens-regression', 'free', 1, 1, v_other);
  if (v_snapshot->>'memberCount')::integer <> 1 or (v_snapshot->>'activityCount')::integer <> 0 then
    raise exception 'free filter or member activity isolation failed';
  end if;
  v_managed_before := (v_snapshot->'scans'->>'total')::integer;
  insert into public.reports(user_id, device_id, title, status, quota_period_start, cloud_saved, report_data)
    values(v_other, 'library-upload', '<script>untrusted title</script>', 'complete', null, true, '{}');
  v_snapshot := public.administrator_dashboard('', 'all', 1, 1, v_other);
  if (v_snapshot->'scans'->>'total')::integer <> v_managed_before
    or (v_snapshot->>'activityCount')::integer <> 1
    or v_snapshot->'activity'->0->>'kind' <> 'Library upload' then
    raise exception 'library upload counted as managed AI usage';
  end if;
  if (v_snapshot->'activity'->0) ? 'report_data' then raise exception 'report contents exposed'; end if;
  v_snapshot := public.administrator_dashboard('videolens-regression', 'free', 2, 2, v_other);
  if jsonb_array_length(v_snapshot->'members') <> 0 or jsonb_array_length(v_snapshot->'activity') <> 0 then
    raise exception 'pagination failed';
  end if;
  if has_function_privilege('anon', 'public.administrator_dashboard(text,text,integer,integer,uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.administrator_dashboard(text,text,integer,integer,uuid)', 'execute')
    or has_schema_privilege('authenticated', 'private', 'usage') then
    raise exception 'administrator data exposed to browser roles';
  end if;
end;
$$;
set local role service_role;
select (public.administrator_dashboard()->'summary'->>'members')::integer >= 1 as service_role_can_read;
rollback;
