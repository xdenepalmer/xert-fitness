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
      (auth.uid() is null and user_id is null)
      or (auth.uid() is not null and user_id = auth.uid())
    )
  );

drop policy if exists "members_read_own_private_session_requests" on public.private_session_requests;
create policy "members_read_own_private_session_requests" on public.private_session_requests
  for select to authenticated
  using (user_id = auth.uid());
