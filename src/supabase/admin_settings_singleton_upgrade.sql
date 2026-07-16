-- Platform launch settings are one versioned record. Multiple rows could make
-- checkout and admin clients observe different payment switches.
lock table public.admin_settings in share row exclusive mode;

do $$
begin
  if (select count(*) from public.admin_settings) > 1 then
    raise exception 'ADMIN_SETTINGS_SINGLETON_VIOLATION';
  end if;
end;
$$;

update public.admin_settings
set updated_at = clock_timestamp()
where updated_at is null;

alter table public.admin_settings
  alter column updated_at set default now(),
  alter column updated_at set not null;

create unique index if not exists admin_settings_singleton_idx
  on public.admin_settings ((true));

insert into public.xert_schema_capabilities (capability)
values ('admin_settings_singleton')
on conflict (capability) do update set installed_at = excluded.installed_at;
