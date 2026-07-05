-- ============================================================================
-- XERT Fitness — Admin panel + CMS schema
-- ============================================================================
-- Adds:
--   • profiles.email (so admins can identify members)
--   • site_content: JSONB key/value CMS (public read, admin write)
--   • Admin RPCs (SECURITY DEFINER, is_admin()-guarded):
--       admin_list_members, admin_grant_credits, admin_set_role,
--       admin_session_roster, admin_set_booking_status
-- Idempotent — safe to re-run.
-- ============================================================================


-- ── profiles.email ──────────────────────────────────────────────────────────
alter table public.profiles add column if not exists email text;

-- Keep the signup trigger writing email too.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone, email)
  values (new.id,
          new.raw_user_meta_data->>'full_name',
          new.raw_user_meta_data->>'phone',
          new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end; $$;

-- Backfill any existing profiles.
update public.profiles p set email = u.email
from auth.users u where u.id = p.id and p.email is distinct from u.email;


-- ── site_content (CMS) ──────────────────────────────────────────────────────
create table if not exists public.site_content (
  key         text primary key,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.site_content enable row level security;
drop policy if exists "site_content_public_read" on public.site_content;
drop policy if exists "site_content_admin_all"   on public.site_content;
create policy "site_content_public_read" on public.site_content
  for select to anon, authenticated using (true);
create policy "site_content_admin_all" on public.site_content
  for all to authenticated using (public.is_admin()) with check (public.is_admin());


-- ── Admin RPCs ──────────────────────────────────────────────────────────────

-- All registered members with credit balance and booking/order counts.
create or replace function public.admin_list_members()
returns table (
  id uuid, full_name text, email text, phone text, role text, joined_at timestamptz,
  credits_remaining bigint, bookings_count bigint, orders_count bigint, total_spent_cents bigint
) language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  return query
  select p.id, p.full_name, p.email, p.phone, p.role, p.created_at,
         coalesce((select sum(cb.remaining) from credit_batches cb
                   where cb.user_id = p.id and (cb.expires_at is null or cb.expires_at > now())), 0),
         (select count(*) from session_bookings sb where sb.user_id = p.id),
         (select count(*) from orders o where o.user_id = p.id and o.status = 'paid'),
         coalesce((select sum(o.amount_cents) from orders o where o.user_id = p.id and o.status = 'paid'), 0)
  from profiles p
  order by p.created_at desc;
end; $$;

-- Grant comp / manual credits to a member.
create or replace function public.admin_grant_credits(
  p_user_id uuid, p_sessions integer, p_validity_days integer
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_sessions is null or p_sessions <= 0 or p_sessions > 100 then
    raise exception 'INVALID_SESSION_COUNT';
  end if;
  insert into credit_batches (user_id, total, remaining, expires_at)
  values (p_user_id, p_sessions, p_sessions,
          case when p_validity_days is not null and p_validity_days > 0
               then now() + make_interval(days => p_validity_days) end);
end; $$;

-- Promote/demote admins.
create or replace function public.admin_set_role(p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_role not in ('member', 'admin') then raise exception 'INVALID_ROLE'; end if;
  if p_user_id = auth.uid() and p_role <> 'admin' then
    raise exception 'CANNOT_DEMOTE_SELF';
  end if;
  update profiles set role = p_role, updated_at = now() where id = p_user_id;
end; $$;

-- Credit-based roster for a class (names + attendance status).
create or replace function public.admin_session_roster(p_session_id uuid)
returns table (
  booking_id uuid, member_id uuid, full_name text, email text, phone text,
  status text, booked_at timestamptz
) language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  return query
  select b.id, b.user_id, p.full_name, p.email, p.phone, b.status, b.created_at
  from session_bookings b
  left join profiles p on p.id = b.user_id
  where b.class_session_id = p_session_id
  order by b.created_at asc;
end; $$;

-- Mark attendance or admin-cancel (refunds the credit on cancel).
create or replace function public.admin_set_booking_status(p_booking_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_batch uuid;
  v_current text;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_status not in ('confirmed', 'attended', 'no_show', 'cancelled') then
    raise exception 'INVALID_STATUS';
  end if;

  select credit_batch_id, status into v_batch, v_current
    from session_bookings where id = p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;

  update session_bookings
    set status = p_status,
        cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end
    where id = p_booking_id;

  -- Admin cancellations always return the credit (goodwill path).
  if p_status = 'cancelled' and v_current <> 'cancelled' and v_batch is not null then
    update credit_batches set remaining = remaining + 1 where id = v_batch;
  end if;
end; $$;


-- ── Grants ──────────────────────────────────────────────────────────────────
grant execute on function public.admin_list_members()                    to authenticated;
grant execute on function public.admin_grant_credits(uuid, integer, integer) to authenticated;
grant execute on function public.admin_set_role(uuid, text)              to authenticated;
grant execute on function public.admin_session_roster(uuid)              to authenticated;
grant execute on function public.admin_set_booking_status(uuid, text)    to authenticated;

-- ============================================================================
-- Done.
-- ============================================================================
