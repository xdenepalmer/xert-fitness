-- Durable, private member notices for operator-cancelled classes.

alter table public.member_announcements
  add column if not exists audience text not null default 'all',
  add column if not exists source_kind text,
  add column if not exists source_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'member_announcements_audience_check'
      and conrelid = 'public.member_announcements'::regclass
  ) then
    alter table public.member_announcements
      add constraint member_announcements_audience_check
      check (audience in ('all', 'targeted'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'member_announcements_source_check'
      and conrelid = 'public.member_announcements'::regclass
  ) then
    alter table public.member_announcements
      add constraint member_announcements_source_check
      check (
        (source_kind is null and source_id is null)
        or (
          source_kind is not null
          and source_id is not null
          and source_kind = btrim(source_kind)
          and char_length(source_kind) between 1 and 60
        )
      );
  end if;
end;
$$;

create unique index if not exists member_announcements_source_key
  on public.member_announcements (source_kind, source_id)
  where source_kind is not null and source_id is not null;

create table if not exists public.member_announcement_targets (
  announcement_id uuid not null references public.member_announcements(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

create index if not exists member_announcement_targets_user_idx
  on public.member_announcement_targets (user_id, announcement_id);

alter table public.member_announcement_targets enable row level security;

drop policy if exists "announcement_targets_select_own_or_admin" on public.member_announcement_targets;
create policy "announcement_targets_select_own_or_admin"
  on public.member_announcement_targets for select
  to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

revoke all on table public.member_announcement_targets from public, anon, authenticated;
grant select on table public.member_announcement_targets to authenticated;

drop policy if exists "member_announcements_select_live_or_admin" on public.member_announcements;
create policy "member_announcements_select_live_or_admin"
  on public.member_announcements for select
  to authenticated
  using (
    public.is_admin()
    or (
      published_at is not null
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

drop function if exists public.my_member_announcements();
create function public.my_member_announcements()
returns table (
  id uuid,
  title text,
  body text,
  tone text,
  cta_label text,
  cta_url text,
  published_at timestamptz,
  expires_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;

  insert into public.member_announcement_receipts (announcement_id, user_id, read_at)
  select announcement.id, v_user_id, now()
  from public.member_announcements as announcement
  where announcement.published_at is not null
    and announcement.published_at <= now()
    and (announcement.expires_at is null or announcement.expires_at > now())
    and (
      announcement.audience = 'all'
      or (
        announcement.audience = 'targeted'
        and exists (
          select 1
          from public.member_announcement_targets target
          where target.announcement_id = announcement.id
            and target.user_id = v_user_id
        )
      )
    )
  on conflict (announcement_id, user_id) do update
    set read_at = least(member_announcement_receipts.read_at, excluded.read_at);

  return query
  select announcement.id, announcement.title, announcement.body, announcement.tone,
         announcement.cta_label, announcement.cta_url, announcement.published_at,
         announcement.expires_at, announcement.updated_at
  from public.member_announcements as announcement
  join public.member_announcement_receipts as receipt
    on receipt.announcement_id = announcement.id and receipt.user_id = v_user_id
  where announcement.published_at is not null
    and announcement.published_at <= now()
    and (announcement.expires_at is null or announcement.expires_at > now())
    and receipt.dismissed_at is null
    and (
      announcement.audience = 'all'
      or (
        announcement.audience = 'targeted'
        and exists (
          select 1
          from public.member_announcement_targets target
          where target.announcement_id = announcement.id
            and target.user_id = v_user_id
        )
      )
    )
  order by announcement.published_at desc, announcement.id desc;
end;
$$;

create or replace function public.dismiss_member_announcement(p_announcement_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (
    select 1
    from public.member_announcements as announcement
    where announcement.id = p_announcement_id
      and announcement.published_at is not null
      and announcement.published_at <= now()
      and (announcement.expires_at is null or announcement.expires_at > now())
      and (
        announcement.audience = 'all'
        or (
          announcement.audience = 'targeted'
          and exists (
            select 1
            from public.member_announcement_targets target
            where target.announcement_id = announcement.id
              and target.user_id = v_user_id
          )
        )
      )
  ) then
    raise exception 'ANNOUNCEMENT_NOT_FOUND';
  end if;

  insert into public.member_announcement_receipts (announcement_id, user_id, read_at, dismissed_at)
  values (p_announcement_id, v_user_id, now(), now())
  on conflict (announcement_id, user_id) do update
    set dismissed_at = coalesce(member_announcement_receipts.dismissed_at, excluded.dismissed_at);
end;
$$;

create or replace function public.create_class_cancellation_notice(p_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_title text;
  v_start_time timestamptz;
  v_announcement_id uuid;
  v_member_booking_count integer := 0;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;

  select title, start_time
    into v_title, v_start_time
    from public.class_sessions
    where id = p_session_id;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;

  select count(*)::integer
    into v_member_booking_count
    from public.session_bookings
    where class_session_id = p_session_id
      and status in ('requested', 'confirmed', 'waitlisted', 'attended', 'no_show');

  if v_member_booking_count = 0 then return null; end if;

  insert into public.member_announcements (
      title, body, tone, cta_label, cta_url, audience, source_kind, source_id,
      published_at, expires_at, created_by, last_changed_by
    ) values (
      'Class cancelled: ' || coalesce(nullif(btrim(v_title), ''), 'XERT class'),
      format(
        'Unfortunately, XERT has cancelled %s on %s. Reserved credits on open credit places are returned when the pack is still live; waitlist places never held a credit. Open XERT to choose another class, or contact us if you need help.',
        coalesce(nullif(btrim(v_title), ''), 'your class'),
        to_char(v_start_time at time zone 'Australia/Brisbane', 'FMDay FMDD FMMonth at FMHH12:MI am')
      ),
      'urgent',
      'Choose another class',
      '/booking',
      'targeted',
      'class_cancellation',
      p_session_id,
      now(),
      now() + interval '30 days',
      auth.uid(),
      auth.uid()
    )
    on conflict (source_kind, source_id)
      where source_kind is not null and source_id is not null
    do update set
      title = excluded.title,
      body = excluded.body,
      expires_at = greatest(public.member_announcements.expires_at, excluded.expires_at),
      updated_at = now(),
      last_changed_by = auth.uid()
  returning id into v_announcement_id;

  insert into public.member_announcement_targets (announcement_id, user_id)
    select v_announcement_id, booking.user_id
    from public.session_bookings booking
    where booking.class_session_id = p_session_id
      and booking.status in ('requested', 'confirmed', 'waitlisted', 'attended', 'no_show')
    group by booking.user_id
  on conflict (announcement_id, user_id) do nothing;

  return v_announcement_id;
end;
$$;

-- admin_cancel_class_session is owned by the credit-refund migrations
-- (class_cancellation_credit_refund_fix.sql, then
-- credit_batch_refund_reactivation.sql). Do not recreate it here: the body
-- that originally shipped in this file filtered on RETURNING status after the
-- cancel write and silently refunded nothing. Re-running this upgrade must
-- not reinstall that.

revoke execute on function public.my_member_announcements() from public, anon;
revoke execute on function public.dismiss_member_announcement(uuid) from public, anon;
revoke all on function public.create_class_cancellation_notice(uuid) from public, anon, authenticated;
grant execute on function public.my_member_announcements() to authenticated;
grant execute on function public.dismiss_member_announcement(uuid) to authenticated;

insert into public.xert_schema_capabilities (capability)
values ('class_cancellation_notifications')
on conflict (capability) do nothing;
