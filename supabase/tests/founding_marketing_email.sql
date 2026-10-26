-- Synthetic users only; every change rolls back.
begin;
do $$
declare
  cutoff timestamptz := now() - interval '2 days';
  early uuid := gen_random_uuid();
  later uuid := gen_random_uuid();
  fresh uuid := gen_random_uuid();
  paying uuid := gen_random_uuid();
  unverified uuid := gen_random_uuid();
  n integer;
begin
  insert into auth.users(id,email,email_confirmed_at,created_at) values
    (early,'mkt-early@videolens-test.dev',now(),now()-interval '10 days'),
    (later,'mkt-later@videolens-test.dev',now(),now()-interval '1 day 1 hour'),
    (fresh,'mkt-fresh@videolens-test.dev',now(),now()-interval '1 hour'),
    (paying,'mkt-paying@videolens-test.dev',now(),now()-interval '10 days'),
    (unverified,'mkt-unverified@videolens-test.dev',null,now()-interval '10 days');
  insert into public.subscriptions(user_id,plan,status,stripe_subscription_id) values(paying,'pro','active','sub_mkt_test');
  select count(*) into n from public.marketing_candidates('founding_announcement',cutoff,500) c where c.email like 'mkt-%@videolens-test.dev';
  if n <> 1 then raise exception 'announcement should reach only the early verified non-paying member, got %', n; end if;
  select count(*) into n from public.marketing_candidates('founding_welcome',cutoff,500) c where c.email like 'mkt-%@videolens-test.dev';
  if n <> 1 then raise exception 'welcome should reach only the day-old new member, got %', n; end if;
  insert into public.marketing_email_sends(user_id,campaign,message_id) values(early,'founding_announcement','msg_test');
  select count(*) into n from public.marketing_candidates('founding_announcement',cutoff,500) c where c.email like 'mkt-%@videolens-test.dev';
  if n <> 0 then raise exception 'announcement repeated'; end if;
  update public.marketing_preferences set opted_out_at=now() where user_id=later;
  select count(*) into n from public.marketing_candidates('founding_25_left',cutoff,500) c where c.email like 'mkt-%@videolens-test.dev';
  if n <> 1 then raise exception 'reminder should skip opted-out, paying, unverified and fresh members, got %', n; end if;
  if (select count(*) from public.marketing_preferences where user_id in (early,later,fresh,paying,unverified)) <> 5 then raise exception 'unsubscribe tokens not provisioned'; end if;
  if has_table_privilege('authenticated','public.marketing_preferences','select')
    or has_table_privilege('anon','public.marketing_email_sends','select')
    or has_function_privilege('authenticated','public.marketing_candidates(text,timestamptz,integer)','execute') then
    raise exception 'marketing data exposed to browser roles';
  end if;
end;
$$;
rollback;
