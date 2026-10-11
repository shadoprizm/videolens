-- Fixtures affect no real member and every mutation rolls back.
begin;
do $$
declare
 u uuid:=gen_random_uuid();
 r uuid:=gen_random_uuid();
 before_snapshot jsonb:=public.administrator_conversion_dashboard(7);
 snapshot jsonb;
 baseline bigint;
begin
 baseline:=(before_snapshot->'summary'->>'signups')::bigint;
 insert into auth.users(id,email,created_at,email_confirmed_at) values(u,'conversion-regression@example.invalid',now()-interval '3 days',now()-interval '3 days');
 insert into public.reports(id,user_id,device_id,status,quota_period_start,source_type,mode,created_at,completed_at,failure_stage,failure_code)
 values(gen_random_uuid(),u,'regression-device','failed','1970-01-01','local_file','general',now()-interval '2 days',now()-interval '2 days','frames','source');
 insert into public.reports(id,user_id,device_id,status,quota_period_start,source_type,mode,created_at,completed_at)
 values(r,u,'regression-device','complete','1970-01-01','youtube','ux',now()-interval '1 day',now()-interval '1 day');
 insert into public.checkout_sessions(stripe_session_id,user_id,status,created_at) values('cs_regression',u,'open',now()-interval '2 days');
 insert into public.payment_receipts(stripe_invoice_id,user_id,stripe_subscription_id,status,amount_paid,currency,created_at)
 values('in_regression',u,'sub_regression','paid',0,'usd',now());
 snapshot:=public.administrator_conversion_dashboard(7);
 if (snapshot->'summary'->>'signups')::bigint<>baseline+1 then raise exception 'Cohort does not include signup'; end if;
 if (snapshot->'summary'->>'completed')::bigint<>(before_snapshot->'summary'->>'completed')::bigint+1 then raise exception 'Successful retry not counted'; end if;
 if (snapshot->'summary'->>'failedOnly')::bigint<>(before_snapshot->'summary'->>'failedOnly')::bigint then raise exception 'Recovered failure counted as failed-only'; end if;
 if snapshot->'summary'->>'reportThenCheckout'<>before_snapshot->'summary'->>'reportThenCheckout' then raise exception 'Checkout before report treated as report conversion'; end if;
 if snapshot->'summary'->>'paidMembers'<>before_snapshot->'summary'->>'paidMembers' then raise exception 'Zero-dollar invoice counted as payment'; end if;
 update public.payment_receipts set amount_paid=1200 where stripe_invoice_id='in_regression';
 snapshot:=public.administrator_conversion_dashboard(7);
 if (snapshot->'summary'->>'paidMembers')::bigint<>(before_snapshot->'summary'->>'paidMembers')::bigint+1 then raise exception 'Positive paid invoice not counted'; end if;
 insert into public.analytics_exclusions(user_id) values(u);
 snapshot:=public.administrator_conversion_dashboard(7);
 if (snapshot->'summary'->>'signups')::bigint<>baseline then raise exception 'Test exclusion ignored'; end if;
 if has_function_privilege('anon','public.administrator_conversion_dashboard(integer)','execute') or has_function_privilege('authenticated','public.administrator_conversion_dashboard(integer)','execute') then raise exception 'Cohort accessible without administrator'; end if;
 if has_table_privilege('authenticated','public.payment_receipts','select') or has_table_privilege('anon','public.journey_events','select') then raise exception 'Sensitive ledger readable by browsers'; end if;
end $$;
set local role service_role;
select public.administrator_conversion_dashboard(30)->'summary' is not null as service_role_can_read;
rollback;
