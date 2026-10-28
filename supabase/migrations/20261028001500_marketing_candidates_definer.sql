-- marketing_candidates reads auth.users, which service_role cannot select
-- through the API. Run it with its owner's rights; only service_role may
-- execute it, and search_path stays empty so every name is schema-qualified.
alter function public.marketing_candidates(text, timestamptz, integer) security definer;
revoke all on function public.marketing_candidates(text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.marketing_candidates(text, timestamptz, integer) to service_role;
