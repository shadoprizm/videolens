-- Activation nudge: one helpful email to members whose account is at least
-- 48 hours old and who have never reserved a managed report. Unlike the
-- founding campaigns, it does not depend on the offer being open.

alter table public.marketing_email_sends drop constraint marketing_email_sends_campaign_check;
alter table public.marketing_email_sends add constraint marketing_email_sends_campaign_check
  check (campaign in ('founding_announcement', 'founding_welcome', 'founding_25_left', 'founding_last_week', 'first_report_nudge'));

-- Account page link to the hosted web app (no install, works on phones).
alter table public.journey_events drop constraint journey_events_event_check;
alter table public.journey_events add constraint journey_events_event_check
  check (event in ('account_opened','install_chrome_clicked','install_firefox_clicked','desktop_link_copied','web_app_clicked','pricing_viewed','checkout_clicked','checkout_returned','report_opened','report_exported','feedback_helpful','feedback_partial','feedback_unhelpful'));

-- Same eligibility rules as before (verified, not opted out, not paying, not
-- already sent this campaign), plus the nudge. A member who received any
-- marketing email in the last 3 days is skipped for the nudge, so it never
-- lands on top of a founding email. CREATE OR REPLACE resets attributes, so
-- SECURITY DEFINER (reads auth.users) is restated here.
create or replace function public.marketing_candidates(p_campaign text, p_cutoff timestamptz, p_limit integer)
returns table (user_id uuid, email text, unsubscribe_token uuid)
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if p_campaign not in ('founding_announcement', 'founding_welcome', 'founding_25_left', 'founding_last_week', 'first_report_nudge') then
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
      when 'first_report_nudge' then u.created_at <= now() - interval '48 hours'
        and not exists (select 1 from public.reports r where r.user_id = u.id and r.quota_period_start is not null)
        and not exists (select 1 from public.activation_events a where a.user_id = u.id and a.event in ('starter_started', 'pro_started'))
        and not exists (select 1 from public.marketing_email_sends m where m.user_id = u.id and m.sent_at > now() - interval '3 days')
      else u.created_at <= now() - interval '1 day'
    end
  order by u.created_at
  limit greatest(0, least(p_limit, 500));
end;
$$;
revoke all on function public.marketing_candidates(text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.marketing_candidates(text, timestamptz, integer) to service_role;
