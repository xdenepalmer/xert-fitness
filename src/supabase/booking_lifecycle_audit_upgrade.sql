-- Immutable lifecycle history for credit-backed member class bookings.

create table if not exists public.session_booking_changes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null,
  class_session_id uuid,
  member_id uuid references auth.users(id) on delete set null,
  changed_by uuid references auth.users(id) on delete set null,
  actor_role text not null check (actor_role in ('member', 'admin', 'system')),
  action text not null check (action in (
    'booked', 'waitlisted', 'promoted', 'status_changed', 'cancelled',
    'attendance_recorded', 'credit_changed', 'updated', 'deleted'
  )),
  class_label text not null,
  previous_snapshot jsonb,
  new_snapshot jsonb,
  created_at timestamptz not null default now()
);

create index if not exists session_booking_changes_created_idx
  on public.session_booking_changes (created_at desc, id desc);
create index if not exists session_booking_changes_booking_idx
  on public.session_booking_changes (booking_id, created_at desc, id desc);
create index if not exists session_booking_changes_member_idx
  on public.session_booking_changes (member_id, created_at desc, id desc);
create index if not exists session_booking_changes_session_idx
  on public.session_booking_changes (class_session_id, created_at desc, id desc);

alter table public.session_booking_changes enable row level security;
drop policy if exists "session_booking_changes_admin_read" on public.session_booking_changes;
create policy "session_booking_changes_admin_read"
  on public.session_booking_changes for select
  to authenticated
  using ((select public.is_admin()));

-- Re-run safe: do not replace a newer guard shape with this older body.
do $install_guard_session_booking_change$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'guard_session_booking_change'
    and pg_get_function_identity_arguments(p.oid) = '';
  if v_def is not null and (v_def ilike '%changed_by%' or v_def ilike '%member_id%') then
    raise notice 'keeping newer guard_session_booking_change';
  else
    execute $fn$
      create or replace function public.guard_session_booking_change()
      returns trigger
      language plpgsql
      set search_path = public, pg_temp
      as $$
      begin
        raise exception 'BOOKING_AUDIT_IMMUTABLE';
      end;
      $$;
$fn$;
  end if;
end;
$install_guard_session_booking_change$;
drop trigger if exists session_booking_changes_immutable on public.session_booking_changes;
create trigger session_booking_changes_immutable
  before update or delete on public.session_booking_changes
  for each row execute function public.guard_session_booking_change();

create or replace function public.audit_session_booking_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_previous jsonb;
  v_new jsonb;
  v_record jsonb;
  v_action text;
  v_class_label text;
  v_actor_role text;
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    v_record := v_new;
    v_action := case
      when new.status = 'waitlisted' then 'waitlisted'
      else 'booked'
    end;
  elsif tg_op = 'DELETE' then
    v_previous := to_jsonb(old);
    v_record := v_previous;
    v_action := 'deleted';
  else
    v_previous := to_jsonb(old);
    v_new := to_jsonb(new);
    if v_previous = v_new then return new; end if;
    v_record := v_new;
    v_action := case
      when old.status is distinct from new.status and new.status = 'cancelled' then 'cancelled'
      when old.status is distinct from new.status and new.status = 'waitlisted' then 'waitlisted'
      when old.status = 'waitlisted' and new.status in ('requested', 'confirmed') then 'promoted'
      when old.status is distinct from new.status and new.status in ('attended', 'no_show') then 'attendance_recorded'
      when old.status is distinct from new.status then 'status_changed'
      when old.credit_batch_id is distinct from new.credit_batch_id then 'credit_changed'
      else 'updated'
    end;
  end if;

  select coalesce(nullif(trim(session.title), ''), nullif(trim(session.class_type), ''), 'Class session')
    into v_class_label
    from public.class_sessions session
   where session.id = nullif(v_record ->> 'class_session_id', '')::uuid;
  v_class_label := coalesce(v_class_label, 'Class session');
  v_actor_role := case
    when auth.uid() is null then 'system'
    when public.is_admin() then 'admin'
    else 'member'
  end;

  insert into public.session_booking_changes (
    booking_id,
    class_session_id,
    member_id,
    changed_by,
    actor_role,
    action,
    class_label,
    previous_snapshot,
    new_snapshot
  ) values (
    nullif(v_record ->> 'id', '')::uuid,
    nullif(v_record ->> 'class_session_id', '')::uuid,
    nullif(v_record ->> 'user_id', '')::uuid,
    auth.uid(),
    v_actor_role,
    v_action,
    v_class_label,
    v_previous,
    v_new
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists session_bookings_audit_lifecycle on public.session_bookings;
create trigger session_bookings_audit_lifecycle
  after insert or update or delete on public.session_bookings
  for each row execute function public.audit_session_booking_change();

revoke all on table public.session_booking_changes from public, anon, authenticated;
grant select on table public.session_booking_changes to authenticated;
revoke execute on function public.guard_session_booking_change() from public, anon, authenticated;
revoke execute on function public.audit_session_booking_change() from public, anon, authenticated;

insert into public.xert_schema_capabilities (capability)
values ('booking_lifecycle_audit')
on conflict (capability) do nothing;
