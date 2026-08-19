-- Public per-class sign-ups: register interest vs taking a real spot.
--
-- Until now the public timetable had one behaviour for every class: an
-- anonymous "Request spot" insert into class_bookings that took no place and
-- checked no capacity, while class_sessions.booking_mode was ignored entirely
-- by the public site. Real capacity only existed for signed-in members holding
-- credits (session_bookings + book_session), which is the wrong shape for a
-- soft launch where payments and memberships live in Fitbox.
--
-- This adds one entry point, submit_class_signup, that honours the class's own
-- booking_mode:
--   interest_only    -> records interest, takes no spot
--   request_to_book  -> records a request for staff to confirm, takes no spot
--   instant_book     -> takes a real spot, capacity-limited and first-come
--
-- Spot-taking is serialised by locking the class_sessions row, so two people
-- pressing Sign up at the same instant can never both take the last place.
-- Contact details are mandatory: a spot is only held once the person is
-- reachable.

-- One active sign-up per email address per class. Created defensively so the
-- migration still applies if legacy rows already contain duplicates.
do $$
begin
  create unique index class_bookings_active_signup_per_email
    on public.class_bookings (class_session_id, lower(btrim(email)))
    where status in ('requested', 'confirmed');
exception
  when duplicate_table then null;
  when unique_violation then
    raise notice 'class_bookings already contains duplicate active sign-ups; skipping unique index.';
end;
$$;

create or replace function public.submit_class_signup(
  p_session_id uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_consent boolean default false,
  p_training_level text default null,
  p_notes text default null
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
  v_row_status text;
  v_id uuid;
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
  if v_status <> 'published' or v_public is not true then
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

  -- A place is held by a confirmed public sign-up or by any active member
  -- booking, so the two paths cannot oversell the same room.
  select count(*)
    into v_taken
    from (
      select 1
        from public.session_bookings member_booking
       where member_booking.class_session_id = p_session_id
         and member_booking.status in ('requested', 'confirmed')
      union all
      select 1
        from public.class_bookings public_signup
       where public_signup.class_session_id = p_session_id
         and public_signup.status = 'confirmed'
    ) held;

  if v_mode = 'instant_book' then
    if v_capacity is not null and v_taken >= v_capacity then
      raise exception 'CLASS_FULL';
    end if;
    v_row_status := 'confirmed';
  else
    v_row_status := 'requested';
  end if;

  insert into public.class_bookings (
    class_session_id, full_name, email, phone, training_level, notes, consent_to_contact, status
  )
  values (
    p_session_id, v_name, v_email, v_phone, v_level, v_notes, true, v_row_status
  )
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'status', v_row_status,
    'booking_mode', v_mode,
    'took_spot', v_row_status = 'confirmed',
    'spots_left', case
      when v_capacity is null then null
      else greatest(v_capacity - (v_taken + (case when v_row_status = 'confirmed' then 1 else 0 end)), 0)
    end
  );
end;
$$;

revoke execute on function public.submit_class_signup(uuid, text, text, text, boolean, text, text) from public;
grant execute on function public.submit_class_signup(uuid, text, text, text, boolean, text, text) to anon, authenticated;

-- Live remaining places for the public timetable. class_bookings is
-- insert-only for anonymous visitors, so the counts have to come from a
-- definer function rather than a direct select.
create or replace function public.public_class_availability()
returns table (
  class_session_id uuid,
  booking_mode text,
  capacity integer,
  taken integer,
  spots_left integer
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    session.id as class_session_id,
    coalesce(session.booking_mode, 'request_to_book') as booking_mode,
    session.capacity,
    (
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
      ), 0)
    )::integer as taken,
    case
      when session.capacity is null then null
      else greatest(
        session.capacity - (
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
          ), 0)
        ),
        0
      )::integer
    end as spots_left
  from public.class_sessions session
  where session.public_visible = true
    and session.status = 'published';
$$;

revoke execute on function public.public_class_availability() from public;
grant execute on function public.public_class_availability() to anon, authenticated;
