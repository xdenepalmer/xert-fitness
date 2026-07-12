-- ============================================================================
-- XERT Fitness — Row Level Security policies
-- ============================================================================
-- Run this ONCE in the Supabase dashboard:  SQL Editor → New query → paste → Run.
--
-- Model:
--   • Public (anon) visitors may ONLY insert into the lead / booking / request
--     tables — exactly what the public forms do. They cannot read, update or
--     delete anything.
--   • Authenticated admins (anyone signed in via Supabase Auth) get full
--     read/write access to every table — exactly what the Admin Command Centre
--     needs.
--
-- This is safe to re-run: every policy is dropped before being recreated.
-- ============================================================================


-- ── Helper: tables that the PUBLIC forms insert into ────────────────────────
-- member_interest, trainer_interest, partner_interest, class_bookings,
-- private_session_requests  → public INSERT + admin full access
-- ----------------------------------------------------------------------------

-- member_interest -----------------------------------------------------------
alter table public.member_interest enable row level security;
drop policy if exists "public_insert_member_interest" on public.member_interest;
drop policy if exists "admin_all_member_interest" on public.member_interest;
create policy "public_insert_member_interest" on public.member_interest
  for insert to anon, authenticated with check (true);
create policy "admin_all_member_interest" on public.member_interest
  for all to authenticated using (true) with check (true);

-- trainer_interest ----------------------------------------------------------
alter table public.trainer_interest enable row level security;
drop policy if exists "public_insert_trainer_interest" on public.trainer_interest;
drop policy if exists "admin_all_trainer_interest" on public.trainer_interest;
create policy "public_insert_trainer_interest" on public.trainer_interest
  for insert to anon, authenticated with check (true);
create policy "admin_all_trainer_interest" on public.trainer_interest
  for all to authenticated using (true) with check (true);

-- partner_interest ----------------------------------------------------------
alter table public.partner_interest enable row level security;
drop policy if exists "public_insert_partner_interest" on public.partner_interest;
drop policy if exists "admin_all_partner_interest" on public.partner_interest;
create policy "public_insert_partner_interest" on public.partner_interest
  for insert to anon, authenticated with check (true);
create policy "admin_all_partner_interest" on public.partner_interest
  for all to authenticated using (true) with check (true);

-- class_bookings ------------------------------------------------------------
alter table public.class_bookings enable row level security;
drop policy if exists "public_insert_class_bookings" on public.class_bookings;
drop policy if exists "admin_all_class_bookings" on public.class_bookings;
create policy "public_insert_class_bookings" on public.class_bookings
  for insert to anon, authenticated with check (true);
create policy "admin_all_class_bookings" on public.class_bookings
  for all to authenticated using (true) with check (true);

-- private_session_requests --------------------------------------------------
alter table public.private_session_requests enable row level security;
drop policy if exists "public_insert_private_session_requests" on public.private_session_requests;
drop policy if exists "admin_all_private_session_requests" on public.private_session_requests;
create policy "public_insert_private_session_requests" on public.private_session_requests
  for insert to anon, authenticated with check (true);
create policy "admin_all_private_session_requests" on public.private_session_requests
  for all to authenticated using (true) with check (true);


-- ── class_sessions ──────────────────────────────────────────────────────────
-- The public site shows published, publicly-visible classes (getClassSessions
-- with publicOnly=true). So: public may READ only published+visible rows;
-- admins get full access.
-- ----------------------------------------------------------------------------
alter table public.class_sessions enable row level security;
drop policy if exists "public_read_published_class_sessions" on public.class_sessions;
drop policy if exists "admin_all_class_sessions" on public.class_sessions;
create policy "public_read_published_class_sessions" on public.class_sessions
  for select to anon, authenticated
  using (public_visible = true and status = 'published');
create policy "admin_all_class_sessions" on public.class_sessions
  for all to authenticated using (true) with check (true);


-- ── admin_settings ──────────────────────────────────────────────────────────
-- The public Home page reads soft-launch settings (countdown, banner, etc.),
-- so anon needs SELECT here; only admins may write.
-- ----------------------------------------------------------------------------
alter table public.admin_settings enable row level security;
drop policy if exists "public_read_admin_settings" on public.admin_settings;
drop policy if exists "admin_write_admin_settings" on public.admin_settings;
drop policy if exists "admin_update_admin_settings" on public.admin_settings;
drop policy if exists "admin_insert_admin_settings" on public.admin_settings;
create policy "public_read_admin_settings" on public.admin_settings
  for select to anon, authenticated using (true);
create policy "admin_update_admin_settings" on public.admin_settings
  for update to authenticated using (true) with check (true);
create policy "admin_insert_admin_settings" on public.admin_settings
  for insert to authenticated with check (true);


-- ============================================================================
-- Done. After running:
--   • Public forms still submit (anon INSERT allowed).
--   • Public site still shows the countdown/banner and published classes.
--   • Every admin read/edit requires a signed-in Supabase Auth user.
-- ============================================================================
