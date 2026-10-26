-- Optional offer emails. Every account gets an unguessable unsubscribe token;
-- opting out is permanent until the member changes it, and it is checked
-- before every send.
create table public.marketing_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  unsubscribe_token uuid not null unique default gen_random_uuid(),
  opted_out_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.marketing_preferences enable row level security;
revoke all on public.marketing_preferences from public, anon, authenticated;
grant select, insert, update, delete on public.marketing_preferences to service_role;

-- One row per member per campaign, written only after the provider accepts the
-- message, so each campaign reaches a member at most once.
create table public.marketing_email_sends (
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign text not null check (campaign in ('founding_announcement', 'founding_welcome', 'founding_25_left', 'founding_last_week')),
  message_id text,
  sent_at timestamptz not null default now(),
  primary key (user_id, campaign)
);
alter table public.marketing_email_sends enable row level security;
revoke all on public.marketing_email_sends from public, anon, authenticated;
grant select, insert, update, delete on public.marketing_email_sends to service_role;

-- Members who are verified, not opted out, not already paying, and not yet
-- sent this campaign. The announcement goes to accounts created before the
-- cutoff; the welcome goes to later accounts once they are a day old.
create or replace function public.marketing_candidates(p_campaign text, p_cutoff timestamptz, p_limit integer)
returns table (user_id uuid, email text, unsubscribe_token uuid)
language plpgsql volatile security invoker set search_path = '' as $$
begin
  if p_campaign not in ('founding_announcement', 'founding_welcome', 'founding_25_left', 'founding_last_week') then
    raise exception using errcode = '22023', message = 'invalid_campaign';
  end if;
  insert into public.marketing_preferences(user_id)
  select u.id from auth.users u where u.deleted_at is null
  on conflict (user_id) do nothing;
  return query
  select u.id, u.email::text, p.unsubscribe_token
  from auth.users u
  join public.marketing_preferences p on p.user_id = u.id
  left join public.subscriptions s on s.user_id = u.id
  where u.deleted_at is null
    and u.email_confirmed_at is not null
    and u.email is not null
    and u.email not ilike '%@example.invalid'
    and p.opted_out_at is null
    and not (s.stripe_subscription_id is not null and s.status in ('active', 'trialing', 'past_due'))
    and not exists (select 1 from public.marketing_email_sends m where m.user_id = u.id and m.campaign = p_campaign)
    and case p_campaign
      when 'founding_announcement' then u.created_at < p_cutoff
      when 'founding_welcome' then u.created_at >= p_cutoff and u.created_at <= now() - interval '1 day'
      else u.created_at <= now() - interval '1 day'
    end
  order by u.created_at
  limit greatest(0, least(p_limit, 500));
end;
$$;
revoke all on function public.marketing_candidates(text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.marketing_candidates(text, timestamptz, integer) to service_role;
