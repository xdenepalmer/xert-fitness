-- Lets members and staff actually be deleted once they have audit history.
--
-- Five audit tables reference auth.users with `on delete set null`:
--   session_booking_changes      (member_id, changed_by)
--   admin_request_status_changes (changed_by)
--   admin_lead_changes           (changed_by)
--   admin_schedule_changes       (changed_by)
--   admin_content_changes        (changed_by)
--
-- Each also carries a BEFORE UPDATE OR DELETE trigger that raises
-- *_AUDIT_IMMUTABLE unconditionally. Postgres implements `on delete set null`
-- as a real UPDATE against the referencing row, so that referential UPDATE hits
-- the immutability trigger and aborts the whole transaction. The practical
-- effect: `auth.admin.deleteUser()` — the last step of api/delete-account.js —
-- fails with BOOKING_AUDIT_IMMUTABLE for any member who has ever booked a
-- class, so "Delete my account" could not succeed. That is both a broken
-- feature and an Australian Privacy Principle 11.2 exposure.
--
-- Each guard now permits exactly one shape of UPDATE: one that nulls the
-- auth-user reference columns and changes nothing else. The audit payload
-- (snapshots, action, labels, timestamps) stays immutable, and DELETE stays
-- blocked outright. No UPDATE policy exists on any of these tables, so this
-- narrow allowance is not reachable by an API caller — only by referential
-- integrity itself.
--
-- Request/lead guards were later extended to also allow subject-PII redaction.
-- Re-running this file must not wipe that newer shape.

-- session_booking_changes: member_id + changed_by
create or replace function public.guard_session_booking_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE'
     and to_jsonb(new) - 'member_id' - 'changed_by'
       = to_jsonb(old) - 'member_id' - 'changed_by'
     and (new.member_id is null or new.member_id is not distinct from old.member_id)
     and (new.changed_by is null or new.changed_by is not distinct from old.changed_by)
  then
    return new;
  end if;
  raise exception 'BOOKING_AUDIT_IMMUTABLE';
end;
$$;

-- admin_request_status_changes: changed_by (skip if redaction-aware shape exists)
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
  if v_def is not null and v_def ilike '%subject_label%' then
    raise notice 'keeping redaction-aware guard_admin_request_status_change';
  else
    execute $fn$
create or replace function public.guard_admin_request_status_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE'
     and to_jsonb(new) - 'changed_by' = to_jsonb(old) - 'changed_by'
     and new.changed_by is null
  then
    return new;
  end if;
  raise exception 'REQUEST_AUDIT_IMMUTABLE';
end;
$$;
$fn$;
  end if;
end;
$install_guard_admin_request_status_change$;

-- admin_lead_changes: changed_by (skip if redaction-aware shape exists)
do $install_guard_admin_lead_change$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'guard_admin_lead_change'
    and pg_get_function_identity_arguments(p.oid) = '';
  if v_def is not null and v_def ilike '%subject_label%' then
    raise notice 'keeping redaction-aware guard_admin_lead_change';
  else
    execute $fn$
create or replace function public.guard_admin_lead_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE'
     and to_jsonb(new) - 'changed_by' = to_jsonb(old) - 'changed_by'
     and new.changed_by is null
  then
    return new;
  end if;
  raise exception 'LEAD_AUDIT_IMMUTABLE';
end;
$$;
$fn$;
  end if;
end;
$install_guard_admin_lead_change$;

-- admin_schedule_changes: changed_by
create or replace function public.guard_admin_schedule_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE'
     and to_jsonb(new) - 'changed_by' = to_jsonb(old) - 'changed_by'
     and new.changed_by is null
  then
    return new;
  end if;
  raise exception 'SCHEDULE_AUDIT_IMMUTABLE';
end;
$$;

-- admin_content_changes: changed_by
create or replace function public.guard_admin_content_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE'
     and to_jsonb(new) - 'changed_by' = to_jsonb(old) - 'changed_by'
     and new.changed_by is null
  then
    return new;
  end if;
  raise exception 'CONTENT_AUDIT_IMMUTABLE';
end;
$$;
