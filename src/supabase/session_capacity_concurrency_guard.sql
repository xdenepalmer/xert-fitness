-- Concurrent book_session / waitlist confirmation capacity guard.
--
-- book_session and admin_set_booking_status already lock class_sessions before
-- counting active places, but any insert/update path that forgets that lock
-- (or races a future overload) can overfill a class. A BEFORE ROW trigger
-- re-locks the session and refuses a new requested/confirmed place once
-- capacity is already held — the last line of defence for SESSION_FULL.

create or replace function public.enforce_session_capacity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_capacity integer;
  v_active integer;
begin
  if new.status is distinct from 'requested' and new.status is distinct from 'confirmed' then
    return new;
  end if;

  -- Already holding a capacity slot; status churn among active places does not
  -- consume an extra seat.
  if tg_op = 'UPDATE' and old.status in ('requested', 'confirmed') then
    return new;
  end if;

  if new.class_session_id is null then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  select session.capacity
    into v_capacity
  from public.class_sessions as session
  where session.id = new.class_session_id
  for update;

  if not found then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  if v_capacity is null then
    return new;
  end if;

  select count(*)::integer
    into v_active
  from public.session_bookings as booking
  where booking.class_session_id = new.class_session_id
    and booking.status in ('requested', 'confirmed')
    and booking.id is distinct from new.id;

  if v_active >= v_capacity then
    raise exception 'SESSION_FULL';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_session_capacity()
  from public, anon, authenticated;

drop trigger if exists session_bookings_capacity_guard on public.session_bookings;
create trigger session_bookings_capacity_guard
  before insert or update of status, class_session_id on public.session_bookings
  for each row execute function public.enforce_session_capacity();

comment on function public.enforce_session_capacity() is
  'Fails closed when a requested/confirmed booking would exceed class_sessions.capacity under concurrency.';

create table if not exists public.xert_schema_capabilities (
  capability text primary key,
  installed_at timestamptz not null default now()
);
alter table public.xert_schema_capabilities enable row level security;
drop policy if exists "xert_schema_capabilities_admin_read" on public.xert_schema_capabilities;
create policy "xert_schema_capabilities_admin_read" on public.xert_schema_capabilities
  for select to authenticated using ((select public.is_admin()));
insert into public.xert_schema_capabilities (capability)
values ('session_capacity_concurrency_guard')
on conflict (capability) do update set installed_at = excluded.installed_at;
