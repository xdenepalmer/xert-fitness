# Coach/PT facility licence agreements with client-volume-based rent, reviewed every 6 months

**Effort: XL**

> Design spec produced during the July 2026 audit, from the owner requirements note.
> Not yet implemented. Reviewed against the schema and code as at commit time.

## Summary

XERT licences floor space to independent PTs. Today the platform has no concept of this at all: `public.coaches` is a marketing CMS row (name, bio, photo) with no login, no ABN, no agreement; `class_sessions.coach_name` is **free text**; `private_session_requests` has **no coach assignment**. So there is currently zero trustworthy data about which coach trained which client — a rent rule keyed to client volume cannot be built on top of what exists. This spec adds a coach identity/engagement spine, an objective facility-use record, a versioned rent plan (fixed base + degressive client-count tiers), a 6-month review with a frozen, replayable audit artefact, a monthly PT statement, and **collection via the shared Stripe Billing spine in [spec 06](06-payment-options.md)** (not a parallel Stripe Invoicing integration). The rent for month M is always known on day 1 of month M — the review sets the rate, activity never changes the current month's bill. Two hard warnings up front: the owner's word "employment" is a sham-contracting and superannuation exposure that engineering cannot fix, and the first review physically cannot run until six months of measurement data exists, so the data spine (Phase 1) is urgent even if the money is not.

## Integration constraints

Cross-spec rules from [INTEGRATION_REVIEW.md](INTEGRATION_REVIEW.md) / [README.md](README.md). These override conflicting collection and role wording below:

1. **Collection consumes [spec 06](06-payment-options.md)’s billing spine.** One Stripe surface: webhook ledger, customers, BECS mandates, commerce health. Prefer `billing_plans.kind = 'coach_rent'` / `billing_subscriptions` / periods. Monthly statements remain the commercial source that sets or updates the subscription amount (or invoices *through* shared customer/mandate objects) — not a second webhook personality or standalone `send_invoice` path.
2. **Roles defer to [spec 07](07-staff-accounts-and-roles.md).** Login privilege is `profiles.role = 'coach'`; commercial scoping stays on `coach_engagements` / `current_coach_id()`. Do **not** keep coaches as `role = 'member'` with engagement-only portal gating. Coach agreement acceptances are a *commercial* ledger (licence / variations) — name them clearly so they are not confused with the member T&Cs ledger in 01/02.
3. **Active-client definition in this spec is canonical** (≥2 qualifying facility sessions per Brisbane calendar month; 6-month average drives the tier). README recommendation aligns to this.

## Recommendation

**Recommended: hybrid = fixed monthly base licence fee + a degressive tier step driven by the 6-month trailing average of verified active clients, with a 6-month establishment period, a collar on increases, and no collar on decreases.**

Concrete plan `xert-facility-2026` (all ex-GST, AUD, per calendar month):

| 6-mo avg active clients | Base | Tier step | Total | Effective $/client at band midpoint |
|---|---|---|---|---|
| Establishment (first 6 months) | $260 | — | **$260** | — |
| 0–4 | $260 | $0 | **$260** | — |
| 5–9 | $260 | $180 | **$440** | $62.86 @ 7 |
| 10–14 | $260 | $320 | **$580** | $48.33 @ 12 |
| 15–19 | $260 | $430 | **$690** | $40.59 @ 17 |
| 20–29 | $260 | $520 | **$780** | $32.50 @ 24 |
| 30+ | $260 | $580 | **$840** (capped) | $24.71 @ 34 |

Why this and not the alternatives:

- **Not flat.** A flat fee makes XERT indifferent to utilisation while the coach with 30 clients consumes six times the floor, equipment wear and cleaning of the coach with 5. It also makes the facility unaffordable for a new coach in month one — which is exactly when you want to attract them.
- **Not percentage-of-revenue. This one is actively dangerous, not merely awkward.** To charge a percentage you must audit the coach's gross takings, which means either trusting self-report (undisputable only until the first dispute) or putting XERT in the payment flow. Putting XERT in the PT payment flow is the *Thomas and Naaz* / *The Optical Superstore* fact pattern: where a principal collects client fees and remits the balance to the practitioner, Australian revenue offices have successfully deemed those flows to be wages for payroll tax. It is also a textbook employment indicium (XERT taking a cut of the coach's earnings looks like commission). **The rent model is legally safer than revenue-share precisely because the money flows coach → XERT, so there are no "payments to the contractor" to deem as wages.** Do not give that advantage away.
- **Not pure tiers with no base.** A zero-client month would produce zero rent while the coach still holds keys, insurance cover, locker space and a slot in the timetable. The base is the floor that covers marginal facility cost regardless.
- **Degressive by design.** Notice the effective rent per client *falls* from $62.86 to $24.71 as volume rises. This is the commercial heart of the model and must be published to coaches, because the obvious failure mode of any volume-based rent is that it taxes growth and teaches coaches to hide clients, train them off-site, or relabel sessions as "online". A coach must be able to look at the table and see that their 20th client is cheaper than their 6th.
- **Cliff effects are real but calibrated.** The worst single step is 9→10 clients at +$140/month. A tenth client at 2 sessions/week × $85 is roughly $737/month gross to the coach, so the step is ~19% of one client's revenue at the single worst boundary. Additionally the tier is matched on `floor(6-month average)`, not a point-in-time count, so one busy month never trips a band on its own.

**Definition of "active client" (the clause a coach will dispute — write it in the agreement in exactly these words):**

> An *active client* for a given calendar month is a distinct individual, recorded as a client of the coach in the XERT platform, for whom that coach delivered **at least two (2) qualifying sessions** within that month, measured on Australia/Brisbane calendar months.
> A **qualifying session** is a session recorded in the XERT platform against a reserved facility slot, with a final status of `delivered` or `no_show_charged`, of kind `one_to_one`, `semi_private` or `assessment`, and physically conducted in a XERT facility.
> The following are **not** qualifying sessions: online or off-site sessions; sessions cancelled by either party (whether early or late); sessions voided by XERT after a dispute.

Each element defends a specific attack:
- **Two, not one.** A one-off, a taster and an intro assessment are leads, not clients. A single-session threshold would let a coach's rent jump on trial sessions that never converted, and would let XERT inflate the count. Two sessions in a month is the smallest honest signal of an ongoing relationship. A coach who delivers one intro assessment and nothing else generates no rent liability from that person.
- **Cancelled clients.** A client who cancels the relationship mid-month still counts *for that month* if they hit two sessions before cancelling — the facility was genuinely used. They stop counting from the following month. There is **no retroactive removal**, because retroactivity is what makes a review unauditable.
- **Late cancellations and no-shows.** A charged no-show counts (the coach billed the client and occupied the floor slot; the facility bore the cost). A late cancellation does **not** count toward the active-client test, even though the slot was consumed — because the owner's words were "the number of clients you are *training*", and this reading is both more generous and easier to defend. Late cancellations still appear on the monthly statement as floor-utilisation, so the owner can see abuse without it silently inflating rent.
- **Shared clients.** A client who trains with two coaches counts for each coach who independently meets the two-session test. Both coaches consumed the floor.
- **Semi-private.** Each participant counts as a client, but each participant must independently reach two sessions. A coach running 4-person semi-private twice a week has 4 active clients from 8 slot-hours — priced correctly, since the floor load is per head.
- **The measurement window** is the six full Brisbane calendar months ending on the last day of the month before the review is drafted. The rate is the tier matched by `floor(mean of the six monthly counts)`. Flooring the mean always resolves ties in the coach's favour, which removes an entire class of argument.

**The failure mode this design must survive is bad data, not bad arithmetic.** Because `class_sessions.coach_name` is free text and PT requests carry no coach at all, the authoritative record must be a **reserved facility slot**, not a self-reported session log. A coach who wants to train in the building books the slot and names the client; the booking is timestamped and neither party can rewrite it afterwards. Delivery is then confirmed by the client (one tap in the member app, or an emailed link for non-members) and auto-confirms after 48 hours so client apathy does not erase the record. Under-reporting — training someone without booking a slot — is a defined breach in the agreement with a back-charge remedy, and it is detectable because it means an unbooked body on the floor. Do not build a rent engine on a log the payer fills in unsupervised.

## Data model

Six migrations, following the repo's existing conventions exactly (`create table if not exists`, `alter table … enable row level security`, `drop policy if exists` then `create policy`, `(select public.is_admin())` for per-statement evaluation as established in `20260714007000_rls_policy_performance.sql`, `security definer … set search_path = public, pg_temp`, immutability guard triggers, `updated_at` optimistic locking via a touch trigger, and a `public.xert_schema_capabilities` marker). Each file is mirrored into `src/supabase/coach_facility_rent_upgrade.sql` for dashboard application, and listed in `README.md` alongside the others.

**A security constraint that shapes the whole model:** `public.coaches` carries `create policy "coaches_public_read" on public.coaches for select to anon, authenticated using (published = true)` (`src/supabase/booking_schema.sql:1168`). Postgres RLS is row-level, not column-level, so **any column added to `public.coaches` is world-readable for published coaches**. ABN, `user_id`, rent and engagement status must therefore live in a separate table. `public.coaches` stays the marketing profile.

```sql
-- ────────────────────────────────────────────────────────────────────────────
-- supabase/migrations/20260726010000_coach_engagements.sql
-- Facility licence engagements. public.coaches remains the anon-readable
-- marketing profile, so every commercial and identity field lives here.
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.coach_engagements (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null unique references public.coaches(id) on delete restrict,
  user_id uuid unique references auth.users(id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'offered', 'active', 'suspended', 'ended')),
  -- Deliberately NOT "employment_start_date". See the security section.
  engagement_start_date date,
  first_delivered_session_on date,
  engagement_end_date date,
  legal_name text not null check (char_length(btrim(legal_name)) between 2 and 160),
  trading_name text check (trading_name is null or char_length(btrim(trading_name)) between 2 and 160),
  abn text check (abn is null or abn ~ '^[0-9]{11}$'),
  gst_registered boolean not null default false,
  billing_email text not null
    check (billing_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' and char_length(billing_email) <= 254),
  stripe_customer_id text unique
    check (stripe_customer_id is null or stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  public_liability_expires_on date,
  professional_indemnity_expires_on date,
  access_suspended_at timestamptz,
  suspension_reason text check (suspension_reason is null or char_length(btrim(suspension_reason)) between 3 and 500),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_engagements_date_order_check
    check (engagement_end_date is null or engagement_start_date is null
           or engagement_end_date >= engagement_start_date),
  constraint coach_engagements_active_requires_start_check
    check (status not in ('active', 'suspended', 'ended') or engagement_start_date is not null),
  constraint coach_engagements_suspension_check
    check ((access_suspended_at is null) = (suspension_reason is null))
);

create index if not exists coach_engagements_status_idx
  on public.coach_engagements (status, engagement_start_date desc);
create index if not exists coach_engagements_user_idx
  on public.coach_engagements (user_id) where user_id is not null;

create or replace function public.touch_coach_record_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke execute on function public.touch_coach_record_updated_at() from public, anon, authenticated;

drop trigger if exists coach_engagements_touch_updated_at on public.coach_engagements;
create trigger coach_engagements_touch_updated_at
  before update on public.coach_engagements
  for each row execute function public.touch_coach_record_updated_at();

alter table public.coach_engagements enable row level security;

drop policy if exists "coach_engagements_admin_all" on public.coach_engagements;
create policy "coach_engagements_admin_all" on public.coach_engagements
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "coach_engagements_read_own" on public.coach_engagements;
create policy "coach_engagements_read_own" on public.coach_engagements
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.coach_engagements from anon;

-- Read identity: includes ended engagements so a former coach can still reach
-- seven years of their own tax records. Never use this to authorise a write.
create or replace function public.current_coach_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select engagement.coach_id
  from public.coach_engagements as engagement
  where engagement.user_id = auth.uid()
    and engagement.status in ('active', 'suspended', 'ended')
  limit 1;
$$;

-- Write identity: only a live, unsuspended engagement may create records.
create or replace function public.current_active_coach_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select engagement.coach_id
  from public.coach_engagements as engagement
  where engagement.user_id = auth.uid()
    and engagement.status = 'active'
    and engagement.access_suspended_at is null
  limit 1;
$$;

revoke execute on function public.current_coach_id() from public, anon;
revoke execute on function public.current_active_coach_id() from public, anon;
grant execute on function public.current_coach_id() to authenticated;
grant execute on function public.current_active_coach_id() to authenticated;

-- Close the attribution gap: class_sessions.coach_name is free text today.
alter table public.class_sessions
  add column if not exists coach_id uuid references public.coaches(id) on delete set null;
create index if not exists class_sessions_coach_idx
  on public.class_sessions (coach_id, start_time desc) where coach_id is not null;

alter table public.private_session_requests
  add column if not exists assigned_coach_id uuid references public.coaches(id) on delete set null,
  add column if not exists assigned_at timestamptz,
  add column if not exists assigned_by uuid references public.profiles(id) on delete set null;
create index if not exists private_session_requests_coach_idx
  on public.private_session_requests (assigned_coach_id, created_at desc)
  where assigned_coach_id is not null;

-- An assigned coach may read only the PT requests routed to them.
drop policy if exists "private_session_requests_read_assigned_coach"
  on public.private_session_requests;
create policy "private_session_requests_read_assigned_coach"
  on public.private_session_requests
  for select to authenticated
  using (assigned_coach_id is not null
         and assigned_coach_id = (select public.current_coach_id()));

insert into public.xert_schema_capabilities (capability)
values ('coach_engagements')
on conflict (capability) do nothing;


-- ────────────────────────────────────────────────────────────────────────────
-- supabase/migrations/20260726020000_coach_facility_rent_plans.sql
-- The published rent schedule. A plan is immutable once published so that any
-- historical review can be replayed against the exact numbers that produced it.
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.coach_rent_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(code) <= 60),
  name text not null check (char_length(btrim(name)) between 3 and 120),
  currency text not null default 'aud' check (currency ~ '^[a-zA-Z]{3}$'),
  base_cents integer not null check (base_cents >= 0 and base_cents <= 2000000),
  establishment_months integer not null default 6 check (establishment_months between 0 and 24),
  establishment_cents integer not null check (establishment_cents >= 0 and establishment_cents <= 2000000),
  review_interval_months integer not null default 6 check (review_interval_months between 1 and 24),
  measurement_months integer not null default 6 check (measurement_months between 1 and 24),
  qualifying_sessions_per_month integer not null default 2
    check (qualifying_sessions_per_month between 1 and 20),
  -- Maximum permitted increase at any one review, in basis points of the
  -- current rate. Decreases are deliberately uncollared and apply in full.
  increase_collar_bps integer not null default 3000 check (increase_collar_bps between 0 and 20000),
  notice_days integer not null default 30 check (notice_days between 0 and 180),
  gst_bps integer not null default 1000 check (gst_bps between 0 and 5000),
  terms_summary text not null check (char_length(btrim(terms_summary)) between 20 and 4000),
  published_at timestamptz,
  superseded_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_rent_plans_supersede_check
    check (superseded_at is null or (published_at is not null and superseded_at > published_at))
);

create unique index if not exists coach_rent_plans_live_idx
  on public.coach_rent_plans ((true))
  where published_at is not null and superseded_at is null;

create table if not exists public.coach_rent_plan_tiers (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.coach_rent_plans(id) on delete cascade,
  min_active_clients integer not null check (min_active_clients >= 0 and min_active_clients <= 500),
  max_active_clients integer check (max_active_clients is null or max_active_clients >= min_active_clients),
  tier_cents integer not null check (tier_cents >= 0 and tier_cents <= 2000000),
  label text not null check (char_length(btrim(label)) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (plan_id, min_active_clients)
);
create index if not exists coach_rent_plan_tiers_plan_idx
  on public.coach_rent_plan_tiers (plan_id, min_active_clients);

drop trigger if exists coach_rent_plans_touch_updated_at on public.coach_rent_plans;
create trigger coach_rent_plans_touch_updated_at
  before update on public.coach_rent_plans
  for each row execute function public.touch_coach_record_updated_at();

-- A published plan is frozen except for being superseded. Reviews reference it
-- by id, so mutating the numbers would silently rewrite settled history.
create or replace function public.guard_coach_rent_plan_write()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'coach_rent_plan_tiers' then
    if exists (
      select 1 from public.coach_rent_plans plan
      where plan.id = coalesce(new.plan_id, old.plan_id) and plan.published_at is not null
    ) then
      raise exception 'COACH_RENT_PLAN_PUBLISHED';
    end if;
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and old.published_at is not null then
    if (to_jsonb(new) - 'superseded_at' - 'updated_at')
       is distinct from (to_jsonb(old) - 'superseded_at' - 'updated_at') then
      raise exception 'COACH_RENT_PLAN_PUBLISHED';
    end if;
    if old.superseded_at is not null and new.superseded_at is distinct from old.superseded_at then
      raise exception 'COACH_RENT_PLAN_PUBLISHED';
    end if;
  end if;
  if tg_op = 'DELETE' and old.published_at is not null then
    raise exception 'COACH_RENT_PLAN_PUBLISHED';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke execute on function public.guard_coach_rent_plan_write() from public, anon, authenticated;

drop trigger if exists coach_rent_plans_publish_guard on public.coach_rent_plans;
create trigger coach_rent_plans_publish_guard
  before update or delete on public.coach_rent_plans
  for each row execute function public.guard_coach_rent_plan_write();

drop trigger if exists coach_rent_plan_tiers_publish_guard on public.coach_rent_plan_tiers;
create trigger coach_rent_plan_tiers_publish_guard
  before insert or update or delete on public.coach_rent_plan_tiers
  for each row execute function public.guard_coach_rent_plan_write();

alter table public.coach_rent_plans enable row level security;
alter table public.coach_rent_plan_tiers enable row level security;

-- The tier schedule is a schedule to every coach's agreement: all engaged
-- coaches see the published plan in full. Unpublished drafts stay owner-only.
drop policy if exists "coach_rent_plans_admin_all" on public.coach_rent_plans;
create policy "coach_rent_plans_admin_all" on public.coach_rent_plans
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "coach_rent_plans_read_published" on public.coach_rent_plans;
create policy "coach_rent_plans_read_published" on public.coach_rent_plans
  for select to authenticated
  using (published_at is not null and (select public.current_coach_id()) is not null);

drop policy if exists "coach_rent_plan_tiers_admin_all" on public.coach_rent_plan_tiers;
create policy "coach_rent_plan_tiers_admin_all" on public.coach_rent_plan_tiers
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "coach_rent_plan_tiers_read_published" on public.coach_rent_plan_tiers;
create policy "coach_rent_plan_tiers_read_published" on public.coach_rent_plan_tiers
  for select to authenticated
  using ((select public.current_coach_id()) is not null
         and exists (select 1 from public.coach_rent_plans plan
                     where plan.id = coach_rent_plan_tiers.plan_id
                       and plan.published_at is not null));

revoke all on table public.coach_rent_plans from anon;
revoke all on table public.coach_rent_plan_tiers from anon;

insert into public.xert_schema_capabilities (capability)
values ('coach_facility_rent_plans')
on conflict (capability) do nothing;


-- ────────────────────────────────────────────────────────────────────────────
-- supabase/migrations/20260726030000_coach_client_sessions.sql
-- The authoritative facility-use record. A reserved slot, not a self-report.
-- Deliberately holds NO health information and NO third-party contact details.
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.coach_clients (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches(id) on delete restrict,
  member_user_id uuid references auth.users(id) on delete set null,
  -- Pseudonymous handle for non-member clients: the coach owns the real
  -- relationship and the real contact details. XERT holds the minimum needed
  -- to count a head (APP 3 data minimisation).
  client_reference text not null check (client_reference ~ '^[A-Za-z0-9][A-Za-z0-9 ._-]{1,59}$'),
  display_name text not null check (char_length(btrim(display_name)) between 2 and 80),
  relationship_status text not null default 'active'
    check (relationship_status in ('active', 'paused', 'ended')),
  first_session_on date,
  last_session_on date,
  ended_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (coach_id, client_reference),
  constraint coach_clients_ended_check
    check ((relationship_status = 'ended') = (ended_on is not null))
);
create unique index if not exists coach_clients_member_idx
  on public.coach_clients (coach_id, member_user_id) where member_user_id is not null;

comment on table public.coach_clients is
  'Minimum identity needed to count facility utilisation. Never store health, injury, goal or contact data here — that stays with the coach.';

create table if not exists public.coach_client_sessions (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches(id) on delete restrict,
  coach_client_id uuid not null references public.coach_clients(id) on delete restrict,
  class_session_id uuid references public.class_sessions(id) on delete set null,
  private_session_request_id uuid references public.private_session_requests(id) on delete set null,
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  location_zone text check (location_zone is null or char_length(btrim(location_zone)) between 1 and 80),
  session_kind text not null default 'one_to_one'
    check (session_kind in ('one_to_one', 'semi_private', 'assessment', 'online')),
  headcount integer not null default 1 check (headcount between 1 and 6),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'delivered', 'no_show_charged',
                      'cancelled_early', 'cancelled_late', 'voided')),
  -- Immutable expression: safe as a generated column. The active-client test
  -- reads this and nothing else, so the rule lives in exactly one place.
  counts_toward_rent boolean not null generated always as (
    status in ('delivered', 'no_show_charged')
    and session_kind in ('one_to_one', 'semi_private', 'assessment')
  ) stored,
  -- Set by trigger: `at time zone <literal>` is STABLE, not IMMUTABLE, so it
  -- cannot be a generated column.
  billing_month date not null,
  cancelled_at timestamptz,
  cancellation_notice_minutes integer check (cancellation_notice_minutes is null or cancellation_notice_minutes >= 0),
  logged_by uuid references public.profiles(id) on delete set null,
  logged_at timestamptz not null default now(),
  confirmed_by_client_at timestamptz,
  auto_confirmed_at timestamptz,
  disputed_at timestamptz,
  dispute_reason text check (dispute_reason is null or char_length(btrim(dispute_reason)) between 3 and 500),
  voided_by uuid references public.profiles(id) on delete set null,
  void_reason text check (void_reason is null or char_length(btrim(void_reason)) between 3 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_client_sessions_time_order_check check (scheduled_end > scheduled_start),
  constraint coach_client_sessions_duration_check
    check (scheduled_end <= scheduled_start + interval '4 hours'),
  constraint coach_client_sessions_headcount_check
    check (session_kind = 'semi_private' or headcount = 1),
  constraint coach_client_sessions_void_check
    check ((status = 'voided') = (void_reason is not null)),
  constraint coach_client_sessions_cancel_check
    check ((status in ('cancelled_early', 'cancelled_late')) = (cancelled_at is not null))
);

create index if not exists coach_client_sessions_rent_idx
  on public.coach_client_sessions (coach_id, billing_month, coach_client_id)
  where counts_toward_rent;
create index if not exists coach_client_sessions_coach_start_idx
  on public.coach_client_sessions (coach_id, scheduled_start desc, id desc);
create index if not exists coach_client_sessions_unconfirmed_idx
  on public.coach_client_sessions (scheduled_start)
  where status = 'delivered' and confirmed_by_client_at is null and auto_confirmed_at is null;
-- One coach cannot double-book the same client into overlapping live slots.
create unique index if not exists coach_client_sessions_slot_idx
  on public.coach_client_sessions (coach_client_id, scheduled_start)
  where status in ('scheduled', 'delivered', 'no_show_charged');

create or replace function public.set_coach_client_session_billing_month()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.billing_month :=
    date_trunc('month', (new.scheduled_start at time zone 'Australia/Brisbane'))::date;
  return new;
end;
$$;
revoke execute on function public.set_coach_client_session_billing_month() from public, anon, authenticated;

drop trigger if exists coach_client_sessions_billing_month on public.coach_client_sessions;
create trigger coach_client_sessions_billing_month
  before insert or update of scheduled_start on public.coach_client_sessions
  for each row execute function public.set_coach_client_session_billing_month();

drop trigger if exists coach_clients_touch_updated_at on public.coach_clients;
create trigger coach_clients_touch_updated_at
  before update on public.coach_clients
  for each row execute function public.touch_coach_record_updated_at();

drop trigger if exists coach_client_sessions_touch_updated_at on public.coach_client_sessions;
create trigger coach_client_sessions_touch_updated_at
  before update on public.coach_client_sessions
  for each row execute function public.touch_coach_record_updated_at();

-- Once a month has been assessed by an issued review or an issued statement,
-- its session records are frozen. Corrections go through an admin void, which
-- writes an audit row, never a silent edit.
create or replace function public.guard_coach_client_session_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'COACH_SESSION_IMMUTABLE';
  end if;
  if tg_op = 'UPDATE' then
    if new.coach_id is distinct from old.coach_id
       or new.coach_client_id is distinct from old.coach_client_id
       or new.billing_month is distinct from old.billing_month then
      raise exception 'COACH_SESSION_IDENTITY_IMMUTABLE';
    end if;
    if exists (
      select 1 from public.coach_monthly_statements statement
      where statement.coach_id = old.coach_id
        and statement.statement_month = old.billing_month
        and statement.status in ('issued', 'paid', 'overdue')
    ) and not public.is_admin() then
      raise exception 'COACH_SESSION_MONTH_CLOSED';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_coach_client_session_write() from public, anon, authenticated;

drop trigger if exists coach_client_sessions_write_guard on public.coach_client_sessions;
create trigger coach_client_sessions_write_guard
  before update or delete on public.coach_client_sessions
  for each row execute function public.guard_coach_client_session_write();

alter table public.coach_clients enable row level security;
alter table public.coach_client_sessions enable row level security;

drop policy if exists "coach_clients_admin_all" on public.coach_clients;
create policy "coach_clients_admin_all" on public.coach_clients
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "coach_clients_read_own" on public.coach_clients;
create policy "coach_clients_read_own" on public.coach_clients
  for select to authenticated
  using (coach_id = (select public.current_coach_id()));

drop policy if exists "coach_clients_insert_own" on public.coach_clients;
create policy "coach_clients_insert_own" on public.coach_clients
  for insert to authenticated
  with check (coach_id = (select public.current_active_coach_id()));

drop policy if exists "coach_clients_update_own" on public.coach_clients;
create policy "coach_clients_update_own" on public.coach_clients
  for update to authenticated
  using (coach_id = (select public.current_active_coach_id()))
  with check (coach_id = (select public.current_active_coach_id()));

drop policy if exists "coach_client_sessions_admin_all" on public.coach_client_sessions;
create policy "coach_client_sessions_admin_all" on public.coach_client_sessions
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "coach_client_sessions_read_own" on public.coach_client_sessions;
create policy "coach_client_sessions_read_own" on public.coach_client_sessions
  for select to authenticated
  using (coach_id = (select public.current_coach_id()));

-- A member may see the sessions booked against their own name so they can
-- confirm or dispute them.
drop policy if exists "coach_client_sessions_read_as_client" on public.coach_client_sessions;
create policy "coach_client_sessions_read_as_client" on public.coach_client_sessions
  for select to authenticated
  using (exists (
    select 1 from public.coach_clients client
    where client.id = coach_client_sessions.coach_client_id
      and client.member_user_id = (select auth.uid())
  ));

drop policy if exists "coach_client_sessions_insert_own" on public.coach_client_sessions;
create policy "coach_client_sessions_insert_own" on public.coach_client_sessions
  for insert to authenticated
  with check (coach_id = (select public.current_active_coach_id())
              and status = 'scheduled'
              and scheduled_start >= now() - interval '2 hours');

drop policy if exists "coach_client_sessions_update_own" on public.coach_client_sessions;
create policy "coach_client_sessions_update_own" on public.coach_client_sessions
  for update to authenticated
  using (coach_id = (select public.current_active_coach_id()))
  with check (coach_id = (select public.current_active_coach_id()) and status <> 'voided');

revoke all on table public.coach_clients from anon;
revoke all on table public.coach_client_sessions from anon;
revoke delete on table public.coach_client_sessions from authenticated;

insert into public.xert_schema_capabilities (capability)
values ('coach_client_sessions')
on conflict (capability) do nothing;


-- ────────────────────────────────────────────────────────────────────────────
-- supabase/migrations/20260726040000_coach_rent_reviews.sql
-- The six-month review artefact. Frozen the moment it leaves draft, so the
-- exact inputs behind any rate can be replayed years later.
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.coach_rent_reviews (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches(id) on delete restrict,
  engagement_id uuid not null references public.coach_engagements(id) on delete restrict,
  plan_id uuid not null references public.coach_rent_plans(id) on delete restrict,
  sequence integer not null check (sequence between 1 and 200),
  window_start_month date not null,
  window_end_month date not null,
  -- [{"month":"2026-02-01","active_clients":8,"qualifying_sessions":61,
  --   "clients":[{"client_id":"…","qualifying_sessions":9}]}, …]
  monthly_counts jsonb not null check (jsonb_typeof(monthly_counts) = 'array'),
  average_active_clients numeric(6,2) not null check (average_active_clients >= 0),
  assessed_active_clients integer not null check (assessed_active_clients >= 0),
  matched_tier_id uuid references public.coach_rent_plan_tiers(id) on delete restrict,
  previous_rent_cents integer not null check (previous_rent_cents >= 0),
  uncollared_rent_cents integer not null check (uncollared_rent_cents >= 0),
  new_rent_cents integer not null check (new_rent_cents >= 0),
  collar_applied boolean not null default false,
  status text not null default 'draft'
    check (status in ('draft', 'issued', 'acknowledged', 'disputed', 'applied', 'withdrawn')),
  effective_from date,
  issued_at timestamptz,
  issued_by uuid references public.profiles(id) on delete set null,
  acknowledged_at timestamptz,
  disputed_at timestamptz,
  dispute_reason text check (dispute_reason is null or char_length(btrim(dispute_reason)) between 10 and 2000),
  dispute_resolution text check (dispute_resolution is null or char_length(btrim(dispute_resolution)) between 10 and 2000),
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (coach_id, sequence),
  constraint coach_rent_reviews_window_check check (window_end_month >= window_start_month),
  constraint coach_rent_reviews_effective_check
    check (status = 'draft' or (effective_from is not null and issued_at is not null)),
  constraint coach_rent_reviews_effective_first_of_month_check
    check (effective_from is null or date_trunc('month', effective_from)::date = effective_from),
  constraint coach_rent_reviews_dispute_check
    check ((disputed_at is null) = (dispute_reason is null))
);

create index if not exists coach_rent_reviews_coach_idx
  on public.coach_rent_reviews (coach_id, window_end_month desc, sequence desc);
create index if not exists coach_rent_reviews_applied_idx
  on public.coach_rent_reviews (coach_id, effective_from desc)
  where status = 'applied';
create index if not exists coach_rent_reviews_open_idx
  on public.coach_rent_reviews (status, issued_at desc)
  where status in ('draft', 'issued', 'disputed');

-- Owner-only commentary lives in its own table because Postgres RLS cannot
-- hide a column. This is the coach-visible / owner-only boundary.
create table if not exists public.coach_rent_review_notes (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.coach_rent_reviews(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null check (char_length(btrim(body)) between 3 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists coach_rent_review_notes_review_idx
  on public.coach_rent_review_notes (review_id, created_at desc);

drop trigger if exists coach_rent_reviews_touch_updated_at on public.coach_rent_reviews;
create trigger coach_rent_reviews_touch_updated_at
  before update on public.coach_rent_reviews
  for each row execute function public.touch_coach_record_updated_at();

create or replace function public.guard_coach_rent_review_write()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_mutable text[] := array[
    'status', 'acknowledged_at', 'disputed_at', 'dispute_reason',
    'dispute_resolution', 'applied_at', 'updated_at'
  ];
  v_previous jsonb;
  v_next jsonb;
  v_field text;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'COACH_RENT_REVIEW_IMMUTABLE'; end if;
    return old;
  end if;
  if old.status = 'draft' then return new; end if;

  v_previous := to_jsonb(old);
  v_next := to_jsonb(new);
  foreach v_field in array v_mutable loop
    v_previous := v_previous - v_field;
    v_next := v_next - v_field;
  end loop;
  if v_previous is distinct from v_next then
    raise exception 'COACH_RENT_REVIEW_IMMUTABLE';
  end if;
  if old.status in ('applied', 'withdrawn') and new.status is distinct from old.status then
    raise exception 'COACH_RENT_REVIEW_TERMINAL';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_coach_rent_review_write() from public, anon, authenticated;

drop trigger if exists coach_rent_reviews_write_guard on public.coach_rent_reviews;
create trigger coach_rent_reviews_write_guard
  before update or delete on public.coach_rent_reviews
  for each row execute function public.guard_coach_rent_review_write();

alter table public.coach_rent_reviews enable row level security;
alter table public.coach_rent_review_notes enable row level security;

drop policy if exists "coach_rent_reviews_admin_all" on public.coach_rent_reviews;
create policy "coach_rent_reviews_admin_all" on public.coach_rent_reviews
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- A coach never sees a draft: an unissued review is the owner thinking aloud.
drop policy if exists "coach_rent_reviews_read_own_issued" on public.coach_rent_reviews;
create policy "coach_rent_reviews_read_own_issued" on public.coach_rent_reviews
  for select to authenticated
  using (coach_id = (select public.current_coach_id())
         and status in ('issued', 'acknowledged', 'disputed', 'applied'));

drop policy if exists "coach_rent_review_notes_admin_all" on public.coach_rent_review_notes;
create policy "coach_rent_review_notes_admin_all" on public.coach_rent_review_notes
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke all on table public.coach_rent_reviews from anon;
revoke all on table public.coach_rent_review_notes from anon, authenticated;
grant select on table public.coach_rent_reviews to authenticated;

insert into public.xert_schema_capabilities (capability)
values ('coach_rent_reviews')
on conflict (capability) do nothing;


-- ────────────────────────────────────────────────────────────────────────────
-- supabase/migrations/20260726050000_coach_monthly_statements.sql
-- Rent for month M is set before month M begins, so the statement never
-- surprises anyone: it reports the closed month's activity and the already
-- known rent, and carries the Stripe invoice link.
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.coach_monthly_statements (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches(id) on delete restrict,
  engagement_id uuid not null references public.coach_engagements(id) on delete restrict,
  plan_id uuid not null references public.coach_rent_plans(id) on delete restrict,
  agreement_version_id uuid references public.coach_agreement_versions(id) on delete restrict,
  rent_review_id uuid references public.coach_rent_reviews(id) on delete restrict,
  statement_month date not null
    check (date_trunc('month', statement_month)::date = statement_month),
  rate_basis text not null check (rate_basis in ('establishment', 'reviewed', 'holdover')),
  rent_cents integer not null check (rent_cents >= 0),
  gst_cents integer not null default 0 check (gst_cents >= 0),
  surcharge_cents integer not null default 0 check (surcharge_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  currency text not null default 'aud' check (currency ~ '^[a-zA-Z]{3}$'),
  active_clients integer not null check (active_clients >= 0),
  sessions_delivered integer not null default 0 check (sessions_delivered >= 0),
  sessions_no_show_charged integer not null default 0 check (sessions_no_show_charged >= 0),
  sessions_cancelled_late integer not null default 0 check (sessions_cancelled_late >= 0),
  headcount_delivered integer not null default 0 check (headcount_delivered >= 0),
  -- Frozen explanation of the number: base/tier split, the tier label, the
  -- per-client session tallies, and the review that set the rate.
  breakdown jsonb not null check (jsonb_typeof(breakdown) = 'object'),
  status text not null default 'draft'
    check (status in ('draft', 'issued', 'paid', 'overdue', 'void')),
  issued_at timestamptz,
  due_on date,
  paid_at timestamptz,
  voided_at timestamptz,
  void_reason text check (void_reason is null or char_length(btrim(void_reason)) between 3 and 500),
  stripe_invoice_id text unique
    check (stripe_invoice_id is null or stripe_invoice_id ~ '^in_[A-Za-z0-9]+$'),
  stripe_invoice_status text
    check (stripe_invoice_status is null or stripe_invoice_status in
           ('draft', 'open', 'paid', 'uncollectible', 'void')),
  stripe_hosted_invoice_url text
    check (stripe_hosted_invoice_url is null or stripe_hosted_invoice_url ~ '^https://'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (coach_id, statement_month),
  constraint coach_monthly_statements_total_check
    check (total_cents = rent_cents + gst_cents + surcharge_cents),
  constraint coach_monthly_statements_issued_check
    check (status = 'draft' or (issued_at is not null and due_on is not null)),
  constraint coach_monthly_statements_void_check
    check ((status = 'void') = (voided_at is not null)),
  constraint coach_monthly_statements_paid_check
    check ((status = 'paid') = (paid_at is not null))
);

create index if not exists coach_monthly_statements_coach_idx
  on public.coach_monthly_statements (coach_id, statement_month desc);
create index if not exists coach_monthly_statements_unpaid_idx
  on public.coach_monthly_statements (due_on, coach_id)
  where status in ('issued', 'overdue');
create index if not exists coach_monthly_statements_invoice_idx
  on public.coach_monthly_statements (stripe_invoice_id) where stripe_invoice_id is not null;

drop trigger if exists coach_monthly_statements_touch_updated_at on public.coach_monthly_statements;
create trigger coach_monthly_statements_touch_updated_at
  before update on public.coach_monthly_statements
  for each row execute function public.touch_coach_record_updated_at();

create or replace function public.guard_coach_statement_write()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_mutable text[] := array[
    'status', 'paid_at', 'voided_at', 'void_reason', 'stripe_invoice_id',
    'stripe_invoice_status', 'stripe_hosted_invoice_url', 'surcharge_cents',
    'total_cents', 'updated_at'
  ];
  v_previous jsonb := to_jsonb(old);
  v_next jsonb := to_jsonb(new);
  v_field text;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'COACH_STATEMENT_IMMUTABLE'; end if;
    return old;
  end if;
  if old.status = 'draft' then return new; end if;
  foreach v_field in array v_mutable loop
    v_previous := v_previous - v_field;
    v_next := v_next - v_field;
  end loop;
  if v_previous is distinct from v_next then
    raise exception 'COACH_STATEMENT_IMMUTABLE';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_coach_statement_write() from public, anon, authenticated;

drop trigger if exists coach_monthly_statements_write_guard on public.coach_monthly_statements;
create trigger coach_monthly_statements_write_guard
  before update or delete on public.coach_monthly_statements
  for each row execute function public.guard_coach_statement_write();

alter table public.coach_monthly_statements enable row level security;

drop policy if exists "coach_monthly_statements_admin_all" on public.coach_monthly_statements;
create policy "coach_monthly_statements_admin_all" on public.coach_monthly_statements
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "coach_monthly_statements_read_own" on public.coach_monthly_statements;
create policy "coach_monthly_statements_read_own" on public.coach_monthly_statements
  for select to authenticated
  using (coach_id = (select public.current_coach_id()) and status <> 'draft');

revoke all on table public.coach_monthly_statements from anon;
revoke insert, update, delete on table public.coach_monthly_statements from authenticated;
grant select on table public.coach_monthly_statements to authenticated;

insert into public.xert_schema_capabilities (capability)
values ('coach_monthly_statements')
on conflict (capability) do nothing;


-- ────────────────────────────────────────────────────────────────────────────
-- supabase/migrations/20260726060000_coach_agreement_versions.sql
-- Contract versioning, acceptance receipts and an immutable engagement audit.
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.coach_agreement_versions (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.coach_engagements(id) on delete restrict,
  version integer not null check (version between 1 and 500),
  kind text not null default 'terms'
    check (kind in ('terms', 'rent_variation', 'termination')),
  plan_id uuid not null references public.coach_rent_plans(id) on delete restrict,
  rent_review_id uuid references public.coach_rent_reviews(id) on delete restrict,
  rent_cents_at_signing integer not null check (rent_cents_at_signing >= 0),
  document_markdown text not null check (char_length(document_markdown) between 200 and 200000),
  -- sha256 of document_markdown || the resolved plan snapshot. Answers
  -- "what exactly did I agree to" without trusting the rendering layer.
  document_sha256 text not null check (document_sha256 ~ '^[a-f0-9]{64}$'),
  plan_snapshot jsonb not null check (jsonb_typeof(plan_snapshot) = 'object'),
  effective_from date not null,
  supersedes_version_id uuid references public.coach_agreement_versions(id) on delete restrict,
  published_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (engagement_id, version)
);
create index if not exists coach_agreement_versions_engagement_idx
  on public.coach_agreement_versions (engagement_id, version desc);

create table if not exists public.coach_agreement_acceptances (
  id uuid primary key default gen_random_uuid(),
  agreement_version_id uuid not null
    references public.coach_agreement_versions(id) on delete restrict,
  engagement_id uuid not null references public.coach_engagements(id) on delete restrict,
  accepted_by uuid not null references auth.users(id) on delete restrict,
  -- 'accepted' = signed the terms. 'acknowledged' = received a rate variation
  -- served under the agreement's variation clause. They are not the same act.
  acceptance_kind text not null default 'accepted'
    check (acceptance_kind in ('accepted', 'acknowledged')),
  document_sha256 text not null check (document_sha256 ~ '^[a-f0-9]{64}$'),
  typed_full_name text not null check (char_length(btrim(typed_full_name)) between 2 and 160),
  accepted_at timestamptz not null default now(),
  request_ip inet,
  user_agent text check (user_agent is null or char_length(user_agent) <= 500),
  unique (agreement_version_id, accepted_by, acceptance_kind)
);
create index if not exists coach_agreement_acceptances_engagement_idx
  on public.coach_agreement_acceptances (engagement_id, accepted_at desc);

create table if not exists public.coach_engagement_events (
  id uuid primary key default gen_random_uuid(),
  resource_type text not null check (resource_type in
    ('coach_engagement', 'coach_rent_plan', 'coach_rent_review',
     'coach_monthly_statement', 'coach_agreement_version', 'coach_client_session')),
  resource_id uuid not null,
  coach_id uuid references public.coaches(id) on delete set null,
  action text not null check (action in
    ('created', 'updated', 'published', 'issued', 'acknowledged', 'disputed',
     'applied', 'withdrawn', 'paid', 'voided', 'suspended', 'reinstated', 'ended')),
  changed_by uuid references auth.users(id) on delete set null,
  actor_role text not null default 'admin' check (actor_role in ('admin', 'coach', 'system')),
  subject_label text not null check (char_length(btrim(subject_label)) between 1 and 200),
  previous_snapshot jsonb,
  new_snapshot jsonb,
  created_at timestamptz not null default now()
);
create index if not exists coach_engagement_events_created_idx
  on public.coach_engagement_events (created_at desc, id desc);
create index if not exists coach_engagement_events_resource_idx
  on public.coach_engagement_events (resource_type, resource_id, created_at desc, id desc);
create index if not exists coach_engagement_events_coach_idx
  on public.coach_engagement_events (coach_id, created_at desc, id desc)
  where coach_id is not null;

create or replace function public.guard_coach_engagement_event()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'COACH_ENGAGEMENT_AUDIT_IMMUTABLE';
end;
$$;

drop trigger if exists coach_engagement_events_immutable on public.coach_engagement_events;
create trigger coach_engagement_events_immutable
  before update or delete on public.coach_engagement_events
  for each row execute function public.guard_coach_engagement_event();

create or replace function public.audit_coach_engagement_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_previous jsonb;
  v_new jsonb;
  v_record jsonb;
  v_resource_type text;
  v_action text;
  v_coach_id uuid;
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new); v_record := v_new; v_action := 'created';
  elsif tg_op = 'DELETE' then
    v_previous := to_jsonb(old); v_record := v_previous; v_action := 'voided';
  else
    v_previous := to_jsonb(old); v_new := to_jsonb(new); v_record := v_new;
    if (v_previous - 'updated_at') = (v_new - 'updated_at') then return new; end if;
    v_action := case
      when coalesce(v_new ->> 'status', '') is distinct from coalesce(v_previous ->> 'status', '')
        then case v_new ->> 'status'
          when 'issued' then 'issued' when 'acknowledged' then 'acknowledged'
          when 'disputed' then 'disputed' when 'applied' then 'applied'
          when 'withdrawn' then 'withdrawn' when 'paid' then 'paid'
          when 'void' then 'voided' when 'suspended' then 'suspended'
          when 'ended' then 'ended' when 'active' then 'reinstated'
          else 'updated' end
      else 'updated' end;
  end if;

  v_resource_type := case tg_table_name
    when 'coach_engagements' then 'coach_engagement'
    when 'coach_rent_plans' then 'coach_rent_plan'
    when 'coach_rent_reviews' then 'coach_rent_review'
    when 'coach_monthly_statements' then 'coach_monthly_statement'
    when 'coach_agreement_versions' then 'coach_agreement_version'
    when 'coach_client_sessions' then 'coach_client_session'
    else null end;
  if v_resource_type is null then raise exception 'COACH_RESOURCE_INVALID'; end if;

  v_coach_id := nullif(v_record ->> 'coach_id', '')::uuid;

  insert into public.coach_engagement_events (
    resource_type, resource_id, coach_id, action, changed_by, actor_role,
    subject_label, previous_snapshot, new_snapshot
  ) values (
    v_resource_type,
    (v_record ->> 'id')::uuid,
    v_coach_id,
    v_action,
    auth.uid(),
    case
      when auth.role() = 'service_role' then 'system'
      when public.is_admin() then 'admin'
      else 'coach' end,
    coalesce(
      nullif(btrim(v_record ->> 'legal_name'), ''),
      nullif(btrim(v_record ->> 'name'), ''),
      v_resource_type
    ),
    v_previous, v_new
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke execute on function public.guard_coach_engagement_event() from public, anon, authenticated;
revoke execute on function public.audit_coach_engagement_change() from public, anon, authenticated;

drop trigger if exists coach_engagements_audit on public.coach_engagements;
create trigger coach_engagements_audit
  after insert or update or delete on public.coach_engagements
  for each row execute function public.audit_coach_engagement_change();

drop trigger if exists coach_rent_plans_audit on public.coach_rent_plans;
create trigger coach_rent_plans_audit
  after insert or update or delete on public.coach_rent_plans
  for each row execute function public.audit_coach_engagement_change();

drop trigger if exists coach_rent_reviews_audit on public.coach_rent_reviews;
create trigger coach_rent_reviews_audit
  after insert or update or delete on public.coach_rent_reviews
  for each row execute function public.audit_coach_engagement_change();

drop trigger if exists coach_monthly_statements_audit on public.coach_monthly_statements;
create trigger coach_monthly_statements_audit
  after insert or update or delete on public.coach_monthly_statements
  for each row execute function public.audit_coach_engagement_change();

drop trigger if exists coach_agreement_versions_audit on public.coach_agreement_versions;
create trigger coach_agreement_versions_audit
  after insert or update or delete on public.coach_agreement_versions
  for each row execute function public.audit_coach_engagement_change();

create or replace function public.guard_coach_agreement_version_write()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.published_at is not null then raise exception 'COACH_AGREEMENT_IMMUTABLE'; end if;
    return old;
  end if;
  if old.published_at is not null
     and (to_jsonb(new) - 'supersedes_version_id') is distinct from (to_jsonb(old) - 'supersedes_version_id') then
    raise exception 'COACH_AGREEMENT_IMMUTABLE';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_coach_agreement_version_write() from public, anon, authenticated;

drop trigger if exists coach_agreement_versions_write_guard on public.coach_agreement_versions;
create trigger coach_agreement_versions_write_guard
  before update or delete on public.coach_agreement_versions
  for each row execute function public.guard_coach_agreement_version_write();

create or replace function public.guard_coach_agreement_acceptance()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'COACH_ACCEPTANCE_IMMUTABLE';
end;
$$;
revoke execute on function public.guard_coach_agreement_acceptance() from public, anon, authenticated;

drop trigger if exists coach_agreement_acceptances_immutable on public.coach_agreement_acceptances;
create trigger coach_agreement_acceptances_immutable
  before update or delete on public.coach_agreement_acceptances
  for each row execute function public.guard_coach_agreement_acceptance();

alter table public.coach_agreement_versions enable row level security;
alter table public.coach_agreement_acceptances enable row level security;
alter table public.coach_engagement_events enable row level security;

drop policy if exists "coach_agreement_versions_admin_all" on public.coach_agreement_versions;
create policy "coach_agreement_versions_admin_all" on public.coach_agreement_versions
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "coach_agreement_versions_read_own" on public.coach_agreement_versions;
create policy "coach_agreement_versions_read_own" on public.coach_agreement_versions
  for select to authenticated
  using (published_at is not null and exists (
    select 1 from public.coach_engagements engagement
    where engagement.id = coach_agreement_versions.engagement_id
      and engagement.user_id = (select auth.uid())
  ));

drop policy if exists "coach_agreement_acceptances_admin_read" on public.coach_agreement_acceptances;
create policy "coach_agreement_acceptances_admin_read" on public.coach_agreement_acceptances
  for select to authenticated
  using ((select public.is_admin()));

drop policy if exists "coach_agreement_acceptances_read_own" on public.coach_agreement_acceptances;
create policy "coach_agreement_acceptances_read_own" on public.coach_agreement_acceptances
  for select to authenticated
  using (accepted_by = (select auth.uid()));

drop policy if exists "coach_engagement_events_admin_read" on public.coach_engagement_events;
create policy "coach_engagement_events_admin_read" on public.coach_engagement_events
  for select to authenticated
  using ((select public.is_admin()));

-- A coach sees their own history, but never the owner's snapshots of a draft.
drop policy if exists "coach_engagement_events_read_own" on public.coach_engagement_events;
create policy "coach_engagement_events_read_own" on public.coach_engagement_events
  for select to authenticated
  using (coach_id is not null
         and coach_id = (select public.current_coach_id())
         and action in ('issued', 'acknowledged', 'disputed', 'applied',
                        'paid', 'suspended', 'reinstated', 'ended'));

revoke all on table public.coach_agreement_versions from anon;
revoke all on table public.coach_agreement_acceptances from anon;
revoke all on table public.coach_engagement_events from anon;
revoke insert, update, delete on table public.coach_agreement_versions from authenticated;
revoke update, delete on table public.coach_agreement_acceptances from authenticated;
revoke insert, update, delete on table public.coach_engagement_events from authenticated;
grant select on table public.coach_agreement_versions to authenticated;
grant select on table public.coach_agreement_acceptances to authenticated;
grant select on table public.coach_engagement_events to authenticated;

-- Feature flag, matching the existing admin_settings switch convention.
alter table public.admin_settings
  add column if not exists coach_rent_enabled boolean not null default false;

insert into public.xert_schema_capabilities (capability)
values ('coach_agreement_versions'), ('coach_engagement_audit')
on conflict (capability) do nothing;
```

## Backend

All business writes go through `security definer` RPCs in the style of `admin_update_request` / `admin_grant_credits_v2`, so the rules live in one place and RLS is the second line of defence, not the only one. Every function follows the repo idiom: `language plpgsql security definer set search_path = public, pg_temp`, `if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;`, `for update` row locks, `revoke execute … from public, anon;` then `grant execute … to authenticated`.

**Rent engine RPCs** (in `20260726040000_coach_rent_reviews.sql`):

- `public.coach_active_clients(p_coach_id uuid, p_month date) returns table(coach_client_id uuid, qualifying_sessions bigint)` — stable, admin-or-own-coach. The single source of the active-client rule:
  ```sql
  select session.coach_client_id, count(*)
  from public.coach_client_sessions session
  where session.coach_id = p_coach_id
    and session.billing_month = date_trunc('month', p_month)::date
    and session.counts_toward_rent
  group by session.coach_client_id
  having count(*) >= v_threshold;   -- plan.qualifying_sessions_per_month
  ```
  Guard: `if not public.is_admin() and p_coach_id is distinct from public.current_coach_id() then raise exception 'COACH_SCOPE_REQUIRED'; end if;`

- `public.coach_rent_cents_for_month(p_coach_id uuid, p_month date) returns integer` — the rate resolver, and the only place the establishment/holdover logic exists. Order: engagement not in `('active','suspended')` → `0`; month is within `plan.establishment_months` of `date_trunc('month', engagement_start_date)` → `plan.establishment_cents`; else the newest `coach_rent_reviews` row with `status = 'applied' and effective_from <= p_month` → its `new_rent_cents`; else **hold over at the establishment rate** and let the operations-health check flag it. Holding over is deliberate: if the owner is late running a review, the coach does not pay for XERT's delay, and the delay becomes visible instead of silently defaulting to a higher band.

- `public.admin_draft_coach_rent_review(p_coach_id uuid) returns uuid` — computes the window (`measurement_months` full Brisbane months ending last month), calls `coach_active_clients` per month, materialises `monthly_counts` with per-client tallies, computes `average_active_clients` and `assessed_active_clients = floor(avg)`, matches the tier, applies the collar (`least(uncollared, previous + previous * increase_collar_bps / 10000)` on increases only), and inserts a `draft`. Idempotent per `(coach_id, sequence)` — re-drafting an existing draft for the same window updates it in place; a non-draft review for that window raises `COACH_REVIEW_ALREADY_ISSUED`.

- `public.admin_issue_coach_rent_review(p_review_id uuid, p_effective_from date, p_expected_updated_at timestamptz) returns void` — optimistic-locked exactly like `admin_archive_member_announcement`. Validates `p_effective_from` is the first of a month and at least `plan.notice_days` away (`raise exception 'COACH_REVIEW_NOTICE_TOO_SHORT'`), flips `draft → issued`, and creates a `kind = 'rent_variation'` `coach_agreement_versions` row with the rendered variation notice and its sha256.

- `public.coach_acknowledge_rent_review(p_review_id uuid, p_typed_full_name text) returns void` and `public.coach_dispute_rent_review(p_review_id uuid, p_reason text) returns void` — coach-scoped via `current_active_coach_id()`. Acknowledgement writes a `coach_agreement_acceptances` row with `acceptance_kind = 'acknowledged'`. **A dispute does not stop the clock**: `applied_at` still lands on `effective_from` under the agreement's variation clause, but the dispute is surfaced to the owner and recorded permanently. Silence must not be a veto and a dispute must not be a veto — otherwise the rate is unenforceable.

- `public.apply_due_coach_rent_reviews() returns integer` — `service_role` only (`if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_ONLY'`), matching `fulfill_stripe_checkout`. Moves `issued`/`acknowledged`/`disputed` reviews with `effective_from <= today` to `applied`.

**Session capture RPCs** (in `20260726030000_coach_client_sessions.sql`):

- `public.coach_book_client_session(p_coach_client_id uuid, p_start timestamptz, p_end timestamptz, p_kind text, p_headcount integer, p_location text) returns uuid` — coach-scoped. Rejects starts more than 90 days out, overlapping own slots, and any booking while `access_suspended_at is not null`.
- `public.coach_settle_client_session(p_session_id uuid, p_status text, p_note text) returns void` — the only path from `scheduled` to a terminal status. Computes `cancellation_notice_minutes` from `now()` vs `scheduled_start` and **derives** `cancelled_early` vs `cancelled_late` at the 12-hour boundary rather than trusting the coach's choice. Refuses to settle a session more than 7 days after `scheduled_end` (`COACH_SESSION_SETTLEMENT_WINDOW_CLOSED`) so the record cannot be backfilled once a statement is near.
- `public.member_confirm_coach_session(p_session_id uuid, p_confirmed boolean, p_reason text) returns void` — the client side, scoped by `coach_clients.member_user_id = auth.uid()`. `false` sets `disputed_at`/`dispute_reason` and pulls the session out of `counts_toward_rent` only when an admin subsequently voids it.
- `public.auto_confirm_coach_sessions() returns integer` — `service_role` only, sets `auto_confirmed_at` on `delivered` sessions older than 48 hours with no confirmation and no dispute.
- `public.admin_void_coach_session(p_session_id uuid, p_reason text) returns void` — the only way to remove a session from the count, always audited.

**Statement RPCs** (in `20260726050000_coach_monthly_statements.sql`):

- `public.admin_issue_coach_statement(p_coach_id uuid, p_month date) returns uuid` — refuses if `p_month` is not fully closed in Brisbane time, computes the tallies, calls `coach_rent_cents_for_month(p_coach_id, p_month + interval '1 month')` for the rent being billed forward, computes `gst_cents = round(rent_cents * plan.gst_bps / 10000.0)` (0 if `not engagement.gst_registered`… no — GST is on *XERT's* supply, so it is charged whenever **XERT** is registered; the coach's registration only affects whether they can claim it back — the flag on the engagement is informational and must not gate the GST line), freezes `breakdown`, sets `due_on = statement_month + interval '1 month' + 6 days`, and flips to `issued`.
- `public.admin_void_coach_statement(p_statement_id uuid, p_reason text) returns void`.
- `public.settle_coach_statement_invoice(p_stripe_invoice_id text, p_status text, p_paid_at timestamptz) returns uuid` — `service_role` only, called from the webhook.

**Serverless functions** (Vercel, `api/`):

- **Coach-rent collection (consume 06 — do not ship a parallel Invoicing API).** Prefer extending spec 06’s subscribe / billing APIs so an issued statement updates or creates a `billing_subscriptions` row (`kind = 'coach_rent'`) with amount derived from the statement, using the shared Stripe customer + BECS mandate on the engagement. Settlement lands through the same `invoice.paid` / webhook-ledger path as memberships. If a statement-linked Stripe Invoice object is still needed for the PDF, create it *through* those shared customer/mandate objects and the single webhook personality — **not** a standalone `collection_method: 'send_invoice'` integration with its own event handlers. Idempotency and `metadata.xert_*` identity discipline still apply.

- **Extend `api/stripe-webhook.js`** — only as already required by spec 06’s billing spine for subscription invoices. Route coach-rent settlement through the existing `processStripeEvent` ledger (retries, duplicates, `finish_stripe_webhook_event`). **Do not add a second webhook endpoint** — the ledger in `stripe_webhook_events` is the thing that makes delivery auditable.

- **Extend `api/admin-commerce-health.js`** — add a `coach_rent` block: unreviewed engagements past their review date, statements overdue by more than 14 days, sessions delivered but unconfirmed for more than 7 days, coaches with insurance expiring within 30 days, and any coach on `rate_basis = 'holdover'`.

**Client data layer** — `src/lib/adminData.js` gains `getCoachEngagements`, `saveCoachEngagement(id, payload, expectedUpdatedAt)` (using `assertAdminMutationVersion`), `getCoachRentPlans`, `publishCoachRentPlan`, `draftCoachRentReview`, `issueCoachRentReview`, `getCoachStatements`, `issueCoachStatement`, `createCoachRentInvoice`. `getOperationsHealth()` gains a `healthCheck('coach_rent', 'Coach rent reviews', …)` entry next to the existing `healthCheck('coaches', …)` at `src/lib/adminData.js:1464`. `src/lib/schemaCapabilities.js` gains the seven new capability keys with their migration paths.

**New pure module `src/lib/coachRent.js`** — the rent maths with zero Supabase imports, mirroring the `ptRequestAnalytics.js` / `coachAdmin.js` pattern so it is unit-testable under `node --test`: `matchRentTier(tiers, activeClients)`, `applyRentCollar({ previousCents, targetCents, collarBps })`, `assessActiveClients(monthlyCounts, threshold)`, `averageActiveClients(monthlyCounts)`, `measurementWindow(now, months)`, `rentBreakdown(plan, tier)`, `effectiveRentPerClient(totalCents, activeClients)`. The Postgres functions and this module must agree; `test/coach-rent-engine.test.js` asserts the published tier table produces exactly the numbers in the recommendation.

## Web UI

Two surfaces: an owner section inside the existing Command Centre, and a **new `/coach` portal that is not under `/admin`**. `AdminRoute` stays admin-only; coaches never get an admin session.

**Owner side — files to extend (all real):**

- `src/lib/adminNavigation.js` — add `'coach-rent'` to `ADMIN_SECTION_KEYS`.
- `src/components/admin/AdminLayout.jsx` — add `{ key: 'coach-rent', label: 'Coach Agreements & Rent', icon: FileSignature }` to the `Site Content` group (rename that group heading to `Team & Content`), importing `FileSignature` from `lucide-react` alongside the existing icons.
- `src/components/admin/CommandPalette.jsx` — add the same entry to its section list, plus a quick action `{ key: 'coach-rent', label: 'Draft a coach rent review', icon: Plus }`.
- `src/pages/AdminCommandCentre.jsx` — `const CoachRentManager = lazy(() => import('@/components/admin/CoachRentManager'));` and `case 'coach-rent': return <CoachRentManager initialCoachId={intent.get('coach')} onIntentHandled={consumeIntent} onDirtyChange={setHasUnsavedChanges} />;`. Route-level code splitting already exists, so this adds no weight to the main chunk.
- `src/components/admin/CoachesManager.jsx` — in the per-coach row action group (currently `Edit` / `Delete` at lines 254–259), add a third button `Rent & agreement` that calls `onNavigate('coach-rent', { coach: c.id })`; thread an `onNavigate` prop down from `AdminCommandCentre`, matching how `AdminOverview` already receives `onNavigate={setSection}`. Also surface a small badge on the row when the coach has an engagement (`Licensed`, `Review due`, `Rent overdue`) so the marketing directory and the commercial reality are visibly connected.
- `src/lib/coachAdmin.js` — add `normalizeCoachEngagementInput(form)` (ABN 11 digits, billing email, dates, status transitions) and `normalizeCoachRentPlanInput(form)` (tier bands contiguous from 0, top band open-ended, monotonically non-decreasing `tier_cents`), throwing the same plain-English `Error` messages as `normalizeCoachInput`.
- `src/lib/adminData.js`, `src/lib/schemaCapabilities.js` — as described in backend.
- `src/App.jsx` — add `<Route path="/coach" element={<CoachRoute><CoachPortal /></CoachRoute>} />` and `<Route path="/coach/*" …>` beside the existing admin routes, lazily imported like the rest.

**Owner side — new files:**

- `src/components/admin/CoachRentManager.jsx` — three tabs. *Engagements*: list of coaches with engagement status, current rent, next review date, insurance expiry, outstanding balance; opens `CoachEngagementEditor`. *Rent plan*: the published tier table with the derived `$ per client at band midpoint` column rendered live, plus a `Publish new plan` flow that warns the current plan becomes immutable. *Statements*: month picker, per-coach statement rows with Stripe invoice status and a `Create invoice` action behind `AdminConfirmDialog`.
- `src/components/admin/CoachEngagementEditor.jsx` — modal in the exact shape of `CoachEditor` in `CoachesManager.jsx`: `fixed inset-0 z-50 bg-black/80`, `role="dialog" aria-modal="true"`, `useEffect` Escape handler, dirty tracking via `onDirtyChange`, `AdminConfirmDialog` on discard, `min-h-11` touch targets, `bg-xert-ink` / `border-xert-steel/20` / `font-display uppercase` styling.
- `src/components/admin/CoachRentReviewPanel.jsx` — the review workspace. Shows the six-month grid (month × active clients × qualifying sessions), the computed average, the matched tier, the uncollared and collared rates side by side with the collar explicitly labelled when it bites, and a per-month drill-down to the qualifying client list. `Draft review` → `Issue with effect from <1st of month>` behind `AdminConfirmDialog` with the notice-period warning. Owner-only notes render here and nowhere else.
- `src/components/admin/CoachStatementsTable.jsx` — modelled on `PTRequestsTable.jsx`: filters, summary tiles, `downloadCsv` export via `src/lib/csv.js`, paging through `collectAdminPages`, bulk `Issue invoices` using `settleAdminMutations` + `adminBulkConfirmation` from `src/lib/adminBulk.js`.
- `src/lib/coachRent.js`, `src/lib/coachRentStatements.js` (statement CSV rows, currency and GST formatting in `en-AU`), `src/lib/coachPortalData.js` (the coach-scoped Supabase queries, kept out of `adminData.js` so the coach bundle never imports the 1615-line admin layer).

**Coach side — new files:**

- `src/components/coach/CoachRoute.jsx` — the mirror of `AdminRoute.jsx`, gating on `profiles.role = 'coach'` (or `has_capability` per [spec 07](07-staff-accounts-and-roles.md)) **and** a linked `coach_engagements` row via `current_coach_id()`. Extend `src/lib/SupabaseAuthContext.jsx` to expose `coachId` and `coachLoading` by calling `supabase.rpc('current_coach_id')` alongside the existing profile fetch (guarded so a null result is the normal case for members and costs one cheap RPC). Loader → sign-in → "no coach engagement" screen with a link to `/account`.
- `src/pages/CoachPortal.jsx` — the coach's whole world, wrapped in `PublicNav` / `PublicFooter` like `Account.jsx`. Sections: **This month** (rent owed, due date, pay-now link via the shared billing customer/mandate from 06, active-client count so far); **Book the floor** (`CoachSessionLogger`); **My clients**; **Statements**; **My rent** (`CoachRentExplainer`); **My agreement**.
- `src/components/coach/CoachSessionLogger.jsx` — book a slot naming a client, then settle it as delivered / no-show / cancelled. Shows the 12-hour cancellation boundary as a live countdown so the early/late classification is never a surprise.
- `src/components/coach/CoachStatementCard.jsx` — clients trained, sessions delivered, no-shows charged, late cancellations (labelled *does not affect your rent*), the effective rate with its basis (`Establishment rate` / `Reviewed <date>` / `Held over — review pending`), base + tier split, GST, total, due date, invoice status.
- `src/components/coach/CoachRentExplainer.jsx` — the full published tier table with the coach's own position marked, their last six monthly counts, their current effective `$ per client`, and a plain-English restatement of the active-client definition. **This is the anti-dispute component**: a coach who can see the arithmetic before the review lands mostly does not dispute it.
- `src/components/coach/CoachAgreementViewer.jsx` — version list, rendered markdown, `document_sha256` displayed, acceptance/acknowledgement flow with typed full name, and an outstanding-variation banner.

**Tests** (`node --test "test/**/*.test.js"`): `test/coach-rent-engine.test.js`, `test/coach-rent-review.test.js`, `test/coach-statement.test.js`, `test/coach-engagement-admin.test.js` (extending the existing `test/coach-admin.test.js` patterns), `test/coach-portal-scope.test.js`.

## iOS UI

The iOS app is a second full client, not a viewer: `AdminStore.swift` already mirrors nearly every admin surface. Coach rent needs an owner view there and a coach portal.

**Files to extend (all real):**

- `ios/XertFitnessApp/XertFitnessApp/OwnerNavigation.swift` — add `case coachRent` to `XertOwnerWorkspace`, `title` `"Coach Rent"`, `detail` `"Licence agreements, reviews and rent statements"`, and place it in the `.commerce` section alongside `.finance`, `.orders`, `.products`.
- `ios/XertFitnessApp/XertFitnessApp/AdminModels.swift` — add `AdminCoachEngagement`, `AdminCoachRentPlan`, `AdminCoachRentTier`, `AdminCoachRentReview`, `AdminCoachStatement`, and `AdminCoachRentDraft`, following the file's existing convention of `Identifiable, Codable, Hashable` structs with snake_case stored properties matching the Postgres columns and computed camelCase presentation helpers (as `AdminMemberSummary.totalSpent` does with `.formatted(.currency(code: "AUD"))`).
- `ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift` — add `/rest/v1/coach_engagements`, `/rest/v1/coach_rent_plans`, `/rest/v1/coach_rent_plan_tiers`, `/rest/v1/coach_rent_reviews`, `/rest/v1/coach_monthly_statements`, `/rest/v1/coach_clients`, `/rest/v1/coach_client_sessions` reads through the existing `request(baseURL:path:queryItems:)` helper, and the writes through the existing `private func rpc<T:Decodable, Body:Encodable>` at line 1759 (`admin_draft_coach_rent_review`, `admin_issue_coach_rent_review`, `admin_issue_coach_statement`, `coach_book_client_session`, `coach_settle_client_session`, `coach_acknowledge_rent_review`, `coach_dispute_rent_review`, `member_confirm_coach_session`, `current_coach_id`). The invoice call goes to the Vercel function via the existing `AppConfig` API base, same as the checkout path.
- `ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift` — add `@Published private(set) var coachEngagements: [AdminCoachEngagement]`, `coachRentPlan: AdminCoachRentPlan?`, `coachRentReviews: [AdminCoachRentReview]`, `coachStatements: [AdminCoachStatement]`, plus the in-flight markers this file uses everywhere (`draftingReviewCoachID`, `issuingReviewID`, `issuingStatementID`, `invoicingStatementID`) and matching `loadCoachRent(session:)` / `draftCoachRentReview(...)` / `issueCoachRentReview(...)` methods. Fold the new sources into the existing `AdminOperationalQueueState.partial(unavailableSources:)` handling so a missing migration degrades rather than crashes, exactly as `refreshUnavailableSources` does today.
- `ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift` — add `private struct AdminCoachRentView: View` and `private struct AdminCoachRentReviewDetailView: View` following the file's established idiom (`List` with `.listRowBackground(Color.xertInk)`, `.scrollContentBackground(.hidden)`, `.background(Color.xertNavy)`, `.navigationTitle`, `ToolbarItem(placement: .primaryAction)`, `confirmationDialog` for destructive/irreversible actions) and wire the `.coachRent` case into the workspace switch next to the existing `AdminProductsView` / `AdminCoachesView` cases.
- `ios/XertFitnessApp/XertFitnessApp/Views/RootView.swift` and `XertNavigation.swift` — add a `Coach` tab that appears only when `store.coachId != nil`, mirroring how the owner tab is conditionally revealed.
- `ios/XertFitnessApp/XertFitnessApp/Models.swift` — add `CoachStatementSummary`, `CoachClient`, `CoachClientSession`, `CoachRentPosition` for the member/coach-side store.
- `ios/XertFitnessApp/XertFitnessApp/XertFitnessAppTests/ModelsTests.swift` — extend with decoding tests for the new payloads, following the existing file's shape.

**New files:**

- `ios/XertFitnessApp/XertFitnessApp/CoachModels.swift` — coach-scoped models, kept separate from `AdminModels.swift` because a coach build path must never touch admin types.
- `ios/XertFitnessApp/XertFitnessApp/Store/CoachStore.swift` — `@MainActor final class CoachStore: ObservableObject` in the shape of `AdminStore`, holding `currentStatement`, `statements`, `clients`, `upcomingSessions`, `sessionsAwaitingSettlement`, `rentPlan`, `myPosition`, `agreementVersions`, `outstandingVariation`.
- `ios/XertFitnessApp/XertFitnessApp/Views/CoachPortalView.swift` — the coach's tab: a rent-owed hero tile (reusing `AdminMoneyTile`'s visual language), *Sessions to settle* with swipe actions for delivered / no-show / cancelled, *Book a slot*, *My clients*, *Statements* (`NavigationLink` to `CoachStatementDetailView`), *My rent* (the published tier table with the coach's band highlighted), *My agreement*.
- `ios/XertFitnessApp/XertFitnessApp/Views/CoachRentExplainerView.swift` — the tier table and active-client definition, reachable from both the coach portal and the owner's review detail so both parties read literally the same words.
- `ios/XertFitnessApp/XertFitnessApp/XertFitnessAppTests/CoachRentTests.swift` — tier matching, collar, and active-client threshold, asserting the same fixtures as `test/coach-rent-engine.test.js` so the three implementations cannot drift.

Settling a session is the one thing a coach does every day on a phone between clients, so it must be one swipe from the app's first screen with no navigation. Everything else can live two taps deep. Push: reuse the existing `MemberPushRegistration` / `api/apns.js` path to notify a coach when a review is issued and when a statement falls overdue — those are the two moments where silence turns into a dispute.

## Security, privacy and compliance

**Authorisation model (superseded — see Integration constraints).** Role privilege is `profiles.role = 'coach'` per [spec 07](07-staff-accounts-and-roles.md); commercial data stays scoped by `coach_engagements` / `current_coach_id()` / `current_active_coach_id()`. Do **not** keep the pre-07 workaround of leaving coaches as `role = 'member'`. A person can still buy packs and book classes — entitlements remain on `credit_batches` / billing; the role is what they may do as staff. `is_admin()` continues to mean owner only.

**The `public.coaches` column trap.** `create policy "coaches_public_read" on public.coaches for select to anon, authenticated using (published = true)` means **every column of a published coach row is world-readable**. Postgres RLS has no column-level filtering. Putting `user_id`, `abn`, `stripe_customer_id` or any rent figure on `public.coaches` would publish a PT's ABN and Stripe customer id to anonymous internet traffic. This is why `coach_engagements` is a separate table, and it should be called out in code review as a standing rule for that table.

**Coach-visible vs owner-only.** The same "no column-level RLS" fact drives the split:
- A coach sees: their own engagement, the *published* rent plan and full tier table, their own clients and sessions, their own **issued** reviews (including the per-month counts that produced the rate), their own **non-draft** statements, their own agreement versions and acceptance receipts, and a filtered slice of the audit log restricted to lifecycle actions.
- A coach never sees: any other coach's anything (every policy is `coach_id = current_coach_id()`, never `true`); draft reviews (`status in ('issued','acknowledged','disputed','applied')`); draft statements (`status <> 'draft'`); unpublished rent plans (`published_at is not null`); `coach_rent_review_notes` (a **separate admin-only table**, because a note column on the review row would be readable by the coach the moment they can read the row); owner snapshots of drafts in `coach_engagement_events` (the coach policy filters on `action in (…)` to exclude `created`/`updated`).
- Reciprocally, XERT deliberately does **not** collect the coach's client contact details, pricing, or any training/health notes.

**Third-party PII and the Privacy Act.** Non-member PT clients are third parties whose data XERT now holds solely to compute rent. `coach_clients` therefore stores a coach-assigned `client_reference` plus a `display_name` and nothing else — no email, no phone, no date of birth, and explicitly no health information. That is deliberate APP 3 data minimisation, and it keeps XERT out of holding **sensitive information** (health information is sensitive under s6 of the Privacy Act 1988, requiring consent under APP 3.3). Health, injury and goal data stay with the coach, who has the actual relationship and can give the APP 5 notice. Note also that the small-business exemption almost certainly does not save XERT: it does not apply to an entity that provides a health service and holds health information, and a gym offering personal training and physio is very likely caught regardless of turnover — assume XERT is APP-bound. The agreement must contain a data-handling clause making the coach responsible for their own client records and requiring them to notify clients that facility utilisation data is shared with XERT. `api/delete-account.js` must be extended: today it nulls `orders.email` and deletes `private_session_requests`; it must also null `coach_clients.member_user_id` (never delete the row — it is the basis of an issued financial statement) and it must refuse to delete an account with an *active* coach engagement, returning a message directing the coach to end their engagement first.

**Financial-record retention beats erasure.** Statements, invoices and issued reviews are tax records: retain 7 years (ATO), then de-identify rather than delete. `coach_client_sessions` has no delete grant to `authenticated` and its guard trigger raises `COACH_SESSION_IMMUTABLE` on delete. Corrections are voids, and voids are audited.

**Audit trail.** `coach_engagement_events` is append-only (`COACH_ENGAGEMENT_AUDIT_IMMUTABLE`), with before/after JSONB snapshots, actor and actor role, following `admin_content_changes` exactly. Combined with the frozen `monthly_counts` on each review and the frozen `breakdown` on each statement, any rate can be fully re-derived years later without re-querying the session table — which matters because the session table legitimately changes as new sessions are added.

**Money handling.** Stripe secrets never reach the browser: coach-rent collection goes through the shared billing spine (spec 06) behind admin/owner gates, exactly as other commerce admin paths do. Statement and subscription metadata must carry `metadata.xert_*` identity (statement and/or subscription ids) or events are ignored, mirroring `hasXertCheckoutIdentity`. Events flow through the existing `stripe_webhook_events` ledger so retries and duplicates behave identically to pack/membership fulfilment. Settlement RPCs remain `service_role` only.

**Surcharging.** If a coach pays by card, any surcharge must not exceed XERT's actual cost of acceptance for that card type — the RBA surcharging standard and the ACCC's excessive-surcharging prohibition, enforceable with penalties. Default the engagement to BECS Direct Debit with no surcharge; card is opt-in with the percentage disclosed on the invoice line. Do not hard-code a surcharge rate in the schema as a constant — `surcharge_cents` is a per-statement figure computed from the actual acceptance cost.

**GST and invoicing.** A licence to occupy commercial premises is a taxable supply. The invoice must be a compliant tax invoice: XERT's ABN, the words "Tax invoice", GST shown separately. Use a Stripe `tax_rate` object rather than a hand-built line so the PDF is compliant. Note the invoice is XERT's supply, so GST applies based on **XERT's** registration, not the coach's — `coach_engagements.gst_registered` is informational only and must not gate the GST calculation.

---

**EMPLOYMENT-LAW RISK — read this before writing any code.**

The owner's note says *"6 months of employment"*. If that word reflects how the relationship actually runs, this entire design is a well-audited record of a contravention.

1. **Sham contracting.** Fair Work Act 2009 ss357–359 prohibit misrepresenting employment as an independent contract, dismissing an employee to re-engage them as a contractor, and making false statements to induce a contract. Civil penalties are substantial and apply per contravention, on top of back-payment of award entitlements (the Fitness Industry Award 2020 is the relevant instrument), leave, notice and interest.

2. **The written contract is no longer decisive.** The *Closing Loopholes* amendments inserted s15AA into the Fair Work Act (operative 26 August 2024): whether someone is an employee is determined by **the real substance, practical reality and true nature of the relationship**, not by the label in the document. This substantially wound back the primacy the High Court gave to written terms in *Personnel Contracting* and *Jamsek* (2022). A beautifully drafted licence agreement is now necessary but not sufficient. What matters is: does XERT control when and where the coach works? Does XERT set or influence what they charge? Do they wear XERT branding and get introduced as XERT staff? Are they required to work exclusively at XERT? Do they use only XERT equipment? Do they bear commercial risk and stand to profit from their own skill? A tiered rent that scales with the coach's client book is fine; a roster, a uniform, a price list and an exclusivity clause are not.

3. **Superannuation is the exposure people miss.** Superannuation Guarantee (Administration) Act 1992 s12(3): a person engaged under a contract **wholly or principally for their labour** is an employee *for superannuation purposes* even where they are a genuine independent contractor at common law. A solo PT with no employees, no substantial plant and no right of delegation is squarely in the frame. XERT may owe SG (12% from 1 July 2025) regardless of the licence label. The SG charge accrues quarterly, is not tax-deductible, and attracts interest and administrative components. Get advice on this specific point before the first coach signs; a written right of delegation that is genuine and actually exercised is the usual mitigant.

4. **Payroll tax — where the rent model actually helps.** Qld's Payroll Tax Act 1971 contains contractor provisions that deem payments under "relevant contracts" to be taxable wages, with narrow exemptions. The medical-centre line of cases (*Thomas and Naaz*, *The Optical Superstore*) deemed flows to be wages where the principal **collected the client's fees and remitted the balance to the practitioner**. Because XERT charges rent — money flowing coach → XERT — there are no payments to the contractor to deem. **This is a real, defensible commercial advantage of the licence model, and it evaporates the moment XERT processes a PT client's payment.** Hard product constraint: PT client money must never touch XERT's Stripe account, and the coach must never be paid by XERT. That constraint should be written into the engineering standards, not just the contract.

5. **Workers' compensation and insurance.** WorkCover Queensland's "worker" definition can capture people who are contractors at common law. Independently of that, the agreement must require the coach to hold public liability (recommend $20m) and professional indemnity, with certificates uploaded and expiry dates tracked — hence `public_liability_expires_on` and `professional_indemnity_expires_on` on the engagement, with an operations-health check and an access-suspension trigger on lapse. An uninsured PT injuring a client on XERT's floor is XERT's problem regardless of the paperwork.

6. **Never use the word "employment" in this product.** Not in the UI, not in emails, not in the contract, and not in a column name. A field literally called `employment_start_date` is a document that opposing counsel will enjoy reading aloud. The schema above uses `engagement_start_date` for exactly this reason. Use "engagement", "licence period", "commencement date", "licensee".

7. **"Rent for PT prices" — do not set the coach's prices.** The note reads *"gym rent for PT prices might be adjusted"*. If XERT sets, caps, or publishes what PTs may charge their clients, that is (a) one of the strongest employment indicia available, and (b) a genuine competition-law risk — an agreement between independent competing service providers on price can be a cartel provision under the Competition and Consumer Act 2010, with criminal exposure. XERT sets **rent**. The coach sets **their prices**. These must be visibly separate in the contract, the UI and the conversation.

**Action: engage a Queensland employment lawyer to review the engagement template and the SG position before the first coach signs, and budget for the possibility that SG is payable.** This is not a problem engineering can solve, and shipping the collection flow before it is resolved converts a legal question into an evidenced pattern of conduct.

## Rollout

**Phase 0 — legal, before any code ships to production (2–4 weeks, parallel with Phase 1 build).** Engagement template drafted and reviewed by a Qld employment lawyer; SG position under s12(3) resolved in writing; decision recorded that XERT never processes PT client payments. Phases 4 and 5 are hard-blocked on this. Phase 1 is not, because it collects operational data that is useful regardless.

**Phase 1 — the data spine (largest and most urgent).** Migrations `…010000_coach_engagements` and `…030000_coach_client_sessions`. Coach login link, `/coach` portal read-only plus session booking and settlement, client list, PT-request assignment. `class_sessions.coach_id` and `private_session_requests.assigned_coach_id` added and wired into `ClassCalendarAdmin.jsx` and `PTRequestsTable.jsx`. **Backfill:** `class_sessions.coach_name` is free text, so an admin mapping screen in `CoachRentManager.jsx` lists distinct historical `coach_name` values with fuzzy-matched `coaches` candidates for one-click confirmation; unmatched names stay null and never enter a rent calculation. Historical free-text sessions are explicitly **excluded from every measurement window** — a review must never be built on names someone typed. Feature flag `admin_settings.coach_rent_enabled` stays `false`.

*This phase is the critical path and its timeline cannot be compressed: the first review needs six full months of measurement data, so the first rate adjustment lands six months after Phase 1 reaches production, not six months after the project starts. If the owner wants reviews running in Q1 2027, Phase 1 must be live by July 2026.*

**Phase 2 — shadow mode (2 weeks build, then 2 full months of observation).** Migrations `…020000_coach_facility_rent_plans` and `…050000_coach_monthly_statements`. The plan is configured, statements generate monthly as `draft`, and the owner alone reviews them. No coach sees a number, no invoice exists. This is where the data problems surface: coaches who forget to book slots, clients who never confirm, semi-private headcounts that look wrong. **Do not skip this.** Two months of shadow statements is the cheapest possible way to discover that the active-client count is wrong, and the most expensive possible time to discover it is in a dispute.

**Phase 3 — coach visibility and contracts (2 weeks).** Migration `…060000_coach_agreement_versions`. Statements become coach-visible, the rent explainer ships with the published tier table, and every coach accepts v1 of the agreement. Rent is still not collected — coaches see what they *would* owe for a month before they owe anything. This converts the tier table from an announcement into a conversation, and it is where the pricing gets pressure-tested against people who will actually pay it.

**Phase 4 — collection (2 weeks).** `api/coach-rent-invoice.js`, Stripe webhook extension, BECS mandate collection. Flip `coach_rent_enabled` to `true`. Roll out to **one friendly coach for one full month** before the rest, exactly as the session-pack payment activation switch was designed to allow. Note the existing `paymentFulfillmentDeliveryIsHealthy` gate blocks *member* checkout on a delivery outage; coach rent invoicing should have its own independent gate so a rent-invoice problem never stops members buying packs, and vice versa.

**Phase 5 — the review engine (2 weeks, activated ~6 months after Phase 1).** Migration `…040000_coach_rent_reviews`, the review workspace, acknowledgement and dispute flows, and the `apply_due_coach_rent_reviews` scheduled job. Every coach's first review is dry-run against real data and hand-checked by the owner before a single notice is issued.

**Migration/backfill safety.** Every phase adds a `xert_schema_capabilities` marker and a `REQUIRED_SCHEMA_CAPABILITIES` entry, so `OperationsHealth.jsx` shows exactly which migration is missing — the mechanism already in place. All new columns on existing tables are `add column if not exists` with defaults, and all new constraints on existing tables use `not valid`, matching `20260716040000_stripe_order_terms_snapshot.sql`. Nothing in Phases 1–3 can affect member checkout, bookings or credits. A rollback of any phase is `coach_rent_enabled = false` plus hiding the nav entry; the tables stay, because the session records are operationally valuable even if the rent model is abandoned.

**Operational readiness before Phase 4.** A written dunning ladder (day 7 reminder, day 14 second notice, day 21 suspension warning, day 28 access suspension) implemented as `access_suspended_at` on the engagement and enforced at the door and in `current_active_coach_id()`. A coach who will not pay is a debtor holding keys to your building; the agreement needs a suspension-of-access right and the product needs to actually exercise it.

## Open questions for the owner

Each has my recommended default; the engineer should build the default and only change it if the owner overrides.

1. **The actual tier numbers.** *Default:* the table in the recommendation ($260 base; $440/$580/$690/$780/$840 by band). The owner must sanity-check the base against real facility cost per PT-hour — floor space, insurance, cleaning, equipment amortisation, admin — and against what SEQ gyms charge (commonly $100–$250/week for a solo PT). The *shape* (degressive, capped, base + step) matters more than the exact figures and should not change.

2. **Does a semi-private head count as a full client?** *Default: yes, but each head must independently reach two sessions in the month.* Facility load is per body. If the owner wants to encourage semi-private, halve the tier weighting rather than changing the active-client definition — never make the headline definition harder to explain.

3. **Do online or off-site sessions count?** *Default: no.* It is facility rent. Accept that this creates an incentive to shift marginal clients online and accept it consciously — the alternative (charging rent on sessions that do not use your building) is indefensible.

4. **What starts the six-month clock?** *Default: the first delivered in-facility session*, recorded in `coach_engagements.first_delivered_session_on`, not the signing date. A coach who signs in January and starts in March should not be reviewed on a window containing two empty months.

5. **Can rent go down?** *Default: yes — uncollared, applied in full, effective the next month.* A one-way ratchet is the fastest way to lose good coaches through a quiet quarter and the fastest way to make the whole arrangement look like a wage deduction. Symmetry costs little and buys enormous goodwill.

6. **Payment method and surcharge.** *Default: BECS Direct Debit, no surcharge, XERT absorbs the ~$0.30 transaction cost.* Card is opt-in with a surcharge equal to actual cost of acceptance, disclosed as a percentage on the invoice. On a $700 invoice, card acceptance costs XERT $12–15 — over a year across five coaches that is roughly $800, which is real money for no benefit.

7. **Exclusivity.** *Default: no exclusivity clause.* Requiring a coach to train only at XERT is one of the strongest employment indicia available and buys nothing the tier model does not already achieve (a coach with more clients here pays more). Replace it with a narrowly drafted 12-month non-solicitation covering only clients **introduced by XERT**, recorded as such at the time via a flag on `coach_clients`.

8. **Does XERT ever take a percentage of PT revenue?** *Default: never, in any form.* See the payroll-tax reasoning in the security section. This should be treated as an architectural invariant, not a pricing preference.

9. **Who owns the client relationship when a coach leaves?** *Default: the coach owns their own clients outright.* XERT-introduced clients are covered by the non-solicit in (7). Any attempt to claim ownership of a coach's client book is unenforceable in practice and toxic in recruitment.

10. **Does XERT set or cap PT session prices?** *Default: absolutely not.* Employment indicium plus competition-law risk. XERT sets rent; the coach sets prices.

11. **What happens if the owner is late running a review?** *Default: the rate holds over at the previous figure and the delay is flagged in Operations Health — no retrospective catch-up charge.* XERT's administrative delay must never become the coach's bill; that is the single most predictable source of a serious dispute.

12. **Minimum insurance.** *Default: $20m public liability plus professional indemnity, certificates uploaded, expiry tracked, access suspended on lapse.*

13. **Retention and de-identification.** *Default: statements, invoices and issued reviews retained 7 years then de-identified; session records retained for the life of the engagement plus 7 years; `coach_clients` display names replaced with the pseudonymous reference once the relationship has been ended for 12 months.*

14. **Should the coach portal live in the iOS app at launch?** *Default: yes, Phase 1, at least for session settlement.* Settling sessions is a between-clients, on-the-floor action; if it needs a laptop it will not happen, and a rent model built on data that does not get entered is worse than no rent model at all.

