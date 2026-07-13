-- Immutable administrator history for public content and business configuration.

create table if not exists public.admin_content_changes (
  id uuid primary key default gen_random_uuid(),
  resource_type text not null check (resource_type in ('site_content', 'coach', 'event', 'product', 'launch_settings')),
  resource_id text not null,
  action text not null check (action in ('created', 'updated', 'deleted')),
  changed_by uuid references auth.users(id) on delete set null,
  subject_label text not null,
  previous_snapshot jsonb,
  new_snapshot jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_content_changes_created_idx
  on public.admin_content_changes (created_at desc, id desc);
create index if not exists admin_content_changes_resource_idx
  on public.admin_content_changes (resource_type, resource_id, created_at desc, id desc);

alter table public.admin_content_changes enable row level security;
drop policy if exists "admin_content_changes_admin_read" on public.admin_content_changes;
create policy "admin_content_changes_admin_read"
  on public.admin_content_changes for select
  to authenticated
  using ((select public.is_admin()));

create or replace function public.guard_admin_content_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'CONTENT_AUDIT_IMMUTABLE';
end;
$$;

drop trigger if exists admin_content_changes_immutable on public.admin_content_changes;
create trigger admin_content_changes_immutable
  before update or delete on public.admin_content_changes
  for each row execute function public.guard_admin_content_change();

create or replace function public.audit_admin_content_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_previous jsonb;
  v_new jsonb;
  v_record jsonb;
  v_resource_type text;
  v_resource_id text;
  v_action text;
  v_subject_label text;
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    v_record := v_new;
    v_action := 'created';
  elsif tg_op = 'DELETE' then
    v_previous := to_jsonb(old);
    v_record := v_previous;
    v_action := 'deleted';
  else
    v_previous := to_jsonb(old);
    v_new := to_jsonb(new);
    if (v_previous - 'updated_at') = (v_new - 'updated_at') then return new; end if;
    v_record := v_new;
    v_action := 'updated';
  end if;

  v_resource_type := case tg_table_name
    when 'site_content' then 'site_content'
    when 'coaches' then 'coach'
    when 'events' then 'event'
    when 'products' then 'product'
    when 'admin_settings' then 'launch_settings'
    else null
  end;
  if v_resource_type is null then raise exception 'CONTENT_RESOURCE_INVALID'; end if;

  v_resource_id := case v_resource_type
    when 'site_content' then nullif(trim(coalesce(v_record ->> 'key', '')), '')
    else nullif(trim(coalesce(v_record ->> 'id', '')), '')
  end;
  if v_resource_id is null then raise exception 'CONTENT_RESOURCE_ID_REQUIRED'; end if;

  v_subject_label := case v_resource_type
    when 'site_content' then coalesce(nullif(trim(v_record ->> 'key'), ''), 'Site content')
    when 'coach' then coalesce(nullif(trim(v_record ->> 'name'), ''), 'Coach')
    when 'event' then coalesce(nullif(trim(v_record ->> 'name'), ''), 'Event')
    when 'product' then coalesce(nullif(trim(v_record ->> 'name'), ''), 'Session pack')
    else 'Launch settings'
  end;

  insert into public.admin_content_changes (
    resource_type,
    resource_id,
    action,
    changed_by,
    subject_label,
    previous_snapshot,
    new_snapshot
  ) values (
    v_resource_type,
    v_resource_id,
    v_action,
    auth.uid(),
    v_subject_label,
    v_previous,
    v_new
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists site_content_audit_admin_change on public.site_content;
create trigger site_content_audit_admin_change
  after insert or update or delete on public.site_content
  for each row execute function public.audit_admin_content_change();

drop trigger if exists coaches_audit_admin_change on public.coaches;
create trigger coaches_audit_admin_change
  after insert or update or delete on public.coaches
  for each row execute function public.audit_admin_content_change();

drop trigger if exists events_audit_admin_change on public.events;
create trigger events_audit_admin_change
  after insert or update or delete on public.events
  for each row execute function public.audit_admin_content_change();

drop trigger if exists products_audit_admin_change on public.products;
create trigger products_audit_admin_change
  after insert or update or delete on public.products
  for each row execute function public.audit_admin_content_change();

drop trigger if exists admin_settings_audit_admin_change on public.admin_settings;
create trigger admin_settings_audit_admin_change
  after insert or update or delete on public.admin_settings
  for each row execute function public.audit_admin_content_change();

revoke all on table public.admin_content_changes from public, anon, authenticated;
grant select on table public.admin_content_changes to authenticated;
revoke execute on function public.guard_admin_content_change() from public, anon, authenticated;
revoke execute on function public.audit_admin_content_change() from public, anon, authenticated;

insert into public.xert_schema_capabilities (capability)
values ('content_change_audit')
on conflict (capability) do nothing;
