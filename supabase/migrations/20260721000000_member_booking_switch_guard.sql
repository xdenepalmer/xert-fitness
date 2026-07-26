-- Make the owner-controlled booking switch authoritative for every client.
-- Existing cancellations, staff actions, waitlist promotions and service-role
-- operations remain available while new member places are paused.
create or replace function public.enforce_member_booking_switch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_bookings_enabled boolean := false;
begin
  if auth.role() = 'service_role'
     or public.is_admin() then
    return new;
  end if;

  if new.user_id is distinct from v_actor then
    raise exception 'BOOKING_ACCOUNT_MISMATCH';
  end if;

  select coalesce(bool_or(settings.bookings_enabled), false)
    into v_bookings_enabled
    from public.admin_settings as settings;

  if not v_bookings_enabled then
    raise exception 'BOOKINGS_PAUSED';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_member_booking_switch()
  from public, anon, authenticated;

drop trigger if exists session_bookings_member_booking_switch
  on public.session_bookings;
create trigger session_bookings_member_booking_switch
  before insert on public.session_bookings
  for each row execute function public.enforce_member_booking_switch();

comment on function public.enforce_member_booking_switch() is
  'Fails closed for new member bookings and waitlist joins when admin_settings.bookings_enabled is false.';

create table if not exists public.xert_schema_capabilities (
  capability text primary key,
  installed_at timestamptz not null default now()
);
alter table public.xert_schema_capabilities enable row level security;
drop policy if exists "xert_schema_capabilities_admin_read" on public.xert_schema_capabilities;
create policy "xert_schema_capabilities_admin_read" on public.xert_schema_capabilities
  for select to authenticated using (public.is_admin());
insert into public.xert_schema_capabilities (capability)
values ('member_booking_switch_guard')
on conflict (capability) do update set installed_at = excluded.installed_at;
