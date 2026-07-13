-- ============================================================================
-- XERT Fitness -- Booking modes upgrade
-- ============================================================================
-- Run this once in the Supabase SQL Editor for an EXISTING XERT installation.
-- It upgrades booking_mode from a display-only field into a real workflow:
--   instant_book    -> confirmed booking immediately
--   request_to_book -> pending request that reserves a class credit and seat
--   interest_only   -> excluded from the credit-booking workflow
--
-- Prerequisites: booking_schema.sql and admin_cms_schema.sql have been run.
-- This script is idempotent and safe to re-run.
-- ============================================================================

-- Existing databases created before booking modes may not have the column.
alter table public.class_sessions
  add column if not exists booking_mode text;

update public.class_sessions
set booking_mode = 'instant_book'
where booking_mode is null
   or booking_mode not in ('instant_book', 'request_to_book', 'interest_only');

alter table public.class_sessions
  alter column booking_mode set default 'instant_book',
  alter column booking_mode set not null;

alter table public.class_sessions
  drop constraint if exists class_sessions_booking_mode_check;
alter table public.class_sessions
  add constraint class_sessions_booking_mode_check
  check (booking_mode in ('instant_book', 'request_to_book', 'interest_only'));

alter table public.session_bookings
  drop constraint if exists session_bookings_status_check;
alter table public.session_bookings
  add constraint session_bookings_status_check
  check (status in ('requested', 'confirmed', 'waitlisted', 'cancelled', 'declined', 'attended', 'no_show'));

-- Keep live timetable records valid on databases that predate these checks.
alter table public.class_sessions
  drop constraint if exists class_sessions_positive_capacity_check;
alter table public.class_sessions
  add constraint class_sessions_positive_capacity_check
  check (capacity is null or capacity > 0) not valid;
alter table public.class_sessions
  drop constraint if exists class_sessions_positive_duration_check;
alter table public.class_sessions
  add constraint class_sessions_positive_duration_check
  check (duration_minutes is null or duration_minutes > 0) not valid;
alter table public.class_sessions
  drop constraint if exists class_sessions_valid_time_range_check;
alter table public.class_sessions
  add constraint class_sessions_valid_time_range_check
  check (end_time is null or (start_time is not null and end_time > start_time)) not valid;
alter table public.class_sessions
  drop constraint if exists class_sessions_published_start_time_check;
alter table public.class_sessions
  add constraint class_sessions_published_start_time_check
  check (status <> 'published' or start_time is not null) not valid;

-- Requested and confirmed bookings reserve capacity. Other statuses do not.
drop index if exists public.session_bookings_unique_active;
create unique index session_bookings_unique_active
  on public.session_bookings(user_id, class_session_id)
  where status in ('requested', 'confirmed');
create index if not exists session_bookings_waitlist_order_idx
  on public.session_bookings(class_session_id, created_at, id)
  where status = 'waitlisted';

create or replace function public.enforce_session_waitlist_fifo()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_first_waitlisted uuid;
begin
  if new.status not in ('requested', 'confirmed') then return new; end if;
  if tg_op = 'UPDATE' then
    if old.status in ('requested', 'confirmed') then return new; end if;
  end if;
  select id into v_first_waitlisted from public.session_bookings
    where class_session_id = new.class_session_id and status = 'waitlisted'
    order by created_at, id limit 1;
  if v_first_waitlisted is null then return new; end if;
  if tg_op = 'UPDATE' then
    if old.status = 'waitlisted' and new.id = v_first_waitlisted then return new; end if;
  end if;
  raise exception 'WAITLIST_PRIORITY';
end; $$;
revoke execute on function public.enforce_session_waitlist_fifo() from public, anon, authenticated;
drop trigger if exists session_bookings_waitlist_fifo_guard on public.session_bookings;
create trigger session_bookings_waitlist_fifo_guard
  before insert or update of status on public.session_bookings
  for each row execute function public.enforce_session_waitlist_fifo();

create or replace function public.book_session(p_session_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_capacity integer;
  v_start timestamptz;
  v_status text;
  v_mode text;
  v_booking_status text;
  v_booked integer;
  v_batch uuid;
  v_booking uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  select capacity, start_time, status, coalesce(booking_mode, 'instant_book')
    into v_capacity, v_start, v_status, v_mode
    from public.class_sessions
    where id = p_session_id
    for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if v_status <> 'published' then raise exception 'SESSION_NOT_BOOKABLE'; end if;
  if v_start <= now() then raise exception 'SESSION_IN_PAST'; end if;
  if v_mode = 'interest_only' then raise exception 'SESSION_INTEREST_ONLY'; end if;
  if v_mode not in ('instant_book', 'request_to_book') then
    raise exception 'SESSION_NOT_BOOKABLE';
  end if;

  if exists (
    select 1 from public.session_bookings
    where user_id = v_user
      and class_session_id = p_session_id
      and status in ('requested', 'confirmed', 'waitlisted')
  ) then
    raise exception 'ALREADY_BOOKED';
  end if;

  select count(*) into v_booked
    from public.session_bookings
    where class_session_id = p_session_id
      and status in ('requested', 'confirmed');
  if v_capacity is not null and v_booked >= v_capacity then
    raise exception 'SESSION_FULL';
  end if;

  select id into v_batch
    from public.credit_batches
    where user_id = v_user
      and remaining > 0
      and (expires_at is null or expires_at > now())
    order by expires_at asc nulls last, created_at asc
    limit 1
    for update;
  if v_batch is null then raise exception 'NO_CREDITS'; end if;

  update public.credit_batches set remaining = remaining - 1 where id = v_batch;
  v_booking_status := case when v_mode = 'request_to_book' then 'requested' else 'confirmed' end;

  insert into public.session_bookings (user_id, class_session_id, credit_batch_id, status)
  values (v_user, p_session_id, v_batch, v_booking_status)
  returning id into v_booking;

  return v_booking;
end; $$;


-- Join a full future class without reserving a class credit. Staff promotion
-- uses admin_set_booking_status, which checks capacity and reserves a credit.
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
  if v_booked < v_capacity and not exists (
    select 1 from public.session_bookings
    where class_session_id = p_session_id and status = 'waitlisted'
  ) then raise exception 'SESSION_HAS_CAPACITY'; end if;

  insert into public.session_bookings (
    user_id, class_session_id, credit_batch_id, status
  ) values (v_user, p_session_id, null, 'waitlisted')
  returning id into v_booking;
  return v_booking;
end; $$;


create or replace function public.cancel_booking(p_booking_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_batch uuid;
  v_start timestamptz;
  v_status text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  select b.credit_batch_id, s.start_time, b.status
    into v_batch, v_start, v_status
    from public.session_bookings b
    join public.class_sessions s on s.id = b.class_session_id
    where b.id = p_booking_id and b.user_id = v_user
    for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_status not in ('requested', 'confirmed', 'waitlisted') then raise exception 'NOT_CANCELLABLE'; end if;

  update public.session_bookings
  set status = 'cancelled', cancelled_at = now()
  where id = p_booking_id;

  if (v_status = 'requested' or (v_status = 'confirmed' and v_start - now() > interval '12 hours')) and v_batch is not null then
    update public.credit_batches
    set remaining = remaining + 1
    where id = v_batch and (expires_at is null or expires_at > now());
  end if;
end; $$;

create or replace function public.sessions_with_availability()
returns table (
  id uuid, class_type text, title text, description text, coach_name text,
  start_time timestamptz, end_time timestamptz, duration_minutes int,
  capacity int, location_zone text, beginner_friendly boolean,
  intensity_level text, booking_mode text, booked_count bigint, spots_left int
) language sql security definer stable set search_path = public as $$
  select s.id, s.class_type, s.title, s.description, s.coach_name,
         s.start_time, s.end_time, s.duration_minutes, s.capacity, s.location_zone,
         s.beginner_friendly, s.intensity_level, s.booking_mode,
         count(b.id) filter (where b.status in ('requested', 'confirmed')) as booked_count,
         case when exists (
                select 1 from public.session_bookings waiting
                where waiting.class_session_id = s.id and waiting.status = 'waitlisted'
              ) then 0
              when s.capacity is null then null
              else greatest(s.capacity - count(b.id) filter (where b.status in ('requested', 'confirmed')), 0)::int
         end as spots_left
  from public.class_sessions s
  left join public.session_bookings b on b.class_session_id = s.id
  where s.public_visible = true and s.status = 'published' and s.start_time > now()
  group by s.id
  order by s.start_time asc;
$$;

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
    from public.session_bookings
    where id = p_booking_id
    for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if p_status = v_current then return; end if;
  if p_status in ('attended', 'no_show') and v_current <> 'confirmed' then
    raise exception 'STATUS_TRANSITION_NOT_ALLOWED';
  end if;

  if p_status in ('requested', 'confirmed') and v_current not in ('requested', 'confirmed') then
    select id into v_first_waitlisted
      from public.session_bookings
      where class_session_id = v_session and status = 'waitlisted'
      order by created_at, id
      limit 1;
    if v_first_waitlisted is not null
      and (v_current <> 'waitlisted' or v_first_waitlisted is distinct from p_booking_id) then
      raise exception 'WAITLIST_ORDER_REQUIRED';
    end if;
  end if;

  if p_status in ('requested', 'confirmed') and v_current not in ('requested', 'confirmed') then
    select capacity, start_time, status into v_capacity, v_start, v_session_status
      from public.class_sessions
      where id = v_session
      for update;
    if not found then raise exception 'SESSION_NOT_FOUND'; end if;
    if v_session_status <> 'published' then raise exception 'SESSION_NOT_BOOKABLE'; end if;
    if v_start <= now() then raise exception 'SESSION_IN_PAST'; end if;

    select count(*) into v_active_count
      from public.session_bookings
      where class_session_id = v_session and status in ('requested', 'confirmed');
    if v_capacity is not null and v_active_count >= v_capacity then
      raise exception 'SESSION_FULL';
    end if;

    select id into v_new_batch
      from public.credit_batches
      where user_id = v_user
        and remaining > 0
        and (expires_at is null or expires_at > now())
      order by expires_at asc nulls last, created_at asc
      limit 1
      for update;
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
    and v_current in ('requested', 'confirmed') and v_batch is not null then
    update public.credit_batches set remaining = remaining + 1 where id = v_batch;
  end if;
end; $$;

create or replace function public.admin_promote_next_waitlisted(p_session_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_booking_id uuid;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  select id into v_booking_id from public.session_bookings
    where class_session_id = p_session_id and status = 'waitlisted'
    order by created_at, id limit 1 for update;
  if v_booking_id is null then raise exception 'WAITLIST_EMPTY'; end if;
  begin
    perform public.admin_set_booking_status(v_booking_id, 'confirmed');
  exception when others then
    if sqlerrm like '%NO_CREDITS%' then raise exception 'WAITLIST_MEMBER_NO_CREDITS'; end if;
    raise;
  end;
  return v_booking_id;
end; $$;

-- When XERT cancels a class, outstanding member bookings are invalidated and
-- requested/confirmed bookings return their reserved credit. The session row
-- is locked first so a concurrent booking cannot slip in during cancellation.
create or replace function public.admin_cancel_class_session(p_session_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_cancelled_count integer := 0;
  v_enquiry_cancelled_count integer := 0;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;

  select status into v_status
    from public.class_sessions
    where id = p_session_id
    for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if v_status = 'completed' then raise exception 'SESSION_ALREADY_COMPLETED'; end if;

  with cancelled_bookings as (
    update public.session_bookings
       set status = 'cancelled', cancelled_at = now()
     where class_session_id = p_session_id
       and status in ('requested', 'confirmed', 'waitlisted')
     returning credit_batch_id, status
  ), restored_credits as (
    update public.credit_batches credits
       set remaining = credits.remaining + refunds.credit_count
      from (
        select credit_batch_id, count(*)::integer as credit_count
          from cancelled_bookings
         where status in ('requested', 'confirmed')
           and credit_batch_id is not null
         group by credit_batch_id
      ) refunds
     where credits.id = refunds.credit_batch_id
     returning credits.id
  )
  select count(*) into v_cancelled_count from cancelled_bookings;

  if to_regclass('public.class_bookings') is not null then
    execute $query$
      update public.class_bookings
         set status = 'cancelled'
       where class_session_id = $1
         and status in ('requested', 'confirmed', 'waitlisted')
    $query$ using p_session_id;
    get diagnostics v_enquiry_cancelled_count = row_count;
  end if;

  update public.class_sessions
     set status = 'cancelled', updated_at = now()
   where id = p_session_id;

  return v_cancelled_count + v_enquiry_cancelled_count;
end; $$;

revoke execute on function public.admin_cancel_class_session(uuid) from public, anon;
grant execute on function public.admin_cancel_class_session(uuid) to authenticated;

revoke execute on function public.sessions_with_availability() from public;
revoke execute on function public.book_session(uuid) from public, anon;
revoke execute on function public.join_session_waitlist(uuid) from public, anon;
revoke execute on function public.cancel_booking(uuid) from public, anon;
revoke execute on function public.my_bookings() from public, anon;
revoke execute on function public.admin_set_booking_status(uuid, text) from public, anon;
revoke execute on function public.admin_promote_next_waitlisted(uuid) from public, anon;
grant execute on function public.sessions_with_availability() to anon, authenticated;
grant execute on function public.book_session(uuid) to authenticated;
grant execute on function public.join_session_waitlist(uuid) to authenticated;
grant execute on function public.cancel_booking(uuid) to authenticated;
grant execute on function public.my_bookings() to authenticated;
grant execute on function public.admin_set_booking_status(uuid, text) to authenticated;
grant execute on function public.admin_promote_next_waitlisted(uuid) to authenticated;

-- Register this contract only after all function replacements succeed.
create table if not exists public.xert_schema_capabilities (
  capability text primary key,
  installed_at timestamptz not null default now()
);
alter table public.xert_schema_capabilities enable row level security;
drop policy if exists "xert_schema_capabilities_admin_read" on public.xert_schema_capabilities;
create policy "xert_schema_capabilities_admin_read" on public.xert_schema_capabilities
  for select to authenticated using (public.is_admin());
insert into public.xert_schema_capabilities (capability)
values ('booking_waitlist_withdrawal') on conflict (capability) do nothing;
insert into public.xert_schema_capabilities (capability)
values ('member_waitlist_join') on conflict (capability) do nothing;
insert into public.xert_schema_capabilities (capability)
values ('waitlist_fifo_promotion') on conflict (capability) do nothing;
create or replace function public.xert_public_capabilities()
returns table (capability text)
language sql security definer stable set search_path = public as $$
  select c.capability from public.xert_schema_capabilities c order by c.capability;
$$;
revoke execute on function public.xert_public_capabilities() from public;
grant execute on function public.xert_public_capabilities() to anon, authenticated;

-- Quick post-run checks (safe SELECTs):
-- select booking_mode, count(*) from public.class_sessions group by booking_mode;
-- select status, count(*) from public.session_bookings group by status;
-- select routine_name from information_schema.routines
-- where routine_schema = 'public' and routine_name in ('book_session', 'cancel_booking', 'admin_set_booking_status');
