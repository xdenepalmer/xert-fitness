-- Immutable operational schedule history for classes, availability and blackouts.

create table if not exists public.admin_schedule_changes (
  id uuid primary key default gen_random_uuid(),
  resource_type text not null check (resource_type in ('class_session', 'availability_block', 'blackout_period')),
  resource_id text not null,
  action text not null check (action in ('created', 'updated', 'cancelled', 'completed', 'deleted')),
  changed_by uuid references auth.users(id) on delete set null,
  subject_label text not null,
  previous_snapshot jsonb,
  new_snapshot jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_schedule_changes_created_idx
  on public.admin_schedule_changes (created_at desc, id desc);
create index if not exists admin_schedule_changes_resource_idx
  on public.admin_schedule_changes (resource_type, resource_id, created_at desc, id desc);

alter table public.admin_schedule_changes enable row level security;
drop policy if exists "admin_schedule_changes_admin_read" on public.admin_schedule_changes;
create policy "admin_schedule_changes_admin_read"
  on public.admin_schedule_changes for select
  to authenticated
  using ((select public.is_admin()));

-- Re-run safe: do not replace a newer guard shape with this older body.
do $install_guard_admin_schedule_change$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'guard_admin_schedule_change'
    and pg_get_function_identity_arguments(p.oid) = '';
  if v_def is not null and (v_def ilike '%changed_by%') then
    raise notice 'keeping newer guard_admin_schedule_change';
  else
    execute $fn$
      create or replace function public.guard_admin_schedule_change()
      returns trigger
      language plpgsql
      set search_path = public, pg_temp
      as $$
      begin
        raise exception 'SCHEDULE_AUDIT_IMMUTABLE';
      end;
      $$;
$fn$;
  end if;
end;
$install_guard_admin_schedule_change$;
drop trigger if exists admin_schedule_changes_immutable on public.admin_schedule_changes;
create trigger admin_schedule_changes_immutable
  before update or delete on public.admin_schedule_changes
  for each row execute function public.guard_admin_schedule_change();

create or replace function public.audit_admin_schedule_change()
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
    v_action := case
      when tg_table_name = 'class_sessions'
        and (v_previous ->> 'status') is distinct from (v_new ->> 'status')
        and (v_new ->> 'status') = 'cancelled' then 'cancelled'
      when tg_table_name = 'class_sessions'
        and (v_previous ->> 'status') is distinct from (v_new ->> 'status')
        and (v_new ->> 'status') = 'completed' then 'completed'
      else 'updated'
    end;
  end if;

  v_resource_type := case tg_table_name
    when 'class_sessions' then 'class_session'
    when 'availability_blocks' then 'availability_block'
    when 'blackout_periods' then 'blackout_period'
    else null
  end;
  if v_resource_type is null then raise exception 'SCHEDULE_RESOURCE_INVALID'; end if;

  v_resource_id := nullif(trim(coalesce(v_record ->> 'id', '')), '');
  if v_resource_id is null then raise exception 'SCHEDULE_RESOURCE_ID_REQUIRED'; end if;
  v_subject_label := case v_resource_type
    when 'class_session' then coalesce(
      nullif(trim(v_record ->> 'title'), ''),
      nullif(trim(v_record ->> 'class_type'), ''),
      'Class session'
    )
    when 'availability_block' then coalesce(
      nullif(trim(v_record ->> 'type'), ''),
      'Availability block'
    )
    else coalesce(
      nullif(trim(v_record ->> 'reason'), ''),
      'Blackout period'
    )
  end;

  insert into public.admin_schedule_changes (
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

drop trigger if exists class_sessions_audit_admin_change on public.class_sessions;
create trigger class_sessions_audit_admin_change
  after insert or update or delete on public.class_sessions
  for each row execute function public.audit_admin_schedule_change();

drop trigger if exists availability_blocks_audit_admin_change on public.availability_blocks;
create trigger availability_blocks_audit_admin_change
  after insert or update or delete on public.availability_blocks
  for each row execute function public.audit_admin_schedule_change();

drop trigger if exists blackout_periods_audit_admin_change on public.blackout_periods;
create trigger blackout_periods_audit_admin_change
  after insert or update or delete on public.blackout_periods
  for each row execute function public.audit_admin_schedule_change();

revoke all on table public.admin_schedule_changes from public, anon, authenticated;
grant select on table public.admin_schedule_changes to authenticated;
revoke execute on function public.guard_admin_schedule_change() from public, anon, authenticated;
revoke execute on function public.audit_admin_schedule_change() from public, anon, authenticated;

insert into public.xert_schema_capabilities (capability)
values ('schedule_change_audit')
on conflict (capability) do nothing;
