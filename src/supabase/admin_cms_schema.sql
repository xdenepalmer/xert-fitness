-- ============================================================================
-- XERT Fitness — Admin panel + CMS schema
-- ============================================================================
-- Adds:
--   • profiles.email (so admins can identify members)
--   • site_content: JSONB key/value CMS (public read, admin write)
--   • Admin RPCs (SECURITY DEFINER, is_admin()-guarded):
--       admin_list_members, admin_grant_credits, admin_set_role,
--       admin_session_roster, admin_set_booking_status,
--       admin_cancel_class_session, admin_event_goal_members
-- Idempotent — safe to re-run.
-- ============================================================================


-- ── profiles.email ──────────────────────────────────────────────────────────
alter table public.profiles add column if not exists email text;

-- booking_schema.sql defines the base profile guard before the email column
-- exists. Once the CMS schema adds it, extend the same trigger so members
-- cannot replace the contact address staff rely on to identify an account.
create or replace function public.guard_profile_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    if tg_op = 'INSERT' then
      if coalesce(new.role, 'member') <> 'member' then
        raise exception 'PROFILE_ROLE_MANAGED_BY_ADMIN';
      end if;
    elsif tg_op = 'UPDATE' then
      if new.id is distinct from old.id then
        raise exception 'PROFILE_ID_IMMUTABLE';
      end if;
      if new.role is distinct from old.role then
        raise exception 'PROFILE_ROLE_MANAGED_BY_ADMIN';
      end if;
      if new.email is distinct from old.email then
        raise exception 'PROFILE_EMAIL_MANAGED_BY_AUTH';
      end if;
      if new.created_at is distinct from old.created_at then
        raise exception 'PROFILE_CREATED_AT_IMMUTABLE';
      end if;
    end if;
  end if;
  return new;
end; $$;

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

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.guard_profile_write() from public, anon, authenticated;

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

-- Bounded command-palette search. Filtering before the aggregate subqueries
-- keeps member lookup fast as the directory grows.
create or replace function public.admin_search_members(
  p_search text,
  p_limit integer default 12
)
returns table (
  id uuid, full_name text, email text, phone text, role text, joined_at timestamptz,
  credits_remaining bigint, bookings_count bigint, orders_count bigint, total_spent_cents bigint
) language plpgsql security definer stable set search_path = public as $$
declare
  v_search text := btrim(coalesce(p_search, ''));
  v_limit integer := greatest(1, least(coalesce(p_limit, 12), 20));
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if char_length(v_search) < 2 or char_length(v_search) > 100 then return; end if;

  return query
  select p.id, p.full_name, p.email, p.phone, p.role, p.created_at,
         coalesce((select sum(cb.remaining) from credit_batches cb
                   where cb.user_id = p.id and (cb.expires_at is null or cb.expires_at > now())), 0),
         (select count(*) from session_bookings sb where sb.user_id = p.id),
         (select count(*) from orders o where o.user_id = p.id and o.status = 'paid'),
         coalesce((select sum(o.amount_cents) from orders o where o.user_id = p.id and o.status = 'paid'), 0)
  from profiles p
  where p.full_name ilike '%' || v_search || '%'
     or p.email ilike '%' || v_search || '%'
     or p.phone ilike '%' || v_search || '%'
  order by p.created_at desc, p.id desc
  limit v_limit;
end; $$;

-- Server-filtered member directory. The total count travels with each bounded
-- row so the admin can paginate without downloading every member account.
create or replace function public.admin_list_members_page(
  p_search text default null,
  p_role text default 'all',
  p_credit text default 'all',
  p_limit integer default 50,
  p_offset integer default 0,
  p_user_id uuid default null
)
returns table (
  id uuid, full_name text, email text, phone text, role text, joined_at timestamptz,
  credits_remaining bigint, bookings_count bigint, orders_count bigint,
  total_spent_cents bigint, total_count bigint
) language plpgsql security definer stable set search_path = public as $$
declare
  v_search text := btrim(coalesce(p_search, ''));
  v_role text := lower(btrim(coalesce(p_role, 'all')));
  v_credit text := lower(btrim(coalesce(p_credit, 'all')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if char_length(v_search) > 100 then raise exception 'INVALID_MEMBER_SEARCH'; end if;
  if v_role not in ('all', 'member', 'admin') then raise exception 'INVALID_MEMBER_ROLE_FILTER'; end if;
  if v_credit not in ('all', 'available', 'none') then raise exception 'INVALID_MEMBER_CREDIT_FILTER'; end if;

  return query
  with member_rows as materialized (
    select p.id, p.full_name, p.email, p.phone, p.role, p.created_at as joined_at,
           coalesce((select sum(cb.remaining) from credit_batches cb
                     where cb.user_id = p.id and cb.remaining > 0
                       and (cb.expires_at is null or cb.expires_at > now())), 0) as credits_remaining,
           (select count(*) from session_bookings sb where sb.user_id = p.id) as bookings_count,
           (select count(*) from orders o where o.user_id = p.id and o.status = 'paid') as orders_count,
           coalesce((select sum(o.amount_cents) from orders o where o.user_id = p.id and o.status = 'paid'), 0) as total_spent_cents
    from profiles p
    where (p_user_id is null or p.id = p_user_id)
      and (v_role = 'all' or p.role = v_role)
      and (
        v_search = ''
        or p.full_name ilike '%' || v_search || '%'
        or p.email ilike '%' || v_search || '%'
        or p.phone ilike '%' || v_search || '%'
      )
  )
  select m.id, m.full_name, m.email, m.phone, m.role, m.joined_at,
         m.credits_remaining, m.bookings_count, m.orders_count,
         m.total_spent_cents, count(*) over() as total_count
  from member_rows m
  where v_credit = 'all'
     or (v_credit = 'available' and m.credits_remaining > 0)
     or (v_credit = 'none' and m.credits_remaining <= 0)
  order by m.joined_at desc, m.id desc
  limit v_limit offset v_offset;
end; $$;

-- Append-only staff timeline for member servicing. Notes are never exposed to
-- members; archiving preserves the author, body and original timestamp.
create table if not exists public.admin_member_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null constraint admin_member_notes_user_id_fkey references public.profiles(id) on delete cascade,
  author_id uuid constraint admin_member_notes_author_id_fkey references public.profiles(id) on delete set null,
  category text not null check (category in ('general', 'coaching', 'follow_up', 'billing')),
  body text not null check (char_length(btrim(body)) between 3 and 1000),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid constraint admin_member_notes_archived_by_fkey references public.profiles(id) on delete set null
);
create index if not exists admin_member_notes_user_created_idx
  on public.admin_member_notes (user_id, created_at desc);
alter table public.admin_member_notes enable row level security;
revoke all on table public.admin_member_notes from public, anon, authenticated;
drop policy if exists "admin_member_notes_admin_read" on public.admin_member_notes;
create policy "admin_member_notes_admin_read" on public.admin_member_notes
  for select to authenticated using (public.is_admin());

create or replace function public.admin_list_member_notes(
  p_user_id uuid,
  p_include_archived boolean default false
)
returns table (
  id uuid, user_id uuid, author_id uuid, author_name text, category text,
  body text, created_at timestamptz, archived_at timestamptz, archived_by uuid
) language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_user_id is null then raise exception 'MEMBER_REQUIRED'; end if;
  return query
  select n.id, n.user_id, n.author_id, coalesce(a.full_name, a.email, 'Former admin'),
         n.category, n.body, n.created_at, n.archived_at, n.archived_by
  from public.admin_member_notes n
  left join public.profiles a on a.id = n.author_id
  where n.user_id = p_user_id
    and (coalesce(p_include_archived, false) or n.archived_at is null)
  order by (n.archived_at is not null), n.created_at desc
  limit 100;
end; $$;

create or replace function public.admin_add_member_note(
  p_user_id uuid,
  p_category text,
  p_body text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_category text := lower(btrim(coalesce(p_category, '')));
  v_body text := btrim(coalesce(p_body, ''));
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if v_category not in ('general', 'coaching', 'follow_up', 'billing') then raise exception 'INVALID_NOTE_CATEGORY'; end if;
  if char_length(v_body) < 3 or char_length(v_body) > 1000 then raise exception 'INVALID_NOTE_BODY'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then raise exception 'MEMBER_NOT_FOUND'; end if;
  insert into public.admin_member_notes (user_id, author_id, category, body)
  values (p_user_id, auth.uid(), v_category, v_body)
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.admin_set_member_note_archived(
  p_note_id uuid,
  p_archived boolean
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_updated integer;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_note_id is null or p_archived is null then raise exception 'INVALID_NOTE_ARCHIVE'; end if;
  update public.admin_member_notes
  set archived_at = case when p_archived then coalesce(archived_at, now()) else null end,
      archived_by = case when p_archived then coalesce(archived_by, auth.uid()) else null end
  where id = p_note_id;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then raise exception 'MEMBER_NOTE_NOT_FOUND'; end if;
end; $$;

create index if not exists session_bookings_member_status_session_idx
  on public.session_bookings (user_id, status, class_session_id);
create index if not exists credit_batches_member_expiry_active_idx
  on public.credit_batches (user_id, expires_at)
  where remaining > 0 and expires_at is not null;

-- Small operational queue for timely member follow-up. A recent active
-- follow-up note suppresses the member for seven days.
drop function if exists public.admin_member_follow_up_queue(integer);
create function public.admin_member_follow_up_queue(p_limit integer default 20)
returns table (
  id uuid, full_name text, email text, phone text, role text, joined_at timestamptz,
  credits_remaining bigint, bookings_count bigint, last_attended_at timestamptz,
  next_booking_at timestamptz, last_follow_up_at timestamptz, reason text, priority integer,
  credits_expiring bigint, next_credit_expiry timestamptz
) language plpgsql security definer stable set search_path = public as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  return query
  with member_activity as materialized (
    select p.id, p.full_name, p.email, p.phone, p.role, p.created_at as joined_at,
           coalesce((select sum(cb.remaining) from public.credit_batches cb
                     where cb.user_id = p.id and cb.remaining > 0
                       and (cb.expires_at is null or cb.expires_at > now())), 0) as credits_remaining,
           coalesce((select sum(cb.remaining) from public.credit_batches cb
                     where cb.user_id = p.id and cb.remaining > 0
                       and cb.expires_at > now()
                       and cb.expires_at <= now() + interval '7 days'), 0) as credits_expiring,
           (select min(cb.expires_at) from public.credit_batches cb
             where cb.user_id = p.id and cb.remaining > 0
               and cb.expires_at > now()
               and cb.expires_at <= now() + interval '7 days') as next_credit_expiry,
           (select count(*) from public.session_bookings sb where sb.user_id = p.id) as bookings_count,
           (select max(cs.start_time) from public.session_bookings sb
             join public.class_sessions cs on cs.id = sb.class_session_id
            where sb.user_id = p.id and sb.status = 'attended') as last_attended_at,
           (select min(cs.start_time) from public.session_bookings sb
             join public.class_sessions cs on cs.id = sb.class_session_id
            where sb.user_id = p.id and sb.status in ('requested', 'confirmed') and cs.start_time > now()) as next_booking_at,
           (select max(n.created_at) from public.admin_member_notes n
            where n.user_id = p.id and n.category = 'follow_up' and n.archived_at is null) as last_follow_up_at
    from public.profiles p
    where p.role = 'member'
  ), candidates as (
    select a.*,
           case
             when a.bookings_count = 0 and a.joined_at < now() - interval '7 days' then 'no_first_booking'
             when a.credits_expiring > 0 then 'credits_expiring'
             when a.credits_remaining > 0 and a.next_booking_at is null
               and coalesce(a.last_attended_at, a.joined_at) < now() - interval '14 days' then 'idle_credits'
             when a.credits_remaining = 0 and a.next_booking_at is null
               and a.last_attended_at >= now() - interval '30 days' then 'renewal_due'
           end as reason,
           case
             when a.bookings_count = 0 and a.joined_at < now() - interval '7 days' then 1
             when a.credits_expiring > 0 then 1
             when a.credits_remaining > 0 and a.next_booking_at is null
               and coalesce(a.last_attended_at, a.joined_at) < now() - interval '14 days' then 2
             else 3
           end as priority
    from member_activity a
    where a.last_follow_up_at is null or a.last_follow_up_at < now() - interval '7 days'
  )
  select c.id, c.full_name, c.email, c.phone, c.role, c.joined_at,
         c.credits_remaining, c.bookings_count, c.last_attended_at,
         c.next_booking_at, c.last_follow_up_at, c.reason, c.priority,
         c.credits_expiring, c.next_credit_expiry
  from candidates c
  where c.reason is not null
  order by c.priority, c.next_credit_expiry nulls last,
           coalesce(c.last_attended_at, c.joined_at), c.id
  limit v_limit;
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

create table if not exists public.admin_role_changes (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null,
  changed_by uuid not null,
  previous_role text not null check (previous_role in ('member', 'admin')),
  new_role text not null check (new_role in ('member', 'admin')),
  created_at timestamptz not null default now()
);
alter table public.admin_role_changes enable row level security;
drop policy if exists "admin_role_changes_admin_read" on public.admin_role_changes;
create policy "admin_role_changes_admin_read" on public.admin_role_changes
  for select to authenticated using (public.is_admin());

-- Promote/demote admins without allowing the final admin to be removed.
create or replace function public.admin_set_role(p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_previous_role text;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_role not in ('member', 'admin') then raise exception 'INVALID_ROLE'; end if;
  if p_user_id = auth.uid() and p_role <> 'admin' then raise exception 'CANNOT_DEMOTE_SELF'; end if;
  perform pg_advisory_xact_lock(hashtext('xert-admin-role-changes'));
  select role into v_previous_role from public.profiles where id = p_user_id for update;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  if v_previous_role = p_role then return; end if;
  if v_previous_role = 'admin' and p_role = 'member'
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'CANNOT_DEMOTE_LAST_ADMIN';
  end if;
  update public.profiles set role = p_role, updated_at = now() where id = p_user_id;
  insert into public.admin_role_changes (target_user_id, changed_by, previous_role, new_role)
  values (p_user_id, auth.uid(), v_previous_role, p_role);
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
create or replace function public.credit_batch_expires_at_after_refund(
  p_expires_at timestamptz,
  p_anchor timestamptz
) returns timestamptz
language sql
stable
parallel safe
set search_path = public, pg_temp
as $$
  select case
    when p_expires_at is not null and p_expires_at <= now()
      then greatest(coalesce(p_anchor, now()), now() + interval '12 hours')
    else p_expires_at
  end;
$$;

-- Re-run safe: keep a refund helper that already skips Stripe-refunded packs.
do $install_refund_credits_to_batch$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'refund_credits_to_batch'
    and pg_get_function_identity_arguments(p.oid) = 'p_batch_id uuid, p_count integer, p_anchor timestamp with time zone';
  if v_def is not null and v_def ilike '%status = ''refunded''%' then
    raise notice 'keeping newer refund_credits_to_batch';
  else
    execute $fn$
create or replace function public.refund_credits_to_batch(
  p_batch_id uuid,
  p_count integer,
  p_anchor timestamptz default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_batch_id is null or p_count is null or p_count <= 0 then
    return;
  end if;
  update public.credit_batches batch
     set remaining = batch.remaining + p_count,
         expires_at = public.credit_batch_expires_at_after_refund(batch.expires_at, p_anchor)
   where batch.id = p_batch_id
     and not exists (
       select 1
         from public.orders o
        where o.id = batch.order_id
          and o.status = 'refunded'
     );
end;
$$;
$fn$;
  end if;
end;
$install_refund_credits_to_batch$;

revoke all on function public.credit_batch_expires_at_after_refund(timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function public.refund_credits_to_batch(uuid, integer, timestamptz)
  from public, anon, authenticated;

-- Re-run safe: keep a helper-backed status RPC (Stripe-refunded pack skip).
do $install_admin_set_booking_status$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'admin_set_booking_status'
    and pg_get_function_identity_arguments(p.oid) = 'p_booking_id uuid, p_status text';
  if v_def is not null and v_def ilike '%refund_credits_to_batch%' then
    raise notice 'keeping newer admin_set_booking_status';
  else
    execute $fn$
create or replace function public.admin_set_booking_status(p_booking_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_batch uuid;
  v_current text;
  v_user uuid;
  v_session uuid;
  v_capacity integer;
  v_start timestamptz;
  v_session_status text;
  v_active_count integer;
  v_new_batch uuid;
  v_first_waitlisted uuid;
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

  if p_status in ('requested', 'confirmed')
     and v_current not in ('requested', 'confirmed', 'attended', 'no_show') then
    select id into v_first_waitlisted
      from session_bookings
      where class_session_id = v_session and status = 'waitlisted'
      order by created_at, id
      limit 1;
    if v_first_waitlisted is not null
      and (v_current <> 'waitlisted' or v_first_waitlisted is distinct from p_booking_id) then
      raise exception 'WAITLIST_ORDER_REQUIRED';
    end if;
  end if;

  -- A status becoming requested/confirmed must reserve a space and credit.
  if p_status in ('requested', 'confirmed')
     and v_current not in ('requested', 'confirmed', 'attended', 'no_show') then
    select capacity, start_time, status into v_capacity, v_start, v_session_status
      from class_sessions where id = v_session for update;
    if not found then raise exception 'SESSION_NOT_FOUND'; end if;
    if v_session_status <> 'published' then raise exception 'SESSION_NOT_BOOKABLE'; end if;
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
    and v_current in ('requested', 'confirmed', 'attended', 'no_show') and v_batch is not null then
    if v_start is null then
      select start_time into v_start from class_sessions where id = v_session;
    end if;
    perform public.refund_credits_to_batch(v_batch, 1, v_start);
  end if;
end; $$;
$fn$;
  end if;
end;
$install_admin_set_booking_status$;

create index if not exists session_bookings_waitlist_order_idx
  on public.session_bookings (class_session_id, created_at, id)
  where status = 'waitlisted';

create or replace function public.admin_promote_next_waitlisted(p_session_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_booking_id uuid;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;

  select id into v_booking_id
    from public.session_bookings
    where class_session_id = p_session_id and status = 'waitlisted'
    order by created_at, id
    limit 1
    for update;
  if v_booking_id is null then raise exception 'WAITLIST_EMPTY'; end if;

  begin
    perform public.admin_set_booking_status(v_booking_id, 'confirmed');
  exception when others then
    if sqlerrm like '%NO_CREDITS%' then raise exception 'WAITLIST_MEMBER_NO_CREDITS'; end if;
    raise;
  end;
  return v_booking_id;
end; $$;

-- Bounded operational desk for future class queues. One row per class keeps
-- the FIFO head and credit blocker visible without loading every full roster.
create or replace function public.admin_waitlist_overview(p_limit integer default 20)
returns table (
  session_id uuid, title text, start_time timestamptz, capacity integer,
  active_count bigint, waitlist_count bigint, spots_available integer,
  can_promote boolean, next_booking_id uuid, next_member_id uuid,
  next_full_name text, next_email text, next_phone text,
  next_booked_at timestamptz, next_available_credits bigint
) language plpgsql security definer stable set search_path = public as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  return query
  with queued_sessions as materialized (
    select s.id, s.title, s.start_time, s.capacity,
           count(b.id) filter (where b.status in ('requested', 'confirmed')) as active_count,
           count(b.id) filter (where b.status = 'waitlisted') as waitlist_count
      from public.class_sessions s
      left join public.session_bookings b on b.class_session_id = s.id
     where s.status = 'published' and s.start_time > now()
     group by s.id, s.title, s.start_time, s.capacity
    having count(b.id) filter (where b.status = 'waitlisted') > 0
  )
  select q.id, q.title, q.start_time, q.capacity,
         q.active_count, q.waitlist_count,
         case when q.capacity is null then null
              else greatest(q.capacity - q.active_count, 0)::integer end,
         q.capacity is null or q.active_count < q.capacity,
         head.id, head.user_id, p.full_name, p.email, p.phone, head.created_at,
         coalesce((select sum(cb.remaining) from public.credit_batches cb
                    where cb.user_id = head.user_id and cb.remaining > 0
                      and (cb.expires_at is null or cb.expires_at > now())), 0)
    from queued_sessions q
    join lateral (
      select b.id, b.user_id, b.created_at
        from public.session_bookings b
       where b.class_session_id = q.id and b.status = 'waitlisted'
       order by b.created_at, b.id
       limit 1
    ) head on true
    left join public.profiles p on p.id = head.user_id
   order by (q.capacity is null or q.active_count < q.capacity) desc,
            q.start_time, q.id
   limit v_limit;
end; $$;

-- One bounded Brisbane-local workload powers the command centre's daily desk
-- without loading every roster or exposing member details to non-admins.
create or replace function public.admin_daily_operations()
returns table (
  session_id uuid, title text, class_type text,
  start_time timestamptz, end_time timestamptz, status text,
  capacity integer, coach_name text, location_zone text, booking_mode text,
  requested_count bigint, confirmed_count bigint, waitlist_count bigint,
  attended_count bigint, no_show_count bigint, public_request_count bigint,
  attendance_due boolean
) language plpgsql security definer stable set search_path = public as $$
declare
  v_local_day date := (now() at time zone 'Australia/Brisbane')::date;
  v_day_start timestamptz;
  v_day_end timestamptz;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  v_day_start := v_local_day::timestamp at time zone 'Australia/Brisbane';
  v_day_end := (v_local_day + 1)::timestamp at time zone 'Australia/Brisbane';

  return query
  select s.id, s.title, s.class_type, s.start_time, s.end_time, s.status,
         s.capacity, s.coach_name, s.location_zone, s.booking_mode,
         coalesce(member_counts.requested_count, 0),
         coalesce(member_counts.confirmed_count, 0),
         coalesce(member_counts.waitlist_count, 0),
         coalesce(member_counts.attended_count, 0),
         coalesce(member_counts.no_show_count, 0),
         coalesce(public_counts.request_count, 0),
         s.start_time <= now()
           and s.status in ('published', 'full', 'completed')
           and coalesce(member_counts.confirmed_count, 0) > 0
    from public.class_sessions s
    left join lateral (
      select count(*) filter (where b.status = 'requested') as requested_count,
             count(*) filter (where b.status = 'confirmed') as confirmed_count,
             count(*) filter (where b.status = 'waitlisted') as waitlist_count,
             count(*) filter (where b.status = 'attended') as attended_count,
             count(*) filter (where b.status = 'no_show') as no_show_count
        from public.session_bookings b
       where b.class_session_id = s.id
    ) member_counts on true
    left join lateral (
      select count(*) filter (where r.status = 'requested') as request_count
        from public.class_bookings r
       where r.class_session_id = s.id
    ) public_counts on true
   where s.start_time >= v_day_start and s.start_time < v_day_end
     and s.status <> 'draft'
   order by s.start_time, s.id
   limit 50;
end; $$;

create index if not exists class_sessions_admin_daily_operations_idx
  on public.class_sessions (start_time, status);

-- Members training toward a specific calendar event, including the contact
-- details staff need to coordinate an event group.
create or replace function public.admin_event_goal_members(p_event_id uuid)
returns table (
  user_id uuid,
  full_name text,
  email text,
  phone text,
  selected_at timestamptz
) language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_event_id is null then raise exception 'EVENT_ID_REQUIRED'; end if;

  return query
  select g.user_id, p.full_name, p.email, p.phone, g.created_at
  from public.member_event_goals g
  left join public.profiles p on p.id = g.user_id
  where g.event_id = p_event_id
  order by g.created_at asc;
end; $$;

-- Edit class metadata without bypassing lifecycle, capacity, or version invariants.
-- class_session_optimistic_locking_upgrade.sql is the canonical upgrade path;
-- keep this fresh-install definition aligned with the three-argument overload.
drop function if exists public.admin_update_class_session(uuid, jsonb, timestamptz);
create function public.admin_update_class_session(
  p_session_id uuid, p_session jsonb, p_expected_updated_at timestamptz
)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_current public.class_sessions%rowtype; v_active_bookings integer; v_update record;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_session_id is null then raise exception 'SESSION_REQUIRED'; end if;
  if p_session is null then raise exception 'SESSION_PAYLOAD_REQUIRED'; end if;
  if p_expected_updated_at is null then raise exception 'SESSION_VERSION_REQUIRED'; end if;
  select * into v_update from jsonb_to_record(p_session) as session_data(
    class_type text, title text, description text, coach_name text,
    start_time timestamptz, end_time timestamptz, duration_minutes integer,
    capacity integer, location_zone text, beginner_friendly boolean,
    intensity_level text, status text, public_visible boolean,
    booking_mode text, notes text
  );
  if v_update.title is null or btrim(v_update.title) = ''
     or v_update.status is null or v_update.capacity is null then
    raise exception 'INVALID_SESSION_PAYLOAD';
  end if;
  select * into v_current from public.class_sessions
    where id = p_session_id for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if v_current.updated_at is distinct from p_expected_updated_at then
    raise exception 'SESSION_STALE';
  end if;
  if v_current.status in ('cancelled', 'completed') and v_update.status <> v_current.status then
    raise exception 'TERMINAL_SESSION_IMMUTABLE';
  end if;
  if v_update.status = 'cancelled' and v_current.status <> 'cancelled' then
    raise exception 'USE_CANCELLATION_WORKFLOW';
  end if;
  if v_update.status = 'completed' and v_current.status <> 'completed' then
    raise exception 'USE_ATTENDANCE_WORKFLOW';
  end if;
  perform 1 from public.session_bookings where class_session_id = p_session_id
    and status in ('requested', 'confirmed') for update;
  select count(*)::integer into v_active_bookings from public.session_bookings
    where class_session_id = p_session_id and status in ('requested', 'confirmed');
  if v_update.capacity < v_active_bookings then
    raise exception 'CAPACITY_BELOW_ACTIVE:%', v_active_bookings;
  end if;
  update public.class_sessions set
    class_type = v_update.class_type, title = btrim(v_update.title),
    description = v_update.description, coach_name = v_update.coach_name,
    start_time = v_update.start_time, end_time = v_update.end_time,
    duration_minutes = v_update.duration_minutes, capacity = v_update.capacity,
    location_zone = v_update.location_zone, beginner_friendly = v_update.beginner_friendly,
    intensity_level = v_update.intensity_level, status = v_update.status,
    public_visible = v_update.public_visible, booking_mode = v_update.booking_mode,
    notes = v_update.notes, updated_at = now()
  where id = p_session_id
    and updated_at = p_expected_updated_at;
  if not found then raise exception 'SESSION_STALE'; end if;
  return p_session_id;
end; $$;

-- Cancel a class as an operator action. This is deliberately different from a
-- member cancellation: every outstanding member booking is invalidated and
-- any reserved credit is returned because XERT, not the member, cancelled it.
-- Attended/no_show still hold their credit and must be refunded once.
-- Re-run safe: keep attended/no_show refunds + Stripe-refunded pack skip.
do $install_admin_cancel_class_session$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'admin_cancel_class_session'
    and pg_get_function_identity_arguments(p.oid) = 'p_session_id uuid';
  if v_def is not null
     and v_def ilike '%attended%'
     and v_def ilike '%no_show%'
     and v_def ilike '%status = ''refunded''%' then
    raise notice 'keeping newer admin_cancel_class_session';
  else
    execute $fn$
create or replace function public.admin_cancel_class_session(p_session_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_start timestamptz;
  v_cancelled_count integer := 0;
  v_enquiry_cancelled_count integer := 0;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;

  -- Locking the session prevents a concurrent booking from being created
  -- between cancelling the class and releasing its reserved places.
  select status, start_time into v_status, v_start
    from public.class_sessions
    where id = p_session_id
    for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if v_status = 'completed' then raise exception 'SESSION_ALREADY_COMPLETED'; end if;

  if to_regprocedure('public.create_class_cancellation_notice(uuid)') is not null then
    perform public.create_class_cancellation_notice(p_session_id);
  end if;

  with targets as (
    select id, credit_batch_id, status as previous_status
      from public.session_bookings
     where class_session_id = p_session_id
       and status in ('requested', 'confirmed', 'waitlisted', 'attended', 'no_show')
     for update
  ), cancelled_bookings as (
    update public.session_bookings booking
       set status = 'cancelled', cancelled_at = now()
      from targets
     where booking.id = targets.id
     returning targets.credit_batch_id as credit_batch_id,
               targets.previous_status as previous_status
  ), restored_credits as (
    update public.credit_batches credits
       set remaining = credits.remaining + refunds.credit_count,
           expires_at = public.credit_batch_expires_at_after_refund(credits.expires_at, v_start)
      from (
        select credit_batch_id, count(*)::integer as credit_count
          from cancelled_bookings
         where previous_status in ('requested', 'confirmed', 'attended', 'no_show')
           and credit_batch_id is not null
         group by credit_batch_id
      ) refunds
     where credits.id = refunds.credit_batch_id
       and not exists (
         select 1
           from public.orders o
          where o.id = credits.order_id
            and o.status = 'refunded'
       )
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
$fn$;
  end if;
end;
$install_admin_cancel_class_session$;


-- Record a complete class roll call atomically and retain who marked it.
alter table public.session_bookings
  add column if not exists attendance_marked_at timestamptz,
  add column if not exists attendance_marked_by uuid references auth.users(id) on delete set null;

-- Re-run safe: keep pending-request credit release + Stripe-refunded pack skip.
do $install_admin_record_session_attendance$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'admin_record_session_attendance'
    and pg_get_function_identity_arguments(p.oid) = 'p_session_id uuid, p_attended_ids uuid[], p_no_show_ids uuid[]';
  if v_def is not null
     and v_def ilike '%status = ''requested''%'
     and v_def ilike '%status = ''refunded''%' then
    raise notice 'keeping newer admin_record_session_attendance';
  else
    execute $fn$
create or replace function public.admin_record_session_attendance(
  p_session_id uuid, p_attended_ids uuid[], p_no_show_ids uuid[]
)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_session_status text; v_start_time timestamptz; v_eligible_count integer;
  v_input_count integer; v_updated_count integer;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_session_id is null then raise exception 'SESSION_REQUIRED'; end if;
  p_attended_ids := coalesce(p_attended_ids, array[]::uuid[]);
  p_no_show_ids := coalesce(p_no_show_ids, array[]::uuid[]);
  v_input_count := cardinality(p_attended_ids) + cardinality(p_no_show_ids);
  if v_input_count = 0 then raise exception 'ATTENDANCE_REQUIRED'; end if;
  if cardinality(p_attended_ids) <> (select count(distinct id) from unnest(p_attended_ids) as ids(id))
     or cardinality(p_no_show_ids) <> (select count(distinct id) from unnest(p_no_show_ids) as ids(id))
     or p_attended_ids && p_no_show_ids then raise exception 'DUPLICATE_BOOKING'; end if;
  select status, start_time into v_session_status, v_start_time
    from public.class_sessions where id = p_session_id for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if v_session_status not in ('published', 'full', 'completed') then raise exception 'SESSION_NOT_OPEN_FOR_ATTENDANCE'; end if;
  if v_start_time > now() then raise exception 'SESSION_NOT_STARTED'; end if;
  perform 1 from public.session_bookings
    where class_session_id = p_session_id and status in ('requested', 'confirmed', 'attended', 'no_show')
    for update;
  select count(*) into v_eligible_count from public.session_bookings
    where class_session_id = p_session_id and status in ('confirmed', 'attended', 'no_show');
  if v_input_count <> v_eligible_count or exists (
    select 1 from unnest(p_attended_ids || p_no_show_ids) as ids(id) where not exists (
      select 1 from public.session_bookings b where b.id = ids.id
        and b.class_session_id = p_session_id and b.status in ('confirmed', 'attended', 'no_show')
    )
  ) then raise exception 'INCOMPLETE_ROLL_CALL'; end if;
  update public.session_bookings
    set status = case when id = any(p_attended_ids) then 'attended' else 'no_show' end,
        attendance_marked_at = now(), attendance_marked_by = auth.uid()
    where class_session_id = p_session_id and id = any(p_attended_ids || p_no_show_ids);
  get diagnostics v_updated_count = row_count;
  update public.credit_batches batch
     set remaining = batch.remaining + released.credits,
         expires_at = public.credit_batch_expires_at_after_refund(batch.expires_at, v_start_time)
    from (
      select credit_batch_id, count(*) as credits
      from public.session_bookings
      where class_session_id = p_session_id
        and status = 'requested'
        and credit_batch_id is not null
      group by credit_batch_id
    ) as released
   where batch.id = released.credit_batch_id
     and not exists (
       select 1
         from public.orders o
        where o.id = batch.order_id
          and o.status = 'refunded'
     );
  update public.session_bookings
     set status = 'cancelled', cancelled_at = now()
   where class_session_id = p_session_id
     and status = 'requested';
  update public.class_sessions set status = 'completed', public_visible = false, updated_at = now()
    where id = p_session_id;
  return v_updated_count;
end; $$;
$fn$;
  end if;
end;
$install_admin_record_session_attendance$;


-- ── Grants ──────────────────────────────────────────────────────────────────
revoke execute on function public.admin_list_members() from public, anon;
revoke execute on function public.admin_search_members(text, integer) from public, anon;
revoke execute on function public.admin_list_members_page(text, text, text, integer, integer, uuid) from public, anon;
revoke execute on function public.admin_list_member_notes(uuid, boolean) from public, anon;
revoke execute on function public.admin_add_member_note(uuid, text, text) from public, anon;
revoke execute on function public.admin_set_member_note_archived(uuid, boolean) from public, anon;
revoke execute on function public.admin_member_follow_up_queue(integer) from public, anon;
revoke execute on function public.admin_grant_credits(uuid, integer, integer) from public, anon, authenticated;
revoke execute on function public.admin_set_role(uuid, text) from public, anon;
revoke execute on function public.admin_session_roster(uuid) from public, anon;
revoke execute on function public.admin_set_booking_status(uuid, text) from public, anon;
revoke execute on function public.admin_promote_next_waitlisted(uuid) from public, anon;
revoke execute on function public.admin_waitlist_overview(integer) from public, anon;
revoke execute on function public.admin_daily_operations() from public, anon;
revoke execute on function public.admin_update_class_session(uuid, jsonb, timestamptz) from public, anon;
revoke execute on function public.admin_cancel_class_session(uuid) from public, anon;
revoke execute on function public.admin_event_goal_members(uuid) from public, anon;
revoke execute on function public.admin_record_session_attendance(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.admin_list_members()                    to authenticated;
grant execute on function public.admin_search_members(text, integer)     to authenticated;
grant execute on function public.admin_list_members_page(text, text, text, integer, integer, uuid) to authenticated;
grant execute on function public.admin_list_member_notes(uuid, boolean) to authenticated;
grant execute on function public.admin_add_member_note(uuid, text, text) to authenticated;
grant execute on function public.admin_set_member_note_archived(uuid, boolean) to authenticated;
grant execute on function public.admin_member_follow_up_queue(integer) to authenticated;
grant execute on function public.admin_set_role(uuid, text)              to authenticated;
grant execute on function public.admin_session_roster(uuid)              to authenticated;
grant execute on function public.admin_set_booking_status(uuid, text)    to authenticated;
grant execute on function public.admin_promote_next_waitlisted(uuid)     to authenticated;
grant execute on function public.admin_waitlist_overview(integer)        to authenticated;
grant execute on function public.admin_daily_operations()                to authenticated;
grant execute on function public.admin_update_class_session(uuid, jsonb, timestamptz) to authenticated;
-- The historical two-argument overload (no version check) must stay revoked
-- once the three-argument form exists; re-running this file must not re-arm it.
do $$
begin
  if to_regprocedure('public.admin_update_class_session(uuid, jsonb)') is null then
    return;
  end if;
  revoke execute on function public.admin_update_class_session(uuid, jsonb) from public, anon;
  if to_regprocedure('public.admin_update_class_session(uuid, jsonb, timestamptz)') is null then
    grant execute on function public.admin_update_class_session(uuid, jsonb) to authenticated;
  else
    revoke execute on function public.admin_update_class_session(uuid, jsonb) from authenticated;
  end if;
end;
$$;
grant execute on function public.admin_cancel_class_session(uuid)         to authenticated;
grant execute on function public.admin_event_goal_members(uuid)            to authenticated;
grant execute on function public.admin_record_session_attendance(uuid, uuid[], uuid[]) to authenticated;

-- Runtime capability marker for admin health and release CI.
create table if not exists public.xert_schema_capabilities (
  capability text primary key,
  installed_at timestamptz not null default now()
);
alter table public.xert_schema_capabilities enable row level security;
drop policy if exists "xert_schema_capabilities_admin_read" on public.xert_schema_capabilities;
create policy "xert_schema_capabilities_admin_read" on public.xert_schema_capabilities
  for select to authenticated using (public.is_admin());
insert into public.xert_schema_capabilities (capability)
values ('admin_role_safety') on conflict (capability) do nothing;
insert into public.xert_schema_capabilities (capability)
values ('attendance_roll_call') on conflict (capability) do nothing;
insert into public.xert_schema_capabilities (capability)
values ('waitlist_fifo_promotion') on conflict (capability) do nothing;
insert into public.xert_schema_capabilities (capability)
values ('class_session_update_guard') on conflict (capability) do nothing;
insert into public.xert_schema_capabilities (capability)
values ('class_session_optimistic_locking') on conflict (capability) do nothing;
insert into public.xert_schema_capabilities (capability)
values ('product_update_guard') on conflict (capability) do nothing;
insert into public.xert_schema_capabilities (capability)
values ('stripe_refund_reconciliation') on conflict (capability) do nothing;
insert into public.xert_schema_capabilities (capability)
values ('credit_expiry_follow_up') on conflict (capability) do nothing;
insert into public.xert_schema_capabilities (capability)
values ('booking_time_conflict_guard') on conflict (capability) do nothing;
insert into public.xert_schema_capabilities (capability)
values ('admin_member_notes') on conflict (capability) do nothing;
insert into public.xert_schema_capabilities (capability)
values ('admin_daily_operations') on conflict (capability) do nothing;
create or replace function public.xert_public_capabilities()
returns table (capability text)
language sql security definer stable set search_path = public as $$
  select c.capability from public.xert_schema_capabilities c order by c.capability;
$$;
revoke execute on function public.xert_public_capabilities() from public;
grant execute on function public.xert_public_capabilities() to anon, authenticated;

-- ============================================================================
-- Done.
-- ============================================================================
