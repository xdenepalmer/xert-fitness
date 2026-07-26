-- Soft-launch switch authz (fail closed at the database boundary).
--
-- Soft Launch Settings / iOS Platform Controls already refuse to open pack
-- checkout without bookings, and refuse to enable bookings without the
-- member_booking_switch_guard capability. Those checks were UI-only:
--   1. POST /api/admin-commerce-health action=activate_payments accepted
--      bookings_enabled:false and admin_activate_session_pack_payments wrote it,
--      leaving Ops Health "unsafe" while Stripe checkout stayed live.
--   2. A direct PostgREST update of admin_settings.bookings_enabled=true
--      succeeded even when the booking-switch trigger was not installed, so a
--      later pause could not actually stop book_session / waitlist joins.
--
-- One BEFORE ROW trigger owns both invariants on every insert/update. The
-- activation RPC also refuses p_bookings_enabled is not true so the trusted
-- service-role path cannot mint the unsafe pair either.

create or replace function public.enforce_soft_launch_switch_authz()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.payments_enabled is true and new.bookings_enabled is not true then
    raise exception 'PAYMENTS_REQUIRE_BOOKINGS';
  end if;

  if new.bookings_enabled is true
     and (tg_op = 'INSERT' or old.bookings_enabled is distinct from true)
     and not exists (
       select 1
         from public.xert_schema_capabilities as capability
        where capability.capability = 'member_booking_switch_guard'
     ) then
    raise exception 'BOOKINGS_REQUIRE_SWITCH_GUARD';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_soft_launch_switch_authz()
  from public, anon, authenticated;

drop trigger if exists admin_settings_soft_launch_switch_authz on public.admin_settings;
create trigger admin_settings_soft_launch_switch_authz
  before insert or update on public.admin_settings
  for each row execute function public.enforce_soft_launch_switch_authz();

comment on function public.enforce_soft_launch_switch_authz() is
  'Fails closed when pack checkout would go live without bookings, or bookings would go live without member_booking_switch_guard.';

create or replace function public.admin_activate_session_pack_payments(
  p_actor_id uuid,
  p_settings_id uuid,
  p_expected_updated_at timestamptz,
  p_target_launch_date date,
  p_countdown_enabled boolean,
  p_bookings_enabled boolean,
  p_announcement_banner_text text,
  p_announcement_banner_enabled boolean
)
returns setof public.admin_settings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current public.admin_settings%rowtype;
  v_actor_is_admin boolean;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'SERVER_PREFLIGHT_REQUIRED'; end if;
  select exists (
    select 1 from public.profiles where id = p_actor_id and role = 'admin'
  ) into v_actor_is_admin;
  if not v_actor_is_admin then raise exception 'ADMIN_REQUIRED'; end if;
  if p_settings_id is null or p_expected_updated_at is null then
    raise exception 'PAYMENT_ACTIVATION_VERSION_REQUIRED';
  end if;
  if p_target_launch_date is null then raise exception 'PAYMENT_ACTIVATION_DATE_REQUIRED'; end if;
  if length(coalesce(p_announcement_banner_text, '')) > 1000 then
    raise exception 'PAYMENT_ACTIVATION_ANNOUNCEMENT_TOO_LONG';
  end if;
  if p_announcement_banner_enabled and nullif(trim(coalesce(p_announcement_banner_text, '')), '') is null then
    raise exception 'PAYMENT_ACTIVATION_ANNOUNCEMENT_REQUIRED';
  end if;
  -- Server fail-closed: UI already blocks this; crafted activate_payments bodies
  -- must not open checkout while class booking stays paused.
  if p_bookings_enabled is not true then
    raise exception 'PAYMENTS_REQUIRE_BOOKINGS';
  end if;

  select settings.*
    into v_current
  from public.admin_settings as settings
  where settings.id = p_settings_id
  for update;

  if not found then raise exception 'PAYMENT_ACTIVATION_SETTINGS_NOT_FOUND'; end if;
  if v_current.updated_at is distinct from p_expected_updated_at then
    raise exception 'PAYMENT_ACTIVATION_STALE';
  end if;
  if v_current.payments_enabled is true then raise exception 'PAYMENT_ACTIVATION_ALREADY_ENABLED'; end if;

  perform set_config('xert.payment_activation_preflight', 'passed', true);
  perform set_config('request.jwt.claim.sub', p_actor_id::text, true);

  return query
  update public.admin_settings
  set
    target_launch_date = p_target_launch_date,
    countdown_enabled = p_countdown_enabled,
    bookings_enabled = true,
    payments_enabled = true,
    announcement_banner_text = nullif(trim(coalesce(p_announcement_banner_text, '')), ''),
    announcement_banner_enabled = p_announcement_banner_enabled
  where id = p_settings_id
    and updated_at = p_expected_updated_at
    and payments_enabled is false
  returning *;

  if not found then raise exception 'PAYMENT_ACTIVATION_STALE'; end if;
end;
$$;

revoke all on function public.admin_activate_session_pack_payments(
  uuid, uuid, timestamptz, date, boolean, boolean, text, boolean
) from public, anon, authenticated;
grant execute on function public.admin_activate_session_pack_payments(
  uuid, uuid, timestamptz, date, boolean, boolean, text, boolean
) to service_role;

create table if not exists public.xert_schema_capabilities (
  capability text primary key,
  installed_at timestamptz not null default now()
);
alter table public.xert_schema_capabilities enable row level security;
drop policy if exists "xert_schema_capabilities_admin_read" on public.xert_schema_capabilities;
create policy "xert_schema_capabilities_admin_read" on public.xert_schema_capabilities
  for select to authenticated using ((select public.is_admin()));
insert into public.xert_schema_capabilities (capability)
values ('soft_launch_switch_authz')
on conflict (capability) do update set installed_at = excluded.installed_at;
