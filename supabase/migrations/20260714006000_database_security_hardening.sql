-- Remove unnecessary externally callable surfaces while preserving the
-- intentional public image URLs and member/admin RPC contracts.

drop policy if exists "site_images_public_read" on storage.objects;

revoke execute on function public.guard_profile_write() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;

  if to_regprocedure('public.admin_grant_credits_v2(uuid,integer,integer,uuid,text)') is null then
    raise exception 'AUDITED_CREDIT_GRANT_NOT_INSTALLED';
  end if;
  if to_regprocedure('public.admin_grant_credits(uuid,integer,integer)') is not null then
    execute 'revoke execute on function public.admin_grant_credits(uuid, integer, integer) from public, anon, authenticated';
  end if;
end;
$$;

insert into public.xert_schema_capabilities (capability)
values ('database_security_hardening')
on conflict (capability) do nothing;
