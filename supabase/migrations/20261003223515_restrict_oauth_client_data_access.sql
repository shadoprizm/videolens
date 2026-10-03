-- OAuth scopes describe OIDC profile claims, not PostgREST table permissions.
-- Keep existing first-party browser sessions working while OAuth clients use
-- only the deliberately narrow VideoLens MCP tools for saved report access.
alter policy "Users can read their own profile"
  on public.profiles
  using ((select auth.uid()) = user_id and (auth.jwt() ->> 'client_id') is null);

alter policy "Users can read their own subscription"
  on public.subscriptions
  using ((select auth.uid()) = user_id and (auth.jwt() ->> 'client_id') is null);

alter policy "Users can read their saved reports"
  on public.reports
  using ((select auth.uid()) = user_id and cloud_saved = true
    and (auth.jwt() ->> 'client_id') is null);

alter policy "Users can delete their saved reports"
  on public.reports
  using ((select auth.uid()) = user_id and cloud_saved = true
    and (auth.jwt() ->> 'client_id') is null);

-- All OAuth clients for this Supabase project are integrations of the
-- VideoLens MCP API. Preserve first-party JWTs unchanged; bind OAuth tokens
-- to the MCP resource so it can reject regular browser session tokens.
create or replace function public.videolens_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  if event -> 'claims' ->> 'client_id' is not null then
    event := jsonb_set(event, '{claims,aud}',
      to_jsonb('https://videolens.io/api/mcp'::text));
  end if;
  return event;
end;
$$;

revoke all on function public.videolens_access_token_hook(jsonb) from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.videolens_access_token_hook(jsonb) to supabase_auth_admin;
