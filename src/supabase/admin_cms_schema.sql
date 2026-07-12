-- ============================================================================
-- XERT Fitness — Admin panel + CMS schema
-- ============================================================================
-- Adds:
--   • profiles.email (so admins can identify members)
--   • site_content: JSONB key/value CMS (public read, admin write)
--   • Admin RPCs (SECURITY DEFINER, is_admin()-guarded):
--       admin_list_members, admin_grant_credits, admin_set_role,
--       admin_session_roster, admin_set_booking_status,
--       admin_cancel_class_session
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

-- Manage a member booking. Pending requests reserve a credit and seat so a
-- confirmation is reliable; waitlisting, declining, or cancelling releases
-- the credit. Moving a waitlisted/declined booking back to requested or
-- confirmed checks capacity and reserves a new credit atomically.
create or replace function public.admin_set_booking_status(p_booking_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_batch uuid;
  v_current text;
  v_user uuid;
  v_session uuid;
  v_capacity integer;
  v_start timestamptz;
  v_active_count integer;
  v_new_batch uuid;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_status not in ('requested', 'confirmed', 'waitlisted', 'cancelled', 'declined', 'attended', 'no_show') then
    raise exception 'INVALID_STATUS';
  end if;

  select credit_batch_id, status, user_id, class_session_id
    into v_batch, v_current, v_user, v_session
    from session_bookings where id = p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if p_status = v_current then return; end if;

  if p_status in ('attended', 'no_show') and v_current <> 'confirmed' then
    raise exception 'STATUS_TRANSITION_NOT_ALLOWED';
  end if;

  -- A status becoming requested/confirmed must reserve a space and credit.
  if p_status in ('requested', 'confirmed') and v_current not in ('requested', 'confirmed') then
    select capacity, start_time into v_capacity, v_start
      from class_sessions where id = v_session for update;
    if not found then raise exception 'SESSION_NOT_FOUND'; end if;
    if v_start <= now() then raise exception 'SESSION_IN_PAST'; end if;

    select count(*) into v_active_count
      from session_bookings
      where class_session_id = v_session and status in ('requested', 'confirmed');
    if v_capacity is not null and v_active_count >= v_capacity then
      raise exception 'SESSION_FULL';
    end if;

    select id into v_new_batch
      from credit_batches
      where user_id = v_user and remaining > 0
        and (expires_at is null or expires_at > now())
      order by expires_at asc nulls last, created_at asc
      limit 1 for update;
    if v_new_batch is null then raise exception 'NO_CREDITS'; end if;

    update credit_batches set remaining = remaining - 1 where id = v_new_batch;
    v_batch := v_new_batch;
  end if;

  update session_bookings
    set status = p_status,
        credit_batch_id = v_batch,
        cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end
    where id = p_booking_id;

  -- Admin resolution releases a previously reserved credit. This is not tied
  -- to the member cancellation window because staff initiated the change.
  if p_status in ('waitlisted', 'declined', 'cancelled')
    and v_current in ('requested', 'confirmed') and v_batch is not null then
    update credit_batches set remaining = remaining + 1 where id = v_batch;
  end if;
end; $$;

-- Cancel a class as an operator action. This is deliberately different from a
-- member cancellation: every outstanding member booking is invalidated and
-- any reserved credit is returned because XERT, not the member, cancelled it.
create or replace function public.admin_cancel_class_session(p_session_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_cancelled_count integer := 0;
  v_enquiry_cancelled_count integer := 0;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;

  -- Locking the session prevents a concurrent booking from being created
  -- between cancelling the class and releasing its reserved places.
  select status into v_status
    from public.class_sessions
    where id = p_session_id
    for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if v_status = 'completed' then raise exception 'SESSION_ALREADY_COMPLETED'; end if;

  with cancelled_bookings as (
    update public.session_bookings
       set status = 'cancelled', cancelled_at = now()
     where class_session_id = p_session_id
       and status in ('requested', 'confirmed', 'waitlisted')
     returning credit_batch_id, status
  ), restored_credits as (
    update public.credit_batches credits
       set remaining = credits.remaining + refunds.credit_count
      from (
        select credit_batch_id, count(*)::integer as credit_count
          from cancelled_bookings
         where status in ('requested', 'confirmed')
           and credit_batch_id is not null
         group by credit_batch_id
      ) refunds
     where credits.id = refunds.credit_batch_id
     returning credits.id
  )
  select count(*) into v_cancelled_count from cancelled_bookings;

  -- The original public booking form uses class_bookings rather than session
  -- credits. Keep that operational queue in sync when its table is present.
  if to_regclass('public.class_bookings') is not null then
    execute $query$
      update public.class_bookings
         set status = 'cancelled'
       where class_session_id = $1
         and status in ('requested', 'confirmed', 'waitlisted')
    $query$ using p_session_id;
    get diagnostics v_enquiry_cancelled_count = row_count;
  end if;

  update public.class_sessions
     set status = 'cancelled', updated_at = now()
   where id = p_session_id;

  return v_cancelled_count + v_enquiry_cancelled_count;
end; $$;


-- ── Grants ──────────────────────────────────────────────────────────────────
revoke execute on function public.admin_list_members() from public, anon;
revoke execute on function public.admin_grant_credits(uuid, integer, integer) from public, anon;
revoke execute on function public.admin_set_role(uuid, text) from public, anon;
revoke execute on function public.admin_session_roster(uuid) from public, anon;
revoke execute on function public.admin_set_booking_status(uuid, text) from public, anon;
revoke execute on function public.admin_cancel_class_session(uuid) from public, anon;
grant execute on function public.admin_list_members()                    to authenticated;
grant execute on function public.admin_grant_credits(uuid, integer, integer) to authenticated;
grant execute on function public.admin_set_role(uuid, text)              to authenticated;
grant execute on function public.admin_session_roster(uuid)              to authenticated;
grant execute on function public.admin_set_booking_status(uuid, text)    to authenticated;
grant execute on function public.admin_cancel_class_session(uuid)         to authenticated;

-- ============================================================================
-- Done.
-- ============================================================================
