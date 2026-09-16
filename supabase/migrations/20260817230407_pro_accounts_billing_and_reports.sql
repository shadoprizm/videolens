-- VideoLens Pro: accounts, Stripe entitlements, managed-report quotas, and
-- opt-in cloud report storage. Public-schema tables are protected by RLS;
-- writes are performed by trusted Vercel functions with the service role.

create extension if not exists pgcrypto;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  stripe_customer_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  status text not null default 'none' check (
    status in ('none', 'incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused')
  ),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_product_id text,
  stripe_price_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  title text not null default 'Untitled video',
  source_type text,
  mode text,
  status text not null default 'pending' check (status in ('pending', 'complete', 'failed')),
  quota_period_start date not null,
  cloud_saved boolean not null default false,
  report_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint cloud_report_requires_data check (not cloud_saved or report_data is not null)
);

create index reports_user_created_idx on public.reports (user_id, created_at desc);
create index reports_user_quota_idx on public.reports (user_id, quota_period_start);

create table public.ai_requests (
  id bigint generated always as identity primary key,
  report_id uuid not null references public.reports(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('chat', 'transcription')),
  created_at timestamptz not null default now()
);

create index ai_requests_report_kind_idx on public.ai_requests (report_id, kind);

create table public.extension_pairings (
  nonce_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create index extension_pairings_expiry_idx on public.extension_pairings (expires_at);

create table public.stripe_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.reports enable row level security;
alter table public.ai_requests enable row level security;
alter table public.extension_pairings enable row level security;
alter table public.stripe_events enable row level security;

create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can read their own subscription"
  on public.subscriptions for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can read their saved reports"
  on public.reports for select
  to authenticated
  using ((select auth.uid()) = user_id and cloud_saved = true);

create policy "Users can delete their saved reports"
  on public.reports for delete
  to authenticated
  using ((select auth.uid()) = user_id and cloud_saved = true);

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.subscriptions from anon, authenticated;
revoke all on table public.reports from anon, authenticated;
revoke all on table public.ai_requests from anon, authenticated;
revoke all on table public.extension_pairings from anon, authenticated;
revoke all on table public.stripe_events from anon, authenticated;

-- New Supabase projects no longer expose new public tables to the Data API
-- automatically. Grant the trusted server role explicitly; it still remains
-- server-only and bypasses RLS, while browser roles receive only the narrow
-- read/delete privileges below.
grant select, insert, update, delete on table public.profiles to service_role;
grant select, insert, update, delete on table public.subscriptions to service_role;
grant select, insert, update, delete on table public.reports to service_role;
grant select, insert, update, delete on table public.ai_requests to service_role;
grant select, insert, update, delete on table public.extension_pairings to service_role;
grant select, insert, update, delete on table public.stripe_events to service_role;
grant usage, select on sequence public.ai_requests_id_seq to service_role;

grant select on table public.profiles to authenticated;
grant select on table public.subscriptions to authenticated;
grant select, delete on table public.reports to authenticated;

-- Quota reservation is atomic. The free account allowance is one managed
-- starter report total; an active or trialing Pro subscription receives 20
-- reservations per UTC calendar month (including annual subscribers).
create or replace function public.reserve_managed_report(
  p_user_id uuid,
  p_device_id text,
  p_cloud_save boolean default false
)
returns table (report_id uuid, plan text, used integer, report_limit integer, period_start date)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subscription public.subscriptions%rowtype;
  v_plan text;
  v_limit integer;
  v_period date;
  v_used integer;
  v_report_id uuid;
begin
  if p_user_id is null or length(trim(coalesce(p_device_id, ''))) < 8 then
    raise exception using errcode = '22023', message = 'invalid_reservation';
  end if;

  insert into public.subscriptions (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select * into v_subscription
  from public.subscriptions
  where user_id = p_user_id
  for update;

  if v_subscription.plan = 'pro' and v_subscription.status in ('active', 'trialing') then
    v_plan := 'pro';
    v_limit := 20;
    v_period := date_trunc('month', now())::date;
  else
    v_plan := 'free';
    v_limit := 1;
    v_period := date '1970-01-01';
  end if;

  select count(*)::integer into v_used
  from public.reports
  where user_id = p_user_id and quota_period_start = v_period;

  if v_used >= v_limit then
    raise exception using errcode = 'P0001', message = 'managed_report_quota_exhausted';
  end if;

  insert into public.reports (user_id, device_id, quota_period_start, cloud_saved, report_data)
  values (p_user_id, trim(p_device_id), v_period, false, null)
  returning id into v_report_id;

  return query select v_report_id, v_plan, v_used + 1, v_limit, v_period;
end;
$$;

-- Managed AI calls are tied to a valid report reservation. The per-report
-- caps limit abuse while leaving room for 40 frame descriptions, synthesis,
-- and follow-up questions.
create or replace function public.record_managed_ai_request(
  p_user_id uuid,
  p_report_id uuid,
  p_kind text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.reports%rowtype;
  v_used integer;
  v_limit integer;
begin
  if p_kind not in ('chat', 'transcription') then
    raise exception using errcode = '22023', message = 'invalid_ai_request_kind';
  end if;

  select * into v_report
  from public.reports
  where id = p_report_id and user_id = p_user_id
  for update;

  if not found or v_report.status not in ('pending', 'complete') then
    raise exception using errcode = 'P0001', message = 'invalid_report_reservation';
  end if;

  v_limit := case when p_kind = 'chat' then 90 else 45 end;
  select count(*)::integer into v_used
  from public.ai_requests
  where report_id = p_report_id and kind = p_kind;

  if v_used >= v_limit then
    raise exception using errcode = 'P0001', message = 'managed_ai_request_limit_exhausted';
  end if;

  insert into public.ai_requests (report_id, user_id, kind)
  values (p_report_id, p_user_id, p_kind);
  return true;
end;
$$;

revoke all on function public.reserve_managed_report(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.record_managed_ai_request(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.reserve_managed_report(uuid, text, boolean) to service_role;
grant execute on function public.record_managed_ai_request(uuid, uuid, text) to service_role;

comment on table public.reports is 'Managed report reservations; final report JSON is stored only when the user explicitly enables cloud saving.';
comment on table public.extension_pairings is 'Short-lived, one-time browser-extension pairing challenges; no Supabase refresh token is sent to the extension.';
