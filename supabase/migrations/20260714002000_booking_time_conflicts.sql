-- Prevent members from holding two active class places at the same time.
-- The advisory lock serialises otherwise independent session transactions for
-- one member, while the class-session trigger protects admin reschedules.

do $$
begin
  if exists (
    with active as (
      select booking.id, booking.user_id, session.start_time,
             coalesce(
               session.end_time,
               session.start_time + make_interval(mins => greatest(coalesce(session.duration_minutes, 60), 1))
             ) as end_time
      from public.session_bookings as booking
      join public.class_sessions as session on session.id = booking.class_session_id
      where booking.status in ('requested', 'confirmed')
    )
    select 1
    from active as first_booking
    join active as second_booking
      on second_booking.user_id = first_booking.user_id
     and second_booking.id > first_booking.id
    where first_booking.start_time < second_booking.end_time
      and first_booking.end_time > second_booking.start_time
  ) then
    raise exception 'EXISTING_BOOKING_TIME_CONFLICTS';
  end if;
end;
$$;

create or replace function public.enforce_booking_time_conflict()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
  v_duration integer;
begin
  if new.status not in ('requested', 'confirmed') then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));

  select session.start_time, session.end_time, session.duration_minutes
    into v_start, v_end, v_duration
  from public.class_sessions as session
  where session.id = new.class_session_id;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;

  v_end := coalesce(
    v_end,
    v_start + make_interval(mins => greatest(coalesce(v_duration, 60), 1))
  );

  if exists (
    select 1
    from public.session_bookings as booking
    join public.class_sessions as session on session.id = booking.class_session_id
    where booking.user_id = new.user_id
      and booking.id is distinct from new.id
      and booking.status in ('requested', 'confirmed')
      and session.start_time < v_end
      and coalesce(
        session.end_time,
        session.start_time + make_interval(mins => greatest(coalesce(session.duration_minutes, 60), 1))
      ) > v_start
  ) then
    raise exception 'BOOKING_TIME_CONFLICT';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_booking_time_conflict() from public, anon, authenticated;
drop trigger if exists session_bookings_time_conflict_guard on public.session_bookings;
create trigger session_bookings_time_conflict_guard
  before insert or update of user_id, class_session_id, status
  on public.session_bookings
  for each row execute function public.enforce_booking_time_conflict();

create or replace function public.enforce_session_reschedule_conflicts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_end timestamptz;
begin
  if new.start_time is not distinct from old.start_time
    and new.end_time is not distinct from old.end_time
    and new.duration_minutes is not distinct from old.duration_minutes then
    return new;
  end if;

  v_end := coalesce(
    new.end_time,
    new.start_time + make_interval(mins => greatest(coalesce(new.duration_minutes, 60), 1))
  );

  for v_user in
    select distinct booking.user_id
    from public.session_bookings as booking
    where booking.class_session_id = new.id
      and booking.status in ('requested', 'confirmed')
    order by booking.user_id
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

    if exists (
      select 1
      from public.session_bookings as booking
      join public.class_sessions as session on session.id = booking.class_session_id
      where booking.user_id = v_user
        and booking.class_session_id <> new.id
        and booking.status in ('requested', 'confirmed')
        and session.start_time < v_end
        and coalesce(
          session.end_time,
          session.start_time + make_interval(mins => greatest(coalesce(session.duration_minutes, 60), 1))
        ) > new.start_time
    ) then
      raise exception 'SESSION_TIME_CONFLICTS_WITH_MEMBER_BOOKING';
    end if;
  end loop;

  return new;
end;
$$;

revoke execute on function public.enforce_session_reschedule_conflicts() from public, anon, authenticated;
drop trigger if exists class_sessions_reschedule_conflict_guard on public.class_sessions;
create trigger class_sessions_reschedule_conflict_guard
  before update of start_time, end_time, duration_minutes
  on public.class_sessions
  for each row execute function public.enforce_session_reschedule_conflicts();

insert into public.xert_schema_capabilities (capability)
values ('booking_time_conflict_guard')
on conflict (capability) do nothing;
