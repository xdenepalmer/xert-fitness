-- ============================================================================
-- XERT Fitness — RLS hardening: admin policies now require profiles.role='admin'
-- ============================================================================
-- The original rls_policies.sql treated ANY authenticated user as an admin
-- (written before member accounts existed). Now that the public can register,
-- every "admin_*" policy must check public.is_admin() instead of just
-- `to authenticated`. Public form INSERTs and public reads are unchanged.
--
-- Requires booking_schema.sql (public.is_admin()) to be applied first.
-- Idempotent — safe to re-run. This supersedes the admin policies in
-- rls_policies.sql; re-running that file will undo this hardening, so don't.
-- ============================================================================

-- ── Lead / request tables: public INSERT stays, admin access now role-gated ──

-- member_interest
drop policy if exists "admin_all_member_interest" on public.member_interest;
create policy "admin_all_member_interest" on public.member_interest
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- trainer_interest
drop policy if exists "admin_all_trainer_interest" on public.trainer_interest;
create policy "admin_all_trainer_interest" on public.trainer_interest
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- partner_interest
drop policy if exists "admin_all_partner_interest" on public.partner_interest;
create policy "admin_all_partner_interest" on public.partner_interest
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- class_bookings (legacy request-to-book)
drop policy if exists "admin_all_class_bookings" on public.class_bookings;
create policy "admin_all_class_bookings" on public.class_bookings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- private_session_requests
drop policy if exists "admin_all_private_session_requests" on public.private_session_requests;
create policy "admin_all_private_session_requests" on public.private_session_requests
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ── class_sessions: public read of published stays; writes admin-only ───────
drop policy if exists "admin_all_class_sessions" on public.class_sessions;
create policy "admin_all_class_sessions" on public.class_sessions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ── admin_settings: public read stays; writes admin-only ────────────────────
drop policy if exists "admin_update_admin_settings" on public.admin_settings;
drop policy if exists "admin_insert_admin_settings" on public.admin_settings;
create policy "admin_update_admin_settings" on public.admin_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin_insert_admin_settings" on public.admin_settings
  for insert to authenticated with check (public.is_admin());

-- ── availability_blocks / blackout_periods: admin-only entirely ─────────────
drop policy if exists "admin_all_availability_blocks" on public.availability_blocks;
drop policy if exists "admins_manage_availability_blocks" on public.availability_blocks;
create policy "admins_manage_availability_blocks" on public.availability_blocks
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin_all_blackout_periods" on public.blackout_periods;
drop policy if exists "admins_manage_blackout_periods" on public.blackout_periods;
create policy "admins_manage_blackout_periods" on public.blackout_periods
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- Done. Verify with:
--   select tablename, policyname, qual from pg_policies
--   where schemaname='public' and policyname like 'admin%';
-- ============================================================================
