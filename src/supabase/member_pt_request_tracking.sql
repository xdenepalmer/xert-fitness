-- Link authenticated PT requests to their member account while preserving
-- anonymous public enquiries. Safe to run repeatedly.

alter table public.private_session_requests
  add column if not exists user_id uuid references auth.users(id) on delete set null default auth.uid();

create index if not exists private_session_requests_user_created_idx
  on public.private_session_requests (user_id, created_at desc)
  where user_id is not null;

-- Conservatively claim historical requests only when one profile owns the
-- normalized email address. Ambiguous addresses remain anonymous.
with unique_profiles as (
  select lower(trim(email)) as email, min(id::text)::uuid as user_id
  from public.profiles
  where nullif(trim(email), '') is not null
  group by lower(trim(email))
  having count(*) = 1
)
update public.private_session_requests request
set user_id = profile.user_id
from unique_profiles profile
where request.user_id is null
  and lower(trim(request.email)) = profile.email;

alter table public.private_session_requests enable row level security;

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

-- Runtime capability marker for admin health and release CI. Register this
-- only after the column, policies and historical ownership pass all succeed.
create table if not exists public.xert_schema_capabilities (
  capability text primary key,
  installed_at timestamptz not null default now()
);
alter table public.xert_schema_capabilities enable row level security;
drop policy if exists "xert_schema_capabilities_admin_read" on public.xert_schema_capabilities;
create policy "xert_schema_capabilities_admin_read" on public.xert_schema_capabilities
  for select to authenticated using (public.is_admin());
insert into public.xert_schema_capabilities (capability)
values ('member_pt_request_tracking') on conflict (capability) do nothing;
create or replace function public.xert_public_capabilities()
returns table (capability text)
language sql security definer stable set search_path = public as $$
  select c.capability from public.xert_schema_capabilities c order by c.capability;
$$;
revoke execute on function public.xert_public_capabilities() from public;
grant execute on function public.xert_public_capabilities() to anon, authenticated;
