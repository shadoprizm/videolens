-- Keep aggregate reads within the application's service-role privileges.
create or replace function public.activation_funnel() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('windowDays',30,'events',coalesce(jsonb_agg(row_to_json(s)), '[]'::jsonb)) from (
    select e.event,count(*) as occurrences,count(distinct e.user_id) as members
    from public.activation_events e join public.profiles p on p.user_id=e.user_id
    where e.created_at >= now()-interval '30 days'
      and lower(coalesce(p.email,'')) <> 'ratelle.ja@gmail.com'
    group by e.event order by e.event
  ) s;
$$;
revoke all on function public.activation_funnel() from public, anon, authenticated;
grant execute on function public.activation_funnel() to service_role;
