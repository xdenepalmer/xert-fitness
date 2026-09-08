-- NOTE ON DRIFT: this rewrites the book_session, cancel_booking and admin
-- booking functions as they actually stand in production, which include a
-- member_entitlements path (booking_entitlement_for_session) applied straight
-- to the database and never committed here. Replaying this repo's migrations
-- from scratch will not reproduce that function, so treat the live database as
-- the source of truth for it until the entitlement work is versioned.

-- Class credits are retired. XERT runs on memberships now: a member asks for a
-- place and staff confirm it, so booking must not look for a credit pack that
-- nobody sells any more. Every class pack product is inactive, and with no
-- credits on file a member's only outcome was "Booking failed".
--
-- Passes (member_entitlements) still work where one exists: they are attached
-- to the booking as before. What goes is the credit fallback that refused the
-- booking outright. Historical credit batches are left untouched, and a legacy
-- booking that did reserve one still gets it back when it is cancelled.

-- ─── Member booking ──────────────────────────────────────────────────────────

create or replace function public.book_session(p_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_capacity integer;
  v_start timestamptz;
  v_status text;
  v_mode text;
  v_booking_status text;
  v_booked integer;
  v_entitlement uuid;
  v_booking uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  select capacity, start_time, status, coalesce(booking_mode, 'instant_book')
    into v_capacity, v_start, v_status, v_mode
    from public.class_sessions where id = p_session_id for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if v_status <> 'published' then raise exception 'SESSION_NOT_BOOKABLE'; end if;
  if v_start <= now() then raise exception 'SESSION_IN_PAST'; end if;
  if v_mode = 'interest_only' then raise exception 'SESSION_INTEREST_ONLY'; end if;
  if v_mode not in ('instant_book', 'request_to_book') then raise exception 'SESSION_NOT_BOOKABLE'; end if;

  if exists (
    select 1 from public.session_bookings
    where user_id = v_user and class_session_id = p_session_id
      and status in ('requested', 'confirmed', 'waitlisted')
  ) then raise exception 'ALREADY_BOOKED'; end if;
  select count(*) into v_booked from public.session_bookings
    where class_session_id = p_session_id and status in ('requested', 'confirmed');
  if v_capacity is not null and v_booked >= v_capacity then raise exception 'SESSION_FULL'; end if;

  -- A pass is recorded against the booking when the member holds one. Nobody
  -- is turned away for not holding one: capacity and staff confirmation are
  -- what decide a place now.
  v_entitlement := public.booking_entitlement_for_session(v_user, p_session_id, null);

  v_booking_status := case when v_mode = 'request_to_book' then 'requested' else 'confirmed' end;
  insert into public.session_bookings (user_id, class_session_id, credit_batch_id, entitlement_id, status)
  values (v_user, p_session_id, null, v_entitlement, v_booking_status)
  returning id into v_booking;
  return v_booking;
end;
$function$;

-- ─── Member cancellation ─────────────────────────────────────────────────────
-- A booking that never reserved anything reports 'not_reserved' rather than
-- 'reservation_unavailable', which used to tell members to contact the club
-- about a credit that was never taken.

create or replace function public.cancel_booking(p_booking_id uuid)
returns table(
  cancelled_booking_id uuid, previous_status text, credit_refund_eligible boolean,
  credit_refunded boolean, credit_outcome text, cancelled_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_batch uuid;
  v_start timestamptz;
  v_status text;
  v_cancelled_at timestamptz := now();
  v_refund_eligible boolean := false;
  v_refunded boolean := false;
  v_outcome text;
  v_updated integer := 0;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  select booking.credit_batch_id, session.start_time, booking.status
    into v_batch, v_start, v_status
    from public.session_bookings booking
    join public.class_sessions session on session.id = booking.class_session_id
   where booking.id = p_booking_id
     and booking.user_id = v_user
   for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_status not in ('requested', 'confirmed', 'waitlisted') then
    raise exception 'NOT_CANCELLABLE';
  end if;

  v_refund_eligible := v_status = 'requested'
    or (v_status = 'confirmed' and v_start - v_cancelled_at > interval '12 hours');

  update public.session_bookings
     set status = 'cancelled',
         cancelled_at = v_cancelled_at
   where id = p_booking_id;

  if v_status = 'waitlisted' or v_batch is null then
    v_outcome := 'not_reserved';
  elsif not v_refund_eligible then
    v_outcome := 'late_cancellation';
  else
    update public.credit_batches
       set remaining = least(total, remaining + 1)
     where id = v_batch
       and remaining < total
       and (expires_at is null or expires_at > v_cancelled_at);
    get diagnostics v_updated = row_count;
    v_refunded := v_updated = 1;

    if v_refunded then
      v_outcome := 'returned';
    elsif exists (
      select 1 from public.credit_batches
       where id = v_batch
         and expires_at is not null
         and expires_at <= v_cancelled_at
    ) then
      v_outcome := 'expired';
    else
      v_outcome := 'reservation_unavailable';
    end if;
  end if;

  return query
  select p_booking_id, v_status, v_refund_eligible, v_refunded,
    v_outcome, v_cancelled_at;
end;
$function$;

-- ─── Staff changing a booking's status ───────────────────────────────────────

create or replace function public.admin_set_booking_status(p_booking_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_batch uuid;
  v_entitlement uuid;
  v_current text;
  v_user uuid;
  v_session uuid;
  v_capacity integer;
  v_start timestamptz;
  v_session_status text;
  v_active_count integer;
  v_first_waitlisted uuid;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_status not in ('requested', 'confirmed', 'waitlisted', 'cancelled', 'declined', 'attended', 'no_show') then
    raise exception 'INVALID_STATUS';
  end if;
  select credit_batch_id, entitlement_id, status, user_id, class_session_id
    into v_batch, v_entitlement, v_current, v_user, v_session
    from public.session_bookings where id = p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if p_status = v_current then return; end if;
  if p_status in ('attended', 'no_show') and v_current <> 'confirmed' then
    raise exception 'STATUS_TRANSITION_NOT_ALLOWED';
  end if;
  if p_status in ('requested', 'confirmed') and v_current not in ('requested', 'confirmed') then
    select id into v_first_waitlisted from public.session_bookings
      where class_session_id = v_session and status = 'waitlisted'
      order by created_at, id limit 1;
    if v_first_waitlisted is not null
       and (v_current <> 'waitlisted' or v_first_waitlisted is distinct from p_booking_id) then
      raise exception 'WAITLIST_ORDER_REQUIRED';
    end if;
    select capacity, start_time, status into v_capacity, v_start, v_session_status
      from public.class_sessions where id = v_session for update;
    if not found then raise exception 'SESSION_NOT_FOUND'; end if;
    if v_session_status <> 'published' then raise exception 'SESSION_NOT_BOOKABLE'; end if;
    if v_start <= now() then raise exception 'SESSION_IN_PAST'; end if;
    select count(*) into v_active_count from public.session_bookings
      where class_session_id = v_session and status in ('requested', 'confirmed');
    if v_capacity is not null and v_active_count >= v_capacity then raise exception 'SESSION_FULL'; end if;

    -- Confirming a place no longer spends a credit, so a member with none can
    -- be confirmed off the waitlist like anyone else.
    v_entitlement := public.booking_entitlement_for_session(v_user, v_session, p_booking_id);
    v_batch := null;
  end if;
  update public.session_bookings
  set status = p_status,
      credit_batch_id = v_batch,
      entitlement_id = v_entitlement,
      cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end
  where id = p_booking_id;
  -- A legacy booking that still holds a credit gives it back when it is undone.
  if p_status in ('waitlisted', 'declined', 'cancelled')
     and v_current in ('requested', 'confirmed') and v_batch is not null then
    update public.credit_batches set remaining = remaining + 1 where id = v_batch;
  end if;
end;
$function$;

-- --- Staff booking a member in -----------------------------------------------

create or replace function public.admin_book_member_into_class(
  p_session_id uuid, p_member_id uuid, p_request_id uuid
)
returns table(
  request_id uuid, booking_id uuid, session_id uuid, member_id uuid,
  booking_status text, credit_batch_id uuid, announcement_id uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_receipt public.admin_staff_booking_receipts%rowtype;
  v_capacity integer;
  v_start timestamptz;
  v_end timestamptz;
  v_session_status text;
  v_booking_mode text;
  v_title text;
  v_location text;
  v_active_count integer;
  v_has_waitlist boolean;
  v_booking_status text;
  v_booking_id uuid;
  v_announcement_id uuid := gen_random_uuid();
  v_when text;
  v_notice_body text;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_session_id is null or p_member_id is null or p_request_id is null then
    raise exception 'STAFF_BOOKING_REQUEST_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));

  select receipt.* into v_receipt
    from public.admin_staff_booking_receipts receipt
   where receipt.request_id = p_request_id;
  if found then
    if v_receipt.session_id is distinct from p_session_id
       or v_receipt.member_id is distinct from p_member_id then
      raise exception 'STAFF_BOOKING_REQUEST_CONFLICT';
    end if;
    return query
    select receipt.request_id, receipt.booking_id, receipt.session_id,
      receipt.member_id, receipt.booking_status, receipt.credit_batch_id,
      receipt.announcement_id, receipt.created_at
      from public.admin_staff_booking_receipts receipt
     where receipt.request_id = p_request_id;
    return;
  end if;

  select session.capacity, session.start_time, session.end_time, session.status,
         coalesce(session.booking_mode, 'instant_book'), session.title,
         session.location_zone
    into v_capacity, v_start, v_end, v_session_status, v_booking_mode, v_title,
         v_location
    from public.class_sessions session
   where session.id = p_session_id
   for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if v_session_status not in ('published', 'full') then
    raise exception 'SESSION_NOT_BOOKABLE';
  end if;
  if coalesce(v_end, v_start + interval '3 hours') <= now() then
    raise exception 'SESSION_FINISHED';
  end if;
  if v_booking_mode = 'interest_only' then
    raise exception 'SESSION_INTEREST_ONLY';
  end if;
  if v_capacity is null or v_capacity < 1 then
    raise exception 'CLASS_CAPACITY_INVALID';
  end if;

  perform 1 from public.profiles profile
   where profile.id = p_member_id
     and profile.role = 'member'
   for share;
  if not found then raise exception 'MEMBER_NOT_BOOKABLE'; end if;

  if exists (
    select 1 from public.session_bookings booking
     where booking.user_id = p_member_id
       and booking.class_session_id = p_session_id
       and booking.status in ('requested', 'confirmed', 'waitlisted', 'attended', 'no_show')
  ) then
    raise exception 'MEMBER_ALREADY_ON_ROSTER';
  end if;

  -- Counts confirmed public sign-ups as well as member bookings, so the front
  -- desk waitlists rather than overselling a class the public already filled.
  select places.held, places.waiting > 0
    into v_active_count, v_has_waitlist
    from public.class_places_held(p_session_id) as places;

  -- Capacity alone decides the place. Credits are retired, so nothing is
  -- reserved and nobody is refused for holding none.
  if v_session_status = 'full'
     or v_active_count >= v_capacity
     or v_has_waitlist then
    v_booking_status := 'waitlisted';
  else
    v_booking_status := 'confirmed';
  end if;

  insert into public.session_bookings (
    user_id, class_session_id, credit_batch_id, status
  ) values (
    p_member_id, p_session_id, null, v_booking_status
  )
  returning id into v_booking_id;

  v_when := to_char(
    v_start at time zone 'Australia/Brisbane',
    'Dy DD Mon, FMHH12:MI AM'
  );
  if v_booking_status = 'confirmed' then
    v_notice_body := format(
      'XERT has booked you into %s on %s%s. Your place is held.',
      coalesce(nullif(btrim(v_title), ''), 'your class'),
      v_when,
      case when nullif(btrim(v_location), '') is null
        then '' else ' at ' || btrim(v_location) end
    );
  else
    v_notice_body := format(
      'XERT has added you to the FIFO waitlist for %s on %s%s. XERT will let you know as soon as a place opens up.',
      coalesce(nullif(btrim(v_title), ''), 'your class'),
      v_when,
      case when nullif(btrim(v_location), '') is null
        then '' else ' at ' || btrim(v_location) end
    );
  end if;

  insert into public.member_announcements (
    id, title, body, tone, cta_label, cta_url, audience, source_kind, source_id,
    published_at, expires_at, created_by, last_changed_by
  ) values (
    v_announcement_id,
    case when v_booking_status = 'confirmed'
      then 'XERT booked your class'
      else 'XERT added you to a waitlist'
    end,
    v_notice_body,
    'info',
    'View bookings',
    '/account',
    'targeted',
    'staff_booking',
    v_booking_id,
    now(),
    least(
      greatest(now() + interval '30 days', v_start + interval '1 day'),
      now() + interval '1 year'
    ),
    auth.uid(),
    auth.uid()
  );

  insert into public.member_announcement_targets (announcement_id, user_id)
  values (v_announcement_id, p_member_id);

  insert into public.admin_staff_booking_receipts (
    request_id, booking_id, session_id, member_id, booking_status,
    credit_batch_id, announcement_id, created_by
  ) values (
    p_request_id, v_booking_id, p_session_id, p_member_id, v_booking_status,
    null, v_announcement_id, auth.uid()
  );

  return query
  select receipt.request_id, receipt.booking_id, receipt.session_id,
    receipt.member_id, receipt.booking_status, receipt.credit_batch_id,
    receipt.announcement_id, receipt.created_at
    from public.admin_staff_booking_receipts receipt
   where receipt.request_id = p_request_id;
end;
$function$;

-- --- Waitlist promotion ------------------------------------------------------
-- Nobody is held on a waitlist for want of a credit any more, so the wrapper
-- that translated NO_CREDITS into WAITLIST_MEMBER_NO_CREDITS goes with it.

create or replace function public.admin_promote_next_waitlisted(p_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_booking_id uuid;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  select id into v_booking_id from public.session_bookings
    where class_session_id = p_session_id and status = 'waitlisted'
    order by created_at, id limit 1 for update;
  if v_booking_id is null then raise exception 'WAITLIST_EMPTY'; end if;
  perform public.admin_set_booking_status(v_booking_id, 'confirmed');
  return v_booking_id;
end;
$function$;

create or replace function public.admin_promote_next_waitlisted_with_notice(
  p_session_id uuid, p_expected_booking_id uuid, p_request_id uuid
)
returns table(
  request_id uuid, session_id uuid, booking_id uuid, user_id uuid,
  announcement_id uuid, promoted_at timestamptz
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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

  perform public.admin_set_booking_status(v_booking_id, 'confirmed');

  insert into public.member_announcements (
    id, title, body, tone, cta_label, cta_url, audience, source_kind, source_id,
    published_at, expires_at, created_by, last_changed_by
  ) values (
    v_announcement_id,
    'Your class place is confirmed',
    format(
      'A place opened in %s on %s%s. Your place is confirmed.',
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
$function$;
