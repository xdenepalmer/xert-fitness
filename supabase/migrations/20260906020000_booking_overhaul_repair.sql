-- Repairs for the booking integrity overhaul, found by auditing it against the
-- live database while the matching frontend was still undeployed.
--
-- The overhaul assumed its own frontend. It is not deployed yet, the iOS app on
-- people's phones is older still, and two of its new guards therefore landed on
-- clients that cannot satisfy them. A migration that only works against code
-- that has not shipped is a migration that breaks a gym.
--
-- Idempotent and safe to re-run.

-- ── 1. The roll call stopped accepting the roll calls anyone can actually send ──
-- The overhaul made public sign-ups part of the room — correctly — and then
-- required every roll call to account for them. The deployed web roll call and
-- every installed phone build their list from the member roster alone, so any
-- class holding a confirmed timetable sign-up answered INCOMPLETE_ROLL_CALL and
-- could not be closed at all.
--
-- Worse, it also refused to run while any class_bookings row sat at 'requested'.
-- That is not a transient state: submit_class_signup writes 'requested' for
-- every interest_only class, every request_to_book class, and every class at all
-- while bookings are paused — which is right now. One person registering
-- interest would have frozen that class's attendance permanently.
--
-- The rule that matters is unchanged: every member booking must be marked,
-- because each one holds a credit that attendance settles. Public sign-ups are
-- marked when the client sends them and left alone when it cannot.
create or replace function public.admin_record_session_attendance(
  p_session_id uuid,
  p_attended_ids uuid[],
  p_no_show_ids uuid[]
)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_session_status text;
  v_start_time timestamptz;
  v_member_eligible integer;
  v_member_marked integer;
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

  -- An undecided MEMBER request still blocks: it is holding a credit that this
  -- roll call is about to settle. A pending public enquiry does not, because it
  -- holds nothing and may sit there for weeks by design.
  perform 1 from public.session_bookings
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

  -- Every id sent must be a real, markable row in one of the two tables.
  if exists (
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

  -- Completeness is measured over the member side only, which every client can
  -- see. A client that also sends its public sign-ups gets them marked; one
  -- that cannot still closes the class.
  select count(*) into v_member_eligible
    from public.session_bookings
   where class_session_id = p_session_id and status in ('confirmed', 'attended', 'no_show');
  select count(*) into v_member_marked
    from public.session_bookings
   where class_session_id = p_session_id
     and status in ('confirmed', 'attended', 'no_show')
     and id = any(p_attended_ids || p_no_show_ids);
  if v_member_marked <> v_member_eligible then
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

-- ── 2. The phone in the owner's pocket can register interest again ──────────
-- The overhaul closed anon's direct INSERT on class_bookings so the public form
-- had to go through the validated RPC. The web build that does that is not
-- deployed, and the iOS build that does it is not written to the App Store yet
-- — so on every installed phone "Register interest" simply failed. During a soft
-- launch that is the only enquiry path a phone has.
--
-- The policy is restored exactly as it was: a row may only be created as
-- 'requested' and only with consent. A 'requested' row holds no place, so this
-- cannot oversell anything — the capacity guards the overhaul added all still
-- stand. Drop it again once the new iOS build has shipped.
drop policy if exists "public_insert_class_bookings" on public.class_bookings;
create policy "public_insert_class_bookings" on public.class_bookings
  for insert to anon, authenticated
  with check (status = 'requested' and consent_to_contact is true);

grant insert on table public.class_bookings to anon;

comment on policy "public_insert_class_bookings" on public.class_bookings is
  'Temporary: keeps the shipped iOS build''s Register interest working. Remove once every client submits through submit_class_signup.';

-- ── 3. One cancellation, one email ──────────────────────────────────────────
-- The overhaul moved the class row's status change ahead of the booking updates
-- so the class-cancellation email would find the people it is written for. It
-- does now — but the per-booking triggers still fire afterwards, so everyone
-- gets the good email ("Sorry, this class is cancelled, your credit is back")
-- and then, seconds later, one that reads as though they cancelled it
-- themselves and invites them to reply asking what happened.
--
-- The per-booking notice is suppressed when the class itself is the thing being
-- cancelled. Both triggers already load the class row, so this costs nothing.
-- Inline escaping for anything a stranger typed. email_body_html escapes too,
-- but it wraps its output in paragraphs, so it cannot be spliced mid-sentence.
create or replace function public.email_escape(p_text text)
returns text
language sql
immutable
as $$
  select replace(replace(replace(replace(replace(
    coalesce(p_text, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;');
$$;

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
  -- Everything below this line was typed by a stranger into a public form and
  -- is about to be concatenated into HTML that lands in the owner's inbox.
  v_who text := public.email_escape(coalesce(new.full_name, new.email));
  v_email text := public.email_escape(new.email);
  v_phone text := public.email_escape(nullif(new.phone, ''));
begin
  select * into v_session from public.class_sessions where id = new.class_session_id;
  if new.email is null or v_session.id is null then return new; end if;
  -- The class-cancellation email already tells this person what happened.
  if v_session.status = 'cancelled' and new.status = 'cancelled' then return new; end if;
  v_line := public.email_class_line(v_session);
  v_release := 'https://xertfitness.com.au/timetable/release?token=' || new.cancel_token::text;
  v_name := public.email_escape(v_name);

  if tg_op = 'INSERT' then
    if new.status = 'confirmed' then
      perform public.queue_email('booking_decisions', new.email, 'You are booked in: ' || coalesce(v_session.title, 'XERT class'),
        public.email_layout('You are booked in', '<p>Hi ' || v_name || ',</p><p>Your place is confirmed for:</p><p><strong>' || v_line || '</strong></p><p>See you there. If you cannot make it, please release your spot so someone else can take it.</p>', 'Release my spot', v_release),
        null, 'class_bookings', new.id::text);
      perform public.email_owner_alert('owner_alerts', 'Spot taken: ' || coalesce(new.full_name, new.email),
        '<p>' || v_who || ' (' || v_email || coalesce(', ' || v_phone, '') || ') took a place in:</p><p><strong>' || v_line || '</strong></p><p>This is a confirmed sign-up, not a request — the place is held.</p>',
        'class_bookings', new.id::text);
    else
      perform public.queue_email('enquiry_acknowledgements', new.email, 'We got your request: ' || coalesce(v_session.title, 'XERT class'),
        public.email_layout('Thanks, we have your request', '<p>Hi ' || v_name || ',</p><p>You asked for a place in:</p><p><strong>' || v_line || '</strong></p><p>No spot is held yet — we will confirm it shortly. Keep an eye on your inbox.</p>', null, null),
        null, 'class_bookings', new.id::text);
      perform public.email_owner_alert('owner_alerts', 'New class request: ' || coalesce(new.full_name, new.email),
        '<p>' || v_who || ' (' || v_email || coalesce(', ' || v_phone, '') || ') asked for a place in:</p><p><strong>' || v_line || '</strong></p>',
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


-- The member half of the same double email.
create or replace function public.email_on_session_booking_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_session public.class_sessions%rowtype;
  v_line text;
  v_name text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return new; end if;
  select * into v_profile from public.profiles where id = new.user_id;
  select * into v_session from public.class_sessions where id = new.class_session_id;
  -- The class-cancellation email already tells this member what happened and
  -- that their credit is back. Without this they also get one that reads as
  -- though they cancelled it themselves and invites them to reply asking why.
  if v_session.status = 'cancelled' and new.status = 'cancelled' then return new; end if;
  if v_profile.email is null or v_session.id is null then return new; end if;
  v_line := public.email_class_line(v_session);
  v_name := public.email_first_name(v_profile.full_name);

  if tg_op = 'INSERT' then
    if new.status = 'requested' then
      perform public.email_owner_alert('owner_alerts', 'New class request: ' || coalesce(v_profile.full_name, v_profile.email),
        '<p>' || coalesce(v_profile.full_name, v_profile.email) || ' has asked for a place in:</p><p><strong>' || v_line || '</strong></p><p>Confirm or decline it under Classes → Class requests.</p>',
        'session_bookings', new.id::text);
    elsif new.status = 'confirmed' then
      perform public.queue_email('booking_decisions', v_profile.email, 'You are booked in: ' || coalesce(v_session.title, 'XERT class'),
        public.email_layout('You are booked in', '<p>Hi ' || v_name || ',</p><p>Your place is confirmed for:</p><p><strong>' || v_line || '</strong></p><p>See you there.</p>', 'View my bookings', 'https://xertfitness.com.au/account'),
        null, 'session_bookings', new.id::text);
    end if;
    return new;
  end if;

  if new.status = 'confirmed' then
    perform public.queue_email('booking_decisions', v_profile.email, 'You are booked in: ' || coalesce(v_session.title, 'XERT class'),
      public.email_layout('You are booked in', '<p>Hi ' || v_name || ',</p><p>Your place is confirmed for:</p><p><strong>' || v_line || '</strong></p><p>See you there.</p>', 'View my bookings', 'https://xertfitness.com.au/account'),
      null, 'session_bookings', new.id::text);
  elsif new.status = 'waitlisted' then
    perform public.queue_email('booking_decisions', v_profile.email, 'You are on the waitlist: ' || coalesce(v_session.title, 'XERT class'),
      public.email_layout('You are on the waitlist', '<p>Hi ' || v_name || ',</p><p>That class is full for now, so we have added you to the waitlist for:</p><p><strong>' || v_line || '</strong></p><p>We will email you the moment a place opens up.</p>', 'View my bookings', 'https://xertfitness.com.au/account'),
      null, 'session_bookings', new.id::text);
  elsif new.status = 'declined' then
    perform public.queue_email('booking_decisions', v_profile.email, 'About your request: ' || coalesce(v_session.title, 'XERT class'),
      public.email_layout('We could not fit you in this time', '<p>Hi ' || v_name || ',</p><p>We were not able to confirm your request for:</p><p><strong>' || v_line || '</strong></p><p>Any credit you reserved has been returned. Have a look at the timetable for another session.</p>', 'See the timetable', 'https://xertfitness.com.au/timetable'),
      null, 'session_bookings', new.id::text);
  elsif new.status = 'cancelled' then
    perform public.queue_email('booking_cancellations', v_profile.email, 'Booking cancelled: ' || coalesce(v_session.title, 'XERT class'),
      public.email_layout('Your booking was cancelled', '<p>Hi ' || v_name || ',</p><p>Your booking has been cancelled for:</p><p><strong>' || v_line || '</strong></p><p>If that was not you, reply to this email and we will sort it out.</p>', 'Book another class', 'https://xertfitness.com.au/booking'),
      null, 'session_bookings', new.id::text);
  end if;
  return new;
end;
$$;

drop trigger if exists email_on_session_booking_change on public.session_bookings;
create trigger email_on_session_booking_change
  after insert or update of status on public.session_bookings
  for each row execute function public.email_on_session_booking_change();

-- ── 4. "Join the waitlist" means something ─────────────────────────────────
-- The overhaul offered a full class's visitor a waitlist and then wrote them a
-- plain 'requested' row — indistinguishable from an ordinary enquiry, sitting
-- in the same queue, with no position and nothing anywhere calling it a
-- waitlist. The person was promised a queue that existed only in the copy.
--
-- An explicit waitlist join is now stored as 'waitlisted', which the roster
-- panel already groups and orders by sign-up time, so the owner can see who is
-- next and the promise is one the Command Centre can keep. It still holds no
-- place, and the duplicate check now covers it too.
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

  -- 'waitlisted' counts as already signed up: joining a queue twice is the same
  -- mistake as signing up twice, and it made the queue position meaningless.
  if exists (
    select 1
      from public.class_bookings existing
     where existing.class_session_id = p_session_id
       and lower(btrim(existing.email)) = v_email
       and existing.status in ('requested', 'confirmed', 'waitlisted')
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
    -- An explicit "let me know if a place frees up". Holds no spot, but lands
    -- in a queue the Command Centre can see and work through in order.
    v_row_status := 'waitlisted';
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
    'waitlisted', v_row_status = 'waitlisted',
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

-- ── 5. Promoting from a full class's waitlist works ────────────────────────
-- The overhaul taught the waitlist desk about classes marked 'full' but left
-- the promotion path accepting only 'published'. The desk therefore offered
-- "Promote next" on exactly the classes most likely to have a queue, and every
-- press answered SESSION_NOT_BOOKABLE. Only that one condition changes here;
-- the credit handling, the FIFO order and the notice are untouched.
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

revoke execute on function public.admin_set_booking_status(uuid, text) from public, anon;
grant execute on function public.admin_set_booking_status(uuid, text) to authenticated;

insert into public.xert_schema_capabilities (capability)
values ('booking_overhaul_repair')
on conflict (capability) do update set installed_at = excluded.installed_at;
