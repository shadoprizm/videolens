-- Aggregate only existing account lifecycle signals for the protected
-- administrator dashboard. This intentionally does not inspect reports,
-- local scans, URLs, prompts, credentials, or other scan content.
create function private.administrator_account_integrity_summary()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'verifiedMembers', count(*) filter (where u.email_confirmed_at is not null),
    'pendingVerificationMembers', count(*) filter (where u.email_confirmed_at is null),
    'connectedExtensionMembers', (
      select count(distinct p.user_id)
      from public.extension_pairings p
      join auth.users paired_user on paired_user.id = p.user_id
      where p.consumed_at is not null and paired_user.deleted_at is null
    )
  )
  from auth.users u
  where u.deleted_at is null;
$$;
revoke all on function private.administrator_account_integrity_summary() from public, anon, authenticated;
grant execute on function private.administrator_account_integrity_summary() to service_role;

create function public.administrator_account_integrity_summary()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.administrator_account_integrity_summary();
$$;
revoke all on function public.administrator_account_integrity_summary() from public, anon, authenticated;
grant execute on function public.administrator_account_integrity_summary() to service_role;

comment on function private.administrator_account_integrity_summary() is
  'Aggregate account confirmation and completed extension-pairing counts for administrators; never includes scan or report content.';;
