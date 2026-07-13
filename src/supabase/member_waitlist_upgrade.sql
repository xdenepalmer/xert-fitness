-- Self-service waitlist joining for full classes.
-- Idempotent and safe to run after booking_modes_upgrade.sql.

create or replace function public.join_session_waitlist(p_session_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_capacity integer;
  v_start timestamptz;
  v_status text;
  v_mode text;
  v_booked integer;
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
  if exists (
    select 1 from public.session_bookings
    where user_id = v_user and class_session_id = p_session_id
      and status in ('requested', 'confirmed', 'waitlisted')
  ) then raise exception 'ALREADY_BOOKED'; end if;
  if v_capacity is null then raise exception 'SESSION_HAS_CAPACITY'; end if;
  select count(*) into v_booked from public.session_bookings
    where class_session_id = p_session_id and status in ('requested', 'confirmed');
  if v_booked < v_capacity then raise exception 'SESSION_HAS_CAPACITY'; end if;
  insert into public.session_bookings (user_id, class_session_id, credit_batch_id, status)
  values (v_user, p_session_id, null, 'waitlisted') returning id into v_booking;
  return v_booking;
end; $$;

revoke execute on function public.join_session_waitlist(uuid) from public, anon;
grant execute on function public.join_session_waitlist(uuid) to authenticated;

create table if not exists public.xert_schema_capabilities (
  capability text primary key,
  installed_at timestamptz not null default now()
);
insert into public.xert_schema_capabilities (capability)
values ('member_waitlist_join') on conflict (capability) do nothing;
