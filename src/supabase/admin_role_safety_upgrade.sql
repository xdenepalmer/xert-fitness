-- Prevent administrative lockout and retain a durable privilege-change audit.
-- Idempotent and safe to re-run after admin_cms_schema.sql.

create table if not exists public.admin_role_changes (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null,
  changed_by uuid not null,
  previous_role text not null check (previous_role in ('member', 'admin')),
  new_role text not null check (new_role in ('member', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.admin_role_changes enable row level security;
drop policy if exists "admin_role_changes_admin_read" on public.admin_role_changes;
create policy "admin_role_changes_admin_read" on public.admin_role_changes
  for select to authenticated using (public.is_admin());

create or replace function public.admin_set_role(p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_previous_role text;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_role not in ('member', 'admin') then raise exception 'INVALID_ROLE'; end if;
  if p_user_id = auth.uid() and p_role <> 'admin' then raise exception 'CANNOT_DEMOTE_SELF'; end if;

  perform pg_advisory_xact_lock(hashtext('xert-admin-role-changes'));
  select role into v_previous_role from public.profiles where id = p_user_id for update;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  if v_previous_role = p_role then return; end if;
  if v_previous_role = 'admin' and p_role = 'member'
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'CANNOT_DEMOTE_LAST_ADMIN';
  end if;

  update public.profiles set role = p_role, updated_at = now() where id = p_user_id;
  insert into public.admin_role_changes (target_user_id, changed_by, previous_role, new_role)
  values (p_user_id, auth.uid(), v_previous_role, p_role);
end; $$;

revoke execute on function public.admin_set_role(uuid, text) from public, anon;
grant execute on function public.admin_set_role(uuid, text) to authenticated;

-- Runtime capability marker for admin health and release CI.
create table if not exists public.xert_schema_capabilities (
  capability text primary key,
  installed_at timestamptz not null default now()
);
alter table public.xert_schema_capabilities enable row level security;
drop policy if exists "xert_schema_capabilities_admin_read" on public.xert_schema_capabilities;
create policy "xert_schema_capabilities_admin_read" on public.xert_schema_capabilities
  for select to authenticated using (public.is_admin());
insert into public.xert_schema_capabilities (capability)
values ('admin_role_safety') on conflict (capability) do nothing;
create or replace function public.xert_public_capabilities()
returns table (capability text)
language sql security definer stable set search_path = public as $$
  select c.capability from public.xert_schema_capabilities c order by c.capability;
$$;
revoke execute on function public.xert_public_capabilities() from public;
grant execute on function public.xert_public_capabilities() to anon, authenticated;
