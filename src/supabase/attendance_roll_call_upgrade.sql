-- Transactional class roll call with staff audit metadata.
-- Idempotent and safe to re-run after booking_schema.sql and admin_cms_schema.sql.

alter table public.session_bookings
  add column if not exists attendance_marked_at timestamptz,
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

  perform 1 from public.session_bookings
    where class_session_id = p_session_id and status in ('confirmed', 'attended', 'no_show')
    for update;
  select count(*) into v_eligible_count
    from public.session_bookings
    where class_session_id = p_session_id and status in ('confirmed', 'attended', 'no_show');

  if v_input_count <> v_eligible_count
     or exists (
       select 1 from unnest(p_attended_ids || p_no_show_ids) as ids(id)
       where not exists (
         select 1 from public.session_bookings b
         where b.id = ids.id and b.class_session_id = p_session_id
           and b.status in ('confirmed', 'attended', 'no_show')
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

  update public.class_sessions
     set status = 'completed', public_visible = false, updated_at = now()
   where id = p_session_id;

  return v_updated_count;
end; $$;

revoke execute on function public.admin_record_session_attendance(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.admin_record_session_attendance(uuid, uuid[], uuid[]) to authenticated;

create table if not exists public.xert_schema_capabilities (
  capability text primary key,
  installed_at timestamptz not null default now()
);
insert into public.xert_schema_capabilities (capability)
values ('attendance_roll_call') on conflict (capability) do nothing;
