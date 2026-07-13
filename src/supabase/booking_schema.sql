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

create or replace function public.admin_update_product(
  p_product_id uuid,
  p_product jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.products%rowtype;
  v_update record;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_product_id is null then raise exception 'PRODUCT_REQUIRED'; end if;
  if p_product is null then raise exception 'PRODUCT_PAYLOAD_REQUIRED'; end if;

  select * into v_update
  from jsonb_to_record(p_product) as product_data(
    name text, description text, price_cents integer, currency text,
    sessions_count integer, validity_days integer, stripe_price_id text,
    featured boolean, active boolean, sort_order integer
  );

  if v_update.name is null or btrim(v_update.name) = ''
     or v_update.price_cents is null or v_update.price_cents <= 0
     or v_update.sessions_count is null or v_update.sessions_count <= 0
     or v_update.validity_days is null or v_update.validity_days <= 0
     or v_update.currency is null or v_update.currency !~ '^[a-zA-Z]{3}$'
     or v_update.sort_order is null or v_update.sort_order < 0
     or v_update.featured is null or v_update.active is null
     or (v_update.stripe_price_id is not null and v_update.stripe_price_id !~ '^price_[A-Za-z0-9]+$') then
    raise exception 'INVALID_PRODUCT_PAYLOAD';
  end if;

  select * into v_current from public.products where id = p_product_id for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
  if v_current.stripe_price_id is not null
     and v_current.stripe_price_id = v_update.stripe_price_id
     and (v_current.price_cents <> v_update.price_cents
       or lower(v_current.currency) <> lower(v_update.currency)) then
    raise exception 'STRIPE_PRICE_REFRESH_REQUIRED';
  end if;

  update public.products
  set name = btrim(v_update.name), description = nullif(btrim(v_update.description), ''),
      price_cents = v_update.price_cents, currency = lower(v_update.currency),
      sessions_count = v_update.sessions_count, validity_days = v_update.validity_days,
      stripe_price_id = nullif(btrim(v_update.stripe_price_id), ''),
      featured = v_update.featured, active = v_update.active, sort_order = v_update.sort_order
  where id = p_product_id;
  return p_product_id;
end;
$$;
revoke execute on function public.admin_update_product(uuid, jsonb) from public, anon;
grant execute on function public.admin_update_product(uuid, jsonb) to authenticated;

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
  stripe_charge_id            text,
  refunded_amount_cents       integer not null default 0 check (refunded_amount_cents >= 0),
  created_at                  timestamptz not null default now(),
  paid_at                     timestamptz,
  refunded_at                 timestamptz,
  reconciled_at               timestamptz,
  reconciled_by               uuid references auth.users(id) on delete set null
);
create index if not exists orders_status_created_idx on public.orders(status, created_at desc, id desc);
create index if not exists orders_unresolved_checkout_idx on public.orders(created_at desc, id desc) where status in ('pending', 'failed');

-- ── member announcements ────────────────────────────────────────────────────
-- Admin-authored operational notices shared by the web account and iOS app.
create table if not exists public.member_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  tone text not null default 'info' check (tone in ('info', 'action', 'urgent')),
  published_at timestamptz,
  expires_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or published_at is null or expires_at > published_at)
);
create index if not exists member_announcements_live_idx
  on public.member_announcements(published_at desc, id desc) where published_at is not null;


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

create table if not exists public.stripe_refunds (
  refund_id text primary key,
  stripe_event_id text not null unique,
  order_id uuid not null unique references public.orders(id),
  stripe_charge_id text,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null check (currency ~ '^[a-zA-Z]{3}$'),
  credits_revoked integer not null default 0 check (credits_revoked >= 0),
  credits_consumed integer not null default 0 check (credits_consumed >= 0),
  bookings_cancelled integer not null default 0 check (bookings_cancelled >= 0),
  refunded_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists stripe_refunds_refunded_at_idx on public.stripe_refunds(refunded_at desc);

create or replace function public.reconcile_stripe_order_refund(
  p_refund_id text, p_event_id text, p_payment_intent_id text, p_charge_id text,
  p_amount_cents integer, p_currency text, p_refunded_at timestamptz
)
returns table (order_id uuid, credits_revoked integer, credits_consumed integer, bookings_cancelled integer)
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
  v_batch public.credit_batches%rowtype;
  v_match_count integer;
  v_existing public.stripe_refunds%rowtype;
  v_reclaimable integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_ONLY'; end if;
  if p_refund_id is null or btrim(p_refund_id) = ''
     or p_event_id is null or btrim(p_event_id) = ''
     or p_payment_intent_id is null or btrim(p_payment_intent_id) = ''
     or p_amount_cents is null or p_amount_cents <= 0
     or p_currency is null or p_currency !~ '^[a-zA-Z]{3}$'
     or p_refunded_at is null then raise exception 'INVALID_REFUND_PAYLOAD'; end if;

  perform 1 from public.orders where stripe_payment_intent_id = p_payment_intent_id for update;
  select count(*)::integer into v_match_count from public.orders where stripe_payment_intent_id = p_payment_intent_id;
  if v_match_count = 0 then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_match_count > 1 then raise exception 'AMBIGUOUS_PAYMENT_INTENT'; end if;
  select * into v_order from public.orders where stripe_payment_intent_id = p_payment_intent_id;
  if v_order.amount_cents <> p_amount_cents or lower(v_order.currency) <> lower(p_currency) then
    raise exception 'REFUND_ORDER_MISMATCH';
  end if;

  select * into v_existing from public.stripe_refunds where stripe_refunds.order_id = v_order.id;
  if found then
    return query select v_existing.order_id, v_existing.credits_revoked, v_existing.credits_consumed, v_existing.bookings_cancelled;
    return;
  end if;
  select * into v_batch from public.credit_batches where credit_batches.order_id = v_order.id for update;
  bookings_cancelled := 0;
  if v_batch.id is not null then
    perform 1 from public.session_bookings
    where credit_batch_id = v_batch.id and status in ('requested', 'confirmed') for update;
    select count(*)::integer into bookings_cancelled from public.session_bookings
    where credit_batch_id = v_batch.id and status in ('requested', 'confirmed');
    update public.session_bookings set status = 'cancelled', cancelled_at = coalesce(cancelled_at, p_refunded_at)
    where credit_batch_id = v_batch.id and status in ('requested', 'confirmed');
  end if;
  v_reclaimable := least(coalesce(v_batch.total, 0), coalesce(v_batch.remaining, 0) + bookings_cancelled);
  credits_revoked := greatest(v_reclaimable, 0);
  credits_consumed := greatest(coalesce(v_batch.total, 0) - v_reclaimable, 0);
  order_id := v_order.id;
  if v_batch.id is not null then update public.credit_batches set remaining = 0 where id = v_batch.id; end if;
  update public.orders set status = 'refunded', refunded_at = p_refunded_at,
    refunded_amount_cents = p_amount_cents, stripe_charge_id = nullif(btrim(p_charge_id), '')
  where id = v_order.id;
  insert into public.stripe_refunds (
    refund_id, stripe_event_id, order_id, stripe_charge_id, amount_cents,
    currency, credits_revoked, credits_consumed, bookings_cancelled, refunded_at
  ) values (
    btrim(p_refund_id), btrim(p_event_id), v_order.id, nullif(btrim(p_charge_id), ''),
    p_amount_cents, lower(p_currency), credits_revoked, credits_consumed, bookings_cancelled, p_refunded_at
  );
  return next;
end;
$$;
revoke execute on function public.reconcile_stripe_order_refund(text, text, text, text, integer, text, timestamptz) from public, anon, authenticated;
grant execute on function public.reconcile_stripe_order_refund(text, text, text, text, integer, text, timestamptz) to service_role;


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
create index if not exists session_bookings_waitlist_order_idx
  on public.session_bookings(class_session_id, created_at, id)
  where status = 'waitlisted';

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

create or replace function public.enforce_session_waitlist_fifo()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_first_waitlisted uuid;
begin
  if new.status not in ('requested', 'confirmed') then return new; end if;
  if tg_op = 'UPDATE' then
    if old.status in ('requested', 'confirmed') then return new; end if;
  end if;

  select id into v_first_waitlisted from public.session_bookings
    where class_session_id = new.class_session_id and status = 'waitlisted'
    order by created_at, id limit 1;
  if v_first_waitlisted is null then return new; end if;
  if tg_op = 'UPDATE' then
    if old.status = 'waitlisted' and new.id = v_first_waitlisted then return new; end if;
  end if;
  raise exception 'WAITLIST_PRIORITY';
end; $$;
revoke execute on function public.enforce_session_waitlist_fifo() from public, anon, authenticated;
drop trigger if exists session_bookings_waitlist_fifo_guard on public.session_bookings;
create trigger session_bookings_waitlist_fifo_guard
  before insert or update of status on public.session_bookings
  for each row execute function public.enforce_session_waitlist_fifo();


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


-- Join a full future class without reserving a class credit. Staff promotion
-- uses admin_set_booking_status, which checks capacity and reserves a credit.
create or replace function public.join_session_waitlist(p_session_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_capacity integer;
  v_start timestamptz;
  v_status text;
  v_mode text;
  v_booked integer;
  v_booking uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  select capacity, start_time, status, coalesce(booking_mode, 'instant_book')
    into v_capacity, v_start, v_status, v_mode
    from public.class_sessions where id = p_session_id for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if v_status <> 'published' then raise exception 'SESSION_NOT_BOOKABLE'; end if;
  if v_start <= now() then raise exception 'SESSION_IN_PAST'; end if;
  if v_mode = 'interest_only' then raise exception 'SESSION_INTEREST_ONLY'; end if;

  if exists (
    select 1 from public.session_bookings
    where user_id = v_user and class_session_id = p_session_id
      and status in ('requested', 'confirmed', 'waitlisted')
  ) then raise exception 'ALREADY_BOOKED'; end if;

  if v_capacity is null then raise exception 'SESSION_HAS_CAPACITY'; end if;
  select count(*) into v_booked from public.session_bookings
    where class_session_id = p_session_id and status in ('requested', 'confirmed');
  if v_booked < v_capacity and not exists (
    select 1 from public.session_bookings
    where class_session_id = p_session_id and status = 'waitlisted'
  ) then raise exception 'SESSION_HAS_CAPACITY'; end if;

  insert into public.session_bookings (
    user_id, class_session_id, credit_batch_id, status
  ) values (v_user, p_session_id, null, 'waitlisted')
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
         case when exists (
                select 1 from session_bookings waiting
                where waiting.class_session_id = s.id and waiting.status = 'waitlisted'
              ) then 0
              when s.capacity is null then null
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
  start_time timestamptz, end_time timestamptz, location_zone text, intensity_level text,
  waitlist_position bigint
) language sql security definer stable set search_path = public as $$
  select b.id, b.status, b.created_at, b.cancelled_at,
         s.id, s.title, s.class_type, s.coach_name,
         s.start_time, s.end_time, s.location_zone, s.intensity_level,
         case when b.status = 'waitlisted' then (
           select count(*) + 1
           from public.session_bookings earlier
           where earlier.class_session_id = b.class_session_id
             and earlier.status = 'waitlisted'
             and (earlier.created_at, earlier.id) < (b.created_at, b.id)
         ) end as waitlist_position
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
drop policy if exists "products_admin_read"  on public.products;
drop policy if exists "products_admin_insert" on public.products;
create policy "products_public_read" on public.products
  for select to anon, authenticated using (active = true);
create policy "products_admin_read" on public.products
  for select to authenticated using (public.is_admin());
create policy "products_admin_insert" on public.products
  for insert to authenticated with check (public.is_admin());

-- orders: a user reads own orders; admins read all. Writes happen via the
-- service-role webhook (which bypasses RLS), so no public insert policy.
alter table public.orders enable row level security;
drop policy if exists "orders_select_own_or_admin" on public.orders;
create policy "orders_select_own_or_admin" on public.orders
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- member_announcements: signed-in members see only live notices; admins manage
-- drafts, publishing and expiry through the command centre.
create or replace function public.touch_member_announcement_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists member_announcements_touch_updated_at on public.member_announcements;
create trigger member_announcements_touch_updated_at
  before update on public.member_announcements
  for each row execute function public.touch_member_announcement_updated_at();
alter table public.member_announcements enable row level security;
drop policy if exists "member_announcements_select_live_or_admin" on public.member_announcements;
drop policy if exists "member_announcements_admin_insert" on public.member_announcements;
drop policy if exists "member_announcements_admin_update" on public.member_announcements;
drop policy if exists "member_announcements_admin_delete" on public.member_announcements;
create policy "member_announcements_select_live_or_admin" on public.member_announcements
  for select to authenticated using (
    public.is_admin() or (
      published_at is not null and published_at <= now()
      and (expires_at is null or expires_at > now())
    )
  );
create policy "member_announcements_admin_insert" on public.member_announcements
  for insert to authenticated with check (public.is_admin());
create policy "member_announcements_admin_update" on public.member_announcements
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "member_announcements_admin_delete" on public.member_announcements
  for delete to authenticated using (public.is_admin());

-- credit_batches: a user reads own credits; admins read all. Writes via
-- SECURITY DEFINER functions / service role only.
alter table public.credit_batches enable row level security;
drop policy if exists "credit_batches_select_own_or_admin" on public.credit_batches;
create policy "credit_batches_select_own_or_admin" on public.credit_batches
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

alter table public.stripe_refunds enable row level security;
drop policy if exists "stripe_refunds_admin_read" on public.stripe_refunds;
create policy "stripe_refunds_admin_read" on public.stripe_refunds
  for select to authenticated using (public.is_admin());

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
revoke all on table public.member_announcements from public, anon;
grant select, insert, update, delete on table public.member_announcements to authenticated;
revoke execute on function public.sessions_with_availability() from public;
revoke execute on function public.book_session(uuid) from public, anon;
revoke execute on function public.join_session_waitlist(uuid) from public, anon;
revoke execute on function public.cancel_booking(uuid) from public, anon;
revoke execute on function public.my_bookings() from public, anon;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.sessions_with_availability() to anon, authenticated;
grant execute on function public.book_session(uuid)          to authenticated;
grant execute on function public.join_session_waitlist(uuid) to authenticated;
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
insert into public.xert_schema_capabilities (capability)
values ('member_waitlist_join') on conflict (capability) do nothing;
insert into public.xert_schema_capabilities (capability)
values ('checkout_reconciliation') on conflict (capability) do nothing;
insert into public.xert_schema_capabilities (capability)
values ('member_announcements') on conflict (capability) do nothing;
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
