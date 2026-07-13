-- XERT admin daily operations desk.
-- One bounded, Brisbane-local day of class workload for the command centre.

create or replace function public.admin_daily_operations()
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
    s.start_time <= now()
      and s.status in ('published', 'full', 'completed')
      and coalesce(member_counts.confirmed_count, 0) > 0
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
    select count(*) filter (where r.status = 'requested') as request_count
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
  'Admin-only, Brisbane-local class workload for the current operational day.';

create index if not exists class_sessions_admin_daily_operations_idx
  on public.class_sessions (start_time, status);

create table if not exists public.xert_schema_capabilities (
  capability text primary key,
  installed_at timestamptz not null default now()
);
alter table public.xert_schema_capabilities enable row level security;
insert into public.xert_schema_capabilities (capability)
values ('admin_daily_operations') on conflict (capability) do nothing;
