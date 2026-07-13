-- Transactional admin class editing. Terminal lifecycle changes must use the
-- dedicated cancellation/attendance functions, and capacity can never be
-- reduced below the number of active credit-backed bookings.

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

  select count(*)::integer into v_active_bookings
  from public.session_bookings
  where class_session_id = p_session_id
    and status in ('requested', 'confirmed');

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

revoke execute on function public.admin_update_class_session(uuid, jsonb) from public, anon;
grant execute on function public.admin_update_class_session(uuid, jsonb) to authenticated;

create table if not exists public.xert_schema_capabilities (
  capability text primary key,
  installed_at timestamptz not null default now()
);
alter table public.xert_schema_capabilities enable row level security;
drop policy if exists "xert_schema_capabilities_admin_read" on public.xert_schema_capabilities;
create policy "xert_schema_capabilities_admin_read" on public.xert_schema_capabilities
  for select to authenticated using (public.is_admin());
insert into public.xert_schema_capabilities (capability)
values ('class_session_update_guard') on conflict (capability) do nothing;

create or replace function public.xert_public_capabilities()
returns table (capability text)
language sql security definer stable set search_path = public as $$
  select c.capability from public.xert_schema_capabilities c order by c.capability;
$$;
revoke execute on function public.xert_public_capabilities() from public;
grant execute on function public.xert_public_capabilities() to anon, authenticated;
