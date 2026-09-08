-- Class credits become a switch the club owns rather than a hard-coded rule.
-- Off (the default, since class packs were retired in favour of memberships)
-- means booking never looks for a credit: capacity and staff confirmation
-- decide a place. Turned back on, the old behaviour returns exactly — a member
-- needs a credit or a pass, and confirming a place spends one.
--
-- Credits a member already bought are honoured either way: a booking that
-- holds one still gives it back when it is cancelled or declined, whatever the
-- switch says today.

alter table public.admin_settings
  add column if not exists class_credits_enabled boolean not null default false;

comment on column public.admin_settings.class_credits_enabled is
  'When true, booking a class requires and spends a class credit. Off since class packs were retired in favour of memberships.';

create or replace function public.class_credits_are_enabled()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce((select class_credits_enabled from public.admin_settings limit 1), false);
$function$;

revoke execute on function public.class_credits_are_enabled() from public, anon;
grant execute on function public.class_credits_are_enabled() to authenticated, service_role;


CREATE OR REPLACE FUNCTION public.book_session(p_session_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  v_capacity integer;
  v_start timestamptz;
  v_status text;
  v_mode text;
  v_booking_status text;
  v_booked integer;
  v_batch uuid;
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

  -- A pass is recorded against the booking when the member holds one.
  v_entitlement := public.booking_entitlement_for_session(v_user, p_session_id, null);

  -- Credits only gate a booking while the club has them switched on. Off, the
  -- place is decided by capacity and staff confirmation alone.
  if v_entitlement is null and public.class_credits_are_enabled() then
    select id into v_batch from public.credit_batches
      where user_id = v_user and remaining > 0 and (expires_at is null or expires_at > now())
      order by expires_at asc nulls last, created_at asc
      limit 1 for update;
    if v_batch is null then raise exception 'NO_CREDITS'; end if;
    update public.credit_batches set remaining = remaining - 1 where id = v_batch;
  end if;

  v_booking_status := case when v_mode = 'request_to_book' then 'requested' else 'confirmed' end;
  insert into public.session_bookings (user_id, class_session_id, credit_batch_id, entitlement_id, status)
  values (v_user, p_session_id, v_batch, v_entitlement, v_booking_status)
  returning id into v_booking;
  return v_booking;
end;
$function$;


CREATE OR REPLACE FUNCTION public.admin_set_booking_status(p_booking_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_new_batch uuid;
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

    v_entitlement := public.booking_entitlement_for_session(v_user, v_session, p_booking_id);
    if v_entitlement is null and public.class_credits_are_enabled() then
      select id into v_new_batch from public.credit_batches
        where user_id = v_user and remaining > 0 and (expires_at is null or expires_at > now())
        order by expires_at asc nulls last, created_at asc limit 1 for update;
      if v_new_batch is null then raise exception 'NO_CREDITS'; end if;
      update public.credit_batches set remaining = remaining - 1 where id = v_new_batch;
      v_batch := v_new_batch;
    else
      v_batch := null;
    end if;
  end if;
  update public.session_bookings
  set status = p_status,
      credit_batch_id = v_batch,
      entitlement_id = v_entitlement,
      cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end
  where id = p_booking_id;
  -- A booking that holds a credit gives it back when it is undone, whether or
  -- not the switch is on now: the member paid for it either way.
  if p_status in ('waitlisted', 'declined', 'cancelled')
     and v_current in ('requested', 'confirmed') and v_batch is not null then
    update public.credit_batches set remaining = remaining + 1 where id = v_batch;
  end if;
end;
$function$;


CREATE OR REPLACE FUNCTION public.admin_book_member_into_class(p_session_id uuid, p_member_id uuid, p_request_id uuid)
 RETURNS TABLE(request_id uuid, booking_id uuid, session_id uuid, member_id uuid, booking_status text, credit_batch_id uuid, announcement_id uuid, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  v_credit_batch_id uuid;
  v_credits_on boolean := public.class_credits_are_enabled();
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

  if v_session_status = 'full'
     or v_active_count >= v_capacity
     or v_has_waitlist then
    v_booking_status := 'waitlisted';
  else
    v_booking_status := 'confirmed';
    -- Credits only gate the place while the club has them switched on.
    if v_credits_on then
      select batch.id into v_credit_batch_id
        from public.credit_batches batch
       where batch.user_id = p_member_id
         and batch.remaining > 0
         and (batch.expires_at is null or batch.expires_at > now())
       order by batch.expires_at asc nulls last, batch.created_at asc
       limit 1
       for update;
      if v_credit_batch_id is null then raise exception 'MEMBER_HAS_NO_CREDITS'; end if;
      update public.credit_batches
         set remaining = remaining - 1
       where id = v_credit_batch_id;
    end if;
  end if;

  insert into public.session_bookings (
    user_id, class_session_id, credit_batch_id, status
  ) values (
    p_member_id, p_session_id, v_credit_batch_id, v_booking_status
  )
  returning id into v_booking_id;

  v_when := to_char(
    v_start at time zone 'Australia/Brisbane',
    'Dy DD Mon, FMHH12:MI AM'
  );
  if v_booking_status = 'confirmed' then
    v_notice_body := format(
      'XERT has booked you into %s on %s%s. %s',
      coalesce(nullif(btrim(v_title), ''), 'your class'),
      v_when,
      case when nullif(btrim(v_location), '') is null
        then '' else ' at ' || btrim(v_location) end,
      case when v_credit_batch_id is null
        then 'Your place is held.'
        else 'One class credit has been reserved for your place.' end
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
    v_credit_batch_id, v_announcement_id, auth.uid()
  );

  return query
  select receipt.request_id, receipt.booking_id, receipt.session_id,
    receipt.member_id, receipt.booking_status, receipt.credit_batch_id,
    receipt.announcement_id, receipt.created_at
    from public.admin_staff_booking_receipts receipt
   where receipt.request_id = p_request_id;
end;
$function$;
