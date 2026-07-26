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

create or replace function public.my_member_announcements()
returns table (
  id uuid, title text, body text, tone text, cta_label text, cta_url text,
  published_at timestamptz, expires_at timestamptz, updated_at timestamptz
)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  insert into public.member_announcement_receipts (announcement_id, user_id, read_at)
  select announcement.id, v_user_id, now()
  from public.member_announcements announcement
  where announcement.archived_at is null
    and announcement.published_at is not null and announcement.published_at <= now()
    and (announcement.expires_at is null or announcement.expires_at > now())
    and (announcement.audience = 'all' or (
      announcement.audience = 'targeted' and exists (
        select 1 from public.member_announcement_targets target
        where target.announcement_id = announcement.id and target.user_id = v_user_id
      )
    ))
  on conflict (announcement_id, user_id) do update
    set read_at = least(member_announcement_receipts.read_at, excluded.read_at);
  return query
  select announcement.id, announcement.title, announcement.body, announcement.tone,
         announcement.cta_label, announcement.cta_url, announcement.published_at,
         announcement.expires_at, announcement.updated_at
  from public.member_announcements announcement
  join public.member_announcement_receipts receipt
    on receipt.announcement_id = announcement.id and receipt.user_id = v_user_id
  where announcement.archived_at is null
    and announcement.published_at is not null and announcement.published_at <= now()
    and (announcement.expires_at is null or announcement.expires_at > now())
    and receipt.dismissed_at is null
    and (announcement.audience = 'all' or (
      announcement.audience = 'targeted' and exists (
        select 1 from public.member_announcement_targets target
        where target.announcement_id = announcement.id and target.user_id = v_user_id
      )
    ))
  order by announcement.published_at desc, announcement.id desc;
end;
$$;

create or replace function public.dismiss_member_announcement(p_announcement_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (
    select 1 from public.member_announcements announcement
    where announcement.id = p_announcement_id
      and announcement.archived_at is null
      and announcement.published_at is not null and announcement.published_at <= now()
      and (announcement.expires_at is null or announcement.expires_at > now())
      and (announcement.audience = 'all' or (
        announcement.audience = 'targeted' and exists (
          select 1 from public.member_announcement_targets target
          where target.announcement_id = announcement.id and target.user_id = v_user_id
        )
      ))
  ) then raise exception 'ANNOUNCEMENT_NOT_FOUND'; end if;
  insert into public.member_announcement_receipts (announcement_id, user_id, read_at, dismissed_at)
  values (p_announcement_id, v_user_id, now(), now())
  on conflict (announcement_id, user_id) do update
    set dismissed_at = coalesce(member_announcement_receipts.dismissed_at, excluded.dismissed_at);
end;
$$;

revoke execute on function public.my_member_announcements() from public, anon;
revoke execute on function public.dismiss_member_announcement(uuid) from public, anon;
grant execute on function public.my_member_announcements() to authenticated;
grant execute on function public.dismiss_member_announcement(uuid) to authenticated;
