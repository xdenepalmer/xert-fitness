-- Session-pack checkout may only move from paused to enabled through the
-- authenticated server preflight. Admin clients retain direct emergency shutdown.
create or replace function public.guard_session_pack_payment_activation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_is_activation boolean;
  v_is_trusted_server boolean;
begin
  if tg_op = 'INSERT' then
    v_is_activation := new.payments_enabled is true;
  else
    v_is_activation := new.payments_enabled is true and old.payments_enabled is not true;
  end if;
  v_is_trusted_server := current_setting('xert.payment_activation_preflight', true) = 'passed'
    or current_user in ('postgres', 'supabase_admin');

  if v_is_activation and not v_is_trusted_server then
    raise exception 'PAYMENT_ACTIVATION_REQUIRES_SERVER_PREFLIGHT';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_session_pack_payment_activation() from public, anon, authenticated;

drop trigger if exists admin_settings_guard_payment_activation on public.admin_settings;
create trigger admin_settings_guard_payment_activation
  before insert or update of payments_enabled on public.admin_settings
  for each row execute function public.guard_session_pack_payment_activation();


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
    bookings_enabled = p_bookings_enabled,
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
) from public;
grant execute on function public.admin_activate_session_pack_payments(
  uuid, uuid, timestamptz, date, boolean, boolean, text, boolean
) to service_role;


create table if not exists public.xert_schema_capabilities (
  capability text primary key,
  installed_at timestamptz not null default now()
);
insert into public.xert_schema_capabilities (capability)
values ('guarded_payment_activation')
on conflict (capability) do update set installed_at = excluded.installed_at;
