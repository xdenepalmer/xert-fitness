# Expanded payment options: recurring memberships (Stripe Billing) on BECS Direct Debit, coexisting with the existing one-off session-pack checkout; wallet payments; coach facility rent; dunning, pause/freeze, cooling-off and ACL-compliant refunds.

**Effort: XL**

> Design spec produced during the July 2026 audit, from the owner requirements note.
> Not yet implemented. Reviewed against the schema and code as at commit time.

## Summary

Today XERT sells one thing: a one-off session-pack credit batch via Stripe Checkout (`api/checkout.js` → `orders` → `fulfill_stripe_checkout` → `credit_batches`), gated by the `payments_enabled` activation switch and the webhook ledger. To sell memberships the gym needs a second, genuinely different money rail: a recurring subscription billed by BECS Direct Debit, which settles over ~3 business days, fails days after the fact, and whose disputes cannot be contested. The recommendation is to add one billing spine (`billing_plans` / `billing_subscriptions` / `billing_periods`) that mints ordinary `credit_batches` on every paid invoice — so the booking, waitlist, attendance and cancellation engine does not change at all — and to reuse the same spine for coach facility rent by swapping the payer, not the machinery. The commercially important calls: sell open-ended no-lock-in memberships (no 12-month contracts, no exit fees), price sessions per period rather than "unlimited", and run coach rent first as the low-blast-radius pilot of the BECS path.

## Recommendation

**Recommended: one "billing spine" (`billing_plans` → `billing_subscriptions` → `billing_periods`) on Stripe Billing, defaulting to BECS Direct Debit, where a membership's entitlement is a normal `credit_batches` row minted on `invoice.paid`.**

Five decisions inside that one approach:

1. **Membership = recurring credit grant, not a new access system.** Each paid invoice mints one `credit_batches` row (`source='membership'`, `expires_at = period_end + grace`). `book_session`, `join_session_waitlist`, `cancel_booking`, waitlist FIFO promotion, roll-call and `reconcile_stripe_order_refund` are all **unchanged**. Members with both a membership and a pack are handled correctly for free, because `book_session` already picks the earliest-expiring batch. This is the single highest-leverage decision in this design: it removes the entire "does this member have access right now?" problem from the booking hot path and makes dunning access policy fall out of credit expiry rather than needing new enforcement code.
2. **No unlimited memberships.** Classes are capacity-8 semi-private coaching. Unlimited makes cost unpriceable, invites seat-hoarding and no-shows, and would force an entitlement check into `book_session`. Sell capped plans (e.g. 4 / 6 / 8 sessions per fortnight). `billing_plans.included_sessions` is `not null` for membership plans by constraint, so this is enforced in the schema, not by convention.
3. **BECS as the default rail, cards/Apple Pay/Google Pay as the alternative.** BECS is materially cheaper at membership price points (Stripe AU list: BECS ~1% + A$0.30 capped at A$3.50 vs domestic cards 1.7% + A$0.30 — on a $180 fortnight that is roughly $2.10 vs $3.36, and the cap makes larger amounts dramatically cheaper). Do **not** build card surcharging to close the gap: the RBA has moved to prohibit surcharging on designated card networks, so a surcharge engine is build-then-delete work. One price, BECS preselected.
4. **Apple Pay / Google Pay require no code.** `buildCheckoutSessionParameters` never sets `payment_method_types`, so the hosted Checkout page already renders whatever is enabled in the Stripe Dashboard's automatic payment methods. Wallets are a dashboard toggle plus a health assertion — not a feature build. The only real work is verifying Apple Pay surfaces inside the iOS `ASWebAuthenticationSession` flow (`ios/.../Services/CheckoutBrowser.swift`) and falling back to `SFSafariViewController` if it does not.
5. **Coach rent is the same subscription with a different payer.** `billing_plans.kind='coach_rent'`, `billing_subscriptions.coach_id` instead of `user_id`, `included_sessions is null`, no entitlement minting. Coaches need no XERT login: the Stripe Checkout URL is itself the capability, emailed by the owner.

**Rejected alternatives and why.** A separate `memberships` subsystem with its own access checks (duplicates the credit engine, forks booking logic, and doubles the refund/dispute surface). Writing subscription checkouts into `orders` (the `guard_stripe_order_terms` trigger raises on any row with a `stripe_checkout_session_id` and no credit terms snapshot, and `fulfill_stripe_checkout` refuses to settle anything that is not a `mode: 'payment'` pending order — bending those guards to fit subscriptions would destroy the exact protection they exist to provide). Self-funded instalments (build Afterpay via the dashboard instead: XERT is paid in full immediately and Afterpay carries the credit risk).

## Data model

```sql
-- supabase/migrations/20260726000000_recurring_billing_spine.sql
-- Mirror to src/supabase/recurring_billing_spine_upgrade.sql (repo convention).
--
-- Recurring memberships and coach facility rent on one Stripe Billing spine.
-- public.orders / public.products / fulfill_stripe_checkout are deliberately
-- untouched: the pending-order and terms-snapshot guards there must never see
-- a subscription Checkout Session.

-- ── billing_plans (sellable recurring product) ──────────────────────────────
create table if not exists public.billing_plans (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  kind text not null check (kind in ('membership', 'coach_rent')),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  description text check (description is null or char_length(btrim(description)) between 1 and 600),
  price_cents integer not null check (price_cents > 0),
  currency text not null default 'aud' check (currency ~ '^[a-zA-Z]{3}$'),
  billing_interval text not null check (billing_interval in ('week', 'month')),
  billing_interval_count integer not null default 2 check (billing_interval_count between 1 and 12),
  included_sessions integer check (included_sessions between 1 and 100),
  entitlement_grace_days integer not null default 7 check (entitlement_grace_days between 0 and 60),
  joining_fee_cents integer not null default 0 check (joining_fee_cents >= 0),
  minimum_term_periods integer not null default 0 check (minimum_term_periods between 0 and 26),
  cancellation_notice_days integer not null default 14 check (cancellation_notice_days between 0 and 30),
  cooling_off_hours integer not null default 48 check (cooling_off_hours between 0 and 240),
  max_pause_days_per_year integer not null default 84 check (max_pause_days_per_year between 0 and 365),
  optimistic_access_limit_cents integer not null default 0 check (optimistic_access_limit_cents >= 0),
  stripe_price_id text,
  stripe_tax_rate_id text,
  active boolean not null default false,
  featured boolean not null default false,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_plans_slug_format_check check (
    slug = lower(slug) and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 80
  ),
  constraint billing_plans_stripe_price_format_check check (
    stripe_price_id is null or stripe_price_id ~ '^price_[A-Za-z0-9]+$'
  ),
  constraint billing_plans_stripe_tax_format_check check (
    stripe_tax_rate_id is null or stripe_tax_rate_id ~ '^txr_[A-Za-z0-9]+$'
  ),
  -- No unlimited memberships: capacity-8 semi-private classes cannot price them.
  constraint billing_plans_membership_entitlement_check check (
    kind <> 'membership' or included_sessions is not null
  ),
  constraint billing_plans_rent_entitlement_check check (
    kind <> 'coach_rent' or (included_sessions is null and joining_fee_cents = 0)
  ),
  -- A live plan must be bound to a Stripe Price, like products.stripe_price_id.
  constraint billing_plans_live_requires_price_check check (
    active is false or stripe_price_id is not null
  )
);

create index if not exists billing_plans_public_idx
  on public.billing_plans (kind, sort_order, id) where active;

alter table public.billing_plans enable row level security;
drop policy if exists "billing_plans_public_read" on public.billing_plans;
create policy "billing_plans_public_read" on public.billing_plans
  for select to anon, authenticated
  using (active and kind = 'membership');
drop policy if exists "billing_plans_admin_read" on public.billing_plans;
create policy "billing_plans_admin_read" on public.billing_plans
  for select to authenticated using ((select public.is_admin()));
drop policy if exists "billing_plans_admin_write" on public.billing_plans;
create policy "billing_plans_admin_write" on public.billing_plans
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop trigger if exists billing_plans_touch_updated_at on public.billing_plans;
create trigger billing_plans_touch_updated_at
  before update on public.billing_plans
  for each row execute function public.touch_catalog_record_updated_at();

-- Reuse the existing immutable content audit for plan pricing changes.
alter table public.admin_content_changes drop constraint if exists admin_content_changes_resource_type_check;
alter table public.admin_content_changes
  add constraint admin_content_changes_resource_type_check
  check (resource_type in ('site_content', 'coach', 'event', 'product', 'launch_settings', 'billing_plan'))
  not valid;

create or replace function public.audit_billing_plan_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_previous jsonb;
  v_new jsonb;
  v_record jsonb;
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new); v_record := v_new; v_action := 'created';
  elsif tg_op = 'DELETE' then
    v_previous := to_jsonb(old); v_record := v_previous; v_action := 'deleted';
  else
    v_previous := to_jsonb(old); v_new := to_jsonb(new);
    if (v_previous - 'updated_at') = (v_new - 'updated_at') then return new; end if;
    v_record := v_new; v_action := 'updated';
  end if;

  insert into public.admin_content_changes (
    resource_type, resource_id, action, changed_by, subject_label,
    previous_snapshot, new_snapshot
  ) values (
    'billing_plan', v_record ->> 'id', v_action, auth.uid(),
    coalesce(nullif(btrim(v_record ->> 'name'), ''), 'Billing plan'),
    v_previous, v_new
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke execute on function public.audit_billing_plan_change() from public, anon, authenticated;

drop trigger if exists billing_plans_audit_admin_change on public.billing_plans;
create trigger billing_plans_audit_admin_change
  after insert or update or delete on public.billing_plans
  for each row execute function public.audit_billing_plan_change();

-- ── billing_customers (Stripe customer per payer) ───────────────────────────
create table if not exists public.billing_customers (
  id uuid primary key default gen_random_uuid(),
  payer_kind text not null check (payer_kind in ('member', 'coach')),
  user_id uuid references auth.users(id) on delete cascade,
  coach_id uuid references public.coaches(id) on delete restrict,
  stripe_customer_id text not null unique,
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_customers_stripe_format_check check (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  constraint billing_customers_payer_identity_check check (
    (payer_kind = 'member' and user_id is not null and coach_id is null)
    or (payer_kind = 'coach' and coach_id is not null and user_id is null)
  ),
  constraint billing_customers_email_check check (
    email = lower(btrim(email))
    and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    and char_length(email) <= 254
  )
);
create unique index if not exists billing_customers_member_idx
  on public.billing_customers (user_id) where user_id is not null;
create unique index if not exists billing_customers_coach_idx
  on public.billing_customers (coach_id) where coach_id is not null;

alter table public.billing_customers enable row level security;
drop policy if exists "billing_customers_select_own_or_admin" on public.billing_customers;
create policy "billing_customers_select_own_or_admin" on public.billing_customers
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
revoke all on table public.billing_customers from public, anon, authenticated;
grant select on table public.billing_customers to authenticated;

drop trigger if exists billing_customers_touch_updated_at on public.billing_customers;
create trigger billing_customers_touch_updated_at
  before update on public.billing_customers
  for each row execute function public.touch_catalog_record_updated_at();

-- ── billing_mandates (BECS DDR registry; never full bank details) ───────────
create table if not exists public.billing_mandates (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.billing_customers(id) on delete cascade,
  stripe_payment_method_id text not null unique,
  stripe_mandate_id text unique,
  payment_method_kind text not null check (payment_method_kind in ('au_becs_debit', 'card')),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'inactive', 'revoked')),
  bsb_last3 text check (bsb_last3 ~ '^[0-9]{3}$'),
  account_last4 text check (account_last4 ~ '^[0-9]{4}$'),
  card_brand text check (card_brand is null or char_length(card_brand) between 2 and 40),
  card_last4 text check (card_last4 ~ '^[0-9]{4}$'),
  mandate_reference text check (mandate_reference is null or char_length(mandate_reference) between 3 and 120),
  mandate_url text check (mandate_url is null or mandate_url ~ '^https://[^[:space:]]+$'),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_mandates_stripe_pm_format_check check (stripe_payment_method_id ~ '^pm_[A-Za-z0-9]+$'),
  constraint billing_mandates_becs_details_check check (
    payment_method_kind <> 'au_becs_debit'
    or (bsb_last3 is not null and account_last4 is not null)
  ),
  constraint billing_mandates_card_details_check check (
    payment_method_kind <> 'card' or card_last4 is not null
  )
);
create index if not exists billing_mandates_customer_idx
  on public.billing_mandates (customer_id, status, created_at desc);

alter table public.billing_mandates enable row level security;
drop policy if exists "billing_mandates_select_own_or_admin" on public.billing_mandates;
create policy "billing_mandates_select_own_or_admin" on public.billing_mandates
  for select to authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1 from public.billing_customers as customers
      where customers.id = billing_mandates.customer_id
        and customers.user_id = (select auth.uid())
    )
  );
revoke all on table public.billing_mandates from public, anon, authenticated;
grant select on table public.billing_mandates to authenticated;

drop trigger if exists billing_mandates_touch_updated_at on public.billing_mandates;
create trigger billing_mandates_touch_updated_at
  before update on public.billing_mandates
  for each row execute function public.touch_catalog_record_updated_at();

-- ── billing_subscriptions (XERT state machine + Stripe mirror) ──────────────
create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('membership', 'coach_rent')),
  plan_id uuid not null references public.billing_plans(id) on delete restrict,
  customer_id uuid references public.billing_customers(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  coach_id uuid references public.coaches(id) on delete set null,
  mandate_id uuid references public.billing_mandates(id) on delete set null,
  status text not null default 'pending_mandate' check (status in (
    'pending_mandate', 'pending_settlement', 'active', 'past_due',
    'suspended', 'paused', 'cancelled'
  )),
  stripe_subscription_id text unique,
  stripe_checkout_session_id text unique,
  -- Immutable commercial snapshot, same principle as orders.credit_total.
  plan_slug text not null,
  price_cents integer not null check (price_cents > 0),
  currency text not null check (currency ~ '^[a-zA-Z]{3}$'),
  billing_interval text not null check (billing_interval in ('week', 'month')),
  billing_interval_count integer not null check (billing_interval_count between 1 and 12),
  included_sessions integer check (included_sessions between 1 and 100),
  entitlement_grace_days integer not null check (entitlement_grace_days between 0 and 60),
  cancellation_notice_days integer not null check (cancellation_notice_days between 0 and 30),
  max_pause_days_per_year integer not null check (max_pause_days_per_year between 0 and 365),
  cooling_off_ends_at timestamptz not null,
  started_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  cancellation_requested_at timestamptz,
  cancellation_effective_at timestamptz,
  cancellation_reason text check (cancellation_reason is null or cancellation_reason in (
    'member_request', 'cooling_off', 'medical', 'relocation',
    'non_payment', 'operator_closure', 'checkout_expired', 'duplicate'
  )),
  ended_at timestamptz,
  arrears_cents integer not null default 0 check (arrears_cents >= 0),
  paused_from timestamptz,
  paused_until timestamptz,
  paused_days_this_year integer not null default 0 check (paused_days_this_year >= 0),
  failed_payment_count integer not null default 0 check (failed_payment_count >= 0),
  last_payment_failed_at timestamptz,
  -- Stripe does not guarantee event order. This is the monotonic apply guard.
  last_stripe_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_subscriptions_stripe_sub_format_check check (
    stripe_subscription_id is null or stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'
  ),
  constraint billing_subscriptions_identity_check check (
    (kind = 'membership' and user_id is not null and coach_id is null and included_sessions is not null)
    or (kind = 'coach_rent' and coach_id is not null and user_id is null and included_sessions is null)
  ),
  constraint billing_subscriptions_period_order_check check (
    current_period_end is null or current_period_start is null
    or current_period_end > current_period_start
  ),
  constraint billing_subscriptions_pause_window_check check (
    paused_until is null or paused_from is null or paused_until > paused_from
  ),
  constraint billing_subscriptions_paused_state_check check (
    status <> 'paused' or (paused_from is not null and paused_until is not null)
  ),
  constraint billing_subscriptions_cancelled_state_check check (
    status <> 'cancelled' or ended_at is not null
  )
);

-- One live subscription per member and per coach.
create unique index if not exists billing_subscriptions_live_member_idx
  on public.billing_subscriptions (user_id)
  where user_id is not null and status <> 'cancelled';
create unique index if not exists billing_subscriptions_live_coach_idx
  on public.billing_subscriptions (coach_id)
  where coach_id is not null and status <> 'cancelled';
create index if not exists billing_subscriptions_status_idx
  on public.billing_subscriptions (status, current_period_end desc, id desc);
create index if not exists billing_subscriptions_dunning_idx
  on public.billing_subscriptions (last_payment_failed_at desc, id desc)
  where status in ('past_due', 'suspended');

alter table public.billing_subscriptions enable row level security;
drop policy if exists "billing_subscriptions_select_own_or_admin" on public.billing_subscriptions;
create policy "billing_subscriptions_select_own_or_admin" on public.billing_subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
revoke all on table public.billing_subscriptions from public, anon, authenticated;
grant select on table public.billing_subscriptions to authenticated;

drop trigger if exists billing_subscriptions_touch_updated_at on public.billing_subscriptions;
create trigger billing_subscriptions_touch_updated_at
  before update on public.billing_subscriptions
  for each row execute function public.touch_catalog_record_updated_at();

-- Commercial terms are frozen at signup, mirroring guard_stripe_order_terms.
create or replace function public.guard_billing_subscription_terms()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (
    new.plan_slug is distinct from old.plan_slug
    or new.price_cents is distinct from old.price_cents
    or new.currency is distinct from old.currency
    or new.billing_interval is distinct from old.billing_interval
    or new.billing_interval_count is distinct from old.billing_interval_count
    or new.included_sessions is distinct from old.included_sessions
    or new.entitlement_grace_days is distinct from old.entitlement_grace_days
    or new.cooling_off_ends_at is distinct from old.cooling_off_ends_at
    or new.kind is distinct from old.kind
    or new.user_id is distinct from old.user_id
    or new.coach_id is distinct from old.coach_id
  ) then
    raise exception 'BILLING_SUBSCRIPTION_TERMS_IMMUTABLE';
  end if;
  if tg_op = 'UPDATE' and old.status = 'cancelled' and new.status <> 'cancelled' then
    raise exception 'BILLING_SUBSCRIPTION_CANCELLATION_IS_TERMINAL';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_billing_subscription_terms() from public, anon, authenticated;

drop trigger if exists billing_subscriptions_guard_terms on public.billing_subscriptions;
create trigger billing_subscriptions_guard_terms
  before insert or update on public.billing_subscriptions
  for each row execute function public.guard_billing_subscription_terms();

-- ── billing_periods (invoice ledger + entitlement idempotency) ──────────────
create table if not exists public.billing_periods (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.billing_subscriptions(id) on delete cascade,
  stripe_invoice_id text not null unique,
  stripe_payment_intent_id text,
  stripe_charge_id text,
  status text not null default 'open' check (status in (
    'open', 'processing', 'paid', 'failed', 'uncollectible', 'refunded', 'voided'
  )),
  amount_cents integer not null check (amount_cents >= 0),
  amount_refunded_cents integer not null default 0 check (amount_refunded_cents >= 0),
  currency text not null check (currency ~ '^[a-zA-Z]{3}$'),
  period_start timestamptz not null,
  period_end timestamptz not null,
  entitlement_sessions integer check (entitlement_sessions between 1 and 100),
  credit_batch_id uuid unique references public.credit_batches(id) on delete set null,
  optimistic_access boolean not null default false,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz,
  failure_code text,
  paid_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_periods_invoice_format_check check (stripe_invoice_id ~ '^in_[A-Za-z0-9]+$'),
  constraint billing_periods_window_check check (period_end > period_start),
  constraint billing_periods_refund_bound_check check (amount_refunded_cents <= amount_cents),
  constraint billing_periods_failure_code_check check (
    failure_code is null or (
      failure_code = btrim(failure_code)
      and char_length(failure_code) between 1 and 120
      and failure_code ~ '^[A-Za-z0-9_.:-]+$'
    )
  )
);
create index if not exists billing_periods_subscription_idx
  on public.billing_periods (subscription_id, period_start desc, id desc);
create index if not exists billing_periods_payment_intent_idx
  on public.billing_periods (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
create index if not exists billing_periods_settlement_idx
  on public.billing_periods (status, next_attempt_at)
  where status in ('processing', 'failed');

alter table public.billing_periods enable row level security;
drop policy if exists "billing_periods_select_own_or_admin" on public.billing_periods;
create policy "billing_periods_select_own_or_admin" on public.billing_periods
  for select to authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1 from public.billing_subscriptions as subscriptions
      where subscriptions.id = billing_periods.subscription_id
        and subscriptions.user_id = (select auth.uid())
    )
  );
revoke all on table public.billing_periods from public, anon, authenticated;
grant select on table public.billing_periods to authenticated;

drop trigger if exists billing_periods_touch_updated_at on public.billing_periods;
create trigger billing_periods_touch_updated_at
  before update on public.billing_periods
  for each row execute function public.touch_catalog_record_updated_at();

-- ── billing_pauses (holiday / injury freeze) ────────────────────────────────
create table if not exists public.billing_pauses (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.billing_subscriptions(id) on delete cascade,
  reason text not null check (reason in ('holiday', 'injury', 'medical', 'other')),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'active', 'completed', 'cancelled')),
  starts_on date not null,
  ends_on date not null,
  requested_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  -- Health information is sensitive information under the Privacy Act. Record
  -- only that evidence was sighted, never a diagnosis or certificate content.
  evidence_sighted_at timestamptz,
  evidence_sighted_by uuid references auth.users(id) on delete set null,
  evidence_reference text check (
    evidence_reference is null or char_length(btrim(evidence_reference)) between 3 and 120
  ),
  credit_expiry_extended_days integer not null default 0
    check (credit_expiry_extended_days between 0 and 365),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_pauses_window_check check (ends_on > starts_on),
  constraint billing_pauses_medical_evidence_check check (
    reason not in ('medical', 'injury') or evidence_sighted_at is not null
  )
);
-- At most one open freeze per subscription; avoids overlapping windows without
-- needing btree_gist.
create unique index if not exists billing_pauses_one_open_idx
  on public.billing_pauses (subscription_id)
  where status in ('scheduled', 'active');
create index if not exists billing_pauses_subscription_idx
  on public.billing_pauses (subscription_id, starts_on desc);

alter table public.billing_pauses enable row level security;
drop policy if exists "billing_pauses_select_own_or_admin" on public.billing_pauses;
create policy "billing_pauses_select_own_or_admin" on public.billing_pauses
  for select to authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1 from public.billing_subscriptions as subscriptions
      where subscriptions.id = billing_pauses.subscription_id
        and subscriptions.user_id = (select auth.uid())
    )
  );
revoke all on table public.billing_pauses from public, anon, authenticated;
grant select on table public.billing_pauses to authenticated;

drop trigger if exists billing_pauses_touch_updated_at on public.billing_pauses;
create trigger billing_pauses_touch_updated_at
  before update on public.billing_pauses
  for each row execute function public.touch_catalog_record_updated_at();

-- ── billing_subscription_events (immutable audit) ───────────────────────────
create table if not exists public.billing_subscription_events (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.billing_subscriptions(id) on delete cascade,
  period_id uuid references public.billing_periods(id) on delete set null,
  event_kind text not null check (event_kind in (
    'created', 'mandate_accepted', 'settlement_pending', 'activated', 'renewed',
    'payment_failed', 'dunning_notice', 'access_suspended', 'reinstated',
    'paused', 'resumed', 'cancellation_scheduled', 'cancelled', 'refunded',
    'disputed', 'mandate_inactive', 'plan_changed'
  )),
  previous_status text,
  new_status text,
  actor_id uuid references auth.users(id) on delete set null,
  stripe_event_id text,
  detail jsonb,
  created_at timestamptz not null default now(),
  constraint billing_subscription_events_stripe_format_check check (
    stripe_event_id is null or stripe_event_id ~ '^(evt_[A-Za-z0-9_]+|admin:[0-9a-f-]{36}:[A-Za-z0-9_.:-]+)$'
  )
);
create index if not exists billing_subscription_events_subscription_idx
  on public.billing_subscription_events (subscription_id, created_at desc, id desc);
create index if not exists billing_subscription_events_created_idx
  on public.billing_subscription_events (created_at desc, id desc);

alter table public.billing_subscription_events enable row level security;
drop policy if exists "billing_subscription_events_admin_read" on public.billing_subscription_events;
create policy "billing_subscription_events_admin_read" on public.billing_subscription_events
  for select to authenticated using ((select public.is_admin()));
revoke all on table public.billing_subscription_events from public, anon, authenticated;
grant select on table public.billing_subscription_events to authenticated;

create or replace function public.guard_billing_subscription_event()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'BILLING_AUDIT_IMMUTABLE';
end;
$$;
revoke execute on function public.guard_billing_subscription_event() from public, anon, authenticated;

drop trigger if exists billing_subscription_events_immutable on public.billing_subscription_events;
create trigger billing_subscription_events_immutable
  before update or delete on public.billing_subscription_events
  for each row execute function public.guard_billing_subscription_event();

-- ── coach_billing_profiles (rent payer PII) ─────────────────────────────────
-- NOT columns on public.coaches: coaches_public_read exposes that table to
-- anon, so an ABN or billing email added there would be world-readable.
create table if not exists public.coach_billing_profiles (
  coach_id uuid primary key references public.coaches(id) on delete restrict,
  legal_name text not null check (char_length(btrim(legal_name)) between 2 and 160),
  billing_email text not null,
  billing_phone text check (billing_phone is null or char_length(btrim(billing_phone)) between 6 and 32),
  abn text check (abn is null or abn ~ '^[0-9]{11}$'),
  gst_registered boolean not null default false,
  agreement_signed_at timestamptz,
  agreement_reference text check (
    agreement_reference is null or char_length(btrim(agreement_reference)) between 3 and 160
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_billing_profiles_email_check check (
    billing_email = lower(btrim(billing_email))
    and billing_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    and char_length(billing_email) <= 254
  )
);

alter table public.coach_billing_profiles enable row level security;
drop policy if exists "coach_billing_profiles_admin_all" on public.coach_billing_profiles;
create policy "coach_billing_profiles_admin_all" on public.coach_billing_profiles
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on table public.coach_billing_profiles from public, anon, authenticated;
grant select, insert, update on table public.coach_billing_profiles to authenticated;

drop trigger if exists coach_billing_profiles_touch_updated_at on public.coach_billing_profiles;
create trigger coach_billing_profiles_touch_updated_at
  before update on public.coach_billing_profiles
  for each row execute function public.touch_catalog_record_updated_at();

-- ── credit_batches: membership provenance ───────────────────────────────────
alter table public.credit_batches
  add column if not exists source text not null default 'purchase',
  add column if not exists subscription_id uuid references public.billing_subscriptions(id) on delete set null,
  add column if not exists period_id uuid references public.billing_periods(id) on delete set null;

alter table public.credit_batches drop constraint if exists credit_batches_source_check;
alter table public.credit_batches add constraint credit_batches_source_check
  check (source in ('purchase', 'membership', 'admin_grant', 'goodwill')) not valid;
alter table public.credit_batches drop constraint if exists credit_batches_membership_link_check;
alter table public.credit_batches add constraint credit_batches_membership_link_check
  check (source <> 'membership' or (subscription_id is not null and period_id is not null)) not valid;

create unique index if not exists credit_batches_period_idx
  on public.credit_batches (period_id) where period_id is not null;
create index if not exists credit_batches_subscription_idx
  on public.credit_batches (subscription_id, expires_at) where subscription_id is not null;

-- ── admin_settings: recurring activation switches ───────────────────────────
-- The drift guard forbids changing these while payments are live, so they are
-- carried by the same preflighted activation RPC as payments_enabled.
alter table public.admin_settings
  add column if not exists memberships_enabled boolean not null default false,
  add column if not exists coach_rent_enabled boolean not null default false;

comment on column public.admin_settings.memberships_enabled is
  'Owner-controlled switch for creating recurring membership Checkout sessions. Requires payments_enabled.';
comment on column public.admin_settings.coach_rent_enabled is
  'Owner-controlled switch for issuing coach facility-rent mandate links. Requires payments_enabled.';

drop function if exists public.admin_activate_session_pack_payments(
  uuid, uuid, timestamptz, date, boolean, boolean, text, boolean
);

create or replace function public.admin_activate_session_pack_payments(
  p_actor_id uuid,
  p_settings_id uuid,
  p_expected_updated_at timestamptz,
  p_target_launch_date date,
  p_countdown_enabled boolean,
  p_bookings_enabled boolean,
  p_announcement_banner_text text,
  p_announcement_banner_enabled boolean,
  p_memberships_enabled boolean,
  p_coach_rent_enabled boolean
)
returns setof public.admin_settings
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_current public.admin_settings%rowtype;
  v_actor_is_admin boolean;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'SERVER_PREFLIGHT_REQUIRED'; end if;
  select exists (select 1 from public.profiles where id = p_actor_id and role = 'admin')
    into v_actor_is_admin;
  if not v_actor_is_admin then raise exception 'ADMIN_REQUIRED'; end if;
  if p_settings_id is null or p_expected_updated_at is null then
    raise exception 'PAYMENT_ACTIVATION_VERSION_REQUIRED';
  end if;
  if p_target_launch_date is null then raise exception 'PAYMENT_ACTIVATION_DATE_REQUIRED'; end if;
  if length(coalesce(p_announcement_banner_text, '')) > 1000 then
    raise exception 'PAYMENT_ACTIVATION_ANNOUNCEMENT_TOO_LONG';
  end if;
  if p_announcement_banner_enabled and nullif(trim(coalesce(p_announcement_banner_text, '')), '') is null then
    raise exception 'PAYMENT_ACTIVATION_ANNOUNCEMENT_REQUIRED';
  end if;

  select settings.* into v_current
  from public.admin_settings as settings
  where settings.id = p_settings_id
  for update;

  if not found then raise exception 'PAYMENT_ACTIVATION_SETTINGS_NOT_FOUND'; end if;
  if v_current.updated_at is distinct from p_expected_updated_at then
    raise exception 'PAYMENT_ACTIVATION_STALE';
  end if;
  if v_current.payments_enabled is true then raise exception 'PAYMENT_ACTIVATION_ALREADY_ENABLED'; end if;

  perform set_config('xert.payment_activation_preflight', 'passed', true);
  perform set_config('request.jwt.claim.sub', p_actor_id::text, true);

  return query
  update public.admin_settings
  set target_launch_date = p_target_launch_date,
      countdown_enabled = p_countdown_enabled,
      bookings_enabled = p_bookings_enabled,
      payments_enabled = true,
      memberships_enabled = coalesce(p_memberships_enabled, false),
      coach_rent_enabled = coalesce(p_coach_rent_enabled, false),
      announcement_banner_text = nullif(trim(coalesce(p_announcement_banner_text, '')), ''),
      announcement_banner_enabled = p_announcement_banner_enabled
  where id = p_settings_id
    and updated_at = p_expected_updated_at
    and payments_enabled is false
  returning *;

  if not found then raise exception 'PAYMENT_ACTIVATION_STALE'; end if;
end;
$$;

revoke all on function public.admin_activate_session_pack_payments(
  uuid, uuid, timestamptz, date, boolean, boolean, text, boolean, boolean, boolean
) from public, anon, authenticated;
grant execute on function public.admin_activate_session_pack_payments(
  uuid, uuid, timestamptz, date, boolean, boolean, text, boolean, boolean, boolean
) to service_role;

-- ── webhook ledger: subscription linkage ────────────────────────────────────
alter table public.stripe_webhook_events
  add column if not exists subscription_id uuid references public.billing_subscriptions(id) on delete set null;
create index if not exists stripe_webhook_events_subscription_idx
  on public.stripe_webhook_events (subscription_id, last_received_at desc)
  where subscription_id is not null;

-- 6-arg overload; the 5-arg version is retained so an in-flight deployment
-- cannot fail mid-rollout.
create or replace function public.finish_stripe_webhook_event(
  p_event_id text,
  p_status text,
  p_order_id uuid,
  p_subscription_id uuid,
  p_error_code text,
  p_finished_at timestamptz
)
returns void language plpgsql security definer set search_path = ''
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
       char_length(v_error_code) > 120 or v_error_code !~ '^[A-Za-z0-9_.:-]+$'
     )) then
    raise exception 'Invalid Stripe webhook completion payload';
  end if;

  select events.* into v_event
  from public.stripe_webhook_events as events
  where events.event_id = p_event_id
  for update;
  if v_event.event_id is null then raise exception 'Stripe webhook ledger event not found'; end if;
  if v_event.status in ('processed', 'ignored') and p_status = 'failed' then return; end if;

  update public.stripe_webhook_events as events
  set status = p_status,
      order_id = coalesce(events.order_id, p_order_id),
      subscription_id = coalesce(events.subscription_id, p_subscription_id),
      finished_at = p_finished_at,
      last_error_code = case when p_status = 'failed' then v_error_code else null end
  where events.event_id = p_event_id;
end;
$$;
revoke execute on function public.finish_stripe_webhook_event(text, text, uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.finish_stripe_webhook_event(text, text, uuid, uuid, text, timestamptz)
  to service_role;

-- ── settle_billing_invoice (the recurring analogue of fulfill_stripe_checkout)
create or replace function public.settle_billing_invoice(
  p_stripe_invoice_id text,
  p_stripe_subscription_id text,
  p_stripe_payment_intent_id text,
  p_stripe_charge_id text,
  p_amount_cents integer,
  p_currency text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_settled_at timestamptz,
  p_optimistic boolean
)
returns table (
  period_id uuid, subscription_id uuid, credit_batch_id uuid, entitlement_created boolean
)
language plpgsql security definer set search_path = ''
as $$
declare
  v_subscription public.billing_subscriptions%rowtype;
  v_period public.billing_periods%rowtype;
  v_batch_id uuid;
  v_created boolean := false;
  v_status text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'BILLING_SETTLEMENT_REQUIRES_SERVICE_ROLE';
  end if;
  if nullif(btrim(p_stripe_invoice_id), '') is null
     or nullif(btrim(p_stripe_subscription_id), '') is null
     or p_amount_cents is null or p_amount_cents < 0
     or lower(coalesce(p_currency, '')) <> 'aud'
     or p_period_start is null or p_period_end is null or p_period_end <= p_period_start
     or p_settled_at is null then
    raise exception 'INVALID_BILLING_SETTLEMENT_PAYLOAD';
  end if;

  -- Never synthesize a subscription from webhook metadata; the API layer binds
  -- the row from subscription.metadata.xert_subscription_id before settling.
  select subscriptions.* into v_subscription
  from public.billing_subscriptions as subscriptions
  where subscriptions.stripe_subscription_id = p_stripe_subscription_id
  for update;
  if v_subscription.id is null then raise exception 'BILLING_SUBSCRIPTION_NOT_FOUND'; end if;
  if v_subscription.status = 'cancelled' and p_optimistic then
    raise exception 'BILLING_SUBSCRIPTION_CANCELLED';
  end if;

  v_status := case when p_optimistic then 'processing' else 'paid' end;

  insert into public.billing_periods (
    subscription_id, stripe_invoice_id, stripe_payment_intent_id, stripe_charge_id,
    status, amount_cents, currency, period_start, period_end,
    entitlement_sessions, optimistic_access,
    paid_at
  ) values (
    v_subscription.id, btrim(p_stripe_invoice_id),
    nullif(btrim(p_stripe_payment_intent_id), ''), nullif(btrim(p_stripe_charge_id), ''),
    v_status, p_amount_cents, lower(p_currency), p_period_start, p_period_end,
    v_subscription.included_sessions, coalesce(p_optimistic, false),
    case when p_optimistic then null else p_settled_at end
  )
  on conflict (stripe_invoice_id) do update
  set status = case
        when public.billing_periods.status = 'paid' then 'paid'
        when public.billing_periods.status = 'refunded' then 'refunded'
        else excluded.status
      end,
      stripe_payment_intent_id = coalesce(public.billing_periods.stripe_payment_intent_id, excluded.stripe_payment_intent_id),
      stripe_charge_id = coalesce(public.billing_periods.stripe_charge_id, excluded.stripe_charge_id),
      paid_at = coalesce(public.billing_periods.paid_at, excluded.paid_at),
      failure_code = null
  returning * into v_period;

  -- Refund is terminal: a late success delivery may never re-grant a period.
  if v_period.status = 'refunded' then
    return query select v_period.id, v_subscription.id, v_period.credit_batch_id, false;
    return;
  end if;

  if v_subscription.kind = 'membership' and v_period.credit_batch_id is null then
    insert into public.credit_batches (
      user_id, product_id, order_id, total, remaining, expires_at,
      source, subscription_id, period_id
    ) values (
      v_subscription.user_id, null, null,
      v_subscription.included_sessions, v_subscription.included_sessions,
      p_period_end + make_interval(days => v_subscription.entitlement_grace_days),
      'membership', v_subscription.id, v_period.id
    )
    on conflict (period_id) do nothing
    returning id into v_batch_id;

    if v_batch_id is not null then
      v_created := true;
      update public.billing_periods
      set credit_batch_id = v_batch_id
      where id = v_period.id;
    else
      select credit_batches.id into v_batch_id
      from public.credit_batches as credit_batches
      where credit_batches.period_id = v_period.id;
    end if;
  else
    v_batch_id := v_period.credit_batch_id;
  end if;

  update public.billing_subscriptions
  set status = case
        when p_optimistic then 'pending_settlement'
        when status in ('past_due', 'suspended', 'pending_settlement', 'pending_mandate') then 'active'
        when status = 'paused' then 'active'
        else status
      end,
      started_at = coalesce(started_at, p_settled_at),
      current_period_start = greatest(coalesce(current_period_start, p_period_start), p_period_start),
      current_period_end = greatest(coalesce(current_period_end, p_period_end), p_period_end),
      failed_payment_count = case when p_optimistic then failed_payment_count else 0 end,
      paused_from = case when p_optimistic then paused_from else null end,
      paused_until = case when p_optimistic then paused_until else null end
  where id = v_subscription.id;

  insert into public.billing_subscription_events (
    subscription_id, period_id, event_kind, previous_status, new_status, detail
  ) values (
    v_subscription.id, v_period.id,
    case when p_optimistic then 'settlement_pending'
         when v_subscription.started_at is null then 'activated'
         else 'renewed' end,
    v_subscription.status,
    case when p_optimistic then 'pending_settlement' else 'active' end,
    jsonb_build_object('invoice', v_period.stripe_invoice_id, 'amount_cents', p_amount_cents)
  );

  return query select v_period.id, v_subscription.id, v_batch_id, v_created;
end;
$$;
revoke execute on function public.settle_billing_invoice(
  text, text, text, text, integer, text, timestamptz, timestamptz, timestamptz, boolean
) from public, anon, authenticated;
grant execute on function public.settle_billing_invoice(
  text, text, text, text, integer, text, timestamptz, timestamptz, timestamptz, boolean
) to service_role;

-- ── revoke_billing_entitlement (failed optimistic access, refund, dispute) ──
create or replace function public.revoke_billing_entitlement(
  p_period_id uuid,
  p_reason text,
  p_effective_at timestamptz
)
returns table (credits_revoked integer, credits_consumed integer, bookings_cancelled integer)
language plpgsql security definer set search_path = ''
as $$
declare
  v_period public.billing_periods%rowtype;
  v_batch public.credit_batches%rowtype;
  v_reclaimable integer;
  v_per_session_cents integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'BILLING_REVOCATION_REQUIRES_SERVICE_ROLE';
  end if;
  if p_period_id is null or p_effective_at is null
     or p_reason not in ('payment_failed', 'refunded', 'disputed', 'cooling_off') then
    raise exception 'INVALID_BILLING_REVOCATION_PAYLOAD';
  end if;

  select periods.* into v_period
  from public.billing_periods as periods
  where periods.id = p_period_id
  for update;
  if v_period.id is null then raise exception 'BILLING_PERIOD_NOT_FOUND'; end if;

  bookings_cancelled := 0;
  credits_revoked := 0;
  credits_consumed := 0;

  if v_period.credit_batch_id is not null then
    select batches.* into v_batch
    from public.credit_batches as batches
    where batches.id = v_period.credit_batch_id
    for update;

    perform 1 from public.session_bookings as bookings
    join public.class_sessions as sessions on sessions.id = bookings.class_session_id
    where bookings.credit_batch_id = v_batch.id
      and bookings.status in ('requested', 'confirmed')
      and sessions.start_time > p_effective_at
    for update;

    with cancelled as (
      update public.session_bookings as bookings
      set status = 'cancelled', cancelled_at = coalesce(bookings.cancelled_at, p_effective_at)
      from public.class_sessions as sessions
      where sessions.id = bookings.class_session_id
        and bookings.credit_batch_id = v_batch.id
        and bookings.status in ('requested', 'confirmed')
        and sessions.start_time > p_effective_at
      returning bookings.id
    )
    select count(*)::integer into bookings_cancelled from cancelled;

    v_reclaimable := least(coalesce(v_batch.total, 0), coalesce(v_batch.remaining, 0) + bookings_cancelled);
    credits_revoked := greatest(v_reclaimable, 0);
    credits_consumed := greatest(coalesce(v_batch.total, 0) - v_reclaimable, 0);

    update public.credit_batches set remaining = 0 where id = v_batch.id;
  end if;

  -- Sessions already taken on money that never cleared become a recorded debt.
  if p_reason in ('payment_failed', 'disputed') and credits_consumed > 0 and v_period.entitlement_sessions > 0 then
    v_per_session_cents := (v_period.amount_cents / v_period.entitlement_sessions)::integer;
    update public.billing_subscriptions
    set arrears_cents = arrears_cents + (v_per_session_cents * credits_consumed)
    where id = v_period.subscription_id;
  end if;

  update public.billing_periods
  set status = case p_reason
        when 'payment_failed' then 'failed'
        when 'disputed' then 'uncollectible'
        else 'refunded' end,
      refunded_at = case when p_reason in ('refunded', 'cooling_off') then p_effective_at else refunded_at end,
      optimistic_access = false
  where id = v_period.id;

  insert into public.billing_subscription_events (
    subscription_id, period_id, event_kind, detail
  ) values (
    v_period.subscription_id, v_period.id,
    case p_reason when 'disputed' then 'disputed' when 'payment_failed' then 'payment_failed' else 'refunded' end,
    jsonb_build_object(
      'credits_revoked', credits_revoked,
      'credits_consumed', credits_consumed,
      'bookings_cancelled', bookings_cancelled
    )
  );

  return next;
end;
$$;
revoke execute on function public.revoke_billing_entitlement(uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.revoke_billing_entitlement(uuid, text, timestamptz) to service_role;

-- ── apply_stripe_subscription_state (out-of-order safe mirror) ──────────────
create or replace function public.apply_stripe_subscription_state(
  p_stripe_subscription_id text,
  p_stripe_status text,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_paused_until timestamptz,
  p_event_created_at timestamptz,
  p_stripe_event_id text
)
returns table (subscription_id uuid, applied boolean, new_status text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_subscription public.billing_subscriptions%rowtype;
  v_next text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'BILLING_STATE_REQUIRES_SERVICE_ROLE';
  end if;
  if nullif(btrim(p_stripe_subscription_id), '') is null or p_event_created_at is null then
    raise exception 'INVALID_BILLING_STATE_PAYLOAD';
  end if;

  select subscriptions.* into v_subscription
  from public.billing_subscriptions as subscriptions
  where subscriptions.stripe_subscription_id = p_stripe_subscription_id
  for update;
  if v_subscription.id is null then raise exception 'BILLING_SUBSCRIPTION_NOT_FOUND'; end if;

  -- Stripe does not guarantee delivery order: never let an older snapshot win.
  if v_subscription.last_stripe_event_at is not null
     and p_event_created_at < v_subscription.last_stripe_event_at then
    return query select v_subscription.id, false, v_subscription.status;
    return;
  end if;

  v_next := case p_stripe_status
    when 'active' then case when p_paused_until is not null then 'paused' else 'active' end
    when 'trialing' then 'active'
    when 'past_due' then 'past_due'
    when 'unpaid' then 'suspended'
    when 'paused' then 'paused'
    when 'canceled' then 'cancelled'
    when 'incomplete' then 'pending_settlement'
    when 'incomplete_expired' then 'cancelled'
    else v_subscription.status
  end;

  if v_subscription.status = 'cancelled' then
    return query select v_subscription.id, false, v_subscription.status;
    return;
  end if;

  update public.billing_subscriptions
  set status = v_next,
      current_period_start = coalesce(p_current_period_start, current_period_start),
      current_period_end = coalesce(p_current_period_end, current_period_end),
      cancel_at_period_end = coalesce(p_cancel_at_period_end, cancel_at_period_end),
      cancellation_effective_at = case
        when coalesce(p_cancel_at_period_end, false) then coalesce(p_current_period_end, current_period_end)
        else cancellation_effective_at end,
      paused_from = case when v_next = 'paused' then coalesce(paused_from, p_event_created_at) else null end,
      paused_until = case when v_next = 'paused' then p_paused_until else null end,
      ended_at = case when v_next = 'cancelled' then coalesce(ended_at, p_event_created_at) else ended_at end,
      last_stripe_event_at = p_event_created_at
  where id = v_subscription.id;

  if v_next is distinct from v_subscription.status then
    insert into public.billing_subscription_events (
      subscription_id, event_kind, previous_status, new_status, stripe_event_id
    ) values (
      v_subscription.id,
      case v_next
        when 'paused' then 'paused'
        when 'cancelled' then 'cancelled'
        when 'suspended' then 'access_suspended'
        when 'active' then case when v_subscription.status = 'paused' then 'resumed' else 'reinstated' end
        else 'payment_failed'
      end,
      v_subscription.status, v_next, nullif(btrim(p_stripe_event_id), '')
    );
  end if;

  return query select v_subscription.id, true, v_next;
end;
$$;
revoke execute on function public.apply_stripe_subscription_state(
  text, text, timestamptz, timestamptz, boolean, timestamptz, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.apply_stripe_subscription_state(
  text, text, timestamptz, timestamptz, boolean, timestamptz, timestamptz, text
) to service_role;

-- ── member_request_membership_pause (self-serve holiday freeze) ─────────────
-- Freezes are whole billing periods starting at the next period boundary, so
-- no pro-rata is ever needed and the member never loses a paid-for session.
create or replace function public.member_request_membership_pause(
  p_periods integer,
  p_reason text
)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_subscription public.billing_subscriptions%rowtype;
  v_starts date;
  v_ends date;
  v_days integer;
  v_used integer;
  v_pause_id uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_periods is null or p_periods not between 1 and 6 then raise exception 'PAUSE_LENGTH_INVALID'; end if;
  if p_reason not in ('holiday', 'other') then raise exception 'PAUSE_REASON_REQUIRES_ADMIN'; end if;

  select subscriptions.* into v_subscription
  from public.billing_subscriptions as subscriptions
  where subscriptions.user_id = v_user
    and subscriptions.kind = 'membership'
    and subscriptions.status = 'active'
  for update;
  if not found then raise exception 'MEMBERSHIP_NOT_PAUSABLE'; end if;
  if v_subscription.current_period_end is null then raise exception 'MEMBERSHIP_NOT_PAUSABLE'; end if;
  if exists (
    select 1 from public.billing_pauses
    where subscription_id = v_subscription.id and status in ('scheduled', 'active')
  ) then raise exception 'PAUSE_ALREADY_SCHEDULED'; end if;

  v_starts := v_subscription.current_period_end::date;
  v_ends := (v_subscription.current_period_end
    + (make_interval(days => case when v_subscription.billing_interval = 'week' then 7 else 0 end,
                     months => case when v_subscription.billing_interval = 'month' then 1 else 0 end)
       * v_subscription.billing_interval_count * p_periods))::date;
  v_days := v_ends - v_starts;

  select coalesce(sum(ends_on - starts_on), 0)::integer into v_used
  from public.billing_pauses
  where subscription_id = v_subscription.id
    and status in ('scheduled', 'active', 'completed')
    and starts_on > (now() - interval '1 year')::date;

  if v_used + v_days > v_subscription.max_pause_days_per_year then
    raise exception 'PAUSE_QUOTA_EXCEEDED';
  end if;

  insert into public.billing_pauses (
    subscription_id, reason, status, starts_on, ends_on, requested_by
  ) values (
    v_subscription.id, p_reason, 'scheduled', v_starts, v_ends, v_user
  ) returning id into v_pause_id;

  insert into public.billing_subscription_events (
    subscription_id, event_kind, previous_status, new_status, actor_id, detail
  ) values (
    v_subscription.id, 'paused', v_subscription.status, v_subscription.status, v_user,
    jsonb_build_object('starts_on', v_starts, 'ends_on', v_ends, 'periods', p_periods)
  );

  return v_pause_id;
end;
$$;
revoke execute on function public.member_request_membership_pause(integer, text) from public, anon;
grant execute on function public.member_request_membership_pause(integer, text) to authenticated;

-- ── system_send_member_notice (dunning notices from the webhook) ────────────
-- admin_send_member_notice requires is_admin(), which is false for the webhook.
-- Idempotent per (source_kind, source_id) via member_announcements_source_key.
create or replace function public.system_send_member_notice(
  p_user_id uuid,
  p_source_kind text,
  p_source_id uuid,
  p_title text,
  p_body text,
  p_tone text,
  p_cta_label text,
  p_cta_url text
)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_announcement_id uuid := gen_random_uuid();
  v_existing uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_ONLY'; end if;
  if p_user_id is null or not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'MEMBER_NOT_FOUND';
  end if;
  if p_source_kind not in (
    'billing_dunning_1', 'billing_dunning_2', 'billing_dunning_final',
    'billing_suspended', 'billing_pre_debit', 'billing_mandate_inactive'
  ) then raise exception 'NOTICE_SOURCE_INVALID'; end if;
  if p_tone not in ('info', 'action', 'urgent') then raise exception 'NOTICE_TONE_INVALID'; end if;

  select id into v_existing from public.member_announcements
  where source_kind = p_source_kind and source_id = p_source_id;
  if found then return v_existing; end if;

  insert into public.member_announcements (
    id, title, body, tone, cta_label, cta_url, audience, source_kind, source_id,
    published_at, expires_at
  ) values (
    v_announcement_id, btrim(p_title), btrim(p_body), p_tone,
    nullif(btrim(coalesce(p_cta_label, '')), ''), nullif(btrim(coalesce(p_cta_url, '')), ''),
    'targeted', p_source_kind, p_source_id, now(), now() + interval '30 days'
  );
  insert into public.member_announcement_targets (announcement_id, user_id)
  values (v_announcement_id, p_user_id);

  return v_announcement_id;
end;
$$;
revoke execute on function public.system_send_member_notice(uuid, text, uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.system_send_member_notice(uuid, text, uuid, text, text, text, text, text)
  to service_role;

-- ── unified revenue view for the admin Orders screen ────────────────────────
create or replace view public.commerce_ledger_entries
with (security_invoker = on) as
  select orders.id, 'pack'::text as entry_kind, orders.user_id, null::uuid as coach_id,
         orders.status, orders.amount_cents, orders.currency,
         orders.created_at, orders.paid_at, orders.refunded_amount_cents,
         products.name as label
  from public.orders as orders
  left join public.products as products on products.id = orders.product_id
  union all
  select periods.id, subscriptions.kind, subscriptions.user_id, subscriptions.coach_id,
         periods.status, periods.amount_cents, periods.currency,
         periods.created_at, periods.paid_at, periods.amount_refunded_cents,
         subscriptions.plan_slug
  from public.billing_periods as periods
  join public.billing_subscriptions as subscriptions on subscriptions.id = periods.subscription_id;

-- ── capability registration ─────────────────────────────────────────────────
insert into public.xert_schema_capabilities (capability)
values ('recurring_billing_spine')
on conflict (capability) do update set installed_at = excluded.installed_at;
insert into public.xert_schema_capabilities (capability)
values ('billing_entitlement_revocation')
on conflict (capability) do update set installed_at = excluded.installed_at;
insert into public.xert_schema_capabilities (capability)
values ('billing_activation_switches')
on conflict (capability) do update set installed_at = excluded.installed_at;
```

Additional RPCs shipped in the same migration, specified but elided above for length (all `security definer`, all following the guards shown): `record_billing_payment_failure(p_stripe_invoice_id, p_failure_code, p_next_attempt_at, p_failed_at)` (service_role, increments `attempt_count`/`failed_payment_count`, sets `past_due`); `bind_billing_subscription(p_checkout_session_id, p_stripe_subscription_id, p_stripe_customer_id, p_mandate)` (service_role, one-shot bind of the pending row, raises `BILLING_SUBSCRIPTION_ALREADY_BOUND` on mismatch); `member_cancel_membership(p_reason)` and `admin_cancel_membership(p_subscription_id, p_reason, p_effective_at)` (`authenticated`, `is_admin()` for the admin form); `admin_approve_membership_pause(p_pause_id, p_starts_on, p_ends_on, p_evidence_reference)`; `membership_prorata_refund_cents(p_period_id, p_effective_on)` (`stable`, returns `round(amount_cents * unused_days / period_days) - consumed_sessions * per_session_cents`); `member_billing_overview()` and `admin_billing_overview(p_limit)` read views for the account and admin screens.

## Backend

**New and changed serverless functions.**

`api/checkout.js` — three surgical changes, no mode switch inside it:
1. Extract the eight-way readiness preflight (lines 532–598: `paymentFulfillmentIsReady`, `stripePendingOrderGuardIsReady`, `stripeOrderTermsSnapshotIsReady`, `stripeWebhookLedgerIsReady`, `paymentFulfillmentDeliveryIsHealthy`, `adminSettingsContractIsReady`, `paymentActivationDriftGuardIsReady`, `sessionPackPaymentsAreEnabled`) into a new `api/commercePreflight.js` exporting `assertCommerceReady(admin, { require: 'pack' | 'membership' | 'coach_rent' })`. `checkout.js` imports it; the capability helpers stay exported from `checkout.js` for `api/admin-commerce-health.js`, which already imports `paymentFulfillmentIsReady` from it.
2. Add `RECURRING_BILLING_CAPABILITY = 'recurring_billing_spine'` to the preflight set only for the recurring paths, so a missing membership migration can never block pack checkout.
3. Nothing else. `buildCheckoutSessionParameters` keeps `mode: 'payment'` and keeps *not* setting `payment_method_types`, which is exactly what makes Apple Pay and Google Pay appear on the hosted page under automatic payment methods. Do not add `payment_method_types` — pinning it would silently switch wallets off.

`api/subscribe.js` (new) — membership Checkout. Mirrors `checkout.js`'s defensive structure:
- `assertCommerceReady(admin, { require: 'membership' })`, plus `admin_settings.memberships_enabled`.
- `normalizeSubscribeRequest(body)` → `{ planSlug, returnTarget, suppliedAttemptID }`, same `PRODUCT_SLUG_PATTERN` and `normalizeCheckoutAttemptID`.
- Loads the plan from `billing_plans where slug = $1 and active and kind = 'membership'`; `assertBillingPlan(plan)` (positive price, `included_sessions` 1..100, `aud`, interval in week/month) as the deployment-safe backstop that `assertCheckoutProduct` is today.
- `assertStripePriceMatchesPlan(plan, stripePrice, expectedLivemode)`: requires `type === 'recurring'`, `recurring.interval === plan.billing_interval`, `recurring.interval_count === plan.billing_interval_count`, `unit_amount === plan.price_cents`, `metadata.xert_plan_id`, `metadata.xert_plan_slug`, `metadata.xert_included_sessions`. In live mode `stripe_price_id` is mandatory (the `billing_plans_live_requires_price_check` constraint already guarantees it), so there is no dynamic `price_data` path for subscriptions.
- Generates `subscriptionId = randomUUID()` **before** calling Stripe and puts it in `subscription_data.metadata.xert_subscription_id` — this is the bind key that makes out-of-order webhooks safe.
- Stripe params: `mode: 'subscription'`, `payment_method_types: ['au_becs_debit', 'card']` (explicit here, unlike packs, because BECS must be offered and must be listed first), `customer_creation` omitted (subscription mode always creates one), `customer_email`, `client_reference_id: user.id`, `success_url`/`cancel_url` from `resolveCheckoutReturnURLs` extended with a `membership` target (`/account?membership=success&checkout_session_id={CHECKOUT_SESSION_ID}` and `/membership-return` for iOS), `custom_text.submit.message` carrying the DDR summary and cooling-off statement, `subscription_data: { metadata, default_tax_rates: plan.stripe_tax_rate_id ? [plan.stripe_tax_rate_id] : undefined }`, `consent_collection: { terms_of_service: 'required' }`, `expires_at` +35 min.
- Idempotency key `xert-subscribe:${user.id}:${plan.id}:${attemptID}`.
- After creation, `verifiedCreatedSubscriptionURL(session, user, plan, …)` re-reads the returned session exactly as `verifiedCreatedCheckoutURL` does (https, `checkout.stripe.com`, livemode match, metadata match) and `sessions.expire()` on mismatch.
- Then inserts the pending `billing_subscriptions` row (`status='pending_mandate'`, `id = subscriptionId`, `stripe_checkout_session_id = session.id`, full commercial snapshot copied from the plan, `cooling_off_ends_at = now + plan.cooling_off_hours`). If the insert fails, expire the Stripe session and return the same `CHECKOUT_RECORDING_FAILED` 503 shape.

`api/stripe-webhook.js` — `processStripeEvent` gains a billing branch after the existing fulfilment/failure/dispute/refund branches and before `finishStripeWebhookEvent`. Event → state mapping:

| Stripe event | Handler | Effect |
|---|---|---|
| `checkout.session.completed` (`mode==='subscription'`) | `subscriptionCheckoutForEvent` → `bind_billing_subscription` | binds `stripe_subscription_id` + customer + mandate; status → `pending_settlement`; upserts `billing_customers` and `billing_mandates` from `setup_intent.payment_method` |
| `checkout.session.completed` (`mode==='setup'`, coach rent) | `coachRentMandateForEvent` | stores mandate, then creates the subscription server-side with `billing_cycle_anchor` |
| `checkout.session.expired` (`mode!=='payment'`) | | pending row → `cancelled`, `cancellation_reason='checkout_expired'` |
| `customer.subscription.created` / `.updated` / `.paused` / `.resumed` | `apply_stripe_subscription_state` | monotonic status/period/pause/cancel_at_period_end mirror |
| `customer.subscription.deleted` | `apply_stripe_subscription_state` | `cancelled`, `ended_at` |
| `invoice.finalized` | `settle_billing_invoice(..., optimistic=false)` is **not** called; a lightweight `upsert_billing_period` records the `open` row with the period window | period ledger exists before money moves |
| `invoice.paid` | `settle_billing_invoice(..., p_optimistic => false)` | mints the `credit_batches` row, `active`, `failed_payment_count = 0` |
| `invoice.payment_failed` | `record_billing_payment_failure` + `system_send_member_notice('billing_dunning_N')` + `notifyTargetedAnnouncement` | `past_due`, no new credits |
| `invoice.payment_action_required` | same as failed, notice CTA is the Stripe hosted invoice URL | card 3DS only |
| `invoice.marked_uncollectible` | `revoke_billing_entitlement(period,'payment_failed')`, subscription → `suspended` | dunning exhausted |
| `invoice.voided` | period → `voided` | pause with `behavior:'void'` |
| `invoice.upcoming` | `system_send_member_notice('billing_pre_debit')` | pre-debit notification, 3 days ahead (set on the endpoint) |
| `payment_intent.processing` | `settle_billing_invoice(..., p_optimistic => true)` when `plan.optimistic_access_limit_cents >= amount` and `failed_payment_count = 0` | BECS submitted; first-period access granted early |
| `payment_intent.payment_failed` | `record_billing_payment_failure` with the BECS failure code, then `revoke_billing_entitlement(period,'payment_failed')` if `optimistic_access` | BECS failure arriving days later |
| `payment_intent.succeeded` | ignored (`invoice.paid` is authoritative) | |
| `setup_intent.succeeded` | upsert `billing_mandates` → `active`, store `mandate` id/url/`bsb_last3`/`account_last4` | DDR captured |
| `mandate.updated` | mandate → `inactive`/`revoked`; notice `billing_mandate_inactive` | BECS mandates die when the account closes |
| `payment_method.detached` | mandate → `revoked` | |
| `charge.refunded` | existing `stripeRefundForEvent` first; if no `orders` row matches the payment intent, resolve `billing_periods` and call `revoke_billing_entitlement(period,'refunded')` | |
| `charge.dispute.created` / `.closed` | `findStripeOrderForReview` extended by `findStripeSubscriptionForReview`; for a BECS dispute also `revoke_billing_entitlement(period,'disputed')` and suspend | |

Three hard rules encoded in the handler, each mirroring a rule the repo already enforces for packs:
- **Never synthesize a subscription.** `settle_billing_invoice` raises `BILLING_SUBSCRIPTION_NOT_FOUND` if the row is missing. The API layer's *only* recovery is one `stripe.subscriptions.retrieve()` to read `metadata.xert_subscription_id` and bind the pre-existing pending row. If that metadata is absent, the ledger records `failed` with `BILLING_SUBSCRIPTION_UNBOUND`, Stripe retries for ~3 days, and the incident surfaces in Operations Health with a "Reconcile subscription" action (`api/admin-reconcile-subscription.js`, modelled exactly on `api/admin-reconcile-order.js`).
- **Refund/dispute is terminal.** `settle_billing_invoice` returns early when the period is already `refunded`, exactly as `fulfill_stripe_checkout` does for a refunded order.
- **Out-of-order events lose.** `apply_stripe_subscription_state` compares `p_event_created_at` to `last_stripe_event_at` and no-ops on a stale snapshot.

`finishStripeWebhookEvent` in `api/stripe-webhook.js` gains a `subscriptionId` argument and calls the 6-arg RPC. `assertStripeEventMode`, `beginStripeWebhookEvent`, the signature verification and the generic 500-so-Stripe-retries behaviour are unchanged.

`api/admin-commerce-health.js` — `REQUIRED_WEBHOOK_EVENTS` is extended with every event above so `inspectStripeWebhookEndpoints` fails the launch check until the endpoint is configured. `inspectCommerceHealth` gains `recurring_billing_ready` (capability), `membership_plan_health` (an `inspectBillingPlans` mirroring `inspectCommerceProducts`: every active plan bound to a live recurring Price with matching interval, amount, currency and metadata), `mandate_health` (count of `billing_mandates` in `inactive`/`revoked` attached to non-cancelled subscriptions) and `dunning_health` (count of `past_due` subscriptions and the oldest `last_payment_failed_at`). `STRIPE_OPERATOR_REVIEW_CODES` gains `BILLING_SUBSCRIPTION_UNBOUND`, `BECS_DISPUTE_REQUIRES_REVIEW` and `BILLING_MANDATE_INACTIVE`, each with a `stripeIncidentResolution` string. `normalizePaymentActivationRequest` and `activateSessionPackPayments` pass the two new booleans to the 10-arg activation RPC.

`api/admin-coach-rent.js` (new) — admin-only, same auth shape as `api/admin-refund-order.js`. `POST {action:'send_mandate_link', coach_id, plan_slug, start_on, confirmation:'SEND RENT LINK'}` creates or reuses the `billing_customers` row for the coach, creates a Checkout Session in `mode:'setup'` with `payment_method_types:['au_becs_debit']`, and returns the URL for the owner to email. The Checkout URL is itself the capability — coaches need no XERT login. `POST {action:'cancel_rent', subscription_id, confirmation:'CANCEL RENT'}` cancels at period end.

`api/admin-membership.js` (new) — admin-only membership operations that must touch Stripe: `pause` (`stripe.subscriptions.update(id, { pause_collection: { behavior: 'void', resumes_at } })`), `resume` (`pause_collection: ''`), `cancel` (`cancel_at_period_end` or immediate + pro-rata refund via `stripe.refunds.create` reusing `api/admin-refund-order.js`'s verify-then-create-then-verify pattern against `billing_periods`), and `retry_payment` (`stripe.invoices.pay`). Every action writes a `billing_subscription_events` row with `actor_id`.

`api/delete-account.js` — **must change**. Today it anonymises `orders.email` and deletes the auth user. A member with a live subscription would leave an orphaned Stripe subscription still debiting their bank account after their XERT account is gone. Add, before `admin.auth.admin.deleteUser`: cancel any non-cancelled `billing_subscriptions` for the user via Stripe (`cancel_at_period_end: false`), detach the BECS payment method, mark the mandate `revoked`, null `billing_customers.email`, and refuse deletion with a 409 if `arrears_cents > 0`.

**Dunning schedule.** Stripe Smart Retries off; fixed schedule configured in the Dashboard: retry at +3, +7 and +12 days, then `mark_uncollectible`. Rationale: BECS returns take up to 3 business days, so card-tuned retry intervals fire before the previous attempt has resolved. Each `invoice.payment_failed` maps to `billing_dunning_1|2|final` notices, deduped by `member_announcements_source_key` so a webhook retry cannot spam the member; push goes out through the existing `notifyTargetedAnnouncement` in `api/admin-publish-announcement.js`.

**Access during dunning — the exact rule.** A member keeps every credit already minted (they paid for that period) and receives no new credits until an invoice clears. Because entitlement *is* a `credit_batches` row with `expires_at = period_end + grace`, this needs no enforcement code in `book_session` at all: the credits simply run out. Suspension additionally stops the subscription and, on a *failed optimistic* first period only, calls `revoke_billing_entitlement`, which cancels future bookings made against that batch and records the value of already-consumed sessions in `arrears_cents`. Nothing that was genuinely paid for is ever clawed back.

## Web UI

**Extend (real files):**
- `src/pages/Booking.jsx` — add a `<MembershipPlans />` section directly above the existing `<section id="packs">` block (line ~247). Reuse the same paused-state banner pattern (`paymentAvailabilityLoaded && !paymentsEnabled`) with a second `membershipsEnabled` flag. Add `getMembershipPlans()` and `getMembershipAvailability()` to the `Promise.allSettled` array in `refresh` (line ~69) so a membership load failure degrades exactly like the pack load failure does today.
- `src/pages/Account.jsx` — add `<MembershipCard />` between the credits stat block (line ~581) and the purchase history section (line ~815). Reuse the existing `purchaseStatus` banner machinery for a `membership=success` query param: `?membership=success&checkout_session_id=…` polls `billing_subscriptions.status` through the same retry-delay ladder as `webCheckoutSettlement`, and must show a **BECS-specific** "your first debit is submitted and clears in about 3 business days — you can book now" state, not the card "payment confirmed" copy.
- `src/lib/bookingData.js` — add `getMembershipPlans()`, `getMembershipAvailability()`, `startMembershipCheckout(planSlug)` (POSTs `/api/subscribe`, reusing `getOrCreateCheckoutAttemptID` and `savePendingWebCheckout`), `getMyMembership()` (RPC `member_billing_overview`), `requestMembershipPause(periods, reason)`, `cancelMyMembership(reason)`. Extend `BOOKING_ERRORS` with `MEMBERSHIP_NOT_PAUSABLE`, `PAUSE_QUOTA_EXCEEDED`, `PAUSE_ALREADY_SCHEDULED`, `MEMBERSHIP_ARREARS` in the same friendly-message style.
- `src/lib/launchSettings.js` — add `memberships_enabled` and `coach_rent_enabled` to `normalizeLaunchSettings` and to the `fields` array in `launchSettingsChanged`; add `membershipPaymentsEnabled(settings)` beside `sessionPackPaymentsEnabled`.
- `src/components/admin/SoftLaunchSettings.jsx` — two more `<Toggle>` rows beside the existing "Session pack payments" toggle (line ~124), with copy stating they require the same paused → preflight → activate ritual.
- `src/components/admin/OperationsHealth.jsx` — two new health cards fed by the extended `/api/admin-commerce-health` payload: "Membership billing" (plan↔Price binding, mandate health) and "Dunning queue" (past-due count, oldest failure, one-click open of the member). Add `'membership-billing': 'memberships'` and `'coach-rent': 'coach-rent'` to the section-routing map at line ~45.
- `src/components/admin/OrdersManager.jsx` — switch `getAllOrders()` to the unified `commerce_ledger_entries` view and add an `entry_kind` filter (pack / membership / coach rent) next to the existing status and currency filters. `purchasedTerms()` needs a membership branch ("6 sessions · fortnightly").
- `src/lib/adminNavigation.js` — add `'memberships'` and `'coach-rent'` to `ADMIN_SECTION_KEYS`.
- `src/pages/AdminCommandCentre.jsx` — two `lazy()` imports and two `case` arms in the `switch` at line ~113.
- `src/lib/adminData.js` — `getMemberships()`, `getMembershipDetail(id)`, `pauseMembership`, `resumeMembership`, `cancelMembership`, `retryMembershipPayment`, `getCoachRentAgreements()`, `sendCoachRentMandateLink()`, each following the existing `fetch('/api/…', { Authorization: Bearer })` + `apiErrorMessage` shape used by `refundOrder`/`reconcileOrder`.
- `src/lib/schemaCapabilities.js` — three new entries in `REQUIRED_SCHEMA_CAPABILITIES`.
- `src/lib/orderAnalytics.js` — add `summarizeRecurringRevenue(entries)` returning committed fortnightly revenue, active member count and churn, for `AdminOverview.jsx`.
- `src/pages/Terms.jsx` — replace the "Payments And Session Packs" section with membership-specific terms (direct debit authority, billing cadence, cooling-off, notice period, freeze policy, ACL statement) and add a "Membership Direct Debit" section.
- `src/pages/Privacy.jsx` — the "Services And Disclosure" section must state that Stripe, Supabase and Vercel store and process information **outside Australia** (APP 8 cross-border disclosure). It currently does not, and adding bank-account mandates makes that omission materially worse.

**Add (new files):**
- `src/components/public/MembershipPlans.jsx` — plan cards matching the existing `SessionPacks.jsx` visual language, each showing sessions-per-fortnight, the fortnightly price, "no lock-in, cancel with 14 days' notice", and a BECS badge. The CTA calls `startMembershipCheckout`.
- `src/components/public/MembershipCard.jsx` — account-side state machine UI: `pending_settlement` ("first debit clears in ~3 business days"), `active` (next debit date, sessions left this period, Pause / Cancel), `past_due` (amount, retry date, "your remaining credits still work", Update payment method), `suspended`, `paused` (resumes-on date, Resume early), `cancelled` (access ends on).
- `src/components/public/MembershipPauseDialog.jsx` — periods selector (1–6), reason, quota remaining, and an explicit "your freeze starts on <next billing date>, you keep the sessions you've already paid for" statement.
- `src/components/public/MembershipCancelDialog.jsx` — branches on `cooling_off_ends_at`: inside the window it offers immediate cancellation with full refund; outside it shows the notice period, the exact final debit date and the final access date, plus an ACL note that a refund can still be requested for a service failure.
- `src/components/admin/MembershipsManager.jsx` — table (member, plan, status, next debit, failures, arrears) with the dunning queue pinned on top; row detail shows the `billing_subscription_events` timeline and `billing_periods` invoices.
- `src/components/admin/CoachRentManager.jsx` — coach billing profiles, rent plan, mandate status, "Send mandate link" (copy-to-clipboard, mirroring the `copyIdentifier` helper in `OrdersManager.jsx`), and paid/failed rent history.
- `src/components/admin/BillingPlansManager.jsx` — plan CRUD with the same optimistic-locking `p_expected_updated_at` pattern and Stripe-Price-refresh guard as `ProductsManager.jsx`.
- `src/pages/MembershipReturn.jsx` — the subscription analogue of `CheckoutReturn.jsx` for the iOS deep-link return.
- `src/lib/memberships.js` — pure formatters/state helpers (`membershipStatusLabel`, `nextDebitLabel`, `formatBillingInterval`, `pauseQuotaRemaining`, `coolingOffRemainingHours`), unit-tested in `test/memberships.test.js`.
- `src/lib/membershipAdmin.js` — admin input normalisation, mirroring `src/lib/products.js`.

Route registration for `/membership-return` goes in `src/App.jsx` alongside `/checkout-return`.

## iOS UI

**Extend (real files):**
- `ios/XertFitnessApp/XertFitnessApp/Views/BookingView.swift` — add a `membershipSection` immediately before `packsSection` (line ~193) with a `ScrollTarget.memberships` case added to the enum at line 21. Reuse the exact paused-state pattern at lines 197–201 (`store.membershipPaymentsEnabled`) and the `checkoutProductID` guard pattern for the in-flight button state.
- `ios/XertFitnessApp/XertFitnessApp/Views/AccountView.swift` — add a `membershipSection` between `membershipSection`'s current placeholder at line 192 and `accountDetailsSection`; extend the `unavailableDataSources` set at line 173 with a `.membership` case. Add rows for status, next debit, sessions remaining this period, Pause, and Cancel.
- `ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift` — add `membershipPlans()` (REST `/rest/v1/billing_plans?kind=eq.membership&active=eq.true`), `membership(session:)` (RPC `member_billing_overview`), `subscribe(session:planSlug:attemptID:)` (POST `/api/subscribe` with `return_target: "ios"`, returning the existing `CheckoutResponse` shape), `requestMembershipPause(session:periods:reason:)` and `cancelMembership(session:reason:)` (RPCs). Follow the existing `vercelRequest` / `rpc` / `restRequest` helpers exactly.
- `ios/XertFitnessApp/XertFitnessApp/Store/XertStore.swift` — add `@Published private(set) var membership: MembershipSummary?` and `membershipPaymentsEnabled`; add `membershipCheckoutURL(for:attemptID:)` mirroring `checkoutURL(for:attemptID:)` at line 639; extend `reconcilePendingCheckout` (line 735) so a subscription return polls `billing_subscriptions.status` rather than `orders`, and — importantly — treats `pending_settlement` as **success**, not as an unresolved checkout. The current `CheckoutReconciliation` retry ladder assumes a terminal paid/failed within seconds; a BECS subscription legitimately sits in `pending_settlement` for days, so a new `MembershipReconciliation` enum with its own terminal-state set is required rather than reusing the pack one.
- `ios/XertFitnessApp/XertFitnessApp/Models.swift` — add `MembershipPlan`, `MembershipSummary` (`status`, `plan_name`, `included_sessions`, `current_period_end`, `next_debit_at`, `sessions_remaining`, `cooling_off_ends_at`, `paused_until`, `failed_payment_count`, `arrears_cents`) and `MembershipPeriod`, matching the existing `Codable` + snake_case-CodingKeys style of `OrderItem`.
- `ios/XertFitnessApp/XertFitnessApp/CheckoutDeepLink.swift` — add a `membership` kind so `xertfitness://checkout-return?kind=membership&status=success` routes to the account membership card.
- `ios/XertFitnessApp/XertFitnessApp/Services/CheckoutBrowser.swift` — no code change, but **verify on a physical device that Apple Pay renders inside `ASWebAuthenticationSession`**. If it does not, add an `openInSafariViewController(url:)` fallback used only when the session's payment methods include `card`.
- `ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift` and `Store/AdminStore.swift` — add read-only membership and dunning lists so the owner can triage failed debits from the floor; write actions stay web-only for the first release.

**Add (new files):**
- `ios/XertFitnessApp/XertFitnessApp/Views/MembershipPlansSection.swift` — the plan cards used by `BookingView`.
- `ios/XertFitnessApp/XertFitnessApp/Views/MembershipDetailView.swift` — status detail, invoice history, Pause and Cancel sheets.
- `ios/XertFitnessApp/XertFitnessApp/MembershipState.swift` — pure status/label/next-debit logic, unit-tested in `ios/XertFitnessApp/XertFitnessAppTests`.

**App Store note:** gym memberships and facility rent are real-world services consumed outside the app, so Stripe (not In-App Purchase) is the correct and permitted rail. Keep the membership CTA phrased as a service subscription, and keep the payment sheet out-of-app in `ASWebAuthenticationSession` exactly as the pack flow already does.

## Security, privacy and compliance

**Authorization and RLS.** Every new table has RLS enabled with policies written out above. Members can `select` only their own `billing_subscriptions`, `billing_periods`, `billing_pauses`, `billing_mandates` and `billing_customers`; no client `insert`/`update`/`delete` policy exists on any of them — all writes go through `security definer` RPCs. Service-role-only functions (`settle_billing_invoice`, `revoke_billing_entitlement`, `apply_stripe_subscription_state`, `system_send_member_notice`, `finish_stripe_webhook_event`) all begin with `if auth.role() is distinct from 'service_role' then raise exception`, matching `fulfill_stripe_checkout` and `reconcile_stripe_order_refund`. Member RPCs (`member_request_membership_pause`, `member_cancel_membership`) derive identity from `auth.uid()` and never take a `user_id` parameter, so one member can never act on another's membership.

**Bank data.** Full BSB and account numbers never reach XERT: they are entered on Stripe's hosted Checkout page and stay with Stripe. `billing_mandates` stores only `bsb_last3`, `account_last4`, the Stripe `pm_`/mandate ids and the mandate URL, with regex constraints that make it impossible to stuff a full account number into those columns. This is the single most important control in the feature and it is enforced by the schema, not by discipline.

**A trap this design deliberately avoids.** Coach billing details are in a separate `coach_billing_profiles` table, not as columns on `public.coaches`. The existing `coaches_public_read` policy is `for select to anon, authenticated using (published)` — adding `billing_email`, `abn` or bank references to `coaches` would publish every coach's billing identity to the anonymous internet through the existing Coaches page query. Any future change must keep rent data off that table.

**Health information (Privacy Act, APP 3 and APP 11).** A medical or injury freeze is health information, which is *sensitive information* under the Privacy Act 1988 and attracts a higher standard. `billing_pauses` therefore records only `evidence_sighted_at`, `evidence_sighted_by` and a short `evidence_reference` (3–120 chars, e.g. "certificate sighted 01/08/26"). Do **not** add a free-text medical notes column and do **not** upload certificates to Supabase Storage — the existing `storage_setup.sql` buckets have no retention or deletion policy that would satisfy APP 11.2 for health records. The admin UI must carry explicit copy telling staff not to type diagnoses.

**Cross-border disclosure (APP 8).** Bank mandates, names and emails are disclosed to Stripe, which stores and processes them overseas. `src/pages/Privacy.jsx` currently names Stripe, Supabase, Vercel and Apple but never states that information is held outside Australia. That must be fixed **before** the first BECS mandate is collected; APP 8 makes XERT accountable for those overseas recipients' handling.

**DDR Service Agreement.** BECS rules require the payer to be given a Direct Debit Request and a DDR Service Agreement at the time the mandate is signed. Stripe's hosted BECS mandate screen presents this, and Stripe emails the mandate confirmation. XERT must (a) not suppress that email, (b) surface the stored `mandate_url` in the member's Account so they can retrieve it later, and (c) send a pre-debit notification via the `invoice.upcoming` → `billing_pre_debit` notice path. Changing the debit amount or date requires prior written notice to the payer — so a price change on an existing member must be scheduled, notified, and never applied silently by editing `billing_plans` (which is why `guard_billing_subscription_terms` freezes the per-subscription price snapshot).

**Disputes are asymmetric and this is the biggest operational risk.** A BECS debit can be disputed as an unauthorised-debit indemnity claim for **months** after the debit, and unlike a card chargeback there is effectively no evidence-submission contest — the money goes back and XERT wears a dispute fee. There is no engineering fix; the mitigations are all preventative and are built in: a recognisable statement descriptor, the mandate confirmation email, the pre-debit notice, and a one-tap cancel in the Account so nobody has to phone their bank to make debits stop. `charge.dispute.created` on a `billing_periods` charge routes to the existing operator-review path with a new `BECS_DISPUTE_REQUIRES_REVIEW` code and auto-suspends the membership.

**Audit.** `billing_subscription_events` is append-only (`guard_billing_subscription_event` raises `BILLING_AUDIT_IMMUTABLE` on update/delete) and records actor, previous status, new status and the originating Stripe event id — the same shape as `admin_content_changes`. `billing_plans` price changes flow into the existing immutable `admin_content_changes` ledger via `audit_billing_plan_change`.

**Account deletion.** `api/delete-account.js` must cancel the Stripe subscription and revoke the mandate before deleting the auth user, and must refuse (409) while `arrears_cents > 0`. Deleting the account today would leave a live direct debit running against a person who no longer exists in XERT — a privacy and consumer-law problem, not just a bug.

**Payment activation.** Memberships and coach rent sit behind `admin_settings.memberships_enabled` / `coach_rent_enabled`, which are covered by the existing drift guard, so they can only be turned on through the audited server preflight in the same statement that enables `payments_enabled`. This deliberately preserves the immutable activation receipt that `paymentActivationAllowsCheckout` verifies — writing the new flags in a separate statement would bump `admin_settings.updated_at`, break the receipt match in `src/lib/paymentActivation.js`, and take pack checkout offline.

## Rollout

**Phase 0 — schema and dead code (1 sprint).** Apply `20260726000000_recurring_billing_spine.sql`; register the three capabilities; ship `api/subscribe.js`, the webhook branches, and the health checks with `memberships_enabled = false` and `coach_rent_enabled = false`. Every new path is unreachable. Existing pack checkout is untouched and must keep passing `npm run stripe:test:verify`. No backfill: there are no existing subscriptions, and existing pack credit batches take `source = 'purchase'` from the column default, so `credit_batches` needs no data migration.

**Phase 1 — test mode, end to end (1 week).** Create test-mode recurring Prices via an extended `scripts/link-stripe-catalog.mjs` (`--kind=membership`). Exercise Stripe's BECS test accounts: the succeeding account, the account that fails after ~3 days, the account that produces a dispute, and the mandate-goes-inactive case. The must-pass assertions: `invoice.paid` twice for the same invoice mints exactly one credit batch (the `credit_batches.period_id` unique index); `customer.subscription.updated` delivered out of order does not regress state; a failed optimistic first period cancels only *future* bookings and records arrears; `charge.refunded` on a subscription charge does not touch pack credits (it can't — `reconcile_stripe_order_refund` joins `credit_batches` on `order_id`, which is null for membership batches).

**Phase 2 — coach rent first, live, 2–3 coaches (2 weeks).** This is the right first live cohort: tiny volume, cooperative payers, weekly amounts, no member-facing blast radius, and it exercises the entire BECS path — mandate collection, 3-day settlement, dunning, a deliberate test failure — before a single member's bank account is touched. Enabling it requires the full ritual: pause payments → run `npm run stripe:launch:check` → activate with `coach_rent_enabled = true` → `npm run stripe:launch:verify`. Budget a short maintenance window; that pause is a feature of the existing drift guard, not a defect.

**Phase 3 — membership pilot, invite-only (3 weeks).** Enable `memberships_enabled`, keep `billing_plans.active = false` for the public list, and invite 10–20 existing pack buyers via `admin_send_member_notice` with a direct plan link. Watch: first-debit success rate, days-to-settlement, dunning volume, and how many pilot members ask to freeze. Hold here until at least two full billing cycles have completed cleanly — one cycle proves signup, two prove renewal, and renewal is where subscriptions break.

**Phase 4 — public launch.** Flip `billing_plans.active = true`; the plans appear on `/booking` and in the iOS `BookingView`. Ship the revised `Terms.jsx` and `Privacy.jsx` **in the same deploy** — not after.

**Phase 5 — pack coexistence tuning.** Keep all three packs. The single-class pass is the try-before-you-commit funnel and the bridge for members resuming early from a freeze; the 10-pack is the option for people who won't direct-debit. Expect pack revenue to fall and total revenue to rise; if pack revenue does not fall, the membership price is wrong.

**Feature flags.** `admin_settings.memberships_enabled` and `coach_rent_enabled` (server-side, audited), plus `billing_plans.active` per plan as the fine-grained lever. Emergency stop: the owner can pause `payments_enabled` from `SoftLaunchSettings.jsx` at any time, which stops new signups instantly; existing subscriptions keep billing in Stripe, which is correct — a paused switch must never silently stop honouring debits members have authorised.

**Rollback.** Phases 0–2 roll back by flipping the switches; the tables are additive and inert. From Phase 3 onward there is no clean rollback, because live BECS mandates exist — the recovery path is to cancel subscriptions in Stripe and refund the current period, which is why Phase 3 is invite-only and gated on two clean cycles.

## Open questions for the owner

Each has my recommended default; the owner only needs to say "no" to change one.

1. **Membership price and shape.** Default: three plans, fortnightly, 4 / 6 / 8 sessions per fortnight, priced at roughly a 15–20% discount to the 10-pack rate ($10.50/session), i.e. about $9/session. **Separately: the existing pack pricing looks low for coached semi-private training in a capacity-8 room** — $15 drop-in and $10.50/session in the 10-pack. Memberships lock a discount in permanently, so if the pricing is going to move, move it before launch, not after.

2. **Billing cadence.** Default: **fortnightly**, aligned to Australian pay cycles, which measurably reduces failure rates. Monthly costs about $12/member/year less in Stripe fees; that is not worth a higher dishonour rate. `billing_interval` is stored per plan so monthly can be added without a migration.

3. **Minimum term / lock-in contracts.** Default: **none.** Open-ended, cancellable with 14 days' notice, no exit fee. I recommend against a discounted 12-month contract: it drags in the state fitness-industry maximum-term and cooling-off rules, and any early-termination fee is exposed to the unfair-contract-terms regime, which since November 2023 carries civil penalties rather than mere unenforceability. The upside of lock-in for a gym this size does not justify that. If the owner insists, `minimum_term_periods` exists — but the fee must be a genuine pre-estimate of loss and must be disclosed pre-contract.

4. **Cooling-off period: exact length and business-day handling.** Default: **48 hours**, stored as `cooling_off_hours` and enforced server-side. XERT trades in Kingaroy, so the Queensland fitness-industry code applies, and I have deliberately *not* hard-coded a number I cannot verify from this repo. **The owner must confirm the current Queensland requirement (length, whether it is business days, and the maximum contract term) with the Office of Fair Trading or a lawyer before Phase 3.** Two of the three numbers in this design (`cooling_off_hours`, `minimum_term_periods`) exist precisely so the answer is a config change, not a migration. Treat this as the one genuinely legally risky item in the whole feature.

5. **Cooling-off refund: full, or less sessions attended?** Default: **full refund, no deduction**, even if they trained once. One class is cheap; an argument about a $9 deduction during someone's first week is not.

6. **Freeze quota.** Default: **12 weeks (84 days) per rolling 12 months** for holiday freezes, self-serve, in whole billing periods starting at the next debit date. Medical/injury freezes are admin-approved, sit outside the quota, may start immediately, and extend unused credit expiry by the frozen days. Beyond six months of medical freeze, cancel rather than freeze.

7. **Early resume from a freeze.** Default: **the resume takes effect at the start of the next billing period**, and a member who wants to train sooner buys a single-class pass. This avoids mid-period pro-rata invoices entirely and is worth the small friction.

8. **Optimistic first-period access while the first BECS debit clears.** Default: **yes, grant it**, capped by `optimistic_access_limit_cents` set to one period's price, and only when the member has no prior failed debit. Telling a new member "come back Thursday" loses the join; the exposure is one period of classes in a room that already has a coach in it. Say no and the alternative is a card-only first payment, which is a materially worse signup flow.

9. **Instalments for larger packages.** Default: **do not build an instalment engine.** Enable Afterpay through the Stripe Dashboard for one-off packs at or above $150 — XERT is paid in full immediately, Afterpay carries the credit risk, and the fee (~6%) is confined to the large baskets where it is affordable. Self-funded instalments mean XERT is extending consumer credit and carrying default risk for a $200 pack.

10. **GST.** Default: **assume XERT is GST-registered** (or will cross $75k) and configure a 10% inclusive Stripe tax rate on all plans plus ABN in the invoice footer, so Stripe's hosted invoices are valid tax invoices. Note that **the existing pack checkout has no tax handling at all** — `buildCheckoutSessionParameters` sets no tax rate and no ABN, so today's Stripe receipts are probably not valid tax invoices for any member claiming them. That is a pre-existing gap worth fixing in the same release.

11. **Coach rent commercials.** Default: **fixed weekly facility rent by BECS**, not a percentage of the coach's revenue. Percentage rent requires XERT to see and verify the coach's takings, which is a whole reporting subsystem plus a trust problem. Also confirm whether the coaches are contractors renting space or staff — that distinction drives ABN, GST, insurance and superannuation obligations well outside this feature's scope, and getting it wrong is expensive.

12. **Failed-debit fee passed on to the member.** Default: **no.** Stripe charges XERT a fee per failed debit, but on-charging a dishonour fee is an unfair-contract-terms risk unless it is a genuine pre-estimate of cost, and it converts a payday timing problem into a churn event. Absorb it.

13. **Who can cancel a membership from the admin side, and is it logged as such?** Default: any admin, always recorded in `billing_subscription_events` with `actor_id`. There is only one admin today, but the audit trail is what makes a later dispute survivable.

