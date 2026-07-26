-- Restore protections that older reusable setup files could overwrite.
--
-- The booking and announcement archival setup files are documented as safe to
-- re-run. Before this repair, they could replace the targeted-notice visibility
-- policy with an older version and could replace the profile-write guard without
-- its email protection. A member could then read another member's targeted
-- notice or change the email that staff use to identify their account.
--
-- This migration restores the hardened policy and trigger for deployed
-- databases. Its mirror in src/supabase is the operator SQL-editor path.

create or replace function public.guard_profile_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    if tg_op = 'INSERT' then
      if coalesce(new.role, 'member') <> 'member' then
        raise exception 'PROFILE_ROLE_MANAGED_BY_ADMIN';
      end if;
    elsif tg_op = 'UPDATE' then
      if new.id is distinct from old.id then
        raise exception 'PROFILE_ID_IMMUTABLE';
      end if;
      if new.role is distinct from old.role then
        raise exception 'PROFILE_ROLE_MANAGED_BY_ADMIN';
      end if;
      if new.email is distinct from old.email then
        raise exception 'PROFILE_EMAIL_MANAGED_BY_AUTH';
      end if;
      if new.created_at is distinct from old.created_at then
        raise exception 'PROFILE_CREATED_AT_IMMUTABLE';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop policy if exists "member_announcements_select_live_or_admin" on public.member_announcements;
create policy "member_announcements_select_live_or_admin"
  on public.member_announcements for select
  to authenticated
  using (
    public.is_admin()
    or (
      archived_at is null
      and published_at is not null
      and published_at <= now()
      and (expires_at is null or expires_at > now())
      and (
        audience = 'all'
        or (
          audience = 'targeted'
          and exists (
            select 1
            from public.member_announcement_targets target
            where target.announcement_id = member_announcements.id
              and target.user_id = (select auth.uid())
          )
        )
      )
    )
  );

revoke execute on function public.guard_profile_write() from public, anon, authenticated;
