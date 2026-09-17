-- Content-free operational milestones. No client writes, content, URLs or payment payloads.
create table public.activation_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  event text not null check (event in ('account_connected','starter_started','starter_completed','starter_failed','pro_started','pro_completed','pro_failed','checkout_started','subscription_active')),
  event_key text not null check (length(event_key) <= 80),
  created_at timestamptz not null default now(),
  primary key (user_id,event,event_key)
);
alter table public.activation_events enable row level security;
revoke all on table public.activation_events from public, anon, authenticated;
grant select, insert on table public.activation_events to service_role;
create index activation_events_created_at on public.activation_events(created_at);

-- Record report transitions transactionally, including failures from older clients/server recovery.
create function public.record_report_activation() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare v_prefix text; v_event text;
begin
  if new.quota_period_start is null then return new; end if;
  v_prefix := case when new.quota_period_start = date '1970-01-01' then 'starter_' else 'pro_' end;
  if TG_OP = 'INSERT' and new.status = 'pending' then v_event := v_prefix || 'started';
  elsif TG_OP = 'UPDATE' and old.status = 'pending' and new.status in ('complete','failed') then
    v_event := v_prefix || case when new.status = 'complete' then 'completed' else 'failed' end;
  else return new;
  end if;
  insert into public.activation_events(user_id,event,event_key) values(new.user_id,v_event,new.id::text) on conflict do nothing;
  return new;
end $$;
revoke all on function public.record_report_activation() from public, anon, authenticated;
grant execute on function public.record_report_activation() to service_role;
create trigger report_activation after insert or update of status on public.reports
for each row execute function public.record_report_activation();

-- Auth is enforced in /api/admin; only its service-role connection can call this aggregate.
create function public.activation_funnel() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('windowDays',30,'events',coalesce(jsonb_agg(row_to_json(s)), '[]'::jsonb)) from (
    select e.event,count(*) as occurrences,count(distinct e.user_id) as members
    from public.activation_events e join auth.users u on u.id=e.user_id
    where e.created_at >= now()-interval '30 days'
      and lower(coalesce(u.email,'')) <> 'ratelle.ja@gmail.com'
    group by e.event order by e.event
  ) s;
$$;
revoke all on function public.activation_funnel() from public, anon, authenticated;
grant execute on function public.activation_funnel() to service_role;
