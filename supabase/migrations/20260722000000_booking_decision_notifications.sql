-- Make staff booking decisions atomic, retry-safe, and visible to the affected
-- member. Apply after targeted_member_notices_upgrade.sql and
-- waitlist_promotion_notifications_upgrade.sql.

-- Promotion receipts are operational records, not a reason to prevent either a
-- member or administrator from exercising account deletion. Member-owned rows
-- disappear with the member; administrator identity is safely redacted.
alter table public.waitlist_promotion_receipts
  alter column promoted_by drop not null;
alter table public.waitlist_promotion_receipts
  drop constraint if exists waitlist_promotion_receipts_booking_id_fkey;
alter table public.waitlist_promotion_receipts
  drop constraint if exists waitlist_promotion_receipts_user_id_fkey;
alter table public.waitlist_promotion_receipts
  drop constraint if exists waitlist_promotion_receipts_promoted_by_fkey;
alter table public.waitlist_promotion_receipts
  add constraint waitlist_promotion_receipts_booking_id_fkey
    foreign key (booking_id) references public.session_bookings(id) on delete cascade;
alter table public.waitlist_promotion_receipts
  add constraint waitlist_promotion_receipts_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.waitlist_promotion_receipts
  add constraint waitlist_promotion_receipts_promoted_by_fkey
    foreign key (promoted_by) references auth.users(id) on delete set null;

create table if not exists public.booking_decision_receipts (
  request_id uuid primary key,
  booking_id uuid not null references public.session_bookings(id) on delete cascade,
  session_id uuid not null references public.class_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  previous_status text not null,
  new_status text not null,
  announcement_id uuid references public.member_announcements(id) on delete set null,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz not null default now(),
  constraint booking_decision_receipts_status_check check (
    previous_status in ('requested', 'confirmed', 'waitlisted', 'cancelled', 'declined', 'attended', 'no_show')
    and new_status in ('requested', 'confirmed', 'waitlisted', 'cancelled', 'declined', 'attended', 'no_show')
  )
);

create index if not exists booking_decision_receipts_booking_idx
  on public.booking_decision_receipts(booking_id, decided_at desc);

alter table public.booking_decision_receipts enable row level security;
revoke all on table public.booking_decision_receipts from public, anon, authenticated;
drop policy if exists "booking_decision_receipts_admin_read" on public.booking_decision_receipts;
create policy "booking_decision_receipts_admin_read"
  on public.booking_decision_receipts for select to authenticated
  using ((select public.is_admin()));
grant select on table public.booking_decision_receipts to authenticated;

-- Re-run safe: waitlist_skip_notice_accuracy installs a newer notice body for
-- waitlisted→cancelled (no false credit-return claim). Keep that shape.
do $install_admin_set_booking_status_with_notice$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'admin_set_booking_status_with_notice'
    and pg_get_function_identity_arguments(p.oid) = 'p_booking_id uuid, p_status text, p_request_id uuid';
  if v_def is not null
     and (v_def ilike '%pack is still live%' or v_def ilike '%Waitlist place removed%') then
    raise notice 'keeping newer admin_set_booking_status_with_notice';
  else
    execute $fn$
create or replace function public.admin_set_booking_status_with_notice(
  p_booking_id uuid,
  p_status text,
  p_request_id uuid
)
returns table (
  request_id uuid,
  booking_id uuid,
  session_id uuid,
  user_id uuid,
  previous_status text,
  new_status text,
  announcement_id uuid,
  notice_created boolean,
  decided_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $body$
declare
  v_booking public.session_bookings%rowtype;
  v_title text;
  v_start timestamptz;
  v_location text;
  v_announcement_id uuid;
  v_notice_title text;
  v_notice_body text;
  v_notice_tone text := 'info';
  v_receipt public.booking_decision_receipts%rowtype;
  v_when text;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_booking_id is null or p_request_id is null then raise exception 'BOOKING_DECISION_REQUEST_INVALID'; end if;
  if p_status not in ('requested', 'confirmed', 'waitlisted', 'cancelled', 'declined', 'attended', 'no_show') then
    raise exception 'INVALID_STATUS';
  end if;

  select receipt.* into v_receipt
    from public.booking_decision_receipts receipt
   where receipt.request_id = p_request_id;
  if found then
    if v_receipt.booking_id is distinct from p_booking_id
       or v_receipt.new_status is distinct from p_status then
      raise exception 'BOOKING_DECISION_REQUEST_CONFLICT';
    end if;
    return query select v_receipt.request_id, v_receipt.booking_id, v_receipt.session_id,
      v_receipt.user_id, v_receipt.previous_status, v_receipt.new_status,
      v_receipt.announcement_id, v_receipt.announcement_id is not null, v_receipt.decided_at;
    return;
  end if;

  select booking.* into v_booking
    from public.session_bookings booking
   where booking.id = p_booking_id
   for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;

  select session.title, session.start_time, session.location_zone
    into v_title, v_start, v_location
    from public.class_sessions session
   where session.id = v_booking.class_session_id;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;

  -- The existing function remains the single authority for legal transitions,
  -- capacity, FIFO order, time conflicts, and credit reservation/refunds.
  perform public.admin_set_booking_status(p_booking_id, p_status);

  if v_booking.status is distinct from p_status
     and p_status in ('confirmed', 'waitlisted', 'declined', 'cancelled') then
    v_announcement_id := gen_random_uuid();
    v_when := to_char(v_start at time zone 'Australia/Brisbane', 'FMDay, FMDD FMMonth at FMHH12:MIam');

    case p_status
      when 'confirmed' then
        v_notice_title := 'Your class booking is confirmed';
        v_notice_body := format(
          'Your place in %s on %s%s is confirmed. One class credit is reserved for you.',
          v_title, v_when,
          case when nullif(btrim(coalesce(v_location, '')), '') is null then ''
            else format(' at %s', btrim(v_location)) end
        );
        v_notice_tone := 'action';
      when 'waitlisted' then
        v_notice_title := 'Your booking request is waitlisted';
        v_notice_body := format(
          'Your request for %s on %s has moved to the waitlist. Your reserved credit has been returned, and XERT will let you know if a place opens.',
          v_title, v_when
        );
        v_notice_tone := 'action';
      when 'declined' then
        v_notice_title := 'Booking request update';
        v_notice_body := format(
          'Your request for %s on %s was not confirmed. Your reserved credit has been returned to your account.',
          v_title, v_when
        );
      when 'cancelled' then
        v_notice_title := 'Your class booking was cancelled';
        v_notice_body := format(
          'XERT cancelled your place in %s on %s. Any reserved class credit has been returned to your account.',
          v_title, v_when
        );
    end case;

    insert into public.member_announcements (
      id, title, body, tone, cta_label, cta_url, audience, source_kind, source_id,
      published_at, expires_at, created_by, last_changed_by
    ) values (
      v_announcement_id, v_notice_title, v_notice_body, v_notice_tone,
      'View bookings', '/account', 'targeted', 'booking_decision', p_booking_id,
      now(), least(greatest(now() + interval '30 days', v_start + interval '1 day'), now() + interval '1 year'),
      auth.uid(), auth.uid()
    );

    insert into public.member_announcement_targets (announcement_id, user_id)
    values (v_announcement_id, v_booking.user_id);
  end if;

  insert into public.booking_decision_receipts (
    request_id, booking_id, session_id, user_id, previous_status, new_status,
    announcement_id, decided_by
  ) values (
    p_request_id, p_booking_id, v_booking.class_session_id, v_booking.user_id,
    v_booking.status, p_status, v_announcement_id, auth.uid()
  );

  return query
  select receipt.request_id, receipt.booking_id, receipt.session_id, receipt.user_id,
    receipt.previous_status, receipt.new_status, receipt.announcement_id,
    receipt.announcement_id is not null, receipt.decided_at
    from public.booking_decision_receipts receipt
   where receipt.request_id = p_request_id;
end;
$body$;
$fn$;
  end if;
end;
$install_admin_set_booking_status_with_notice$;

revoke execute on function public.admin_set_booking_status_with_notice(uuid, text, uuid)
  from public, anon;
grant execute on function public.admin_set_booking_status_with_notice(uuid, text, uuid)
  to authenticated;

insert into public.xert_schema_capabilities (capability)
values ('booking_decision_notifications')
on conflict (capability) do nothing;
