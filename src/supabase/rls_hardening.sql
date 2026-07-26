-- ============================================================================
-- XERT Fitness — RLS hardening: admin policies now require profiles.role='admin'
-- ============================================================================
-- The original rls_policies.sql treated ANY authenticated user as an admin
-- (written before member accounts existed). Now that the public can register,
-- every "admin_*" policy must check public.is_admin() instead of just
-- `to authenticated`. Public reads are unchanged; public form INSERTs are
-- constrained to their trusted initial status and required contact consent.
--
-- Requires booking_schema.sql (public.is_admin()) to be applied first.
-- Idempotent — safe to re-run. Admin policy quals use (select public.is_admin())
-- so a re-run keeps the InitPlan-safe shape from admin_policy_scalar_subquery
-- instead of reintroducing per-row is_admin() lookups. This file remains the
-- canonical hardening pass (it also covers profiles).
-- ============================================================================

-- ── Lead / request tables: guarded public INSERT + role-gated admin access ──

-- install_public_form_insert_policies() is the single authoritative definition
-- of these policies. Writing them out here as well is how an "idempotent"
-- re-run of this file could strip a guard a later script had added, so the
-- local copy is only a bootstrap for a database that predates the installer.
do $$
begin
  if to_regprocedure('public.install_public_form_insert_policies()') is not null then
    perform public.install_public_form_insert_policies();
  else
    execute $bootstrap$
      drop policy if exists "public_insert_member_interest" on public.member_interest;
      create policy "public_insert_member_interest" on public.member_interest
        for insert to anon, authenticated
        with check (status = 'new' and consent_to_contact is true);
    $bootstrap$;
    execute $bootstrap$
      drop policy if exists "public_insert_trainer_interest" on public.trainer_interest;
      create policy "public_insert_trainer_interest" on public.trainer_interest
        for insert to anon, authenticated
        with check (status = 'new' and consent_to_contact is true);
    $bootstrap$;
    execute $bootstrap$
      drop policy if exists "public_insert_partner_interest" on public.partner_interest;
      create policy "public_insert_partner_interest" on public.partner_interest
        for insert to anon, authenticated
        with check (status = 'new' and consent_to_contact is true);
    $bootstrap$;
    execute $bootstrap$
      drop policy if exists "public_insert_class_bookings" on public.class_bookings;
      create policy "public_insert_class_bookings" on public.class_bookings
        for insert to anon, authenticated
        with check (status = 'requested' and consent_to_contact is true);
    $bootstrap$;
    execute $bootstrap$
      drop policy if exists "public_insert_private_session_requests" on public.private_session_requests;
      create policy "public_insert_private_session_requests" on public.private_session_requests
        for insert to anon, authenticated
        with check (status = 'requested' and consent_to_contact is true
      and (
        ((select auth.uid()) is null and user_id is null)
        or ((select auth.uid()) is not null and user_id = (select auth.uid()))
      ));
    $bootstrap$;
  end if;
end;
$$;

-- member_interest
drop policy if exists "admin_all_member_interest" on public.member_interest;
create policy "admin_all_member_interest" on public.member_interest
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- trainer_interest
drop policy if exists "admin_all_trainer_interest" on public.trainer_interest;
create policy "admin_all_trainer_interest" on public.trainer_interest
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- partner_interest
drop policy if exists "admin_all_partner_interest" on public.partner_interest;
create policy "admin_all_partner_interest" on public.partner_interest
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- class_bookings (legacy request-to-book)
drop policy if exists "admin_all_class_bookings" on public.class_bookings;
create policy "admin_all_class_bookings" on public.class_bookings
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- private_session_requests
alter table public.private_session_requests
  add column if not exists user_id uuid references auth.users(id) on delete set null default auth.uid();
drop policy if exists "admin_all_private_session_requests" on public.private_session_requests;
create policy "admin_all_private_session_requests" on public.private_session_requests
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- ── class_sessions: public read of published stays; writes admin-only ───────
drop policy if exists "admin_all_class_sessions" on public.class_sessions;
create policy "admin_all_class_sessions" on public.class_sessions
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- ── profiles: members can update contact details, never their own authority ─
-- RLS controls row ownership; this trigger protects privileged columns from a
-- direct PostgREST update that tries to change role or identity fields.
create or replace function public.guard_profile_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    if tg_op = 'INSERT' then
      if coalesce(new.role, 'member') <> 'member' then
        raise exception 'PROFILE_ROLE_MANAGED_BY_ADMIN';
      end if;
    elsif tg_op = 'UPDATE' then
      if new.id is distinct from old.id then
        raise exception 'PROFILE_ID_IMMUTABLE';
      end if;
      if new.role is distinct from old.role then
        raise exception 'PROFILE_ROLE_MANAGED_BY_ADMIN';
      end if;
      if new.email is distinct from old.email then
        raise exception 'PROFILE_EMAIL_MANAGED_BY_AUTH';
      end if;
      if new.created_at is distinct from old.created_at then
        raise exception 'PROFILE_CREATED_AT_IMMUTABLE';
      end if;
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists before_profile_write on public.profiles;
create trigger before_profile_write
  before insert or update on public.profiles
  for each row execute function public.guard_profile_write();

revoke execute on function public.guard_profile_write() from public, anon, authenticated;

drop policy if exists "profiles_insert_self" on public.profiles;

-- ── admin_settings: public read stays; writes admin-only ────────────────────
drop policy if exists "admin_update_admin_settings" on public.admin_settings;
drop policy if exists "admin_insert_admin_settings" on public.admin_settings;
create policy "admin_update_admin_settings" on public.admin_settings
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin_insert_admin_settings" on public.admin_settings
  for insert to authenticated with check ((select public.is_admin()));

-- ── availability_blocks / blackout_periods: admin-only entirely ─────────────
drop policy if exists "admin_all_availability_blocks" on public.availability_blocks;
drop policy if exists "admins_manage_availability_blocks" on public.availability_blocks;
create policy "admins_manage_availability_blocks" on public.availability_blocks
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "admin_all_blackout_periods" on public.blackout_periods;
drop policy if exists "admins_manage_blackout_periods" on public.blackout_periods;
create policy "admins_manage_blackout_periods" on public.blackout_periods
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- ============================================================================
-- Done. Verify with:
--   select tablename, policyname, qual from pg_policies
--   where schemaname='public' and policyname like 'admin%';
-- ============================================================================
