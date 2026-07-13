-- Evaluate request identity/admin checks once per statement instead of once
-- per scanned row across the core member and admin data paths.

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()))
  with check (id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "orders_select_own_or_admin" on public.orders;
create policy "orders_select_own_or_admin" on public.orders
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "announcement_receipts_select_own_or_admin" on public.member_announcement_receipts;
create policy "announcement_receipts_select_own_or_admin" on public.member_announcement_receipts
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "credit_batches_select_own_or_admin" on public.credit_batches;
create policy "credit_batches_select_own_or_admin" on public.credit_batches
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "session_bookings_select_own_or_admin" on public.session_bookings;
create policy "session_bookings_select_own_or_admin" on public.session_bookings
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "member_event_goals_select_own_or_admin" on public.member_event_goals;
create policy "member_event_goals_select_own_or_admin" on public.member_event_goals
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "member_event_goals_insert_own" on public.member_event_goals;
create policy "member_event_goals_insert_own" on public.member_event_goals
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "member_event_goals_delete_own_or_admin" on public.member_event_goals;
create policy "member_event_goals_delete_own_or_admin" on public.member_event_goals
  for delete to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "public_insert_private_session_requests" on public.private_session_requests;
create policy "public_insert_private_session_requests" on public.private_session_requests
  for insert to anon, authenticated
  with check (
    status = 'requested'
    and consent_to_contact is true
    and (
      ((select auth.uid()) is null and user_id is null)
      or ((select auth.uid()) is not null and user_id = (select auth.uid()))
    )
  );

drop policy if exists "members_read_own_private_session_requests" on public.private_session_requests;
create policy "members_read_own_private_session_requests" on public.private_session_requests
  for select to authenticated
  using (user_id = (select auth.uid()));

insert into public.xert_schema_capabilities (capability)
values ('rls_policy_performance')
on conflict (capability) do nothing;
