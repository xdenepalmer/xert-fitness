-- Upgrade an existing XERT database so live payment settings cannot drift from
-- the immutable activation receipt. Emergency pause remains unrestricted.
create or replace function public.guard_session_pack_payment_activation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_is_activation boolean;
  v_is_trusted_server boolean;
  v_live_settings_changed boolean;
begin
  if tg_op = 'INSERT' then
    v_is_activation := new.payments_enabled is true;
    v_live_settings_changed := false;
  else
    v_is_activation := new.payments_enabled is true and old.payments_enabled is not true;
    v_live_settings_changed := old.payments_enabled is true
      and new.payments_enabled is true
      and to_jsonb(new) is distinct from to_jsonb(old);
  end if;
  v_is_trusted_server := current_setting('xert.payment_activation_preflight', true) = 'passed'
    or current_user in ('postgres', 'supabase_admin');

  if v_is_activation and not v_is_trusted_server then
    raise exception 'PAYMENT_ACTIVATION_REQUIRES_SERVER_PREFLIGHT';
  end if;
  if v_live_settings_changed then
    raise exception 'PAYMENT_SETTINGS_CHANGE_REQUIRES_PAUSE';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_session_pack_payment_activation() from public, anon, authenticated;

-- Sort after admin_settings_touch_updated_at so version-only drift is visible.
drop trigger if exists admin_settings_guard_payment_activation on public.admin_settings;
drop trigger if exists admin_settings_z_guard_payment_activation on public.admin_settings;
create trigger admin_settings_z_guard_payment_activation
  before insert or update on public.admin_settings
  for each row execute function public.guard_session_pack_payment_activation();

create table if not exists public.xert_schema_capabilities (
  capability text primary key,
  installed_at timestamptz not null default now()
);
insert into public.xert_schema_capabilities (capability)
values ('payment_activation_drift_guard')
on conflict (capability) do update set installed_at = excluded.installed_at;
