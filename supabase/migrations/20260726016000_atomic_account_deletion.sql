-- Makes "delete my account" all-or-nothing.
--
-- api/delete-account.js ran three unrelated statements over three round trips
-- with no transaction: null the email on orders, delete the member's PT
-- requests, then delete the auth user. A failure part way through left the
-- account half destroyed while the UI reported "Could not delete account", and
-- there was no way to tell which half had happened. Until 20260726001000 landed
-- that was not a rare race: the audit-immutability triggers made the auth
-- deletion fail for every member with any class history, so the first two steps
-- always committed and the third always failed.
--
-- One SECURITY DEFINER routine puts all of it in a single transaction. It
-- deletes from auth.users directly, which is what auth.admin.deleteUser does;
-- the identity, session and refresh-token tables all cascade from it, as do
-- profiles, session_bookings and credit_batches through this schema's own
-- foreign keys. Doing it here rather than over the GoTrue API is the whole
-- point: it is the only way the irreversible step can share a transaction with
-- the reversible ones.
--
-- class_bookings is the legacy public enquiry table. It holds a name, email,
-- phone and free-text notes, has no user_id column at all, and was never
-- touched by deletion even though the account dialog and the privacy policy
-- both say bookings are removed. It is matched on the normalised email, and the
-- match is exact rather than a pattern so an address containing an underscore
-- cannot sweep up a stranger's enquiry.
--
-- Execute is granted to service_role only. The endpoint already authenticates
-- the caller's own bearer token and passes their own id; nothing reachable from
-- a browser can call this.

-- Re-run safe: later redaction / public-lead-cleanup bodies must not be replaced.
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
  if v_def is not null and (v_def ilike '%redact_audit_subject_pii%' or v_def ilike '%member_interest%') then
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
values ('atomic_account_deletion') on conflict (capability) do nothing;
