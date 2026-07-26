-- Atomic, immutable audit trail for legacy booking and PT request operations.

create table if not exists public.admin_request_status_changes (
  id uuid primary key default gen_random_uuid(),
  request_type text not null check (request_type in ('class_booking', 'private_session')),
  request_id text not null,
  changed_by uuid references auth.users(id) on delete set null,
  previous_status text not null,
  new_status text not null,
  previous_admin_notes text,
  new_admin_notes text,
  subject_label text,
  subject_email text,
  created_at timestamptz not null default now()
);

create index if not exists admin_request_status_changes_created_idx
  on public.admin_request_status_changes (created_at desc, id desc);
create index if not exists admin_request_status_changes_request_idx
  on public.admin_request_status_changes (request_type, request_id, created_at desc);

alter table public.admin_request_status_changes enable row level security;
drop policy if exists "admin_request_status_changes_admin_read" on public.admin_request_status_changes;
create policy "admin_request_status_changes_admin_read" on public.admin_request_status_changes
  for select to authenticated using ((select public.is_admin()));

revoke all on table public.admin_request_status_changes from anon;
revoke insert, update, delete on table public.admin_request_status_changes from authenticated;
grant select on table public.admin_request_status_changes to authenticated;

-- Re-run safe: do not replace a newer guard shape with this older body.
do $install_guard_admin_request_status_change$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'guard_admin_request_status_change'
    and pg_get_function_identity_arguments(p.oid) = '';
  if v_def is not null and (v_def ilike '%changed_by%' or v_def ilike '%subject_label%') then
    raise notice 'keeping newer guard_admin_request_status_change';
  else
    execute $fn$
      create or replace function public.guard_admin_request_status_change()
      returns trigger language plpgsql set search_path = public as $$
      begin
        raise exception 'REQUEST_AUDIT_IMMUTABLE';
      end;
      $$;
$fn$;
  end if;
end;
$install_guard_admin_request_status_change$;
drop trigger if exists admin_request_status_changes_immutable on public.admin_request_status_changes;
create trigger admin_request_status_changes_immutable
  before update or delete on public.admin_request_status_changes
  for each row execute function public.guard_admin_request_status_change();

create or replace function public.admin_update_request(
  p_request_type text,
  p_request_id text,
  p_status text default null,
  p_admin_notes text default null,
  p_update_admin_notes boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_request_type text := lower(trim(coalesce(p_request_type, '')));
  v_request_id text := trim(coalesce(p_request_id, ''));
  v_requested_status text := nullif(lower(trim(coalesce(p_status, ''))), '');
  v_row jsonb;
  v_previous_status text;
  v_new_status text;
  v_previous_notes text;
  v_new_notes text;
  v_subject_label text;
  v_subject_email text;
  v_audit_id uuid;
begin
  if v_actor is null or not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if v_request_type not in ('class_booking', 'private_session') then
    raise exception 'REQUEST_TYPE_INVALID';
  end if;
  if v_request_id = '' then
    raise exception 'REQUEST_REQUIRED';
  end if;
  if v_requested_status is null and not coalesce(p_update_admin_notes, false) then
    raise exception 'REQUEST_CHANGE_REQUIRED';
  end if;
  if length(coalesce(p_admin_notes, '')) > 5000 then
    raise exception 'ADMIN_NOTES_TOO_LONG';
  end if;

  if v_request_type = 'class_booking' then
    if v_requested_status is not null and v_requested_status not in (
      'requested', 'confirmed', 'waitlisted', 'cancelled', 'declined', 'attended', 'no_show'
    ) then
      raise exception 'BOOKING_STATUS_INVALID';
    end if;
    select to_jsonb(request)
      into v_row
      from public.class_bookings request
     where request.id::text = v_request_id
     for update;
  else
    if v_requested_status is not null and v_requested_status not in (
      'requested', 'approved', 'declined', 'reschedule_requested', 'completed', 'cancelled'
    ) then
      raise exception 'PT_STATUS_INVALID';
    end if;
    select to_jsonb(request)
      into v_row
      from public.private_session_requests request
     where request.id::text = v_request_id
     for update;
  end if;

  if v_row is null then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  v_previous_status := v_row ->> 'status';
  v_previous_notes := nullif(trim(coalesce(v_row ->> 'admin_notes', '')), '');
  v_new_status := coalesce(v_requested_status, v_previous_status);
  v_new_notes := case
    when coalesce(p_update_admin_notes, false) then nullif(trim(coalesce(p_admin_notes, '')), '')
    else v_previous_notes
  end;

  if v_new_status is not distinct from v_previous_status
     and v_new_notes is not distinct from v_previous_notes then
    return null;
  end if;

  if v_request_type = 'class_booking' then
    update public.class_bookings
       set status = v_new_status,
           admin_notes = v_new_notes
     where id::text = v_request_id;
  else
    update public.private_session_requests
       set status = v_new_status,
           admin_notes = v_new_notes
     where id::text = v_request_id;
  end if;

  v_subject_label := coalesce(
    nullif(trim(v_row ->> 'full_name'), ''),
    nullif(trim(v_row ->> 'name'), ''),
    nullif(trim(v_row ->> 'email'), ''),
    case when v_request_type = 'class_booking' then 'Booking request' else 'PT request' end
  );
  v_subject_email := nullif(lower(trim(coalesce(v_row ->> 'email', ''))), '');

  insert into public.admin_request_status_changes (
    request_type, request_id, changed_by,
    previous_status, new_status,
    previous_admin_notes, new_admin_notes,
    subject_label, subject_email
  ) values (
    v_request_type, v_request_id, v_actor,
    v_previous_status, v_new_status,
    v_previous_notes, v_new_notes,
    v_subject_label, v_subject_email
  ) returning id into v_audit_id;

  return v_audit_id;
end;
$$;

revoke execute on function public.guard_admin_request_status_change() from public, anon, authenticated;
revoke execute on function public.admin_update_request(text, text, text, text, boolean) from public, anon;
grant execute on function public.admin_update_request(text, text, text, text, boolean) to authenticated;

insert into public.xert_schema_capabilities (capability)
values ('request_status_audit')
on conflict (capability) do nothing;
