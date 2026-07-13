-- Enforce trusted initial workflow state and consent for every public form.
-- Idempotent and safe to run after the lead/request tables and booking_schema.sql.

alter table public.member_interest enable row level security;
drop policy if exists "public_insert_member_interest" on public.member_interest;
create policy "public_insert_member_interest" on public.member_interest
  for insert to anon, authenticated
  with check (status = 'new' and consent_to_contact is true);

alter table public.trainer_interest enable row level security;
drop policy if exists "public_insert_trainer_interest" on public.trainer_interest;
create policy "public_insert_trainer_interest" on public.trainer_interest
  for insert to anon, authenticated
  with check (status = 'new' and consent_to_contact is true);

alter table public.partner_interest enable row level security;
drop policy if exists "public_insert_partner_interest" on public.partner_interest;
create policy "public_insert_partner_interest" on public.partner_interest
  for insert to anon, authenticated
  with check (status = 'new' and consent_to_contact is true);

alter table public.class_bookings enable row level security;
drop policy if exists "public_insert_class_bookings" on public.class_bookings;
create policy "public_insert_class_bookings" on public.class_bookings
  for insert to anon, authenticated
  with check (status = 'requested' and consent_to_contact is true);

alter table public.private_session_requests
  add column if not exists user_id uuid references auth.users(id) on delete set null default auth.uid();
alter table public.private_session_requests enable row level security;
drop policy if exists "public_insert_private_session_requests" on public.private_session_requests;
create policy "public_insert_private_session_requests" on public.private_session_requests
  for insert to anon, authenticated
  with check (
    status = 'requested'
    and consent_to_contact is true
    and (
      (auth.uid() is null and user_id is null)
      or (auth.uid() is not null and user_id = auth.uid())
    )
  );

-- Register only after every policy above has been recreated successfully.
create table if not exists public.xert_schema_capabilities (
  capability text primary key,
  installed_at timestamptz not null default now()
);
alter table public.xert_schema_capabilities enable row level security;
drop policy if exists "xert_schema_capabilities_admin_read" on public.xert_schema_capabilities;
create policy "xert_schema_capabilities_admin_read" on public.xert_schema_capabilities
  for select to authenticated using (public.is_admin());
insert into public.xert_schema_capabilities (capability)
values ('public_form_integrity') on conflict (capability) do nothing;
create or replace function public.xert_public_capabilities()
returns table (capability text)
language sql security definer stable set search_path = public as $$
  select c.capability from public.xert_schema_capabilities c order by c.capability;
$$;
revoke execute on function public.xert_public_capabilities() from public;
grant execute on function public.xert_public_capabilities() to anon, authenticated;
