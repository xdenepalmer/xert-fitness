-- Booking and timetable integrity overhaul.
--
-- Three separate paths could put a person in a class — book_session (members
-- spending a credit), submit_class_signup (the public timetable) and an admin
-- confirming a request in the Command Centre — and only the first two agreed on
-- what "full" meant. This migration gives all of them one shared definition of a
-- held place, makes the owner's booking switch authoritative for the public
-- path, stops anonymous sign-ups stepping over waitlisted members, and gives a
-- visitor who took a real spot a way to hand it back.
--
-- Every change here is idempotent and safe to re-run.

-- ── 1. A self-service handle on a public sign-up ────────────────────────────
-- Anonymous visitors have no account, so the only way to let them release a
-- spot is an unguessable token issued at sign-up time. anon has no select
-- policy on class_bookings, so the token is only ever seen by the person who
-- created the row (returned once by submit_class_signup) and by staff.
alter table public.class_bookings
  add column if not exists cancel_token uuid not null default gen_random_uuid();
alter table public.class_bookings
  add column if not exists cancelled_at timestamptz;

create unique index if not exists class_bookings_cancel_token_key
  on public.class_bookings (cancel_token);

-- Statuses are read by admin_update_request, the roster and the availability
-- maths; a typo reaching the column would silently free or hold a place.
do $$
begin
  alter table public.class_bookings
    add constraint class_bookings_status_check
    check (status in ('requested', 'confirmed', 'waitlisted', 'cancelled', 'declined', 'attended', 'no_show'));
exception
  when duplicate_object then null;
  when check_violation then
    raise notice 'class_bookings contains statuses outside the supported set; constraint skipped.';
end;
$$;

create index if not exists class_bookings_session_status_idx
  on public.class_bookings (class_session_id, status);

-- ── 2. One shared definition of a held place ────────────────────────────────
-- A place is held by an active member booking (requested or confirmed — a
-- credit is already committed) or by a confirmed public sign-up. A public row
-- still sitting at 'requested' is an enquiry and holds nothing; that is the
-- whole point of request_to_book.
--
-- waiting > 0 means the class was full enough for a member to queue, so it must
-- read as full everywhere until staff clear the queue — otherwise a walk-up on
-- the public timetable takes the place the waitlisted member is queued for.
create or replace function public.class_places_held(p_session_id uuid)
returns table (held integer, waiting integer)
language sql
stable
set search_path = ''
as $$
  select
    (
      coalesce((
        select count(*)
          from public.session_bookings member_booking
         where member_booking.class_session_id = p_session_id
           and member_booking.status in ('requested', 'confirmed')
      ), 0)
      + coalesce((
        select count(*)
          from public.class_bookings public_signup
         where public_signup.class_session_id = p_session_id
           and public_signup.status = 'confirmed'
      ), 0)
    )::integer as held,
    coalesce((
      select count(*)
        from public.session_bookings waiting_member
       where waiting_member.class_session_id = p_session_id
         and waiting_member.status = 'waitlisted'
    ), 0)::integer as waiting;
$$;

-- Deliberately not security definer: a plain SQL function can be inlined into
-- the lateral joins below, and it is only ever called from inside the definer
-- functions here. Called directly by a member it would silently return only the
-- rows RLS lets them see, so nobody but those functions may execute it.
revoke execute on function public.class_places_held(uuid) from public, anon, authenticated;

comment on function public.class_places_held(uuid) is
  'Shared capacity truth for book_session, submit_class_signup and admin_update_request.';

-- ── 3. Public availability now agrees with the member view ──────────────────
-- Previously public_class_availability ignored the waitlist entirely while
-- sessions_with_availability reported zero places the moment anyone queued, so
-- /timetable and /booking stated opposite facts about the same class. The
-- public view also had no way to tell the front end that the owner's booking
-- switch is off, or when the class starts, so the timetable had to guess.
drop function if exists public.public_class_availability();
create function public.public_class_availability()
returns table (
  class_session_id uuid,
  booking_mode text,
  capacity integer,
  taken integer,
  waiting integer,
  spots_left integer,
  starts_at timestamptz,
  bookings_open boolean,
  can_take_spot boolean
)
language sql
security definer
stable
set search_path = ''
as $$
  with switch as (
    select coalesce(bool_or(settings.bookings_enabled), false) as bookings_enabled
      from public.admin_settings as settings
  ),
  counted as (
    select
      session.id,
      coalesce(session.booking_mode, 'request_to_book') as booking_mode,
      session.capacity,
      session.start_time,
      coalesce((
        select count(*)
          from public.session_bookings member_booking
         where member_booking.class_session_id = session.id
           and member_booking.status in ('requested', 'confirmed')
      ), 0)
      + coalesce((
        select count(*)
          from public.class_bookings public_signup
         where public_signup.class_session_id = session.id
           and public_signup.status = 'confirmed'
      ), 0) as taken,
      coalesce((
        select count(*)
          from public.session_bookings waiting_member
         where waiting_member.class_session_id = session.id
           and waiting_member.status = 'waitlisted'
      ), 0) as waiting
    from public.class_sessions session
    where session.public_visible = true
      and session.status in ('published', 'full')
  )
  select
    counted.id as class_session_id,
    counted.booking_mode,
    counted.capacity,
    counted.taken::integer,
    counted.waiting::integer,
    -- The real arithmetic. Reporting zero whenever anyone is queued used to
    -- freeze a class as "full" even after five people cancelled, because
    -- nothing could take the free places and nothing cleared the queue.
    -- `waiting` is its own signal, so the count can stay honest.
    case
      when counted.capacity is null then null
      else greatest(counted.capacity - counted.taken, 0)::integer
    end as spots_left,
    counted.start_time as starts_at,
    switch.bookings_enabled as bookings_open,
    (
      switch.bookings_enabled
      and counted.booking_mode = 'instant_book'
      and counted.start_time > now()
      and counted.waiting = 0
      and (counted.capacity is null or counted.taken < counted.capacity)
    ) as can_take_spot
  from counted cross join switch;
$$;

revoke execute on function public.public_class_availability() from public;
grant execute on function public.public_class_availability() to anon, authenticated;

comment on function public.public_class_availability() is
  'Live public capacity, waitlist state and whether a real spot can be taken right now.';

-- ── 4. The public sign-up honours the owner's booking switch ────────────────
-- The switch used to be cosmetic on the public timetable: the card said
-- "Bookings open soon — no spot is held", the visitor pressed it, and an
-- instant_book class quietly confirmed a real capacity place anyway. Now the
-- database decides, so the promise on the button is the promise that is kept.
-- The signature gains p_join_waitlist so a full class is no longer a dead end:
-- the same form can record "contact me if a place frees up" without taking one.
-- The old seven-argument function is dropped rather than kept alongside, since
-- two candidates with the same argument names make PostgREST refuse the call.
drop function if exists public.submit_class_signup(uuid, text, text, text, boolean, text, text);

create or replace function public.submit_class_signup(
  p_session_id uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_consent boolean default false,
  p_training_level text default null,
  p_notes text default null,
  p_join_waitlist boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_capacity integer;
  v_start timestamptz;
  v_status text;
  v_public boolean;
  v_mode text;
  v_taken integer;
  v_waiting integer;
  v_bookings_open boolean := false;
  v_row_status text;
  v_id uuid;
  v_token uuid;
  v_actor uuid := auth.uid();
  v_name text := btrim(coalesce(p_full_name, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_level text := nullif(btrim(coalesce(p_training_level, '')), '');
begin
  if p_consent is not true then
    raise exception 'CONSENT_REQUIRED';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 100 then
    raise exception 'NAME_REQUIRED';
  end if;
  if char_length(v_email) > 254
     or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'EMAIL_REQUIRED';
  end if;
  if char_length(v_phone) < 6 or char_length(v_phone) > 32
     or v_phone !~ '^\+?[0-9 ()-]+$' then
    raise exception 'PHONE_REQUIRED';
  end if;
  if char_length(coalesce(v_notes, '')) > 1000 then
    raise exception 'NOTES_TOO_LONG';
  end if;

  select coalesce(bool_or(settings.bookings_enabled), false)
    into v_bookings_open
    from public.admin_settings as settings;

  -- Serialise every sign-up for this class behind one row lock, so the
  -- capacity count below cannot be read stale by a concurrent sign-up.
  select capacity, start_time, status, public_visible, coalesce(booking_mode, 'request_to_book')
    into v_capacity, v_start, v_status, v_public, v_mode
    from public.class_sessions
   where id = p_session_id
     for update;

  if not found then
    raise exception 'CLASS_NOT_FOUND';
  end if;
  if v_status not in ('published', 'full') or v_public is not true then
    raise exception 'CLASS_NOT_OPEN';
  end if;
  if v_start <= now() then
    raise exception 'CLASS_STARTED';
  end if;

  if exists (
    select 1
      from public.class_bookings existing
     where existing.class_session_id = p_session_id
       and lower(btrim(existing.email)) = v_email
       and existing.status in ('requested', 'confirmed')
  ) then
    raise exception 'ALREADY_SIGNED_UP';
  end if;

  -- The same person must not hold two places in one class by using both doors:
  -- a credit booking on /booking and an anonymous sign-up on /timetable. Match
  -- on the signed-in account when there is one, and on the member's own email
  -- otherwise, since that is all an anonymous visitor gives us.
  if exists (
    select 1
      from public.session_bookings member_booking
      join public.profiles member on member.id = member_booking.user_id
     where member_booking.class_session_id = p_session_id
       and member_booking.status in ('requested', 'confirmed', 'waitlisted')
       and (
         (v_actor is not null and member_booking.user_id = v_actor)
         or lower(btrim(coalesce(member.email, ''))) = v_email
       )
  ) then
    raise exception 'ALREADY_BOOKED_AS_MEMBER';
  end if;

  select held, waiting into v_taken, v_waiting
    from public.class_places_held(p_session_id);

  if coalesce(p_join_waitlist, false) then
    -- An explicit "let me know if a place frees up": never takes a spot, and is
    -- allowed precisely when the class is one the person could not just join.
    v_row_status := 'requested';
  elsif v_mode = 'instant_book' and v_bookings_open then
    -- Members already queueing for this class have first claim on the room.
    if v_waiting > 0 then
      raise exception 'CLASS_WAITLISTED';
    end if;
    if v_capacity is not null and v_taken >= v_capacity then
      raise exception 'CLASS_FULL';
    end if;
    v_row_status := 'confirmed';
  else
    -- interest_only, request_to_book, or any class while bookings are paused:
    -- record the person and hold nothing.
    v_row_status := 'requested';
  end if;

  insert into public.class_bookings (
    class_session_id, full_name, email, phone, training_level, notes, consent_to_contact, status
  )
  values (
    p_session_id, v_name, v_email, v_phone, v_level, v_notes, true, v_row_status
  )
  returning id, cancel_token into v_id, v_token;

  return jsonb_build_object(
    'id', v_id,
    'status', v_row_status,
    'booking_mode', v_mode,
    'bookings_open', v_bookings_open,
    'took_spot', v_row_status = 'confirmed',
    'waitlisted', coalesce(p_join_waitlist, false),
    'cancel_token', case when v_row_status = 'confirmed' then v_token else null end,
    'spots_left', case
      when v_capacity is null then null
      when v_waiting > 0 then 0
      else greatest(v_capacity - (v_taken + (case when v_row_status = 'confirmed' then 1 else 0 end)), 0)
    end
  );
end;
$$;

revoke execute on function public.submit_class_signup(uuid, text, text, text, boolean, text, text, boolean) from public;
grant execute on function public.submit_class_signup(uuid, text, text, text, boolean, text, text, boolean) to anon, authenticated;

-- ── 5. Giving a public spot back ────────────────────────────────────────────
-- A held place that nobody can release is the exact failure a capacity system
-- exists to prevent: the class reads full while the room is not.
create or replace function public.cancel_class_signup(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_status text;
  v_session uuid;
  v_start timestamptz;
  v_title text;
begin
  if p_token is null then
    raise exception 'SIGNUP_NOT_FOUND';
  end if;

  select signup.id, signup.status, signup.class_session_id
    into v_id, v_status, v_session
    from public.class_bookings signup
   where signup.cancel_token = p_token
     for update;

  if not found then
    raise exception 'SIGNUP_NOT_FOUND';
  end if;

  select session.start_time, session.title
    into v_start, v_title
    from public.class_sessions session
   where session.id = v_session;

  if v_status in ('cancelled', 'declined') then
    return jsonb_build_object('id', v_id, 'status', v_status, 'already_cancelled', true, 'class_title', v_title);
  end if;
  if v_status in ('attended', 'no_show') then
    raise exception 'SIGNUP_ALREADY_MARKED';
  end if;
  if v_start is not null and v_start <= now() then
    raise exception 'CLASS_STARTED';
  end if;

  update public.class_bookings
     set status = 'cancelled',
         cancelled_at = now()
   where id = v_id;

  return jsonb_build_object(
    'id', v_id,
    'status', 'cancelled',
    'already_cancelled', false,
    'class_title', v_title,
    'freed_spot', v_status = 'confirmed'
  );
end;
$$;

revoke execute on function public.cancel_class_signup(uuid) from public;
grant execute on function public.cancel_class_signup(uuid) to anon, authenticated;

comment on function public.cancel_class_signup(uuid) is
  'Lets a public sign-up release its own place using the token issued at sign-up.';

-- ── 6. Staff can no longer oversell a class by accident ─────────────────────
-- admin_update_request took the row lock but never counted the room, so
-- confirming the thirteenth request into a twelve-person class simply worked
-- and nothing anywhere said otherwise. Overbooking is still allowed — a gym
-- owner squeezing someone in is a real and reasonable thing — but it now has to
-- be a decision rather than an accident, so the caller must ask for it.
--
-- The old five-argument signature is dropped rather than kept alongside: two
-- candidates with the same argument names make PostgREST refuse the call.
drop function if exists public.admin_update_request(text, text, text, text, boolean);

create or replace function public.admin_update_request(
  p_request_type text,
  p_request_id text,
  p_status text default null,
  p_admin_notes text default null,
  p_update_admin_notes boolean default false,
  p_allow_overbook boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_request_type text := lower(trim(coalesce(p_request_type, '')));
  v_request_id text := trim(coalesce(p_request_id, ''));
  v_requested_status text := nullif(lower(trim(coalesce(p_status, ''))), '');
  v_row jsonb;
  v_previous_status text;
  v_new_status text;
  v_previous_notes text;
  v_new_notes text;
  v_subject_label text;
  v_subject_email text;
  v_audit_id uuid;
  v_session_id uuid;
  v_capacity integer;
  v_taken integer;
  v_waiting integer;
begin
  if v_actor is null or not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if v_request_type not in ('class_booking', 'private_session') then
    raise exception 'REQUEST_TYPE_INVALID';
  end if;
  if v_request_id = '' then
    raise exception 'REQUEST_REQUIRED';
  end if;
  if v_requested_status is null and not coalesce(p_update_admin_notes, false) then
    raise exception 'REQUEST_CHANGE_REQUIRED';
  end if;
  if length(coalesce(p_admin_notes, '')) > 5000 then
    raise exception 'ADMIN_NOTES_TOO_LONG';
  end if;

  if v_request_type = 'class_booking' then
    if v_requested_status is not null and v_requested_status not in (
      'requested', 'confirmed', 'waitlisted', 'cancelled', 'declined', 'attended', 'no_show'
    ) then
      raise exception 'BOOKING_STATUS_INVALID';
    end if;
    select to_jsonb(request)
      into v_row
      from public.class_bookings request
     where request.id::text = v_request_id
     for update;
  else
    if v_requested_status is not null and v_requested_status not in (
      'requested', 'approved', 'declined', 'reschedule_requested', 'completed', 'cancelled'
    ) then
      raise exception 'PT_STATUS_INVALID';
    end if;
    select to_jsonb(request)
      into v_row
      from public.private_session_requests request
     where request.id::text = v_request_id
     for update;
  end if;

  if v_row is null then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  v_previous_status := v_row ->> 'status';
  v_previous_notes := nullif(trim(coalesce(v_row ->> 'admin_notes', '')), '');
  v_new_status := coalesce(v_requested_status, v_previous_status);
  v_new_notes := case
    when coalesce(p_update_admin_notes, false) then nullif(trim(coalesce(p_admin_notes, '')), '')
    else v_previous_notes
  end;

  if v_new_status is not distinct from v_previous_status
     and v_new_notes is not distinct from v_previous_notes then
    return null;
  end if;

  -- Only a move INTO 'confirmed' takes a place, so re-saving a note on an
  -- already-confirmed row never trips the check.
  if v_request_type = 'class_booking'
     and v_new_status = 'confirmed'
     and v_previous_status is distinct from 'confirmed' then
    v_session_id := nullif(v_row ->> 'class_session_id', '')::uuid;
    if v_session_id is not null then
      -- Lock the class the same way the public sign-up does, so two staff
      -- confirming at once cannot both read the last free place.
      select capacity into v_capacity
        from public.class_sessions
       where id = v_session_id
       for update;

      select held, waiting into v_taken, v_waiting
        from public.class_places_held(v_session_id);

      -- Only capacity is a hard stop. A queued member does not block staff from
      -- confirming a request they have decided to accept; the waitlist desk is
      -- where that judgement is made, and blocking here would strand the queue.
      if not coalesce(p_allow_overbook, false)
         and v_capacity is not null and v_taken >= v_capacity then
        raise exception 'CLASS_FULL';
      end if;
    end if;
  end if;

  if v_request_type = 'class_booking' then
    update public.class_bookings
       set status = v_new_status,
           admin_notes = v_new_notes,
           cancelled_at = case
             when v_new_status in ('cancelled', 'declined') then coalesce((v_row ->> 'cancelled_at')::timestamptz, now())
             else null
           end
     where id::text = v_request_id;
  else
    update public.private_session_requests
       set status = v_new_status,
           admin_notes = v_new_notes
     where id::text = v_request_id;
  end if;

  v_subject_label := coalesce(
    nullif(trim(v_row ->> 'full_name'), ''),
    nullif(trim(v_row ->> 'name'), ''),
    nullif(trim(v_row ->> 'email'), ''),
    case when v_request_type = 'class_booking' then 'Booking request' else 'PT request' end
  );
  v_subject_email := nullif(lower(trim(coalesce(v_row ->> 'email', ''))), '');

  insert into public.admin_request_status_changes (
    request_type, request_id, changed_by,
    previous_status, new_status,
    previous_admin_notes, new_admin_notes,
    subject_label, subject_email
  ) values (
    v_request_type, v_request_id, v_actor,
    v_previous_status, v_new_status,
    v_previous_notes, v_new_notes,
    v_subject_label, v_subject_email
  ) returning id into v_audit_id;

  return v_audit_id;
end;
$$;

revoke execute on function public.admin_update_request(text, text, text, text, boolean, boolean) from public, anon;
grant execute on function public.admin_update_request(text, text, text, text, boolean, boolean) to authenticated;

comment on function public.admin_update_request(text, text, text, text, boolean, boolean) is
  'Staff status changes with an immutable audit trail; confirming a class request is capacity-checked unless overbooking is explicitly requested.';

-- ── 7. Staff need the same capacity truth the guard uses ────────────────────
-- The requests queue could not show whether confirming a row would oversell,
-- because nothing exposed the count to the Command Centre.
create or replace function public.admin_class_capacity()
returns table (
  class_session_id uuid,
  title text,
  starts_at timestamptz,
  booking_mode text,
  capacity integer,
  taken integer,
  waiting integer,
  pending integer,
  spots_left integer
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    session.id as class_session_id,
    session.title,
    session.start_time as starts_at,
    coalesce(session.booking_mode, 'request_to_book') as booking_mode,
    session.capacity,
    places.held as taken,
    places.waiting,
    coalesce((
      select count(*)
        from public.class_bookings pending_signup
       where pending_signup.class_session_id = session.id
         and pending_signup.status = 'requested'
    ), 0)::integer as pending,
    case
      when session.capacity is null then null
      else greatest(session.capacity - places.held, 0)::integer
    end as spots_left
  from public.class_sessions session
  cross join lateral public.class_places_held(session.id) as places
  -- Bounded to the window staff actually work in. Without it this walks the
  -- whole class history to answer a question about tomorrow morning.
  where (select public.is_admin())
    and session.start_time > now() - interval '7 days';
$$;

revoke execute on function public.admin_class_capacity() from public, anon;
grant execute on function public.admin_class_capacity() to authenticated;

-- ── 8. The member door counts the public door's places too ──────────────────
-- book_session and join_session_waitlist counted session_bookings only, so a
-- class the public timetable had already filled still looked empty to a member
-- spending a credit — the same room sold twice from two different pages. Both
-- now use the shared count. Behaviour is otherwise identical, including the
-- credit handling and the FIFO waitlist rules.
create or replace function public.book_session(p_session_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user     uuid := auth.uid();
  v_capacity int;
  v_start    timestamptz;
  v_status   text;
  v_mode     text;
  v_booking_status text;
  v_booked   int;
  v_waiting  int;
  v_batch    uuid;
  v_booking  uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  -- Lock the session row to serialise capacity checks.
  select capacity, start_time, status, coalesce(booking_mode, 'instant_book')
    into v_capacity, v_start, v_status, v_mode
    from class_sessions where id = p_session_id for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  -- 'full' is still a listed class: the member feed shows it so its waitlist
  -- can be joined, which is precisely the class most likely to need one.
  if v_status not in ('published', 'full') then raise exception 'SESSION_NOT_BOOKABLE'; end if;
  if v_start <= now() then raise exception 'SESSION_IN_PAST'; end if;
  if v_mode = 'interest_only' then raise exception 'SESSION_INTEREST_ONLY'; end if;
  if v_mode not in ('instant_book', 'request_to_book') then
    raise exception 'SESSION_NOT_BOOKABLE';
  end if;

  if exists (
    select 1 from session_bookings
    where user_id = v_user and class_session_id = p_session_id
      and status in ('requested', 'confirmed', 'waitlisted')
  ) then
    raise exception 'ALREADY_BOOKED';
  end if;

  -- Counts confirmed public sign-ups as well as member bookings.
  select held, waiting into v_booked, v_waiting
    from public.class_places_held(p_session_id);
  if v_capacity is not null and v_booked >= v_capacity then
    raise exception 'SESSION_FULL';
  end if;
  -- Someone is already queued for this class, so the free place is theirs
  -- first. The queue is cleared by staff from the waitlist desk.
  if coalesce(v_waiting, 0) > 0 then
    raise exception 'SESSION_WAITLIST_FIRST';
  end if;

  select id into v_batch
    from credit_batches
    where user_id = v_user and remaining > 0
      and (expires_at is null or expires_at > now())
    order by expires_at asc nulls last, created_at asc
    limit 1 for update;
  if v_batch is null then raise exception 'NO_CREDITS'; end if;

  update credit_batches set remaining = remaining - 1 where id = v_batch;

  v_booking_status := case when v_mode = 'request_to_book' then 'requested' else 'confirmed' end;

  insert into session_bookings (user_id, class_session_id, credit_batch_id, status)
    values (v_user, p_session_id, v_batch, v_booking_status)
    returning id into v_booking;

  return v_booking;
end; $$;

create or replace function public.join_session_waitlist(p_session_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_capacity integer;
  v_start timestamptz;
  v_status text;
  v_mode text;
  v_booked integer;
  v_waiting integer;
  v_booking uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  select capacity, start_time, status, coalesce(booking_mode, 'instant_book')
    into v_capacity, v_start, v_status, v_mode
    from public.class_sessions where id = p_session_id for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if v_status not in ('published', 'full') then raise exception 'SESSION_NOT_BOOKABLE'; end if;
  if v_start <= now() then raise exception 'SESSION_IN_PAST'; end if;
  if v_mode = 'interest_only' then raise exception 'SESSION_INTEREST_ONLY'; end if;

  if exists (
    select 1 from public.session_bookings
    where user_id = v_user and class_session_id = p_session_id
      and status in ('requested', 'confirmed', 'waitlisted')
  ) then raise exception 'ALREADY_BOOKED'; end if;

  if v_capacity is null then raise exception 'SESSION_HAS_CAPACITY'; end if;
  select held, waiting into v_booked, v_waiting
    from public.class_places_held(p_session_id);
  if v_booked < v_capacity and coalesce(v_waiting, 0) = 0 then
    raise exception 'SESSION_HAS_CAPACITY';
  end if;

  insert into public.session_bookings (
    user_id, class_session_id, credit_batch_id, status
  ) values (v_user, p_session_id, null, 'waitlisted')
  returning id into v_booking;
  return v_booking;
end; $$;

revoke execute on function public.book_session(uuid) from public, anon;
revoke execute on function public.join_session_waitlist(uuid) from public, anon;
grant execute on function public.book_session(uuid) to authenticated;
grant execute on function public.join_session_waitlist(uuid) to authenticated;

-- ── 9. Every remaining admin capacity guard counts both doors ───────────────
-- admin_set_booking_status (waitlist promotion and re-confirming a booking),
-- admin_update_class_session (the capacity-below-active guard) and
-- admin_book_member_into_class (the front desk) each counted session_bookings
-- alone. On an instant_book class filled through the public timetable they all
-- read the room as empty: capacity could be cut below the people in it, the
-- waitlist desk offered "Promote next" into a full class, and the front desk
-- confirmed rather than waitlisted. Each is re-issued here with only its
-- counting statement changed, so all the credit, notification and FIFO
-- behaviour around it is untouched.

create or replace function public.admin_set_booking_status(p_booking_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_batch uuid;
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

  select credit_batch_id, status, user_id, class_session_id
    into v_batch, v_current, v_user, v_session
    from public.session_bookings where id = p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if p_status = v_current then return; end if;
  if p_status in ('attended', 'no_show') and v_current <> 'confirmed' then
    raise exception 'STATUS_TRANSITION_NOT_ALLOWED';
  end if;

  if p_status in ('requested', 'confirmed')
     and v_current not in ('requested', 'confirmed', 'attended', 'no_show') then
    select id into v_first_waitlisted
      from public.session_bookings
      where class_session_id = v_session and status = 'waitlisted'
      order by created_at, id limit 1;
    if v_first_waitlisted is not null
      and (v_current <> 'waitlisted' or v_first_waitlisted is distinct from p_booking_id) then
      raise exception 'WAITLIST_ORDER_REQUIRED';
    end if;
  end if;

  if p_status in ('requested', 'confirmed')
     and v_current not in ('requested', 'confirmed', 'attended', 'no_show') then
    select capacity, start_time, status into v_capacity, v_start, v_session_status
      from public.class_sessions where id = v_session for update;
    if not found then raise exception 'SESSION_NOT_FOUND'; end if;
    if v_session_status <> 'published' then raise exception 'SESSION_NOT_BOOKABLE'; end if;
    if v_start <= now() then raise exception 'SESSION_IN_PAST'; end if;

    -- Counts confirmed public sign-ups as well as member bookings, so a class
    -- the public timetable already filled cannot be topped up from here.
    select places.held into v_active_count
      from public.class_places_held(v_session) as places;
    if v_capacity is not null and v_active_count >= v_capacity then raise exception 'SESSION_FULL'; end if;

    select id into v_new_batch from public.credit_batches
      where user_id = v_user and remaining > 0
        and (expires_at is null or expires_at > now())
      order by expires_at asc nulls last, created_at asc limit 1 for update;
    if v_new_batch is null then raise exception 'NO_CREDITS'; end if;
    update public.credit_batches set remaining = remaining - 1 where id = v_new_batch;
    v_batch := v_new_batch;
  end if;

  update public.session_bookings
    set status = p_status,
        credit_batch_id = v_batch,
        cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end
    where id = p_booking_id;

  if p_status in ('waitlisted', 'declined', 'cancelled')
    and v_current in ('requested', 'confirmed', 'attended', 'no_show') and v_batch is not null then
    update public.credit_batches set remaining = remaining + 1 where id = v_batch;
  end if;
end; $$;

create or replace function public.admin_update_class_session(
  p_session_id uuid,
  p_session jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_status text;
  v_active_bookings integer;
  v_update record;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_session_id is null then raise exception 'SESSION_REQUIRED'; end if;
  if p_session is null then raise exception 'SESSION_PAYLOAD_REQUIRED'; end if;

  select * into v_update
  from jsonb_to_record(p_session) as session_data(
    class_type text,
    title text,
    description text,
    coach_name text,
    start_time timestamptz,
    end_time timestamptz,
    duration_minutes integer,
    capacity integer,
    location_zone text,
    beginner_friendly boolean,
    intensity_level text,
    status text,
    public_visible boolean,
    booking_mode text,
    notes text
  );

  if v_update.title is null or btrim(v_update.title) = ''
     or v_update.status is null or v_update.capacity is null then
    raise exception 'INVALID_SESSION_PAYLOAD';
  end if;

  select status into v_current_status
  from public.class_sessions
  where id = p_session_id
  for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;

  if v_current_status in ('cancelled', 'completed')
     and v_update.status <> v_current_status then
    raise exception 'TERMINAL_SESSION_IMMUTABLE';
  end if;
  if v_update.status = 'cancelled' and v_current_status <> 'cancelled' then
    raise exception 'USE_CANCELLATION_WORKFLOW';
  end if;
  if v_update.status = 'completed' and v_current_status <> 'completed' then
    raise exception 'USE_ATTENDANCE_WORKFLOW';
  end if;

  perform 1
  from public.session_bookings
  where class_session_id = p_session_id
    and status in ('requested', 'confirmed')
  for update;

  -- Counts confirmed public sign-ups as well as member bookings, so capacity
  -- can never be cut below the number of people actually holding a place.
  select places.held into v_active_bookings
    from public.class_places_held(p_session_id) as places;

  if v_update.capacity < v_active_bookings then
    raise exception 'CAPACITY_BELOW_ACTIVE:%', v_active_bookings;
  end if;

  update public.class_sessions
  set class_type = v_update.class_type,
      title = btrim(v_update.title),
      description = v_update.description,
      coach_name = v_update.coach_name,
      start_time = v_update.start_time,
      end_time = v_update.end_time,
      duration_minutes = v_update.duration_minutes,
      capacity = v_update.capacity,
      location_zone = v_update.location_zone,
      beginner_friendly = v_update.beginner_friendly,
      intensity_level = v_update.intensity_level,
      status = v_update.status,
      public_visible = v_update.public_visible,
      booking_mode = v_update.booking_mode,
      notes = v_update.notes,
      updated_at = now()
  where id = p_session_id;

  return p_session_id;
end;
$$;

create or replace function public.admin_book_member_into_class(
  p_session_id uuid,
  p_member_id uuid,
  p_request_id uuid
)
returns table (
  request_id uuid,
  booking_id uuid,
  session_id uuid,
  member_id uuid,
  booking_status text,
  credit_batch_id uuid,
  announcement_id uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
      'XERT has booked you into %s on %s%s. One class credit has been reserved for your place.',
      coalesce(nullif(btrim(v_title), ''), 'your class'),
      v_when,
      case when nullif(btrim(v_location), '') is null
        then '' else ' at ' || btrim(v_location) end
    );
  else
    v_notice_body := format(
      'XERT has added you to the FIFO waitlist for %s on %s%s. No class credit is reserved unless a place is confirmed.',
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
$$;

-- The public timetable is the other half of the same room, so the member view
-- has to count it too. It also gains waiting_count, so the member UI can offer
-- the waitlist because someone is queued rather than because the place count
-- was quietly rewritten to zero.
drop function if exists public.sessions_with_availability();
create function public.sessions_with_availability()
returns table (
  id uuid, class_type text, title text, description text, coach_name text,
  start_time timestamptz, end_time timestamptz, duration_minutes int,
  capacity int, location_zone text, beginner_friendly boolean,
  intensity_level text, booking_mode text, booked_count bigint, spots_left int,
  waiting_count int
) language sql security definer stable set search_path = public as $$
  select s.id, s.class_type, s.title, s.description, s.coach_name,
         s.start_time, s.end_time, s.duration_minutes, s.capacity, s.location_zone,
         s.beginner_friendly, s.intensity_level, s.booking_mode,
         places.held::bigint as booked_count,
         case when s.capacity is null then null
              else greatest(s.capacity - places.held, 0)::int
         end as spots_left,
         places.waiting as waiting_count
  from public.class_sessions s
  cross join lateral public.class_places_held(s.id) as places
  where s.public_visible = true and s.status in ('published', 'full') and s.start_time > now()
  order by s.start_time asc;
$$;

revoke execute on function public.admin_set_booking_status(uuid, text) from public, anon;
revoke execute on function public.admin_update_class_session(uuid, jsonb) from public, anon;
revoke execute on function public.admin_book_member_into_class(uuid, uuid, uuid) from public, anon;
revoke execute on function public.sessions_with_availability() from public;
grant execute on function public.admin_set_booking_status(uuid, text) to authenticated;
grant execute on function public.admin_update_class_session(uuid, jsonb) to authenticated;
grant execute on function public.admin_book_member_into_class(uuid, uuid, uuid) to authenticated;
grant execute on function public.sessions_with_availability() to anon, authenticated;

-- ── 10. The waitlist desk reads the whole room ──────────────────────────────
-- admin_waitlist_overview drove the "Place open · Promote next" badge from
-- member bookings alone, so a class filled by the public timetable advertised
-- every one of its places as free.
create or replace function public.admin_waitlist_overview(p_limit integer default 20)
returns table (
  session_id uuid, title text, start_time timestamptz, capacity integer,
  active_count bigint, waitlist_count bigint, spots_available integer,
  can_promote boolean, next_booking_id uuid, next_member_id uuid,
  next_full_name text, next_email text, next_phone text,
  next_booked_at timestamptz, next_available_credits bigint
) language plpgsql security definer stable set search_path = public as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  return query
  with queued_sessions as materialized (
    select s.id, s.title, s.start_time, s.capacity,
           places.held::bigint as active_count,
           places.waiting::bigint as waitlist_count
      from public.class_sessions s
      cross join lateral public.class_places_held(s.id) as places
     where s.status in ('published', 'full') and s.start_time > now()
       and places.waiting > 0
  )
  select q.id, q.title, q.start_time, q.capacity,
         q.active_count, q.waitlist_count,
         case when q.capacity is null then null
              else greatest(q.capacity - q.active_count, 0)::integer end,
         q.capacity is null or q.active_count < q.capacity,
         head.id, head.user_id, p.full_name, p.email, p.phone, head.created_at,
         coalesce((select sum(cb.remaining) from public.credit_batches cb
                    where cb.user_id = head.user_id and cb.remaining > 0
                      and (cb.expires_at is null or cb.expires_at > now())), 0)
    from queued_sessions q
    join lateral (
      select b.id, b.user_id, b.created_at
        from public.session_bookings b
       where b.class_session_id = q.id and b.status = 'waitlisted'
       order by b.created_at, b.id
       limit 1
    ) head on true
    left join public.profiles p on p.id = head.user_id
   order by (q.capacity is null or q.active_count < q.capacity) desc,
            q.start_time, q.id
   limit v_limit;
end; $$;

revoke execute on function public.admin_waitlist_overview(integer) from public, anon;
grant execute on function public.admin_waitlist_overview(integer) to authenticated;

-- ── 11. Roll call covers everyone who was in the room ───────────────────────
-- Attendance only ever touched session_bookings, then closed the class and
-- un-published it. A class filled through the public timetable therefore had no
-- attendance record at all, and its sign-ups stayed 'confirmed' forever.
-- The id arrays now address rows in either table, so the existing call shape
-- from the web and iOS is unchanged — the roll call simply has to be complete
-- across both.
alter table public.class_bookings
  add column if not exists attendance_marked_at timestamptz;
alter table public.class_bookings
  add column if not exists attendance_marked_by uuid references auth.users(id) on delete set null;

create or replace function public.admin_record_session_attendance(
  p_session_id uuid,
  p_attended_ids uuid[],
  p_no_show_ids uuid[]
)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_session_status text;
  v_start_time timestamptz;
  v_eligible_count integer;
  v_input_count integer;
  v_updated_count integer;
  v_signup_count integer;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_session_id is null then raise exception 'SESSION_REQUIRED'; end if;

  p_attended_ids := coalesce(p_attended_ids, array[]::uuid[]);
  p_no_show_ids := coalesce(p_no_show_ids, array[]::uuid[]);
  v_input_count := cardinality(p_attended_ids) + cardinality(p_no_show_ids);
  if v_input_count = 0 then raise exception 'ATTENDANCE_REQUIRED'; end if;
  if cardinality(p_attended_ids) <> (select count(distinct id) from unnest(p_attended_ids) as ids(id))
     or cardinality(p_no_show_ids) <> (select count(distinct id) from unnest(p_no_show_ids) as ids(id))
     or p_attended_ids && p_no_show_ids then
    raise exception 'DUPLICATE_BOOKING';
  end if;

  select status, start_time into v_session_status, v_start_time
    from public.class_sessions where id = p_session_id for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if v_session_status not in ('published', 'full', 'completed') then raise exception 'SESSION_NOT_OPEN_FOR_ATTENDANCE'; end if;
  if v_start_time > now() then raise exception 'SESSION_NOT_STARTED'; end if;

  -- An undecided request on either side means the room is not settled yet.
  perform 1 from public.session_bookings
    where class_session_id = p_session_id and status = 'requested'
    for update;
  if found then
    raise exception 'PENDING_BOOKING_REQUESTS';
  end if;
  perform 1 from public.class_bookings
    where class_session_id = p_session_id and status = 'requested'
    for update;
  if found then
    raise exception 'PENDING_BOOKING_REQUESTS';
  end if;

  perform 1 from public.session_bookings
    where class_session_id = p_session_id and status in ('confirmed', 'attended', 'no_show')
    for update;
  perform 1 from public.class_bookings
    where class_session_id = p_session_id and status in ('confirmed', 'attended', 'no_show')
    for update;

  select count(*) into v_eligible_count
    from public.session_bookings
    where class_session_id = p_session_id and status in ('confirmed', 'attended', 'no_show');
  select count(*) into v_signup_count
    from public.class_bookings
    where class_session_id = p_session_id and status in ('confirmed', 'attended', 'no_show');
  v_eligible_count := v_eligible_count + v_signup_count;

  if v_input_count <> v_eligible_count
     or exists (
       select 1 from unnest(p_attended_ids || p_no_show_ids) as ids(id)
       where not exists (
         select 1 from public.session_bookings b
         where b.id = ids.id and b.class_session_id = p_session_id
           and b.status in ('confirmed', 'attended', 'no_show')
       )
       and not exists (
         select 1 from public.class_bookings c
         where c.id = ids.id and c.class_session_id = p_session_id
           and c.status in ('confirmed', 'attended', 'no_show')
       )
     ) then
    raise exception 'INCOMPLETE_ROLL_CALL';
  end if;

  update public.session_bookings
     set status = case when id = any(p_attended_ids) then 'attended' else 'no_show' end,
         attendance_marked_at = now(),
         attendance_marked_by = auth.uid()
   where class_session_id = p_session_id
     and id = any(p_attended_ids || p_no_show_ids);
  get diagnostics v_updated_count = row_count;

  update public.class_bookings
     set status = case when id = any(p_attended_ids) then 'attended' else 'no_show' end,
         attendance_marked_at = now(),
         attendance_marked_by = auth.uid()
   where class_session_id = p_session_id
     and id = any(p_attended_ids || p_no_show_ids);
  get diagnostics v_signup_count = row_count;
  v_updated_count := v_updated_count + v_signup_count;

  update public.class_sessions
     set status = 'completed', public_visible = false, updated_at = now()
   where id = p_session_id;

  return v_updated_count;
end; $$;

revoke execute on function public.admin_record_session_attendance(uuid, uuid[], uuid[])
  from public, anon;
grant execute on function public.admin_record_session_attendance(uuid, uuid[], uuid[])
  to authenticated;

-- ── 12. Marking someone present before the class has started ────────────────
-- attended/no_show frees the place in every count, so pressing it on tomorrow's
-- class quietly resold the room. The roll call already refused to run early;
-- the single-row path did not.
create or replace function public.guard_booking_attendance_timing()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_start timestamptz;
begin
  if new.status in ('attended', 'no_show')
     and old.status is distinct from new.status then
    select start_time into v_start
      from public.class_sessions
     where id = new.class_session_id;
    if v_start is not null and v_start > now() then
      raise exception 'SESSION_NOT_STARTED';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_booking_attendance_timing() from public, anon, authenticated;

drop trigger if exists session_bookings_attendance_timing on public.session_bookings;
create trigger session_bookings_attendance_timing
  before update of status on public.session_bookings
  for each row execute function public.guard_booking_attendance_timing();

drop trigger if exists class_bookings_attendance_timing on public.class_bookings;
create trigger class_bookings_attendance_timing
  before update of status on public.class_bookings
  for each row execute function public.guard_booking_attendance_timing();

-- ── 13. The public form no longer has a side door ───────────────────────────
-- anon held a direct INSERT policy on class_bookings, so a visitor (or a bot)
-- could write request rows straight at the table: no class validation, no
-- capacity awareness, no contact-detail checks, and each one made XERT's own
-- domain email an address the sender chose. submit_class_signup is security
-- definer and inserts regardless of RLS, so the public path keeps working.
drop policy if exists "public_insert_class_bookings" on public.class_bookings;
revoke insert, select, update, delete on table public.class_bookings from anon;

-- ── 14. A cancelled class emails the people who were in it ─────────────────
-- The cancellation email fires from the class row's status change, but the
-- class row was updated last — after every booking had already been set to
-- 'cancelled' — so the trigger's recipient query found nobody and the purpose-
-- written "Sorry, this class is cancelled, your credit is back" email was never
-- sent. Public sign-ups were also left with a null cancelled_at while member
-- bookings got a real one, so any cancellation report undercounted by exactly
-- the public side. Only the ordering and that timestamp change here.
create or replace function public.admin_cancel_class_session(p_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_cancelled_count integer := 0;
  v_enquiry_cancelled_count integer := 0;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;

  select status into v_status
    from public.class_sessions
    where id = p_session_id
    for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if v_status = 'completed' then raise exception 'SESSION_ALREADY_COMPLETED'; end if;

  perform public.create_class_cancellation_notice(p_session_id);

  -- Cancel the class BEFORE the bookings. The cancellation email fires from
  -- the class row's status change and looks for everyone still holding a place
  -- or a request; doing this last meant it always found an empty room, so the
  -- one email written for this moment reached nobody.
  update public.class_sessions
     set status = 'cancelled', updated_at = now()
   where id = p_session_id;

  with targets as (
    select id, credit_batch_id, status as previous_status
      from public.session_bookings
     where class_session_id = p_session_id
       and status in ('requested', 'confirmed', 'waitlisted')
     for update
  ), cancelled_bookings as (
    update public.session_bookings booking
       set status = 'cancelled', cancelled_at = now()
      from targets
     where booking.id = targets.id
     returning targets.credit_batch_id as credit_batch_id,
               targets.previous_status as previous_status
  ), restored_credits as (
    update public.credit_batches credits
       set remaining = credits.remaining + refunds.credit_count
      from (
        select credit_batch_id, count(*)::integer as credit_count
          from cancelled_bookings
         where previous_status in ('requested', 'confirmed')
           and credit_batch_id is not null
         group by credit_batch_id
      ) refunds
     where credits.id = refunds.credit_batch_id
     returning credits.id
  )
  select count(*) into v_cancelled_count from cancelled_bookings;

  if to_regclass('public.class_bookings') is not null then
    execute $query$
      update public.class_bookings
         set status = 'cancelled', cancelled_at = now()
       where class_session_id = $1
         and status in ('requested', 'confirmed', 'waitlisted')
    $query$ using p_session_id;
    get diagnostics v_enquiry_cancelled_count = row_count;
  end if;

  return v_cancelled_count + v_enquiry_cancelled_count;
end;
$$;

revoke all on function public.admin_cancel_class_session(uuid) from public, anon;
grant execute on function public.admin_cancel_class_session(uuid) to authenticated;

-- ── 15. The confirmation email matches what actually happened ──────────────
-- Every new public row got the same "We got your request — we will confirm it
-- shortly" email, including the walk-up who had just taken a real, capacity-
-- limited spot. The one person whose place was genuinely held was the one told
-- it was not. The insert branch now reads the status the row was written with,
-- and the confirmed copy carries the link that releases the spot again.
create or replace function public.email_on_class_booking_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.class_sessions%rowtype;
  v_line text;
  v_name text := public.email_first_name(new.full_name);
  v_release text;
begin
  select * into v_session from public.class_sessions where id = new.class_session_id;
  if new.email is null or v_session.id is null then return new; end if;
  v_line := public.email_class_line(v_session);
  v_release := 'https://xertfitness.com.au/timetable/release?token=' || new.cancel_token::text;

  if tg_op = 'INSERT' then
    if new.status = 'confirmed' then
      perform public.queue_email('booking_decisions', new.email, 'You are booked in: ' || coalesce(v_session.title, 'XERT class'),
        public.email_layout('You are booked in', '<p>Hi ' || v_name || ',</p><p>Your place is confirmed for:</p><p><strong>' || v_line || '</strong></p><p>See you there. If you cannot make it, please release your spot so someone else can take it.</p>', 'Release my spot', v_release),
        null, 'class_bookings', new.id::text);
      perform public.email_owner_alert('owner_alerts', 'Spot taken: ' || coalesce(new.full_name, new.email),
        '<p>' || coalesce(new.full_name, new.email) || ' (' || new.email || coalesce(', ' || nullif(new.phone, ''), '') || ') took a place in:</p><p><strong>' || v_line || '</strong></p><p>This is a confirmed sign-up, not a request — the place is held.</p>',
        'class_bookings', new.id::text);
    else
      perform public.queue_email('enquiry_acknowledgements', new.email, 'We got your request: ' || coalesce(v_session.title, 'XERT class'),
        public.email_layout('Thanks, we have your request', '<p>Hi ' || v_name || ',</p><p>You asked for a place in:</p><p><strong>' || v_line || '</strong></p><p>No spot is held yet — we will confirm it shortly. Keep an eye on your inbox.</p>', null, null),
        null, 'class_bookings', new.id::text);
      perform public.email_owner_alert('owner_alerts', 'New class request: ' || coalesce(new.full_name, new.email),
        '<p>' || coalesce(new.full_name, new.email) || ' (' || new.email || coalesce(', ' || nullif(new.phone, ''), '') || ') asked for a place in:</p><p><strong>' || v_line || '</strong></p>',
        'class_bookings', new.id::text);
    end if;
    return new;
  end if;

  if new.status is not distinct from old.status then return new; end if;
  if new.status = 'confirmed' then
    perform public.queue_email('booking_decisions', new.email, 'You are booked in: ' || coalesce(v_session.title, 'XERT class'),
      public.email_layout('You are booked in', '<p>Hi ' || v_name || ',</p><p>Your place is confirmed for:</p><p><strong>' || v_line || '</strong></p><p>See you there. If you cannot make it, please release your spot so someone else can take it.</p>', 'Release my spot', v_release),
      null, 'class_bookings', new.id::text);
  elsif new.status = 'waitlisted' then
    perform public.queue_email('booking_decisions', new.email, 'You are on the waitlist: ' || coalesce(v_session.title, 'XERT class'),
      public.email_layout('You are on the waitlist', '<p>Hi ' || v_name || ',</p><p>That class is full for now, so you are on the waitlist for:</p><p><strong>' || v_line || '</strong></p><p>We will email you if a place opens up.</p>', null, null),
      null, 'class_bookings', new.id::text);
  elsif new.status = 'declined' then
    perform public.queue_email('booking_decisions', new.email, 'About your request: ' || coalesce(v_session.title, 'XERT class'),
      public.email_layout('We could not fit you in this time', '<p>Hi ' || v_name || ',</p><p>We were not able to confirm your request for:</p><p><strong>' || v_line || '</strong></p><p>Have a look at the timetable for another session.</p>', 'See the timetable', 'https://xertfitness.com.au/timetable'),
      null, 'class_bookings', new.id::text);
  elsif new.status = 'cancelled' then
    perform public.queue_email('booking_cancellations', new.email, 'Request cancelled: ' || coalesce(v_session.title, 'XERT class'),
      public.email_layout('Your request was cancelled', '<p>Hi ' || v_name || ',</p><p>Your request has been cancelled for:</p><p><strong>' || v_line || '</strong></p><p>Reply to this email if that is not right.</p>', 'See the timetable', 'https://xertfitness.com.au/timetable'),
      null, 'class_bookings', new.id::text);
  end if;
  return new;
end;
$$;

drop trigger if exists email_on_class_booking_change on public.class_bookings;
create trigger email_on_class_booking_change
  after insert or update of status on public.class_bookings
  for each row execute function public.email_on_class_booking_change();

-- ── 16. The day desk counts the whole room ─────────────────────────────────
-- admin_daily_operations reported confirmed places from session_bookings alone
-- and counted only 'requested' public rows, so an instant_book class the
-- timetable had filled read as "0 confirmed / 8 capacity" on the owner's phone
-- — and attendance_due, which requires a confirmed count, never fired for it,
-- so the class could not be marked off either.
drop function if exists public.admin_daily_operations();
create function public.admin_daily_operations()
returns table (
  session_id uuid,
  title text,
  class_type text,
  start_time timestamptz,
  end_time timestamptz,
  status text,
  capacity integer,
  coach_name text,
  location_zone text,
  booking_mode text,
  requested_count bigint,
  confirmed_count bigint,
  waitlist_count bigint,
  attended_count bigint,
  no_show_count bigint,
  public_request_count bigint,
  public_confirmed_count bigint,
  public_waitlist_count bigint,
  places_held bigint,
  attendance_due boolean
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_local_day date := (now() at time zone 'Australia/Brisbane')::date;
  v_day_start timestamptz;
  v_day_end timestamptz;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;

  v_day_start := v_local_day::timestamp at time zone 'Australia/Brisbane';
  v_day_end := (v_local_day + 1)::timestamp at time zone 'Australia/Brisbane';

  return query
  select
    s.id,
    s.title,
    s.class_type,
    s.start_time,
    s.end_time,
    s.status,
    s.capacity,
    s.coach_name,
    s.location_zone,
    s.booking_mode,
    coalesce(member_counts.requested_count, 0),
    coalesce(member_counts.confirmed_count, 0),
    coalesce(member_counts.waitlist_count, 0),
    coalesce(member_counts.attended_count, 0),
    coalesce(member_counts.no_show_count, 0),
    coalesce(public_counts.request_count, 0),
    coalesce(public_counts.confirmed_count, 0),
    coalesce(public_counts.waitlist_count, 0),
    -- The same definition of a held place the rest of the system uses.
    coalesce(member_counts.requested_count, 0)
      + coalesce(member_counts.confirmed_count, 0)
      + coalesce(public_counts.confirmed_count, 0),
    s.start_time <= now()
      and s.status in ('published', 'full', 'completed')
      and (
        coalesce(member_counts.confirmed_count, 0)
          + coalesce(public_counts.confirmed_count, 0)
          + coalesce(member_counts.attended_count, 0)
          + coalesce(member_counts.no_show_count, 0)
          + coalesce(public_counts.marked_count, 0)
      ) > 0
  from public.class_sessions s
  left join lateral (
    select
      count(*) filter (where b.status = 'requested') as requested_count,
      count(*) filter (where b.status = 'confirmed') as confirmed_count,
      count(*) filter (where b.status = 'waitlisted') as waitlist_count,
      count(*) filter (where b.status = 'attended') as attended_count,
      count(*) filter (where b.status = 'no_show') as no_show_count
    from public.session_bookings b
    where b.class_session_id = s.id
  ) member_counts on true
  left join lateral (
    select
      count(*) filter (where r.status = 'requested') as request_count,
      count(*) filter (where r.status = 'confirmed') as confirmed_count,
      count(*) filter (where r.status = 'waitlisted') as waitlist_count,
      count(*) filter (where r.status in ('attended', 'no_show')) as marked_count
    from public.class_bookings r
    where r.class_session_id = s.id
  ) public_counts on true
  where s.start_time >= v_day_start
    and s.start_time < v_day_end
    and s.status <> 'draft'
  order by s.start_time, s.id
  limit 50;
end;
$$;

revoke execute on function public.admin_daily_operations() from public, anon;
grant execute on function public.admin_daily_operations() to authenticated;

comment on function public.admin_daily_operations() is
  'One Brisbane day of class workload, counting member bookings and public timetable sign-ups alike.';

insert into public.xert_schema_capabilities (capability)
values ('booking_integrity_overhaul')
on conflict (capability) do update set installed_at = excluded.installed_at;
