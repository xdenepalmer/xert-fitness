-- ============================================================================
-- XERT Fitness — Booking & Commerce schema
-- ============================================================================
-- Adds member accounts, session-pack products, Stripe orders, session credits
-- and credit-based class bookings on top of the existing lead/soft-launch
-- schema. Safe to re-run (idempotent: create-if-not-exists + drop/recreate
-- policies & functions).
--
-- Run in Supabase SQL editor OR apply via the project's Postgres connection.
-- ============================================================================


-- ── profiles ────────────────────────────────────────────────────────────────
-- One row per Supabase Auth user. role='admin' unlocks the Command Centre;
-- everyone else is a 'member'.
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  phone       text,
  role        text not null default 'member',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (new.id,
          new.raw_user_meta_data->>'full_name',
          new.raw_user_meta_data->>'phone')
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Admin check that bypasses RLS (SECURITY DEFINER) to avoid policy recursion.
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- RLS controls which rows a member can change, not which columns they can
-- alter. Keep authority and identity fields server-owned to stop a direct
-- PostgREST request promoting a member profile to admin.
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
      if new.created_at is distinct from old.created_at then
        raise exception 'PROFILE_CREATED_AT_IMMUTABLE';
      end if;
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists before_profile_write on public.profiles;
create trigger before_profile_write
  before insert or update on public.profiles
  for each row execute function public.guard_profile_write();


-- ── products (session packs) ────────────────────────────────────────────────
create table if not exists public.products (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,
  name            text not null,
  description     text,
  price_cents     integer not null check (price_cents > 0),
  currency        text not null default 'aud' check (currency ~ '^[a-zA-Z]{3}$'),
  sessions_count  integer not null check (sessions_count > 0),
  validity_days   integer not null check (validity_days > 0),
  stripe_price_id text,
  featured        boolean default false,
  active          boolean default true,
  sort_order      integer default 0,
  created_at      timestamptz not null default now()
);

insert into public.products (slug, name, description, price_cents, currency, sessions_count, validity_days, featured, sort_order) values
  ('single',         '1 Class Pass',                'Perfect for a drop-in session, casual training or trying your first XERT session.', 1500,  'aud', 1,  14, false, 1),
  ('starter-4',      '4 Class Starter Pack',        'A great way to experience the XERT training system.',                               4800,  'aud', 4,  28, true,  2),
  ('performance-10', '10 Class Performance Pack',   'Designed for members committed to consistency and long-term progress.',             10500, 'aud', 10, 56, false, 3)
on conflict (slug) do nothing;


-- ── orders (Stripe) ─────────────────────────────────────────────────────────
create table if not exists public.orders (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid references auth.users(id) on delete set null,
  product_id                  uuid references public.products(id),
  email                       text,
  amount_cents                integer,
  currency                    text default 'aud',
  status                      text not null default 'pending', -- pending|paid|failed|refunded
  stripe_checkout_session_id  text unique,
  stripe_payment_intent_id    text,
  created_at                  timestamptz not null default now(),
  paid_at                     timestamptz
);
create index if not exists orders_status_created_idx on public.orders(status, created_at desc, id desc);


-- ── credit_batches (session credits with expiry) ────────────────────────────
create table if not exists public.credit_batches (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  product_id  uuid references public.products(id),
  order_id    uuid unique references public.orders(id),
  total       integer not null,
  remaining   integer not null,
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists credit_batches_user_idx on public.credit_batches(user_id);
create index if not exists credit_batches_active_idx on public.credit_batches(id) where remaining > 0;


-- ── session_bookings (member bookings that consume a credit) ─────────────────
create table if not exists public.session_bookings (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  class_session_id  uuid not null references public.class_sessions(id) on delete cascade,
  credit_batch_id   uuid references public.credit_batches(id),
  status            text not null default 'confirmed', -- requested|confirmed|waitlisted|cancelled|declined|attended|no_show
  created_at        timestamptz not null default now(),
  cancelled_at      timestamptz
);
-- A member can only hold one space-holding request or confirmed booking per
-- session. Waitlisted and declined requests do not reserve a place.
drop index if exists public.session_bookings_unique_active;
create unique index if not exists session_bookings_unique_active
  on public.session_bookings(user_id, class_session_id)
  where status in ('requested', 'confirmed');
-- Capacity counts look bookings up by session.
create index if not exists session_bookings_session_idx
  on public.session_bookings(class_session_id);

-- Booking modes live on class_sessions because staff choose the policy per
-- class. Keep the value constrained even on databases that predate this field.
alter table public.class_sessions
  add column if not exists booking_mode text;
update public.class_sessions
  set booking_mode = 'instant_book'
  where booking_mode is null
     or booking_mode not in ('instant_book', 'request_to_book', 'interest_only');
alter table public.class_sessions
  alter column booking_mode set default 'instant_book',
  alter column booking_mode set not null;
alter table public.class_sessions
  drop constraint if exists class_sessions_booking_mode_check;
alter table public.class_sessions
  add constraint class_sessions_booking_mode_check
  check (booking_mode in ('instant_book', 'request_to_book', 'interest_only'));

-- Keep timetable data usable even when it is created outside the admin UI.
alter table public.class_sessions
  drop constraint if exists class_sessions_positive_capacity_check;
alter table public.class_sessions
  add constraint class_sessions_positive_capacity_check
  check (capacity is null or capacity > 0) not valid;
alter table public.class_sessions
  drop constraint if exists class_sessions_positive_duration_check;
alter table public.class_sessions
  add constraint class_sessions_positive_duration_check
  check (duration_minutes is null or duration_minutes > 0) not valid;
alter table public.class_sessions
  drop constraint if exists class_sessions_valid_time_range_check;
alter table public.class_sessions
  add constraint class_sessions_valid_time_range_check
  check (end_time is null or (start_time is not null and end_time > start_time)) not valid;
alter table public.class_sessions
  drop constraint if exists class_sessions_published_start_time_check;
alter table public.class_sessions
  add constraint class_sessions_published_start_time_check
  check (status <> 'published' or start_time is not null) not valid;

alter table public.session_bookings
  drop constraint if exists session_bookings_status_check;
alter table public.session_bookings
  add constraint session_bookings_status_check
  check (status in ('requested', 'confirmed', 'waitlisted', 'cancelled', 'declined', 'attended', 'no_show'));


-- ── coaches (Coaches page) ──────────────────────────────────────────────────
create table if not exists public.coaches (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null,
  role                     text,
  bio                      text,
  experience               text,
  currently_training_for   text,
  photo_url                text,
  social_url               text,
  category                 text default 'coach', -- coach|nutritionist|massage|physio
  sort_order               integer default 0,
  published                boolean default true,
  created_at               timestamptz not null default now()
);


-- ── events (South East Queensland event schedule) ───────────────────────────
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    text, -- marathon|triathlon|ironman|hyrox|crossfit|swim|ultra|cycling|spartan|other
  event_date  date,
  end_date    date,
  location    text,
  region      text default 'South East Queensland',
  url         text,
  published   boolean default true,
  sort_order  integer default 0,
  created_at  timestamptz not null default now()
);

-- ── member_event_goals (events members train toward together) ───────────────
create table if not exists public.member_event_goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  event_id    uuid not null references public.events(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (user_id, event_id)
);
create index if not exists member_event_goals_event_idx on public.member_event_goals(event_id);


-- ============================================================================
-- Booking logic (SECURITY DEFINER so it can enforce rules atomically)
-- ============================================================================

-- Book a class or submit a booking request. Both modes reserve a seat and the
-- earliest-expiring available credit atomically; a staff decline/waitlist
-- releases that credit again. Interest-only classes deliberately stay out of
-- the commerce flow and use the existing interest workflow instead.
create or replace function public.book_session(p_session_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user     uuid := auth.uid();
  v_capacity int;
  v_start    timestamptz;
  v_status   text;
  v_mode     text;
  v_booking_status text;
  v_booked   int;
  v_batch    uuid;
  v_booking  uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  -- Lock the session row to serialise capacity checks.
  select capacity, start_time, status, coalesce(booking_mode, 'instant_book')
    into v_capacity, v_start, v_status, v_mode
    from class_sessions where id = p_session_id for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if v_status <> 'published' then raise exception 'SESSION_NOT_BOOKABLE'; end if;
  if v_start <= now() then raise exception 'SESSION_IN_PAST'; end if;
  if v_mode = 'interest_only' then raise exception 'SESSION_INTEREST_ONLY'; end if;
  if v_mode not in ('instant_book', 'request_to_book') then
    raise exception 'SESSION_NOT_BOOKABLE';
  end if;

  if exists (
    select 1 from session_bookings
    where user_id = v_user and class_session_id = p_session_id
      and status in ('requested', 'confirmed', 'waitlisted')
  ) then
    raise exception 'ALREADY_BOOKED';
  end if;

  select count(*) into v_booked
    from session_bookings
    where class_session_id = p_session_id and status in ('requested', 'confirmed');
  if v_capacity is not null and v_booked >= v_capacity then
    raise exception 'SESSION_FULL';
  end if;

  select id into v_batch
    from credit_batches
    where user_id = v_user and remaining > 0
      and (expires_at is null or expires_at > now())
    order by expires_at asc nulls last, created_at asc
    limit 1 for update;
  if v_batch is null then raise exception 'NO_CREDITS'; end if;

  update credit_batches set remaining = remaining - 1 where id = v_batch;

  v_booking_status := case when v_mode = 'request_to_book' then 'requested' else 'confirmed' end;

  insert into session_bookings (user_id, class_session_id, credit_batch_id, status)
    values (v_user, p_session_id, v_batch, v_booking_status)
    returning id into v_booking;

  return v_booking;
end; $$;

-- Cancel a confirmed booking, pending request, or waitlist place. Waitlisted
-- places have already released their credit and must never refund it twice.
create or replace function public.cancel_booking(p_booking_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user   uuid := auth.uid();
  v_batch  uuid;
  v_start  timestamptz;
  v_status text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  select b.credit_batch_id, s.start_time, b.status
    into v_batch, v_start, v_status
    from session_bookings b
    join class_sessions s on s.id = b.class_session_id
    where b.id = p_booking_id and b.user_id = v_user
    for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_status not in ('requested', 'confirmed', 'waitlisted') then raise exception 'NOT_CANCELLABLE'; end if;

  update session_bookings set status = 'cancelled', cancelled_at = now()
    where id = p_booking_id;

  if (v_status = 'requested' or (v_status = 'confirmed' and v_start - now() > interval '12 hours')) and v_batch is not null then
    update credit_batches set remaining = remaining + 1
      where id = v_batch and (expires_at is null or expires_at > now());
  end if;
end; $$;

-- Public timetable with live spots remaining (no booker identities exposed).
create or replace function public.sessions_with_availability()
returns table (
  id uuid, class_type text, title text, description text, coach_name text,
  start_time timestamptz, end_time timestamptz, duration_minutes int,
  capacity int, location_zone text, beginner_friendly boolean,
  intensity_level text, booking_mode text, booked_count bigint, spots_left int
) language sql security definer stable set search_path = public as $$
  select s.id, s.class_type, s.title, s.description, s.coach_name,
         s.start_time, s.end_time, s.duration_minutes, s.capacity, s.location_zone,
         s.beginner_friendly, s.intensity_level, s.booking_mode,
         count(b.id) filter (where b.status in ('requested', 'confirmed')) as booked_count,
         -- null capacity = unlimited => null spots_left (mirrors book_session).
         -- Pending requests reserve their place until staff acts on them.
         case when s.capacity is null then null
              else greatest(s.capacity - count(b.id) filter (where b.status in ('requested', 'confirmed')), 0)::int
         end as spots_left
  from class_sessions s
  left join session_bookings b on b.class_session_id = s.id
  where s.public_visible = true and s.status = 'published' and s.start_time > now()
  group by s.id
  order by s.start_time asc;
$$;

-- A member's own bookings with full session detail (works regardless of the
-- session's publish state, since it is scoped to auth.uid()).
create or replace function public.my_bookings()
returns table (
  booking_id uuid, status text, booked_at timestamptz, cancelled_at timestamptz,
  session_id uuid, title text, class_type text, coach_name text,
  start_time timestamptz, end_time timestamptz, location_zone text, intensity_level text
) language sql security definer stable set search_path = public as $$
  select b.id, b.status, b.created_at, b.cancelled_at,
         s.id, s.title, s.class_type, s.coach_name,
         s.start_time, s.end_time, s.location_zone, s.intensity_level
  from session_bookings b
  join class_sessions s on s.id = b.class_session_id
  where b.user_id = auth.uid()
  order by s.start_time desc;
$$;


-- ============================================================================
-- Row Level Security for the new tables
-- ============================================================================

-- profiles: a user sees/updates own row; admins see all.
alter table public.profiles enable row level security;
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
drop policy if exists "profiles_update_own_or_admin" on public.profiles;
drop policy if exists "profiles_insert_self"         on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "profiles_update_own_or_admin" on public.profiles
  for update to authenticated using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
-- Profile rows are created only by handle_new_user() in the Auth trigger.
-- Members may update their contact fields after that, but cannot seed a row
-- with arbitrary identity metadata through the browser API.

-- products: public may read active packs; admins manage.
alter table public.products enable row level security;
drop policy if exists "products_public_read" on public.products;
drop policy if exists "products_admin_all"   on public.products;
create policy "products_public_read" on public.products
  for select to anon, authenticated using (active = true);
create policy "products_admin_all" on public.products
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- orders: a user reads own orders; admins read all. Writes happen via the
-- service-role webhook (which bypasses RLS), so no public insert policy.
alter table public.orders enable row level security;
drop policy if exists "orders_select_own_or_admin" on public.orders;
create policy "orders_select_own_or_admin" on public.orders
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- credit_batches: a user reads own credits; admins read all. Writes via
-- SECURITY DEFINER functions / service role only.
alter table public.credit_batches enable row level security;
drop policy if exists "credit_batches_select_own_or_admin" on public.credit_batches;
create policy "credit_batches_select_own_or_admin" on public.credit_batches
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- session_bookings: a user reads own bookings; admins read all. Inserts/updates
-- go through book_session()/cancel_booking() (SECURITY DEFINER).
alter table public.session_bookings enable row level security;
drop policy if exists "session_bookings_select_own_or_admin" on public.session_bookings;
create policy "session_bookings_select_own_or_admin" on public.session_bookings
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- coaches: public reads published; admins manage.
alter table public.coaches enable row level security;
drop policy if exists "coaches_public_read" on public.coaches;
drop policy if exists "coaches_admin_all"   on public.coaches;
create policy "coaches_public_read" on public.coaches
  for select to anon, authenticated using (published = true);
create policy "coaches_admin_all" on public.coaches
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- events: public reads published; admins manage.
alter table public.events enable row level security;
drop policy if exists "events_public_read" on public.events;
drop policy if exists "events_admin_all"   on public.events;
create policy "events_public_read" on public.events
  for select to anon, authenticated using (published = true);
create policy "events_admin_all" on public.events
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- member_event_goals: members control their own goals; staff can see the
-- group around each event so programming and follow-up stay purposeful.
alter table public.member_event_goals enable row level security;
drop policy if exists "member_event_goals_select_own_or_admin" on public.member_event_goals;
drop policy if exists "member_event_goals_insert_own" on public.member_event_goals;
drop policy if exists "member_event_goals_delete_own_or_admin" on public.member_event_goals;
create policy "member_event_goals_select_own_or_admin" on public.member_event_goals
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "member_event_goals_insert_own" on public.member_event_goals
  for insert to authenticated with check (user_id = auth.uid());
create policy "member_event_goals_delete_own_or_admin" on public.member_event_goals
  for delete to authenticated using (user_id = auth.uid() or public.is_admin());


-- ── Function grants ─────────────────────────────────────────────────────────
-- SECURITY DEFINER functions are executable by PUBLIC unless explicitly
-- revoked. Keep public timetable reads open, but limit member/admin actions.
revoke execute on function public.sessions_with_availability() from public;
revoke execute on function public.book_session(uuid) from public, anon;
revoke execute on function public.cancel_booking(uuid) from public, anon;
revoke execute on function public.my_bookings() from public, anon;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.sessions_with_availability() to anon, authenticated;
grant execute on function public.book_session(uuid)          to authenticated;
grant execute on function public.cancel_booking(uuid)        to authenticated;
grant execute on function public.my_bookings()               to authenticated;
grant execute on function public.is_admin()                  to authenticated;

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
values ('booking_waitlist_withdrawal') on conflict (capability) do nothing;
create or replace function public.xert_public_capabilities()
returns table (capability text)
language sql security definer stable set search_path = public as $$
  select c.capability from public.xert_schema_capabilities c order by c.capability;
$$;
revoke execute on function public.xert_public_capabilities() from public;
grant execute on function public.xert_public_capabilities() to anon, authenticated;

-- ============================================================================
-- Done.
--
-- To promote a user to admin (after they have signed up once):
--   update public.profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'their@email.com');
-- ============================================================================
