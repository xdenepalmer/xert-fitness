-- XERT Fitness - audited, idempotent manual credit grants
-- Run after booking_schema.sql and admin_cms_schema.sql.

create table if not exists public.admin_credit_grants (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  user_id uuid references auth.users(id) on delete set null,
  granted_by uuid references auth.users(id) on delete set null,
  sessions integer not null check (sessions between 1 and 100),
  validity_days integer check (validity_days between 1 and 3650),
  note text not null check (char_length(btrim(note)) between 3 and 500),
  credit_batch_id uuid references public.credit_batches(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists admin_credit_grants_user_created_idx
  on public.admin_credit_grants(user_id, created_at desc);

alter table public.admin_credit_grants enable row level security;
drop policy if exists "admins_read_credit_grants" on public.admin_credit_grants;
create policy "admins_read_credit_grants" on public.admin_credit_grants
  for select to authenticated using (public.is_admin());

create or replace function public.admin_grant_credits_v2(
  p_user_id uuid,
  p_sessions integer,
  p_validity_days integer,
  p_request_id uuid,
  p_note text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_existing public.admin_credit_grants%rowtype;
  v_credit_batch_id uuid;
  v_note text := btrim(coalesce(p_note, ''));
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_user_id is null or not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'MEMBER_NOT_FOUND';
  end if;
  if p_sessions is null or p_sessions < 1 or p_sessions > 100 then
    raise exception 'INVALID_SESSION_COUNT';
  end if;
  if p_validity_days is not null and (p_validity_days < 1 or p_validity_days > 3650) then
    raise exception 'INVALID_VALIDITY_DAYS';
  end if;
  if p_request_id is null then raise exception 'REQUEST_ID_REQUIRED'; end if;
  if char_length(v_note) < 3 or char_length(v_note) > 500 then
    raise exception 'GRANT_NOTE_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select * into v_existing
    from public.admin_credit_grants
    where request_id = p_request_id;

  if found then
    if v_existing.user_id is distinct from p_user_id
      or v_existing.sessions is distinct from p_sessions
      or v_existing.validity_days is distinct from p_validity_days
      or v_existing.note is distinct from v_note then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return v_existing.credit_batch_id;
  end if;

  insert into public.credit_batches (user_id, total, remaining, expires_at)
  values (
    p_user_id,
    p_sessions,
    p_sessions,
    case when p_validity_days is not null then now() + make_interval(days => p_validity_days) end
  ) returning id into v_credit_batch_id;

  insert into public.admin_credit_grants (
    request_id, user_id, granted_by, sessions, validity_days, note, credit_batch_id
  ) values (
    p_request_id, p_user_id, auth.uid(), p_sessions, p_validity_days, v_note, v_credit_batch_id
  );

  return v_credit_batch_id;
end; $$;

revoke execute on function public.admin_grant_credits_v2(uuid, integer, integer, uuid, text) from public, anon;
grant execute on function public.admin_grant_credits_v2(uuid, integer, integer, uuid, text) to authenticated;
