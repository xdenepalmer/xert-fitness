-- Public class_bookings inserts only checked status='requested' and consent.
-- Nothing rejected a request against a class whose start_time was already in
-- the past, so the public /timetable "Request spot" path (and any direct
-- PostgREST insert) could create live admin queue rows for finished classes.
--
-- Member booking via book_session / sessions_with_availability already filters
-- start_time > now(); this trigger brings the legacy class_bookings path in
-- line. Admins writing through service role or SECURITY DEFINER helpers are
-- unaffected when they update existing rows — this is BEFORE INSERT only.

create or replace function public.guard_class_booking_session_is_upcoming()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
  v_status text;
begin
  if new.class_session_id is null then
    raise exception 'CLASS_SESSION_REQUIRED';
  end if;

  select start_time, status
    into v_start, v_status
  from public.class_sessions
  where id = new.class_session_id;

  if not found then
    raise exception 'CLASS_SESSION_NOT_FOUND';
  end if;

  if v_status is distinct from 'published' then
    raise exception 'CLASS_SESSION_NOT_BOOKABLE';
  end if;

  if v_start is null or v_start <= now() then
    raise exception 'CLASS_SESSION_IN_PAST';
  end if;

  return new;
end;
$$;

drop trigger if exists class_bookings_require_upcoming_session on public.class_bookings;
create trigger class_bookings_require_upcoming_session
  before insert on public.class_bookings
  for each row execute function public.guard_class_booking_session_is_upcoming();

revoke execute on function public.guard_class_booking_session_is_upcoming() from public, anon, authenticated;

insert into public.xert_schema_capabilities (capability)
values ('reject_past_class_booking_requests') on conflict (capability) do nothing;
