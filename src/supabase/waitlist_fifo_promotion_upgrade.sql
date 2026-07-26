-- Fair, atomic waitlist promotion with member-visible FIFO positions.
-- Apply after booking_modes_upgrade.sql and member_waitlist_upgrade.sql.

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

drop function if exists public.my_bookings();
create function public.my_bookings()
returns table (
  booking_id uuid, status text, booked_at timestamptz, cancelled_at timestamptz,
  session_id uuid, title text, class_type text, coach_name text,
  start_time timestamptz, end_time timestamptz, location_zone text, intensity_level text,
  waitlist_position bigint
) language sql security definer stable set search_path = public as $$
  select b.id, b.status, b.created_at, b.cancelled_at,
         s.id, s.title, s.class_type, s.coach_name,
         s.start_time, s.end_time, s.location_zone, s.intensity_level,
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
  insert into public.session_bookings (user_id, class_session_id, credit_batch_id, status)
  values (v_user, p_session_id, null, 'waitlisted') returning id into v_booking;
  return v_booking;
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

revoke execute on function public.join_session_waitlist(uuid) from public, anon;
revoke execute on function public.sessions_with_availability() from public;
grant execute on function public.join_session_waitlist(uuid) to authenticated;
grant execute on function public.sessions_with_availability() to anon, authenticated;

-- Re-run safe: an older copy of this script inlined remaining+1 and skipped the
-- shared refund helper, so Ops Health re-runs restored credits onto packs Stripe
-- had already fully refunded. Keep a newer helper-backed body; otherwise install
-- the helper path (refund_credits_to_batch refuses orders.status = 'refunded').
do $install_admin_set_booking_status$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'admin_set_booking_status'
    and pg_get_function_identity_arguments(p.oid) = 'p_booking_id uuid, p_status text';
  if v_def is not null and v_def ilike '%refund_credits_to_batch%' then
    raise notice 'keeping newer admin_set_booking_status';
  else
    execute $fn$
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
    if v_session_status <> 'published' then raise exception 'SESSION_NOT_BOOKABLE'; end if;
    if v_start <= now() then raise exception 'SESSION_IN_PAST'; end if;

    select count(*) into v_active_count from public.session_bookings
      where class_session_id = v_session and status in ('requested', 'confirmed');
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
    if v_start is null then
      select start_time into v_start from public.class_sessions where id = v_session;
    end if;
    perform public.refund_credits_to_batch(v_batch, 1, v_start);
  end if;
end; $$;
$fn$;
  end if;
end;
$install_admin_set_booking_status$;

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

create or replace function public.admin_waitlist_overview(p_limit integer default 50)
returns table (
  session_id uuid, title text, start_time timestamptz, capacity integer,
  active_count bigint, waitlist_count bigint, spots_available integer,
  can_promote boolean, next_booking_id uuid, next_member_id uuid,
  next_full_name text, next_email text, next_phone text,
  next_booked_at timestamptz, next_available_credits bigint
) language plpgsql security definer stable set search_path = public as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 50));
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  return query
  with queued_sessions as materialized (
    select s.id, s.title, s.start_time, s.capacity,
           count(b.id) filter (where b.status in ('requested', 'confirmed')) as active_count,
           count(b.id) filter (where b.status = 'waitlisted') as waitlist_count
      from public.class_sessions s
      left join public.session_bookings b on b.class_session_id = s.id
     where s.status = 'published' and s.start_time > now()
     group by s.id, s.title, s.start_time, s.capacity
    having count(b.id) filter (where b.status = 'waitlisted') > 0
  )
  select q.id, q.title, q.start_time, q.capacity,
         q.active_count, q.waitlist_count,
         case when q.capacity is null then null
              else greatest(q.capacity - q.active_count, 0)::integer end,
         q.capacity is null or q.active_count < q.capacity,
         head.id, head.user_id, p.full_name, p.email, p.phone, head.created_at,
         coalesce((select sum(cb.remaining) from public.credit_batches cb
                    where cb.user_id = head.user_id and cb.remaining > 0
                      and (cb.expires_at is null or cb.expires_at > now())), 0)
    from queued_sessions q
    join lateral (
      select b.id, b.user_id, b.created_at
        from public.session_bookings b
       where b.class_session_id = q.id and b.status = 'waitlisted'
       order by b.created_at, b.id
       limit 1
    ) head on true
    left join public.profiles p on p.id = head.user_id
   order by (q.capacity is null or q.active_count < q.capacity) desc,
            q.start_time, q.id
   limit v_limit;
end; $$;

revoke execute on function public.admin_set_booking_status(uuid, text) from public, anon;
revoke execute on function public.admin_promote_next_waitlisted(uuid) from public, anon;
revoke execute on function public.admin_waitlist_overview(integer) from public, anon;
grant execute on function public.admin_set_booking_status(uuid, text) to authenticated;
grant execute on function public.admin_promote_next_waitlisted(uuid) to authenticated;
grant execute on function public.admin_waitlist_overview(integer) to authenticated;

create table if not exists public.xert_schema_capabilities (
  capability text primary key,
  installed_at timestamptz not null default now()
);
alter table public.xert_schema_capabilities enable row level security;
drop policy if exists "xert_schema_capabilities_admin_read" on public.xert_schema_capabilities;
create policy "xert_schema_capabilities_admin_read" on public.xert_schema_capabilities
  for select to authenticated using (public.is_admin());
insert into public.xert_schema_capabilities (capability)
values ('waitlist_fifo_promotion') on conflict (capability) do nothing;
