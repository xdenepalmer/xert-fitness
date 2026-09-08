-- book_session and admin_set_booking_status lost two guards from the booking
-- integrity overhaul (20260906010000 / 20260906020000) when an entitlement-aware
-- version was applied straight to the database over the top of them. Both are
-- restored here, on top of the entitlement path and the class-credits switch,
-- so nothing else is undone:
--
--   * capacity counts confirmed public sign-ups as well as member bookings, so
--     the same place cannot be sold from the public timetable and from a member
--     account at once;
--   * a member cannot take a free place while somebody is queued for it. Staff
--     clear the queue from the waitlist desk.
--
-- Verified against production: an ordinary booking succeeds; a class the public
-- has already filled refuses with SESSION_FULL; and a class with someone
-- waiting refuses with SESSION_WAITLIST_FIRST.
--
-- Every other function the overhaul defines was already live and untouched.


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
  v_waiting integer;
  v_batch uuid;
  v_entitlement uuid;
  v_booking uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  select capacity, start_time, status, coalesce(booking_mode, 'instant_book')
    into v_capacity, v_start, v_status, v_mode
    from public.class_sessions where id = p_session_id for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  -- 'full' is still a listed class: the member feed shows it so its waitlist
  -- can be joined, which is precisely the class most likely to need one.
  if v_status not in ('published', 'full') then raise exception 'SESSION_NOT_BOOKABLE'; end if;
  if v_start <= now() then raise exception 'SESSION_IN_PAST'; end if;
  if v_mode = 'interest_only' then raise exception 'SESSION_INTEREST_ONLY'; end if;
  if v_mode not in ('instant_book', 'request_to_book') then raise exception 'SESSION_NOT_BOOKABLE'; end if;

  if exists (
    select 1 from public.session_bookings
    where user_id = v_user and class_session_id = p_session_id
      and status in ('requested', 'confirmed', 'waitlisted')
  ) then raise exception 'ALREADY_BOOKED'; end if;

  -- Counts confirmed public sign-ups as well as member bookings.
  select places.held, places.waiting into v_booked, v_waiting
    from public.class_places_held(p_session_id) as places;
  if v_capacity is not null and v_booked >= v_capacity then raise exception 'SESSION_FULL'; end if;
  -- Someone is already queued for this class, so the free place is theirs
  -- first. The queue is cleared by staff from the waitlist desk.
  if coalesce(v_waiting, 0) > 0 then raise exception 'SESSION_WAITLIST_FIRST'; end if;

  -- A pass is recorded against the booking when the member holds one.
  v_entitlement := public.booking_entitlement_for_session(v_user, p_session_id, null);

  -- Credits only gate a booking while the club has them switched on.
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

  if p_status in ('requested', 'confirmed')
     and v_current not in ('requested', 'confirmed', 'attended', 'no_show') then
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
    -- 'full' is still a live class, and it is precisely the one most likely to
    -- have a queue. The waitlist desk lists those classes and offers Promote
    -- next on them; refusing here made that button fail every time.
    if v_session_status not in ('published', 'full') then raise exception 'SESSION_NOT_BOOKABLE'; end if;
    if v_start <= now() then raise exception 'SESSION_IN_PAST'; end if;

    -- Counts confirmed public sign-ups as well as member bookings, so a class
    -- the public timetable already filled cannot be topped up from here.
    select places.held into v_active_count
      from public.class_places_held(v_session) as places;
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
  -- A booking that holds a credit gives it back when it is undone.
  if p_status in ('waitlisted', 'declined', 'cancelled')
     and v_current in ('requested', 'confirmed', 'attended', 'no_show') and v_batch is not null then
    update public.credit_batches set remaining = remaining + 1 where id = v_batch;
  end if;
end;
$function$;
