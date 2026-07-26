-- Account deletion left public interest leads (including health free-text) and
-- anonymous PT requests keyed only by email. The dialog and Privacy Policy say
-- bookings/PT/goals are removed; members who registered interest or requested
-- PT before signing up kept those rows forever after "Delete my account".
--
-- Extends delete_member_account to remove email-matched member_interest,
-- trainer_interest, partner_interest and any private_session_requests still
-- holding that address (covers anonymous submissions where user_id is null).
-- Matching stays exact on lower(btrim(email)) so an underscore cannot sweep
-- up a stranger's row. Tables that are not installed yet are skipped.

create or replace function public.delete_member_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_email text;
  v_table text;
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

  -- Linked PT requests first (account-owned coaching notes).
  delete from public.private_session_requests where user_id = p_user_id;

  if v_email is not null and v_email <> '' then
    -- Legacy public class enquiry table (no user_id).
    if to_regclass('public.class_bookings') is not null then
      execute 'delete from public.class_bookings where lower(btrim(email)) = $1'
        using v_email;
    end if;

    -- Anonymous (and any leftover) PT rows matched only by email.
    delete from public.private_session_requests
     where lower(btrim(email)) = v_email;

    -- Public interest leads, including health free-text on member_interest.
    foreach v_table in array array[
      'member_interest', 'trainer_interest', 'partner_interest'
    ] loop
      if to_regclass('public.' || v_table) is not null then
        execute format(
          'delete from public.%I where lower(btrim(email)) = $1',
          v_table
        ) using v_email;
      end if;
    end loop;

    -- De-identify denormalised subject PII in immutable audit tables before
    -- the auth user (and therefore the email key) disappears.
    if to_regprocedure('public.redact_audit_subject_pii(text)') is not null then
      perform public.redact_audit_subject_pii(v_email);
    end if;
  end if;

  delete from auth.users where id = p_user_id;
end;
$$;

revoke execute on function public.delete_member_account(uuid) from public, anon, authenticated;
grant execute on function public.delete_member_account(uuid) to service_role;

insert into public.xert_schema_capabilities (capability)
values ('account_deletion_public_lead_cleanup')
on conflict (capability) do nothing;
