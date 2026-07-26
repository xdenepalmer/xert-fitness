-- Evaluates public.is_admin() once per query instead of once per row.
--
-- 20260714007000 wrapped auth.uid() and public.is_admin() in a scalar subquery
-- for eleven policies so the planner hoists them into an InitPlan. The
-- admin_all_* policies on the lead and request tables, class_sessions,
-- admin_settings, availability_blocks and blackout_periods were never included,
-- so they still call the function in a bare qual, once for every row scanned.
--
-- Measured on PostgreSQL 16 with is_admin()'s real body (a STABLE SECURITY
-- DEFINER `select exists (...)`) as the USING clause over 5,000 rows, running
-- as a non-superuser so RLS applied. Bare: `Filter: ((status = 'new') AND
-- is_admin())`, 9.424 ms. Wrapped: `InitPlan 1 (returns $0)` computed once,
-- `Filter: ($0 AND ...)`, 0.354 ms. A control confirmed the effect is specific
-- to RLS quals rather than general constant folding.
--
-- Every admin badge count, every lead export page and every member directory
-- scan pays this, and it gets worse in exact proportion to how much data the
-- gym accumulates. The predicate is unchanged; only its evaluation frequency is.
--
-- The policies are recreated with their existing shape and nothing else moves.

drop policy if exists "admin_all_member_interest" on public.member_interest;
create policy "admin_all_member_interest" on public.member_interest
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "admin_all_trainer_interest" on public.trainer_interest;
create policy "admin_all_trainer_interest" on public.trainer_interest
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "admin_all_partner_interest" on public.partner_interest;
create policy "admin_all_partner_interest" on public.partner_interest
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "admin_all_class_bookings" on public.class_bookings;
create policy "admin_all_class_bookings" on public.class_bookings
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "admin_all_private_session_requests" on public.private_session_requests;
create policy "admin_all_private_session_requests" on public.private_session_requests
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "admin_all_class_sessions" on public.class_sessions;
create policy "admin_all_class_sessions" on public.class_sessions
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "admin_update_admin_settings" on public.admin_settings;
create policy "admin_update_admin_settings" on public.admin_settings
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "admin_insert_admin_settings" on public.admin_settings;
create policy "admin_insert_admin_settings" on public.admin_settings
  for insert to authenticated with check ((select public.is_admin()));

drop policy if exists "admins_manage_availability_blocks" on public.availability_blocks;
create policy "admins_manage_availability_blocks" on public.availability_blocks
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "admins_manage_blackout_periods" on public.blackout_periods;
create policy "admins_manage_blackout_periods" on public.blackout_periods
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

insert into public.xert_schema_capabilities (capability)
values ('admin_policy_scalar_subquery') on conflict (capability) do nothing;
