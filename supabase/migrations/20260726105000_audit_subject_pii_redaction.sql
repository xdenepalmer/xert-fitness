-- Narrow erasure path for subject PII denormalised into audit tables.
--
-- admin_lead_changes and admin_request_status_changes copy subject_label /
-- subject_email (and, for requests, staff admin notes) into every audit row.
-- The immutability triggers correctly block ordinary UPDATE/DELETE, but that
-- also made APP 11.2 / APP 13 correction and erasure impossible: after a member
-- deleted their account the audit rows kept their name, email and notes forever.
--
-- Extend the existing SET NULL exception pattern from
-- 20260726001000_audit_immutability_account_deletion_fix.sql:
--   1. Keep the referential changed_by nulling allowance.
--   2. Additionally allow an UPDATE that only nulls the subject PII columns
--      (and request admin-note columns) and changes nothing else. DELETE and
--      any other column change still raise *_AUDIT_IMMUTABLE.
--   3. Expose admin_redact_audit_subject_pii(email) as SECURITY DEFINER for
--      service_role and is_admin() callers.
--   4. Call that redaction from delete_member_account before auth.users is
--      removed, so account deletion de-identifies matching audit rows.

create or replace function public.guard_admin_request_status_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Referential ON DELETE SET NULL of changed_by (account deletion).
  if tg_op = 'UPDATE'
     and to_jsonb(new) - 'changed_by' = to_jsonb(old) - 'changed_by'
     and new.changed_by is null
  then
    return new;
  end if;

  -- Subject PII / staff-note redaction for erasure requests.
  if tg_op = 'UPDATE'
     and to_jsonb(new)
           - 'subject_label' - 'subject_email'
           - 'previous_admin_notes' - 'new_admin_notes'
       = to_jsonb(old)
           - 'subject_label' - 'subject_email'
           - 'previous_admin_notes' - 'new_admin_notes'
     and new.subject_label is null
     and new.subject_email is null
     and new.previous_admin_notes is null
     and new.new_admin_notes is null
  then
    return new;
  end if;

  raise exception 'REQUEST_AUDIT_IMMUTABLE';
end;
$$;

create or replace function public.guard_admin_lead_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Referential ON DELETE SET NULL of changed_by (account deletion).
  if tg_op = 'UPDATE'
     and to_jsonb(new) - 'changed_by' = to_jsonb(old) - 'changed_by'
     and new.changed_by is null
  then
    return new;
  end if;

  -- Subject PII redaction for erasure requests.
  if tg_op = 'UPDATE'
     and to_jsonb(new) - 'subject_label' - 'subject_email'
       = to_jsonb(old) - 'subject_label' - 'subject_email'
     and new.subject_label is null
     and new.subject_email is null
  then
    return new;
  end if;

  raise exception 'LEAD_AUDIT_IMMUTABLE';
end;
$$;

-- Internal helper: no auth gate. Execute is revoked from API roles; only other
-- SECURITY DEFINER routines in this schema (and superuser) can call it.
create or replace function public.redact_audit_subject_pii(p_subject_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(btrim(coalesce(p_subject_email, '')));
  v_request_count integer := 0;
  v_lead_count integer := 0;
begin
  if v_email = '' then
    raise exception 'EMAIL_REQUIRED';
  end if;

  update public.admin_request_status_changes
     set subject_label = null,
         subject_email = null,
         previous_admin_notes = null,
         new_admin_notes = null
   where subject_email = v_email;
  get diagnostics v_request_count = row_count;

  update public.admin_lead_changes
     set subject_label = null,
         subject_email = null
   where subject_email = v_email;
  get diagnostics v_lead_count = row_count;

  return jsonb_build_object(
    'subject_email', v_email,
    'request_rows', v_request_count,
    'lead_rows', v_lead_count
  );
end;
$$;

revoke all on function public.redact_audit_subject_pii(text)
  from public, anon, authenticated, service_role;

-- Gated entry point for APP 12/13 erasure after the account is already gone.
create or replace function public.admin_redact_audit_subject_pii(p_subject_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := '';
begin
  begin
    v_role := coalesce(auth.jwt() ->> 'role', '');
  exception when others then
    v_role := '';
  end;

  if v_role is distinct from 'service_role' and not public.is_admin() then
    raise exception 'ADMIN_ONLY';
  end if;

  return public.redact_audit_subject_pii(p_subject_email);
end;
$$;

revoke all on function public.admin_redact_audit_subject_pii(text) from public, anon;
grant execute on function public.admin_redact_audit_subject_pii(text)
  to authenticated, service_role;

-- Account deletion must de-identify audit rows while the email is still known.
-- Re-run safe: do not replace a newer delete_member_account body (public lead cleanup).
do $install_delete_member_account$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'delete_member_account'
    and pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid';
  if v_def is not null and (v_def ilike '%member_interest%') then
    raise notice 'keeping newer delete_member_account';
  else
    execute $fn$
create or replace function public.delete_member_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_email text;
begin
  if p_user_id is null then
    raise exception 'ACCOUNT_REQUIRED';
  end if;

  select lower(btrim(email)) into v_email from auth.users where id = p_user_id;
  if not found then
    raise exception 'ACCOUNT_NOT_FOUND';
  end if;

  -- orders.user_id is `on delete set null`, so the financial record survives
  -- the member. The address is the only identifying column on it.
  update public.orders set email = null where user_id = p_user_id;

  -- PT requests carry contact details and coaching notes. They are account
  -- data, not a financial record, so they go.
  delete from public.private_session_requests where user_id = p_user_id;

  if to_regclass('public.class_bookings') is not null and v_email is not null and v_email <> '' then
    execute 'delete from public.class_bookings where lower(btrim(email)) = $1' using v_email;
  end if;

  -- De-identify denormalised subject PII in immutable audit tables before the
  -- auth user (and therefore the email key) disappears. Uses the ungated
  -- helper so nested JWT role checks cannot abort deletion.
  if v_email is not null and v_email <> '' then
    perform public.redact_audit_subject_pii(v_email);
  end if;

  delete from auth.users where id = p_user_id;
end;
$$;

$fn$;
  end if;
end;
$install_delete_member_account$;
revoke execute on function public.delete_member_account(uuid) from public, anon, authenticated;
grant execute on function public.delete_member_account(uuid) to service_role;

insert into public.xert_schema_capabilities (capability)
values ('audit_subject_pii_redaction')
on conflict (capability) do nothing;
