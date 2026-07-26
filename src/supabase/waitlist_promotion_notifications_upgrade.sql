-- Idempotent waitlist promotion with an atomic, private member notice.
-- Apply after waitlist_fifo_promotion_upgrade.sql, targeted_member_notices_upgrade.sql,
-- and member_push_notifications_upgrade.sql.

create table if not exists public.waitlist_promotion_receipts (
  request_id uuid primary key,
  session_id uuid not null references public.class_sessions(id) on delete restrict,
  booking_id uuid not null unique references public.session_bookings(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  announcement_id uuid not null unique references public.member_announcements(id) on delete restrict,
  promoted_by uuid not null references auth.users(id) on delete restrict,
  promoted_at timestamptz not null default now()
);

create index if not exists waitlist_promotion_receipts_session_idx
  on public.waitlist_promotion_receipts(session_id, promoted_at desc);

alter table public.waitlist_promotion_receipts enable row level security;
revoke all on table public.waitlist_promotion_receipts from public, anon, authenticated;
drop policy if exists "waitlist_promotion_receipts_admin_read" on public.waitlist_promotion_receipts;
create policy "waitlist_promotion_receipts_admin_read"
  on public.waitlist_promotion_receipts for select to authenticated
  using (public.is_admin());
grant select on table public.waitlist_promotion_receipts to authenticated;

create or replace function public.admin_promote_next_waitlisted_with_notice(
  p_session_id uuid,
  p_expected_booking_id uuid,
  p_request_id uuid
)
returns table (
  request_id uuid,
  session_id uuid,
  booking_id uuid,
  user_id uuid,
  announcement_id uuid,
  promoted_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking_id uuid;
  v_user_id uuid;
  v_title text;
  v_start timestamptz;
  v_location text;
  v_announcement_id uuid := gen_random_uuid();
  v_receipt public.waitlist_promotion_receipts%rowtype;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_session_id is null or p_expected_booking_id is null or p_request_id is null then
    raise exception 'WAITLIST_PROMOTION_REQUEST_INVALID';
  end if;

  select receipt.*
    into v_receipt
    from public.waitlist_promotion_receipts receipt
   where receipt.request_id = p_request_id;
  if found then
    if v_receipt.session_id is distinct from p_session_id
       or v_receipt.booking_id is distinct from p_expected_booking_id then
      raise exception 'WAITLIST_PROMOTION_REQUEST_CONFLICT';
    end if;
    return query select v_receipt.request_id, v_receipt.session_id, v_receipt.booking_id,
                        v_receipt.user_id, v_receipt.announcement_id, v_receipt.promoted_at;
    return;
  end if;

  select receipt.*
    into v_receipt
    from public.waitlist_promotion_receipts receipt
   where receipt.booking_id = p_expected_booking_id;
  if found then
    if v_receipt.session_id is distinct from p_session_id then
      raise exception 'WAITLIST_PROMOTION_REQUEST_CONFLICT';
    end if;
    return query select v_receipt.request_id, v_receipt.session_id, v_receipt.booking_id,
                        v_receipt.user_id, v_receipt.announcement_id, v_receipt.promoted_at;
    return;
  end if;

  select session.title, session.start_time, session.location_zone
    into v_title, v_start, v_location
    from public.class_sessions session
   where session.id = p_session_id
   for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;

  select booking.id, booking.user_id
    into v_booking_id, v_user_id
    from public.session_bookings booking
   where booking.class_session_id = p_session_id
     and booking.status = 'waitlisted'
   order by booking.created_at, booking.id
   limit 1
   for update;
  if v_booking_id is null then raise exception 'WAITLIST_EMPTY'; end if;
  if v_booking_id is distinct from p_expected_booking_id then
    raise exception 'WAITLIST_CHANGED';
  end if;

  begin
    perform public.admin_set_booking_status(v_booking_id, 'confirmed');
  exception when others then
    if sqlerrm like '%NO_CREDITS%' then raise exception 'WAITLIST_MEMBER_NO_CREDITS'; end if;
    raise;
  end;

  insert into public.member_announcements (
    id, title, body, tone, cta_label, cta_url, audience, source_kind, source_id,
    published_at, expires_at, created_by, last_changed_by
  ) values (
    v_announcement_id,
    'Your class place is confirmed',
    format(
      'A place opened in %s on %s%s. One class credit has been reserved for you.',
      v_title,
      to_char(v_start at time zone 'Australia/Brisbane', 'FMDay, FMDD FMMonth at FMHH12:MIam'),
      case when nullif(btrim(coalesce(v_location, '')), '') is null
        then '' else format(' at %s', btrim(v_location)) end
    ),
    'action', 'View booking', '/account', 'targeted', 'waitlist_promotion', v_booking_id,
    now(), v_start + interval '1 day', auth.uid(), auth.uid()
  );

  insert into public.member_announcement_targets (announcement_id, user_id)
  values (v_announcement_id, v_user_id);

  insert into public.waitlist_promotion_receipts (
    request_id, session_id, booking_id, user_id, announcement_id, promoted_by
  ) values (
    p_request_id, p_session_id, v_booking_id, v_user_id, v_announcement_id, auth.uid()
  );

  return query
  select receipt.request_id, receipt.session_id, receipt.booking_id, receipt.user_id,
         receipt.announcement_id, receipt.promoted_at
    from public.waitlist_promotion_receipts receipt
   where receipt.request_id = p_request_id;
end;
$$;

revoke execute on function public.admin_promote_next_waitlisted_with_notice(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.admin_promote_next_waitlisted_with_notice(uuid, uuid, uuid)
  to authenticated;
-- Keep the previous RPC available while already-installed native clients adopt this release.
grant execute on function public.admin_promote_next_waitlisted(uuid) to authenticated;

insert into public.xert_schema_capabilities (capability)
values ('waitlist_promotion_notifications')
on conflict (capability) do nothing;
