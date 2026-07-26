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
  email       text,
  role        text not null default 'member',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- This file used to create profiles without an email column and leave
-- admin_cms_schema.sql to add it. That made the two files disagree about what
-- handle_new_user and guard_profile_write should look like, and because both
-- are `create or replace`, re-running this file silently reverted the hardened
-- definitions. The column is created here so every file can define the same,
-- fully hardened, trigger pair.
alter table public.profiles add column if not exists email text;

-- Auto-create a profile row whenever a new auth user signs up.
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
-- PostgREST request promoting a member profile to admin. Email is created
-- above so this hardened definition (including email immutability) is always
-- valid and cannot be silently reverted by re-running this file.
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

drop trigger if exists before_profile_write on public.profiles;
create trigger before_profile_write
  before insert or update on public.profiles
  for each row execute function public.guard_profile_write();

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.guard_profile_write() from public, anon, authenticated;


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
  if not public.is_admin() then
    raise exception 'ADMIN_ONLY';
  end if;
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
       or lower(v_current.currency) <> lower(v_update.currency)
       or v_current.sessions_count <> v_update.sessions_count
       or v_current.validity_days <> v_update.validity_days) then
    raise exception 'STRIPE_PRICE_REFRESH_REQUIRED';
  end if;

  if v_update.active and (
       not v_current.active
       or v_current.stripe_price_id is distinct from nullif(btrim(v_update.stripe_price_id), '')
       or v_current.price_cents <> v_update.price_cents
       or lower(v_current.currency) <> lower(v_update.currency)
       or v_current.sessions_count <> v_update.sessions_count
       or v_current.validity_days <> v_update.validity_days
     ) then
    raise exception 'PRODUCT_ACTIVATION_VERIFICATION_REQUIRED';
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
-- catalog_optimistic_locking_upgrade.sql supersedes this overload with a
-- three-argument form that raises PRODUCT_STALE, and revokes execute on this
-- one so a request that omits p_expected_updated_at cannot resolve to the
-- unguarded overload. Re-running this file used to hand that grant straight
-- back, silently disarming the optimistic lock. Only grant while the guarded
-- overload is absent.
revoke execute on function public.admin_update_product(uuid, jsonb) from public, anon;
do $$
begin
  if to_regprocedure('public.admin_update_product(uuid, jsonb, timestamptz)') is null then
    grant execute on function public.admin_update_product(uuid, jsonb) to authenticated;
  else
    revoke execute on function public.admin_update_product(uuid, jsonb) from authenticated;
  end if;
end;
$$;

create or replace function public.admin_create_product(p_slug text, p_product jsonb)
returns public.products
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_product record;
  v_created public.products%rowtype;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_ONLY';
  end if;
  if p_product is null then raise exception 'PRODUCT_PAYLOAD_REQUIRED'; end if;

  select * into v_product
  from jsonb_to_record(p_product) as product_data(
    name text,
    description text,
    price_cents integer,
    currency text,
    sessions_count integer,
    validity_days integer,
    featured boolean,
    sort_order integer
  );

  if p_slug is null
     or length(p_slug) > 80
     or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     or v_product.name is null or btrim(v_product.name) = ''
     or length(btrim(v_product.name)) > 120
     or length(coalesce(btrim(v_product.description), '')) > 2000
     or v_product.price_cents is null or v_product.price_cents <= 0
     or v_product.currency is null or v_product.currency !~ '^[a-zA-Z]{3}$'
     or v_product.sessions_count is null or v_product.sessions_count not between 1 and 1000
     or v_product.validity_days is null or v_product.validity_days not between 1 and 3650
     or v_product.featured is null
     or v_product.sort_order is null or v_product.sort_order not between 0 and 10000 then
    raise exception 'INVALID_PRODUCT_PAYLOAD';
  end if;

  insert into public.products (
    slug, name, description, price_cents, currency, sessions_count,
    validity_days, stripe_price_id, featured, active, sort_order
  ) values (
    p_slug,
    btrim(v_product.name),
    nullif(btrim(v_product.description), ''),
    v_product.price_cents,
    lower(v_product.currency),
    v_product.sessions_count,
    v_product.validity_days,
    null,
    v_product.featured,
    false,
    v_product.sort_order
  )
  returning * into v_created;

  return v_created;
end;
$$;

revoke all on function public.admin_create_product(text, jsonb) from public, anon;
grant execute on function public.admin_create_product(text, jsonb) to authenticated;

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
  credit_total                integer check (credit_total > 0),
  credit_validity_days        integer check (credit_validity_days > 0),
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

create or replace function public.guard_stripe_order_terms()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.stripe_checkout_session_id is not null
     and (new.credit_total is null or new.credit_validity_days is null) then
    raise exception 'Stripe orders require a purchased credit terms snapshot';
  end if;
  if tg_op = 'UPDATE' and (
    new.credit_total is distinct from old.credit_total
    or new.credit_validity_days is distinct from old.credit_validity_days
  ) then
    raise exception 'Stripe order credit terms are immutable';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_stripe_order_terms_trigger on public.orders;
create trigger guard_stripe_order_terms_trigger
before insert or update on public.orders
for each row execute function public.guard_stripe_order_terms();

-- ── member announcements ────────────────────────────────────────────────────
-- Admin-authored operational notices shared by the web account and iOS app.
create table if not exists public.member_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  tone text not null default 'info' check (tone in ('info', 'action', 'urgent')),
  cta_label text,
  cta_url text,
  published_at timestamptz,
  first_published_at timestamptz,
  expires_at timestamptz,
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  last_changed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or published_at is null or expires_at > published_at),
  constraint member_announcements_cta_check check (
    (cta_label is null and cta_url is null)
    or (
      cta_label is not null and cta_url is not null
      and cta_label = btrim(cta_label) and char_length(cta_label) between 1 and 40
      and cta_label !~ '[[:cntrl:]]'
      and cta_url = btrim(cta_url) and char_length(cta_url) between 1 and 500
      and cta_url !~ '[[:cntrl:]]'
      and (
        (left(cta_url, 1) = '/' and left(cta_url, 2) <> '//')
        or (cta_url ~ '^https://' and split_part(split_part(cta_url, '://', 2), '/', 1) not like '%@%')
      )
    )
  )
);
create index if not exists member_announcements_live_idx
  on public.member_announcements(published_at desc, id desc) where published_at is not null;
create index if not exists member_announcements_archive_idx
  on public.member_announcements(archived_at, created_at desc, id desc);

create table if not exists public.member_announcement_receipts (
  announcement_id uuid not null references public.member_announcements(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  dismissed_at timestamptz,
  primary key (announcement_id, user_id)
);
create index if not exists member_announcement_receipts_user_idx
  on public.member_announcement_receipts(user_id, dismissed_at, announcement_id);

create table if not exists public.member_announcement_admin_events (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null,
  announcement_title text not null,
  action text not null check (action in ('created', 'updated', 'published', 'unpublished', 'archived', 'restored', 'deleted')),
  actor_id uuid references public.profiles(id) on delete set null,
  previous_published_at timestamptz,
  new_published_at timestamptz,
  previous_archived_at timestamptz,
  new_archived_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists member_announcement_admin_events_created_idx
  on public.member_announcement_admin_events(created_at desc, id desc);
create index if not exists member_announcement_admin_events_announcement_idx
  on public.member_announcement_admin_events(announcement_id, created_at desc);


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

-- Settle a paid Stripe Checkout Session in one locked transaction. This keeps
-- refunds terminal even when Stripe retries an older success event later.
create or replace function public.fulfill_stripe_checkout(
  p_checkout_session_id text,
  p_user_id uuid,
  p_product_id uuid,
  p_email text,
  p_amount_cents integer,
  p_currency text,
  p_payment_intent_id text,
  p_paid_at timestamptz,
  p_credit_total integer,
  p_credit_validity_days integer
)
returns table(fulfilled_order_id uuid, final_status text, credit_created boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_credit_rows integer := 0;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Stripe fulfillment requires service role';
  end if;
  if nullif(btrim(p_checkout_session_id), '') is null
     or nullif(btrim(p_payment_intent_id), '') is null
     or p_user_id is null or p_product_id is null
     or p_amount_cents is null or p_amount_cents <= 0
     or lower(coalesce(p_currency, '')) <> 'aud'
     or p_paid_at is null
     or p_credit_total is null or p_credit_total <= 0
     or p_credit_validity_days is null or p_credit_validity_days <= 0 then
    raise exception 'Invalid Stripe fulfillment payload';
  end if;

  select orders.* into v_order from public.orders as orders
  where orders.stripe_checkout_session_id = p_checkout_session_id for update;
  if v_order.id is null then raise exception 'Stripe fulfillment requires a recorded pending order'; end if;
  -- A NULL user_id means the buyer deleted their account after this order was
  -- recorded. Every other identity field must still match exactly.
  if (v_order.user_id is not null and v_order.user_id is distinct from p_user_id)
     or v_order.product_id is distinct from p_product_id
     or v_order.amount_cents is distinct from p_amount_cents
     or lower(coalesce(v_order.currency, '')) <> lower(p_currency)
     or v_order.credit_total is distinct from p_credit_total
     or v_order.credit_validity_days is distinct from p_credit_validity_days
     or (v_order.stripe_payment_intent_id is not null
         and v_order.stripe_payment_intent_id <> p_payment_intent_id) then
    raise exception 'Stripe fulfillment does not match the recorded order';
  end if;

  if v_order.status = 'refunded' then
    return query select v_order.id, v_order.status, false;
    return;
  end if;
  if v_order.status not in ('pending', 'failed', 'paid') then
    raise exception 'Stripe order has an unsupported state: %', v_order.status;
  end if;

  update public.orders as orders set
    status = 'paid',
    -- Account deletion nulls email; never re-attach Stripe's address onto an
    -- orphaned financial row, and clear any leftover address if auth was
    -- removed outside delete_member_account.
    email = case
      when orders.user_id is null then null
      else coalesce(nullif(btrim(p_email), ''), orders.email)
    end,
    stripe_payment_intent_id = coalesce(orders.stripe_payment_intent_id, p_payment_intent_id),
    paid_at = coalesce(orders.paid_at, p_paid_at)
  where orders.id = v_order.id returning orders.* into v_order;

  -- No account left to credit when the buyer has deleted their membership.
  if v_order.user_id is not null then
    insert into public.credit_batches (user_id, product_id, order_id, total, remaining, expires_at)
    values (
      v_order.user_id, p_product_id, v_order.id, v_order.credit_total, v_order.credit_total,
      v_order.paid_at + make_interval(days => v_order.credit_validity_days)
    )
    on conflict (order_id) do nothing;
    get diagnostics v_credit_rows = row_count;
  end if;
  return query select v_order.id, v_order.status, v_credit_rows = 1;
end;
$$;
revoke execute on function public.fulfill_stripe_checkout(
  text, uuid, uuid, text, integer, text, text, timestamptz, integer, integer
) from public, anon, authenticated;
grant execute on function public.fulfill_stripe_checkout(
  text, uuid, uuid, text, integer, text, text, timestamptz, integer, integer
) to service_role;
-- Retire the pre-terms-snapshot overload so operator re-runs cannot resurrect it.
drop function if exists public.fulfill_stripe_checkout(
  text, uuid, uuid, text, integer, text, text, timestamptz, integer, timestamptz
);

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

-- Active class places may not overlap. A per-member transaction lock closes
-- the race between bookings for two different sessions.
create or replace function public.enforce_booking_time_conflict()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_start timestamptz;
  v_end timestamptz;
  v_duration integer;
begin
  if new.status not in ('requested', 'confirmed') then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));

  select session.start_time, session.end_time, session.duration_minutes
    into v_start, v_end, v_duration
  from public.class_sessions as session
  where session.id = new.class_session_id;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  v_end := coalesce(v_end, v_start + make_interval(mins => greatest(coalesce(v_duration, 60), 1)));

  if exists (
    select 1
    from public.session_bookings as booking
    join public.class_sessions as session on session.id = booking.class_session_id
    where booking.user_id = new.user_id
      and booking.id is distinct from new.id
      and booking.status in ('requested', 'confirmed')
      and session.start_time < v_end
      and coalesce(
        session.end_time,
        session.start_time + make_interval(mins => greatest(coalesce(session.duration_minutes, 60), 1))
      ) > v_start
  ) then raise exception 'BOOKING_TIME_CONFLICT'; end if;
  return new;
end; $$;
revoke execute on function public.enforce_booking_time_conflict() from public, anon, authenticated;
drop trigger if exists session_bookings_time_conflict_guard on public.session_bookings;
create trigger session_bookings_time_conflict_guard
  before insert or update of user_id, class_session_id, status on public.session_bookings
  for each row execute function public.enforce_booking_time_conflict();

-- Moving an existing class must preserve the same invariant for every member
-- already holding a requested or confirmed place.
create or replace function public.enforce_session_reschedule_conflicts()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
  v_end timestamptz;
begin
  if new.start_time is not distinct from old.start_time
    and new.end_time is not distinct from old.end_time
    and new.duration_minutes is not distinct from old.duration_minutes then return new;
  end if;
  v_end := coalesce(
    new.end_time,
    new.start_time + make_interval(mins => greatest(coalesce(new.duration_minutes, 60), 1))
  );
  for v_user in
    select distinct booking.user_id
    from public.session_bookings as booking
    where booking.class_session_id = new.id and booking.status in ('requested', 'confirmed')
    order by booking.user_id
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
    if exists (
      select 1
      from public.session_bookings as booking
      join public.class_sessions as session on session.id = booking.class_session_id
      where booking.user_id = v_user
        and booking.class_session_id <> new.id
        and booking.status in ('requested', 'confirmed')
        and session.start_time < v_end
        and coalesce(
          session.end_time,
          session.start_time + make_interval(mins => greatest(coalesce(session.duration_minutes, 60), 1))
        ) > new.start_time
    ) then raise exception 'SESSION_TIME_CONFLICTS_WITH_MEMBER_BOOKING'; end if;
  end loop;
  return new;
end; $$;
revoke execute on function public.enforce_session_reschedule_conflicts() from public, anon, authenticated;
drop trigger if exists class_sessions_reschedule_conflict_guard on public.class_sessions;
create trigger class_sessions_reschedule_conflict_guard
  before update of start_time, end_time, duration_minutes on public.class_sessions
  for each row execute function public.enforce_session_reschedule_conflicts();


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

revoke all on function public.credit_batch_expires_at_after_refund(timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function public.refund_credits_to_batch(uuid, integer, timestamptz)
  from public, anon, authenticated;

-- Cancel a confirmed booking, pending request, or waitlist place. Waitlisted
-- places have already released their credit and must never refund it twice.
-- A timely cancel always restores the credit; if the pack has already expired,
-- reactivate the batch so the returned credit stays bookable.
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

  if (v_status = 'requested' or (v_status = 'confirmed' and v_start - now() > interval '12 hours'))
     and v_batch is not null then
    perform public.refund_credits_to_batch(v_batch, 1, v_start);
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


create or replace function public.admin_announcement_metrics()
returns table (announcement_id uuid, read_count bigint, dismissed_count bigint)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  return query
  select announcement.id, count(receipt.user_id)::bigint,
         count(receipt.user_id) filter (where receipt.dismissed_at is not null)::bigint
  from public.member_announcements as announcement
  left join public.member_announcement_receipts as receipt on receipt.announcement_id = announcement.id
  group by announcement.id;
end;
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
  for select to authenticated using (id = (select auth.uid()) or (select public.is_admin()));
create policy "profiles_update_own_or_admin" on public.profiles
  for update to authenticated using (id = (select auth.uid()) or (select public.is_admin()))
  with check (id = (select auth.uid()) or (select public.is_admin()));
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
revoke insert on table public.products from anon, authenticated;

-- orders: a user reads own orders; admins read all. Writes happen via the
-- service-role webhook (which bypasses RLS), so no public insert policy.
alter table public.orders enable row level security;
drop policy if exists "orders_select_own_or_admin" on public.orders;
create policy "orders_select_own_or_admin" on public.orders
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));

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

create or replace function public.prepare_member_announcement_lifecycle()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    new.last_changed_by := coalesce(auth.uid(), new.last_changed_by, new.created_by);
    if new.published_at is not null then
      new.first_published_at := coalesce(new.first_published_at, new.published_at);
    end if;
  else
    new.first_published_at := old.first_published_at;
    if old.archived_at is not null and new.archived_at is null and new.published_at is not null then
      raise exception 'RESTORE_ANNOUNCEMENT_BEFORE_PUBLISHING';
    end if;
    if old.first_published_at is null and new.published_at is not null then
      new.first_published_at := new.published_at;
    end if;
    new.last_changed_by := coalesce(auth.uid(), new.last_changed_by, old.last_changed_by);
  end if;
  if new.archived_at is not null and new.published_at is not null then
    raise exception 'ARCHIVED_ANNOUNCEMENT_CANNOT_PUBLISH';
  end if;
  return new;
end;
$$;
drop trigger if exists member_announcements_prepare_lifecycle on public.member_announcements;
create trigger member_announcements_prepare_lifecycle
  before insert or update on public.member_announcements
  for each row execute function public.prepare_member_announcement_lifecycle();

create or replace function public.guard_member_announcement_delete()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if old.first_published_at is not null then raise exception 'ANNOUNCEMENT_ARCHIVE_REQUIRED'; end if;
  return old;
end;
$$;
drop trigger if exists member_announcements_guard_delete on public.member_announcements;
create trigger member_announcements_guard_delete
  before delete on public.member_announcements
  for each row execute function public.guard_member_announcement_delete();

create or replace function public.audit_member_announcement_lifecycle()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_action text;
  v_announcement_id uuid;
  v_announcement_title text;
  v_actor_id uuid;
  v_previous_published_at timestamptz;
  v_new_published_at timestamptz;
  v_previous_archived_at timestamptz;
  v_new_archived_at timestamptz;
begin
  if tg_op = 'INSERT' then
    v_action := case when new.published_at is null then 'created' else 'published' end;
  elsif tg_op = 'DELETE' then
    v_action := 'deleted';
  elsif old.archived_at is null and new.archived_at is not null then
    v_action := 'archived';
  elsif old.archived_at is not null and new.archived_at is null then
    v_action := 'restored';
  elsif old.published_at is null and new.published_at is not null then
    v_action := 'published';
  elsif old.published_at is not null and new.published_at is null then
    v_action := 'unpublished';
  else
    v_action := 'updated';
  end if;
  if tg_op = 'DELETE' then
    v_announcement_id := old.id;
    v_announcement_title := old.title;
    v_actor_id := coalesce(auth.uid(), old.last_changed_by);
    v_previous_published_at := old.published_at;
    v_previous_archived_at := old.archived_at;
  elsif tg_op = 'INSERT' then
    v_announcement_id := new.id;
    v_announcement_title := new.title;
    v_actor_id := coalesce(auth.uid(), new.last_changed_by);
    v_new_published_at := new.published_at;
    v_new_archived_at := new.archived_at;
  else
    v_announcement_id := new.id;
    v_announcement_title := new.title;
    v_actor_id := coalesce(auth.uid(), new.last_changed_by);
    v_previous_published_at := old.published_at;
    v_new_published_at := new.published_at;
    v_previous_archived_at := old.archived_at;
    v_new_archived_at := new.archived_at;
  end if;
  insert into public.member_announcement_admin_events (
    announcement_id, announcement_title, action, actor_id,
    previous_published_at, new_published_at, previous_archived_at, new_archived_at
  ) values (
    v_announcement_id, v_announcement_title, v_action, v_actor_id,
    v_previous_published_at, v_new_published_at, v_previous_archived_at, v_new_archived_at
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists member_announcements_audit_lifecycle on public.member_announcements;
create trigger member_announcements_audit_lifecycle
  after insert or update or delete on public.member_announcements
  for each row execute function public.audit_member_announcement_lifecycle();

create or replace function public.admin_archive_member_announcement(p_announcement_id uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_actor uuid := auth.uid();
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  perform 1 from public.member_announcements where id = p_announcement_id for update;
  if not found then raise exception 'ANNOUNCEMENT_NOT_FOUND'; end if;
  if p_archived then
    update public.member_announcements
    set archived_at = now(), archived_by = v_actor, published_at = null, last_changed_by = v_actor
    where id = p_announcement_id and archived_at is null;
  else
    update public.member_announcements
    set archived_at = null, archived_by = null, last_changed_by = v_actor
    where id = p_announcement_id and archived_at is not null;
  end if;
end;
$$;
alter table public.member_announcements enable row level security;
drop policy if exists "member_announcements_select_live_or_admin" on public.member_announcements;
drop policy if exists "member_announcements_admin_insert" on public.member_announcements;
drop policy if exists "member_announcements_admin_update" on public.member_announcements;
drop policy if exists "member_announcements_admin_delete" on public.member_announcements;
-- Targeted notices are private to their recipients. That predicate is added by
-- class_cancellation_notifications_upgrade.sql, which also creates
-- member_announcement_targets. This file used to recreate the read policy
-- without it, so re-running an "idempotent" script on a hardened database let
-- every member read every other member's targeted notice. Emit whichever form
-- the installed schema can express, never the weaker one.
do $announcement_policy$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'member_announcements' and column_name = 'audience'
  ) and to_regclass('public.member_announcement_targets') is not null then
    execute $policy$
      create policy "member_announcements_select_live_or_admin" on public.member_announcements
        for select to authenticated using (
          public.is_admin() or (
            archived_at is null
            and published_at is not null and published_at <= now()
            and (expires_at is null or expires_at > now())
            and (
              audience = 'all'
              or (
                audience = 'targeted'
                and exists (
                  select 1
                  from public.member_announcement_targets target
                  where target.announcement_id = member_announcements.id
                    and target.user_id = (select auth.uid())
                )
              )
            )
          )
        );
    $policy$;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'member_announcements' and column_name = 'audience'
  ) then
    -- Audience exists without targets: fail closed to broadcast-only so
    -- re-applying this file cannot expose targeted notices.
    execute $policy$
      create policy "member_announcements_select_live_or_admin" on public.member_announcements
        for select to authenticated using (
          public.is_admin() or (
            archived_at is null
            and published_at is not null and published_at <= now()
            and (expires_at is null or expires_at > now())
            and audience = 'all'
          )
        );
    $policy$;
  elsif to_regclass('public.member_announcement_targets') is null then
    -- Fresh install before targeting exists: broadcast-era read policy only.
    execute $policy$
      create policy "member_announcements_select_live_or_admin" on public.member_announcements
        for select to authenticated using (
          public.is_admin() or (
            archived_at is null
            and published_at is not null and published_at <= now()
            and (expires_at is null or expires_at > now())
          )
        );
    $policy$;
  else
    -- Audience column missing but targets already present: never emit a
    -- broadcast-era policy that would expose targeted rows.
    raise exception 'ANNOUNCEMENT_POLICY_SCHEMA_DRIFT';
  end if;
end;
$announcement_policy$;
create policy "member_announcements_admin_insert" on public.member_announcements
  for insert to authenticated with check (public.is_admin());
create policy "member_announcements_admin_update" on public.member_announcements
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "member_announcements_admin_delete" on public.member_announcements
  for delete to authenticated using (public.is_admin());

alter table public.member_announcement_receipts enable row level security;
drop policy if exists "announcement_receipts_select_own_or_admin" on public.member_announcement_receipts;
create policy "announcement_receipts_select_own_or_admin" on public.member_announcement_receipts
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));

alter table public.member_announcement_admin_events enable row level security;
drop policy if exists "member_announcement_admin_events_admin_read" on public.member_announcement_admin_events;
create policy "member_announcement_admin_events_admin_read" on public.member_announcement_admin_events
  for select to authenticated using ((select public.is_admin()));

-- credit_batches: a user reads own credits; admins read all. Writes via
-- SECURITY DEFINER functions / service role only.
alter table public.credit_batches enable row level security;
drop policy if exists "credit_batches_select_own_or_admin" on public.credit_batches;
create policy "credit_batches_select_own_or_admin" on public.credit_batches
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));

alter table public.stripe_refunds enable row level security;
drop policy if exists "stripe_refunds_admin_read" on public.stripe_refunds;
create policy "stripe_refunds_admin_read" on public.stripe_refunds
  for select to authenticated using (public.is_admin());

-- session_bookings: a user reads own bookings; admins read all. Inserts/updates
-- go through book_session()/cancel_booking() (SECURITY DEFINER).
alter table public.session_bookings enable row level security;
drop policy if exists "session_bookings_select_own_or_admin" on public.session_bookings;
create policy "session_bookings_select_own_or_admin" on public.session_bookings
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));

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
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "member_event_goals_insert_own" on public.member_event_goals
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "member_event_goals_delete_own_or_admin" on public.member_event_goals
  for delete to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));


-- ── Function grants ─────────────────────────────────────────────────────────
-- SECURITY DEFINER functions are executable by PUBLIC unless explicitly
-- revoked. Keep public timetable reads open, but limit member/admin actions.
revoke all on table public.member_announcements from public, anon;
grant select, insert, update, delete on table public.member_announcements to authenticated;
revoke all on table public.member_announcement_receipts from public, anon;
grant select on table public.member_announcement_receipts to authenticated;
revoke all on table public.member_announcement_admin_events from public, anon, authenticated;
grant select on table public.member_announcement_admin_events to authenticated;
revoke execute on function public.touch_member_announcement_updated_at() from public, anon, authenticated;
revoke execute on function public.prepare_member_announcement_lifecycle() from public, anon, authenticated;
revoke execute on function public.guard_member_announcement_delete() from public, anon, authenticated;
revoke execute on function public.audit_member_announcement_lifecycle() from public, anon, authenticated;
revoke execute on function public.sessions_with_availability() from public;
revoke execute on function public.book_session(uuid) from public, anon;
revoke execute on function public.join_session_waitlist(uuid) from public, anon;
revoke execute on function public.cancel_booking(uuid) from public, anon;
revoke execute on function public.my_bookings() from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.admin_announcement_metrics() from public, anon;
revoke execute on function public.admin_archive_member_announcement(uuid, boolean) from public, anon;
grant execute on function public.sessions_with_availability() to anon, authenticated;
grant execute on function public.book_session(uuid)          to authenticated;
grant execute on function public.join_session_waitlist(uuid) to authenticated;
grant execute on function public.cancel_booking(uuid)        to authenticated;
grant execute on function public.my_bookings()               to authenticated;
grant execute on function public.is_admin()                  to authenticated;
grant execute on function public.admin_announcement_metrics() to authenticated;

-- shared_admin_optimistic_locking_upgrade.sql supersedes this overload with a
-- version-checked three-argument form and revokes execute on this one. Only
-- grant it back while that guarded overload is absent, so re-running this file
-- cannot re-arm the unguarded archive path.
do $$
begin
  if to_regprocedure('public.admin_archive_member_announcement(uuid, boolean, timestamptz)') is null then
    grant execute on function public.admin_archive_member_announcement(uuid, boolean) to authenticated;
  else
    revoke execute on function public.admin_archive_member_announcement(uuid, boolean) from authenticated;
  end if;
end;
$$;

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
values ('credit_batch_refund_reactivation') on conflict (capability) do nothing;
insert into public.xert_schema_capabilities (capability)
values ('cancel_booking_expired_batch_refund') on conflict (capability) do nothing;
insert into public.xert_schema_capabilities (capability)
values ('member_waitlist_join') on conflict (capability) do nothing;
insert into public.xert_schema_capabilities (capability)
values ('checkout_reconciliation') on conflict (capability) do nothing;
insert into public.xert_schema_capabilities (capability)
values ('stripe_payment_fulfillment') on conflict (capability) do nothing;
insert into public.xert_schema_capabilities (capability)
values ('stripe_pending_order_guard') on conflict (capability) do nothing;
insert into public.xert_schema_capabilities (capability)
values ('stripe_order_terms_snapshot') on conflict (capability) do nothing;
insert into public.xert_schema_capabilities (capability)
values ('stripe_fulfillment_deleted_member') on conflict (capability) do nothing;
insert into public.xert_schema_capabilities (capability)
values ('stripe_fulfillment_deleted_email_erasure') on conflict (capability) do nothing;
insert into public.xert_schema_capabilities (capability)
values ('refund_skips_stripe_refunded_batches') on conflict (capability) do nothing;
-- Durable, retry-safe observability for verified Stripe webhook deliveries.
create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  livemode boolean not null,
  status text not null check (status in ('processing', 'processed', 'ignored', 'failed')),
  attempts integer not null default 1 check (attempts > 0),
  order_id uuid references public.orders(id) on delete set null,
  first_received_at timestamptz not null,
  last_received_at timestamptz not null,
  finished_at timestamptz,
  last_error_code text,
  check (event_id = btrim(event_id) and char_length(event_id) between 5 and 255),
  check (event_type = btrim(event_type) and char_length(event_type) between 3 and 160),
  check (last_error_code is null or (
    last_error_code = btrim(last_error_code)
    and char_length(last_error_code) between 1 and 120
    and last_error_code ~ '^[A-Za-z0-9_.:-]+$'
  ))
);

create index if not exists stripe_webhook_events_status_received_idx
  on public.stripe_webhook_events(status, last_received_at desc);
create index if not exists stripe_webhook_events_order_idx
  on public.stripe_webhook_events(order_id, last_received_at desc)
  where order_id is not null;

alter table public.stripe_webhook_events enable row level security;
drop policy if exists "stripe_webhook_events_admin_read" on public.stripe_webhook_events;
create policy "stripe_webhook_events_admin_read" on public.stripe_webhook_events
  for select to authenticated using (public.is_admin());

create or replace function public.begin_stripe_webhook_event(
  p_event_id text,
  p_event_type text,
  p_livemode boolean,
  p_received_at timestamptz
)
returns table(already_finished boolean, attempt_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.stripe_webhook_events%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Stripe webhook ledger requires service role';
  end if;
  if p_event_id is null or p_event_id !~ '^evt_[A-Za-z0-9_]+$'
     or char_length(p_event_id) > 255
     or p_event_type is null or p_event_type <> btrim(p_event_type)
     or char_length(p_event_type) not between 3 and 160
     or p_livemode is null or p_received_at is null then
    raise exception 'Invalid Stripe webhook ledger payload';
  end if;

  insert into public.stripe_webhook_events (
    event_id, event_type, livemode, status, attempts,
    first_received_at, last_received_at
  ) values (
    p_event_id, p_event_type, p_livemode, 'processing', 1,
    p_received_at, p_received_at
  )
  on conflict (event_id) do update
  set attempts = public.stripe_webhook_events.attempts + 1,
      last_received_at = excluded.last_received_at,
      status = case
        when public.stripe_webhook_events.status in ('processed', 'ignored')
          then public.stripe_webhook_events.status
        else 'processing'
      end,
      last_error_code = case
        when public.stripe_webhook_events.status in ('processed', 'ignored')
          then public.stripe_webhook_events.last_error_code
        else null
      end
  returning * into v_event;

  if v_event.event_type <> p_event_type or v_event.livemode <> p_livemode then
    raise exception 'Stripe webhook event identity mismatch';
  end if;

  return query select
    v_event.status in ('processed', 'ignored'),
    v_event.attempts;
end;
$$;

create or replace function public.finish_stripe_webhook_event(
  p_event_id text,
  p_status text,
  p_order_id uuid,
  p_error_code text,
  p_finished_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.stripe_webhook_events%rowtype;
  v_error_code text := nullif(btrim(p_error_code), '');
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Stripe webhook ledger requires service role';
  end if;
  if p_event_id is null or p_event_id !~ '^evt_[A-Za-z0-9_]+$'
     or p_status not in ('processed', 'ignored', 'failed')
     or p_finished_at is null
     or (v_error_code is not null and (
       char_length(v_error_code) > 120
       or v_error_code !~ '^[A-Za-z0-9_.:-]+$'
     )) then
    raise exception 'Invalid Stripe webhook completion payload';
  end if;

  select events.* into v_event
  from public.stripe_webhook_events as events
  where events.event_id = p_event_id
  for update;
  if v_event.event_id is null then
    raise exception 'Stripe webhook ledger event not found';
  end if;

  if v_event.status in ('processed', 'ignored') and p_status = 'failed' then
    return;
  end if;

  update public.stripe_webhook_events as events
  set status = p_status,
      order_id = coalesce(events.order_id, p_order_id),
      finished_at = p_finished_at,
      last_error_code = case when p_status = 'failed' then v_error_code else null end
  where events.event_id = p_event_id;
end;
$$;

revoke execute on function public.begin_stripe_webhook_event(text, text, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function public.begin_stripe_webhook_event(text, text, boolean, timestamptz)
  to service_role;
revoke execute on function public.finish_stripe_webhook_event(text, text, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.finish_stripe_webhook_event(text, text, uuid, text, timestamptz)
  to service_role;

insert into public.xert_schema_capabilities (capability)
values ('stripe_webhook_ledger') on conflict (capability) do nothing;
insert into public.xert_schema_capabilities (capability)
values ('member_announcements') on conflict (capability) do nothing;
insert into public.xert_schema_capabilities (capability)
values ('announcement_receipts') on conflict (capability) do nothing;
insert into public.xert_schema_capabilities (capability)
values ('announcement_actions') on conflict (capability) do nothing;
insert into public.xert_schema_capabilities (capability)
values ('announcement_archival') on conflict (capability) do nothing;
insert into public.xert_schema_capabilities (capability)
values ('booking_time_conflict_guard') on conflict (capability) do nothing;
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
