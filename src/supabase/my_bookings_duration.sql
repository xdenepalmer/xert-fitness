-- Gives the client the same booking length the conflict trigger uses.
--
-- enforce_booking_time_conflict (20260714002000) derives the end of a booked
-- class as:
--
--   coalesce(session.end_time,
--            session.start_time + make_interval(mins => greatest(coalesce(session.duration_minutes, 60), 1)))
--
-- The client computes the same thing in src/lib/bookingUi.js to decide whether
-- to disable the Book button, but my_bookings() never returned
-- duration_minutes, so for an existing booking with a null end_time it fell
-- back to a flat 60 minutes. sessions_with_availability already returns the
-- column, so the two sides of the same comparison disagreed. A 90-minute class
-- with no explicit end time was treated as 60, letting the client offer a
-- booking the trigger then rejected with BOOKING_TIME_CONFLICT; a 45-minute one
-- was treated as 60, disabling the button for a booking the server would have
-- accepted.
--
-- The column is appended after intensity_level and before waitlist_position;
-- callers read by name, and the returns-table change requires the drop.

drop function if exists public.my_bookings();
create function public.my_bookings()
returns table (
  booking_id uuid, status text, booked_at timestamptz, cancelled_at timestamptz,
  session_id uuid, title text, class_type text, coach_name text,
  start_time timestamptz, end_time timestamptz, duration_minutes integer,
  location_zone text, intensity_level text,
  waitlist_position bigint
) language sql security definer stable set search_path = public as $$
  select b.id, b.status, b.created_at, b.cancelled_at,
         s.id, s.title, s.class_type, s.coach_name,
         s.start_time, s.end_time, s.duration_minutes, s.location_zone, s.intensity_level,
         case when b.status = 'waitlisted' then (
           select count(*) + 1
           from public.session_bookings earlier
           where earlier.class_session_id = b.class_session_id
             and earlier.status = 'waitlisted'
             and (earlier.created_at, earlier.id) < (b.created_at, b.id)
         ) end as waitlist_position
  from public.session_bookings b
  join public.class_sessions s on s.id = b.class_session_id
  where b.user_id = auth.uid()
  order by s.start_time desc;
$$;
revoke execute on function public.my_bookings() from public, anon;
grant execute on function public.my_bookings() to authenticated;

insert into public.xert_schema_capabilities (capability)
values ('my_bookings_duration') on conflict (capability) do nothing;
