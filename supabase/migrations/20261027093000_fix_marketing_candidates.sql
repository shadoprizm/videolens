-- The output column user_id shadowed the table column in ON CONFLICT, so the
-- function raised "column reference is ambiguous" on every call. Resolve
-- names to columns; behaviour is otherwise unchanged.
create or replace function public.marketing_candidates(p_campaign text, p_cutoff timestamptz, p_limit integer)
returns table (user_id uuid, email text, unsubscribe_token uuid)
language plpgsql volatile security invoker set search_path = '' as $$
#variable_conflict use_column
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
