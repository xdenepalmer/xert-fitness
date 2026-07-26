-- Class session edits require the caller's loaded updated_at so concurrent
-- administrators cannot silently overwrite each other's schedule changes.
--
-- admin_update_class_session(uuid, jsonb) already guarded terminal lifecycle
-- and capacity-below-active-bookings, but it never compared versions: a second
-- save with a stale form rewrote every column, including fields the second
-- admin never intended to change (coach, start time, etc.).
--
-- Mirror of catalog_optimistic_locking for products/events: add
-- p_expected_updated_at, raise SESSION_STALE on mismatch, and revoke the
-- unguarded two-argument overload so PostgREST cannot resolve an omit to it.

drop function if exists public.admin_update_class_session(uuid, jsonb, timestamptz);
create function public.admin_update_class_session(
  p_session_id uuid,
  p_session jsonb,
  p_expected_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current public.class_sessions%rowtype;
  v_active_bookings integer;
  v_update record;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_session_id is null then raise exception 'SESSION_REQUIRED'; end if;
  if p_session is null then raise exception 'SESSION_PAYLOAD_REQUIRED'; end if;
  if p_expected_updated_at is null then raise exception 'SESSION_VERSION_REQUIRED'; end if;

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

  select * into v_current
  from public.class_sessions
  where id = p_session_id
  for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;

  if v_current.updated_at is distinct from p_expected_updated_at then
    raise exception 'SESSION_STALE';
  end if;

  if v_current.status in ('cancelled', 'completed')
     and v_update.status <> v_current.status then
    raise exception 'TERMINAL_SESSION_IMMUTABLE';
  end if;
  if v_update.status = 'cancelled' and v_current.status <> 'cancelled' then
    raise exception 'USE_CANCELLATION_WORKFLOW';
  end if;
  if v_update.status = 'completed' and v_current.status <> 'completed' then
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
  where id = p_session_id
    and updated_at = p_expected_updated_at;
  if not found then raise exception 'SESSION_STALE'; end if;

  return p_session_id;
end;
$$;

revoke execute on function public.admin_update_class_session(uuid, jsonb, timestamptz) from public, anon;
grant execute on function public.admin_update_class_session(uuid, jsonb, timestamptz) to authenticated;
do $$
begin
  if to_regprocedure('public.admin_update_class_session(uuid, jsonb)') is not null then
    revoke execute on function public.admin_update_class_session(uuid, jsonb)
      from public, anon, authenticated;
  end if;
end;
$$;

insert into public.xert_schema_capabilities (capability)
values ('class_session_optimistic_locking')
on conflict (capability) do nothing;
