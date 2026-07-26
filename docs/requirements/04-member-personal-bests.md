# Member Personal Bests, owner-curated movement catalogue, estimated-1RM conversion and coach load prescription

**Effort: L**

> Design spec produced during the July 2026 audit, from the owner requirements note.
> Not yet implemented. Reviewed against the schema and code as at commit time.

## Summary

Members get a Personal Bests section on their account (web + iOS) where they log results against an owner-curated catalogue of movements and tests — never free text — covering every PB shape: rep maxes, times, max reps, AMRAP rounds+reps, and distance. The system stores the raw observation and derives an estimated 1RM using Epley, always labelled as an estimate, which then powers the thing that actually earns the owner money: a per-class "load sheet" that turns every booked member's PB into a rounded, loadable barbell weight at a chosen percentage. Every PB carries a verification state; only staff-verified records can ever appear on a leaderboard, and leaderboards ship dark behind an owner switch with explicit opt-in consent because bodyweight and body-composition data on an identifiable member is legally the riskiest thing in this whole feature.

## Recommendation

Build ONE model: a two-level owner-curated catalogue (`pb_movements` → `pb_tests`) plus an append-only `pb_records` table where every result is a new row and "current PB" is always derived, never stored as mutable state.

Why two catalogue levels rather than one: a "Back Squat 5RM" and a "Back Squat 1RM" must share a movement identity, otherwise you cannot convert one into the other and the conversion table is dead on arrival. The movement owns identity, category, whether load applies and the plate increment; the test owns the comparable benchmark (metric kind, rep target, distance, time cap, scoring direction, leaderboard eligibility). Everything downstream — e1RM, leaderboards, load sheets — keys off `pb_tests.metric_kind` + `scoring_direction`, so one code path handles 500 m row, Fran and a 5RM deadlift.

Why append-only with derived bests: the owner explicitly asked for "history and progression over time". An upsert-per-test model destroys exactly that. `distinct on`/`row_number()` over an indexed `rank_value` gives the current best in one query, and progression is free.

Why a single canonical `rank_value`: `sort_value` is the raw comparable number; `rank_value` is `sort_value` for higher-is-better tests and `-sort_value` for lower-is-better (times). One `order by rank_value desc` and one index then serve every metric kind including fastest-500m-row and longest-handstand-hold, which are both `metric_kind='time'` but opposite directions.

Canonical estimated-1RM formula: **Epley**, stored denormalised in `pb_records.estimated_1rm_kg` with `estimated_1rm_formula` recording `'epley'` or `'measured'`. Reasons, not preference:
- All three formulas return exactly `w` at r=1, so a true single is stored as `'measured'` and is NOT an estimate. Epley being linear makes that fall out for free.
- Brzycki has a pole at r=37 (`36/(37−r)` → division by zero) and returns negative loads beyond it. That is a hard crash surface you would have to guard forever. Epley is monotonic and finite for all r.
- Epley and Brzycki agree to within ~4% up to 10 reps and cross exactly at r=10 (both give 133.33 kg from 100 kg). Lombardi under-predicts at low reps (100 kg × 3 → 111.6 vs Epley 110.0) but collapses at high reps.
- Above ~10 reps they diverge materially and the estimate stops being a coaching input. 100 kg × 15 reps: Epley 150.0 kg, Brzycki 163.6 kg, Lombardi 131.1 kg — a 32.5 kg spread on the same lift. Therefore: **`estimated_1rm_kg` is only computed for `rep_target` 1–12; above 12 the rep max is stored and e1RM is NULL**, and the UI shows "Est." plus the source ("Est. 1RM 140 kg — Epley, from 120 kg × 5") everywhere a derived number appears. Brzycki and Lombardi are still computed client-side in `src/lib/personalBests.js` and shown as a comparison spread on the record detail, so the coach can see the uncertainty — but never stored, never ranked on.

Canonical unit: **kilograms**. Australian gym, metric plates, metric events. `load_kg numeric(7,2)` is truth; `entered_unit ∈ ('kg','lb')` is stored purely so the member sees back what they typed instead of "102.06 kg". Conversion is the exact factor 0.45359237, applied server-side in the RPC before insert. Distances in metres, times in seconds to 1/100 (rowing ergs report hundredths).

Who may record: **members self-report; only staff verify.** Every row carries `verification_status ∈ ('self_reported','verified','disputed')`, default `self_reported`. Members see all of their own records; the member's own progression is honest. Leaderboards read `verification_status = 'verified'` only — this is a hard filter in the leaderboard RPC, not a UI badge, which is the only way "unverified PBs poison leaderboards" actually gets solved. Once a record is verified a member can no longer edit it (else the loop is: log → get verified → rewrite the number). Staff logging a PB they watched writes `source='staff'` and is verified on creation.

**Roles (defer to [spec 07](07-staff-accounts-and-roles.md)).** Do not invent a private role model in this feature. Until 07 Phase A lands, verification authority remains `public.is_admin()`, with attribution to a CMS `coaches` row via `verified_coach_id` ("verified by Coach Jess"). After 07, staff/owner verification may use `has_capability` as appropriate; admin-only verification remains acceptable until then. This feature still must not redefine `is_admin()` or widen owner blast radius.

## Data model

Two new migrations, mirroring the repo's dual-file convention (`supabase/migrations/*` plus an `src/supabase/*_upgrade.sql` copy, both asserted by one test).

**File 1 — `supabase/migrations/20260726000000_member_personal_bests.sql`**
(mirror: `src/supabase/member_personal_bests_upgrade.sql`)

```sql
-- Owner-curated movement catalogue, member personal bests, Epley 1RM
-- conversion, staff verification and consent-gated leaderboards.

-- ── pb_movements (owner-curated; never member free text) ────────────────────
create table if not exists public.pb_movements (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 60),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  category text not null check (category in (
    'barbell', 'dumbbell', 'kettlebell', 'gymnastics',
    'monostructural', 'strongman', 'benchmark', 'other')),
  supports_load boolean not null default false,
  load_increment_kg numeric(5,2) not null default 2.5
    check (load_increment_kg > 0 and load_increment_kg <= 25),
  bar_weight_kg numeric(5,2) check (bar_weight_kg is null or bar_weight_kg between 5 and 30),
  coaching_notes text check (coaching_notes is null or char_length(btrim(coaching_notes)) <= 500),
  sort_order integer not null default 0 check (sort_order >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── pb_tests (the comparable benchmark on a movement) ───────────────────────
create table if not exists public.pb_tests (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid not null
    constraint pb_tests_movement_id_fkey references public.pb_movements(id) on delete restrict,
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 80),
  name text not null check (char_length(btrim(name)) between 2 and 100),
  metric_kind text not null
    check (metric_kind in ('load', 'time', 'reps', 'rounds_reps', 'distance')),
  scoring_direction text not null
    check (scoring_direction in ('higher_better', 'lower_better')),
  rep_target integer check (rep_target is null or rep_target between 1 and 30),
  distance_m numeric(8,2) check (distance_m is null or (distance_m > 0 and distance_m <= 100000)),
  duration_seconds integer check (duration_seconds is null or duration_seconds between 10 and 86400),
  reps_per_round integer check (reps_per_round is null or reps_per_round between 1 and 500),
  unit_label text not null default 'reps' check (unit_label in ('reps', 'cal', 'm', 'rounds')),
  time_cap_seconds integer check (time_cap_seconds is null or time_cap_seconds between 10 and 86400),
  prescription_text text
    check (prescription_text is null or char_length(btrim(prescription_text)) <= 300),
  leaderboard_eligible boolean not null default false,
  scaling_required boolean not null default false,
  sort_order integer not null default 0 check (sort_order >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Each metric kind owns exactly the parameters it needs. A malformed test
  -- would silently produce uncomparable member records, so reject it here.
  constraint pb_tests_metric_shape_check check (
    case metric_kind
      when 'load' then rep_target is not null
        and reps_per_round is null and duration_seconds is null
      when 'time' then rep_target is null and reps_per_round is null
      when 'reps' then rep_target is null and reps_per_round is null
        and duration_seconds is null
      when 'rounds_reps' then reps_per_round is not null
        and duration_seconds is not null and rep_target is null
      when 'distance' then duration_seconds is not null
        and rep_target is null and reps_per_round is null
      else false
    end
  ),
  constraint pb_tests_load_direction_check
    check (metric_kind <> 'load' or scoring_direction = 'higher_better')
);
create index if not exists pb_tests_movement_idx
  on public.pb_tests (movement_id, sort_order, id);
create index if not exists pb_tests_active_idx
  on public.pb_tests (active, sort_order, id) where active;

-- ── pb_records (append-only history; current best is always derived) ────────
create table if not exists public.pb_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    constraint pb_records_user_id_fkey references public.profiles(id) on delete cascade,
  test_id uuid not null
    constraint pb_records_test_id_fkey references public.pb_tests(id) on delete restrict,
  request_id uuid,
  achieved_on date not null check (achieved_on >= date '2015-01-01'),

  -- Raw observation. Exactly one shape is populated; pb_derive_record() rejects
  -- any row whose populated shape does not match pb_tests.metric_kind.
  load_kg numeric(7,2) check (load_kg is null or (load_kg > 0 and load_kg <= 500)),
  entered_unit text not null default 'kg' check (entered_unit in ('kg', 'lb')),
  result_seconds numeric(9,2)
    check (result_seconds is null or (result_seconds > 0 and result_seconds <= 86400)),
  result_reps integer check (result_reps is null or (result_reps >= 0 and result_reps <= 100000)),
  result_rounds integer check (result_rounds is null or (result_rounds >= 0 and result_rounds <= 1000)),
  result_distance_m numeric(9,2)
    check (result_distance_m is null or (result_distance_m > 0 and result_distance_m <= 1000000)),
  bodyweight_kg numeric(6,2)
    check (bodyweight_kg is null or (bodyweight_kg >= 20 and bodyweight_kg <= 400)),
  scaling text not null default 'rx' check (scaling in ('rx', 'scaled', 'custom')),
  -- Deliberately NOT a free medical field. See the label in the UI spec.
  context_note text
    check (context_note is null or char_length(btrim(context_note)) between 1 and 200),

  -- Derived. Written only by public.pb_derive_record().
  result_total_reps integer,
  sort_value numeric(12,3),
  rank_value numeric(12,3),
  estimated_1rm_kg numeric(7,2),
  estimated_1rm_formula text
    check (estimated_1rm_formula is null or estimated_1rm_formula in ('measured', 'epley')),
  bodyweight_ratio numeric(6,3),

  -- Verification. Members may never write these; the guard enforces it.
  verification_status text not null default 'self_reported'
    check (verification_status in ('self_reported', 'verified', 'disputed')),
  verified_at timestamptz,
  verified_by uuid
    constraint pb_records_verified_by_fkey references public.profiles(id) on delete set null,
  verified_coach_id uuid
    constraint pb_records_verified_coach_id_fkey references public.coaches(id) on delete set null,
  verification_note text
    check (verification_note is null or char_length(btrim(verification_note)) between 1 and 300),
  source text not null default 'member' check (source in ('member', 'staff')),
  created_by uuid
    constraint pb_records_created_by_fkey references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pb_records_verified_shape_check
    check ((verification_status = 'verified') = (verified_at is not null))
);
-- achieved_on <= current_date is enforced in pb_derive_record(): current_date
-- is STABLE and Postgres rejects it inside a CHECK constraint.

create unique index if not exists pb_records_request_idx
  on public.pb_records (user_id, request_id) where request_id is not null;
create index if not exists pb_records_user_test_idx
  on public.pb_records (user_id, test_id, scaling, rank_value desc, achieved_on desc, id desc);
create index if not exists pb_records_user_recent_idx
  on public.pb_records (user_id, achieved_on desc, id desc);
create index if not exists pb_records_leaderboard_idx
  on public.pb_records (test_id, scaling, rank_value desc, achieved_on, id)
  where verification_status = 'verified';
create index if not exists pb_records_verification_queue_idx
  on public.pb_records (created_at desc, id desc) where verification_status = 'self_reported';

-- ── pb_leaderboard_consents (opt-in, revocable, versioned) ──────────────────
create table if not exists public.pb_leaderboard_consents (
  user_id uuid primary key
    constraint pb_leaderboard_consents_user_id_fkey references public.profiles(id) on delete cascade,
  display_alias text not null check (char_length(btrim(display_alias)) between 2 and 40),
  consent_version text not null default '2026-07-26',
  consented_at timestamptz not null default now(),
  revoked_at timestamptz,
  updated_at timestamptz not null default now()
);
-- There is deliberately no "share my bodyweight" option. Bodyweight and
-- bodyweight_ratio are never selected by public.pb_leaderboard().

-- ── pb_record_changes (immutable audit, mirrors session_booking_changes) ────
create table if not exists public.pb_record_changes (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null,
  test_id uuid,
  member_id uuid references auth.users(id) on delete set null,
  changed_by uuid references auth.users(id) on delete set null,
  actor_role text not null check (actor_role in ('member', 'admin', 'system')),
  action text not null
    check (action in ('logged', 'updated', 'verified', 'disputed', 'unverified', 'deleted')),
  test_label text not null,
  previous_snapshot jsonb,
  new_snapshot jsonb,
  created_at timestamptz not null default now()
);
create index if not exists pb_record_changes_created_idx
  on public.pb_record_changes (created_at desc, id desc);
create index if not exists pb_record_changes_member_idx
  on public.pb_record_changes (member_id, created_at desc, id desc);
create index if not exists pb_record_changes_record_idx
  on public.pb_record_changes (record_id, created_at desc, id desc);

-- ── Row level security ─────────────────────────────────────────────────────
alter table public.pb_movements enable row level security;
alter table public.pb_tests enable row level security;
alter table public.pb_records enable row level security;
alter table public.pb_leaderboard_consents enable row level security;
alter table public.pb_record_changes enable row level security;

revoke all on table public.pb_movements from public, anon, authenticated;
revoke all on table public.pb_tests from public, anon, authenticated;
revoke all on table public.pb_records from public, anon, authenticated;
revoke all on table public.pb_leaderboard_consents from public, anon, authenticated;
revoke all on table public.pb_record_changes from public, anon, authenticated;
grant select on table public.pb_movements to authenticated;
grant select on table public.pb_tests to authenticated;
grant select on table public.pb_records to authenticated;
grant select on table public.pb_leaderboard_consents to authenticated;
grant select on table public.pb_record_changes to authenticated;
-- Every write goes through a SECURITY DEFINER RPC. No INSERT/UPDATE/DELETE is
-- granted to authenticated on any of these tables, so PostgREST cannot bypass
-- the derivation, unit conversion or verification rules.

drop policy if exists "pb_movements_read_active" on public.pb_movements;
create policy "pb_movements_read_active" on public.pb_movements
  for select to authenticated using (active);
drop policy if exists "pb_movements_admin_read" on public.pb_movements;
create policy "pb_movements_admin_read" on public.pb_movements
  for select to authenticated using ((select public.is_admin()));

drop policy if exists "pb_tests_read_active" on public.pb_tests;
create policy "pb_tests_read_active" on public.pb_tests
  for select to authenticated
  using (active and exists (
    select 1 from public.pb_movements movement
    where movement.id = pb_tests.movement_id and movement.active
  ));
drop policy if exists "pb_tests_admin_read" on public.pb_tests;
create policy "pb_tests_admin_read" on public.pb_tests
  for select to authenticated using ((select public.is_admin()));

drop policy if exists "pb_records_read_own" on public.pb_records;
create policy "pb_records_read_own" on public.pb_records
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "pb_records_admin_read" on public.pb_records;
create policy "pb_records_admin_read" on public.pb_records
  for select to authenticated using ((select public.is_admin()));

drop policy if exists "pb_leaderboard_consents_read_own" on public.pb_leaderboard_consents;
create policy "pb_leaderboard_consents_read_own" on public.pb_leaderboard_consents
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "pb_leaderboard_consents_admin_read" on public.pb_leaderboard_consents;
create policy "pb_leaderboard_consents_admin_read" on public.pb_leaderboard_consents
  for select to authenticated using ((select public.is_admin()));

drop policy if exists "pb_record_changes_admin_read" on public.pb_record_changes;
create policy "pb_record_changes_admin_read" on public.pb_record_changes
  for select to authenticated using ((select public.is_admin()));

-- ── updated_at touch (mirrors touch_catalog_record_updated_at) ──────────────
create or replace function public.touch_pb_record_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke execute on function public.touch_pb_record_updated_at() from public, anon, authenticated;

drop trigger if exists pb_movements_touch_updated_at on public.pb_movements;
create trigger pb_movements_touch_updated_at before update on public.pb_movements
  for each row execute function public.touch_pb_record_updated_at();
drop trigger if exists pb_tests_touch_updated_at on public.pb_tests;
create trigger pb_tests_touch_updated_at before update on public.pb_tests
  for each row execute function public.touch_pb_record_updated_at();
drop trigger if exists pb_leaderboard_consents_touch_updated_at on public.pb_leaderboard_consents;
create trigger pb_leaderboard_consents_touch_updated_at
  before update on public.pb_leaderboard_consents
  for each row execute function public.touch_pb_record_updated_at();

-- ── Derivation + integrity guard for every pb_records write ────────────────
create or replace function public.pb_derive_record()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_test public.pb_tests%rowtype;
  v_movement public.pb_movements%rowtype;
  v_value numeric;
begin
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id then raise exception 'PB_OWNER_IMMUTABLE'; end if;
    if new.test_id is distinct from old.test_id then raise exception 'PB_TEST_IMMUTABLE'; end if;
    if not public.is_admin() then
      -- A verified record is evidence. Rewriting it after verification would
      -- let a member launder an unverified number onto the leaderboard.
      if old.verification_status <> 'self_reported' then
        raise exception 'PB_VERIFIED_RECORD_LOCKED';
      end if;
      if new.verification_status is distinct from old.verification_status
         or new.verified_at is distinct from old.verified_at
         or new.verified_by is distinct from old.verified_by
         or new.verified_coach_id is distinct from old.verified_coach_id
         or new.source is distinct from old.source then
        raise exception 'PB_VERIFICATION_MANAGED_BY_STAFF';
      end if;
    end if;
  end if;

  select * into v_test from public.pb_tests where id = new.test_id;
  if not found then raise exception 'PB_TEST_NOT_FOUND'; end if;
  if not v_test.active then raise exception 'PB_TEST_INACTIVE'; end if;
  select * into v_movement from public.pb_movements where id = v_test.movement_id;
  if not found or not v_movement.active then raise exception 'PB_MOVEMENT_INACTIVE'; end if;
  if new.achieved_on > current_date then raise exception 'PB_ACHIEVED_ON_FUTURE'; end if;
  if not v_test.scaling_required then new.scaling := 'rx'; end if;

  if v_test.metric_kind = 'load' then
    if new.load_kg is null or new.result_seconds is not null or new.result_reps is not null
       or new.result_rounds is not null or new.result_distance_m is not null then
      raise exception 'PB_RESULT_SHAPE_INVALID';
    end if;
    v_value := new.load_kg;
  elsif v_test.metric_kind = 'time' then
    if new.result_seconds is null or new.load_kg is not null or new.result_reps is not null
       or new.result_rounds is not null or new.result_distance_m is not null then
      raise exception 'PB_RESULT_SHAPE_INVALID';
    end if;
    if v_test.time_cap_seconds is not null and new.result_seconds > v_test.time_cap_seconds then
      raise exception 'PB_TIME_CAP_EXCEEDED';
    end if;
    v_value := new.result_seconds;
  elsif v_test.metric_kind = 'reps' then
    if new.result_reps is null or new.load_kg is not null or new.result_seconds is not null
       or new.result_rounds is not null or new.result_distance_m is not null then
      raise exception 'PB_RESULT_SHAPE_INVALID';
    end if;
    v_value := new.result_reps;
  elsif v_test.metric_kind = 'rounds_reps' then
    if new.result_rounds is null or new.result_reps is null or new.load_kg is not null
       or new.result_seconds is not null or new.result_distance_m is not null then
      raise exception 'PB_RESULT_SHAPE_INVALID';
    end if;
    -- A partial round can never equal or exceed a full round, or the total-rep
    -- ordering that ranks AMRAP scores becomes ambiguous.
    if new.result_reps >= v_test.reps_per_round then raise exception 'PB_PARTIAL_ROUND_INVALID'; end if;
    new.result_total_reps := new.result_rounds * v_test.reps_per_round + new.result_reps;
    v_value := new.result_total_reps;
  else
    if new.result_distance_m is null or new.load_kg is not null or new.result_seconds is not null
       or new.result_reps is not null or new.result_rounds is not null then
      raise exception 'PB_RESULT_SHAPE_INVALID';
    end if;
    v_value := new.result_distance_m;
  end if;
  if v_test.metric_kind <> 'rounds_reps' then new.result_total_reps := null; end if;

  new.sort_value := round(v_value, 3);
  new.rank_value := case when v_test.scoring_direction = 'lower_better'
                         then -round(v_value, 3) else round(v_value, 3) end;

  -- Epley: 1RM = w * (1 + r / 30). Every published formula (Epley, Brzycki
  -- 36/(37-r), Lombardi r^0.10) returns exactly w at one rep, so a true single
  -- is stored as measured and is never presented as an estimate. Above twelve
  -- reps the formulas diverge materially (100 kg x 15: Epley 150.0, Brzycki
  -- 163.6, Lombardi 131.1) so no canonical estimate is stored at all.
  if v_test.metric_kind = 'load' and v_movement.supports_load
     and v_test.rep_target between 1 and 12 then
    if v_test.rep_target = 1 then
      new.estimated_1rm_kg := new.load_kg;
      new.estimated_1rm_formula := 'measured';
    else
      new.estimated_1rm_kg := round(new.load_kg * (1 + v_test.rep_target::numeric / 30), 2);
      new.estimated_1rm_formula := 'epley';
    end if;
  else
    new.estimated_1rm_kg := null;
    new.estimated_1rm_formula := null;
  end if;

  if new.bodyweight_kg is not null and v_test.metric_kind = 'load' and new.load_kg is not null then
    new.bodyweight_ratio := round(new.load_kg / new.bodyweight_kg, 3);
  else
    new.bodyweight_ratio := null;
  end if;

  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke execute on function public.pb_derive_record() from public, anon, authenticated;
drop trigger if exists pb_records_derive on public.pb_records;
create trigger pb_records_derive before insert or update on public.pb_records
  for each row execute function public.pb_derive_record();

-- ── Immutable audit ────────────────────────────────────────────────────────
create or replace function public.guard_pb_record_change()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'PB_AUDIT_IMMUTABLE';
end;
$$;
drop trigger if exists pb_record_changes_immutable on public.pb_record_changes;
create trigger pb_record_changes_immutable
  before update or delete on public.pb_record_changes
  for each row execute function public.guard_pb_record_change();

create or replace function public.audit_pb_record_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_previous jsonb;
  v_new jsonb;
  v_record jsonb;
  v_action text;
  v_label text;
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new); v_record := v_new; v_action := 'logged';
  elsif tg_op = 'DELETE' then
    v_previous := to_jsonb(old); v_record := v_previous; v_action := 'deleted';
  else
    v_previous := to_jsonb(old); v_new := to_jsonb(new);
    if (v_previous - 'updated_at') = (v_new - 'updated_at') then return new; end if;
    v_record := v_new;
    v_action := case
      when old.verification_status is distinct from new.verification_status
        and new.verification_status = 'verified' then 'verified'
      when old.verification_status is distinct from new.verification_status
        and new.verification_status = 'disputed' then 'disputed'
      when old.verification_status is distinct from new.verification_status
        and new.verification_status = 'self_reported' then 'unverified'
      else 'updated'
    end;
  end if;

  select coalesce(nullif(btrim(test.name), ''), 'Personal best test') into v_label
    from public.pb_tests test where test.id = nullif(v_record ->> 'test_id', '')::uuid;
  v_label := coalesce(v_label, 'Personal best test');

  insert into public.pb_record_changes (
    record_id, test_id, member_id, changed_by, actor_role, action,
    test_label, previous_snapshot, new_snapshot
  ) values (
    nullif(v_record ->> 'id', '')::uuid,
    nullif(v_record ->> 'test_id', '')::uuid,
    nullif(v_record ->> 'user_id', '')::uuid,
    auth.uid(),
    case when auth.uid() is null then 'system'
         when public.is_admin() then 'admin' else 'member' end,
    v_action, v_label, v_previous, v_new
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke execute on function public.guard_pb_record_change() from public, anon, authenticated;
revoke execute on function public.audit_pb_record_change() from public, anon, authenticated;
drop trigger if exists pb_records_audit_lifecycle on public.pb_records;
create trigger pb_records_audit_lifecycle
  after insert or update or delete on public.pb_records
  for each row execute function public.audit_pb_record_change();

-- ── Catalogue edits reuse the existing admin content audit ──────────────────
alter table public.admin_content_changes
  drop constraint if exists admin_content_changes_resource_type_check;
alter table public.admin_content_changes
  add constraint admin_content_changes_resource_type_check
  check (resource_type in ('site_content', 'coach', 'event', 'product',
                           'launch_settings', 'pb_movement', 'pb_test'));
-- Re-issue public.audit_admin_content_change() verbatim from
-- supabase/migrations/20260714013000_content_change_audit.sql with two extra
-- branches in each CASE:
--   v_resource_type: when 'pb_movements' then 'pb_movement'
--                    when 'pb_tests' then 'pb_test'
--   v_subject_label: when 'pb_movement' then coalesce(nullif(trim(v_record ->> 'name'), ''), 'Movement')
--                    when 'pb_test' then coalesce(nullif(trim(v_record ->> 'name'), ''), 'PB test')
drop trigger if exists pb_movements_audit_admin_change on public.pb_movements;
create trigger pb_movements_audit_admin_change
  after insert or update or delete on public.pb_movements
  for each row execute function public.audit_admin_content_change();
drop trigger if exists pb_tests_audit_admin_change on public.pb_tests;
create trigger pb_tests_audit_admin_change
  after insert or update or delete on public.pb_tests
  for each row execute function public.audit_admin_content_change();

-- ── Owner switch for leaderboards (mirrors payments_enabled) ────────────────
alter table public.admin_settings
  add column if not exists pb_leaderboards_enabled boolean not null default false;
comment on column public.admin_settings.pb_leaderboards_enabled is
  'Owner-controlled switch for consent-gated, verified-only personal best leaderboards.';

insert into public.xert_schema_capabilities (capability)
values ('member_personal_bests')
on conflict (capability) do nothing;
```

**File 2 — `supabase/migrations/20260726001000_personal_best_catalogue_seed.sql`**
(mirror: `src/supabase/personal_best_catalogue_seed.sql`)

```sql
insert into public.pb_movements (slug, name, category, supports_load, load_increment_kg, bar_weight_kg, sort_order) values
  ('back-squat','Back Squat','barbell',true,2.5,20,10),
  ('front-squat','Front Squat','barbell',true,2.5,20,20),
  ('overhead-squat','Overhead Squat','barbell',true,2.5,20,30),
  ('deadlift','Deadlift','barbell',true,2.5,20,40),
  ('bench-press','Bench Press','barbell',true,2.5,20,50),
  ('strict-press','Strict Press','barbell',true,2.5,20,60),
  ('push-press','Push Press','barbell',true,2.5,20,70),
  ('power-clean','Power Clean','barbell',true,2.5,20,80),
  ('squat-clean','Squat Clean','barbell',true,2.5,20,90),
  ('power-snatch','Power Snatch','barbell',true,2.5,20,100),
  ('squat-snatch','Squat Snatch','barbell',true,2.5,20,110),
  ('clean-and-jerk','Clean & Jerk','barbell',true,2.5,20,120),
  ('thruster','Thruster','barbell',true,2.5,20,130),
  ('weighted-pull-up','Weighted Pull-up','gymnastics',true,1.25,null,140),
  ('strict-pull-up','Strict Pull-up','gymnastics',false,2.5,null,150),
  ('strict-handstand-push-up','Strict Handstand Push-up','gymnastics',false,2.5,null,160),
  ('ring-muscle-up','Ring Muscle-up','gymnastics',false,2.5,null,170),
  ('double-under','Double-under','gymnastics',false,2.5,null,180),
  ('toes-to-bar','Toes-to-Bar','gymnastics',false,2.5,null,190),
  ('handstand-hold','Handstand Hold','gymnastics',false,2.5,null,200),
  ('row-erg','Rowing Erg','monostructural',false,2.5,null,210),
  ('ski-erg','SkiErg','monostructural',false,2.5,null,220),
  ('air-bike','Air Bike','monostructural',false,2.5,null,230),
  ('run','Run','monostructural',false,2.5,null,240),
  ('farmers-carry','Farmer''s Carry','strongman',false,4,null,250),
  ('sled-push','Sled Push','strongman',true,5,null,260),
  ('fran','Fran','benchmark',false,2.5,null,300),
  ('grace','Grace','benchmark',false,2.5,null,310),
  ('helen','Helen','benchmark',false,2.5,null,320),
  ('karen','Karen','benchmark',false,2.5,null,330),
  ('cindy','Cindy','benchmark',false,2.5,null,340),
  ('murph','Murph','benchmark',false,2.5,null,350),
  ('hyrox-simulation','HYROX Simulation','benchmark',false,2.5,null,360)
on conflict (slug) do nothing;

insert into public.pb_tests (
  movement_id, slug, name, metric_kind, scoring_direction, rep_target, distance_m,
  duration_seconds, reps_per_round, unit_label, time_cap_seconds, prescription_text,
  leaderboard_eligible, scaling_required, sort_order)
select movement.id, seed.slug, seed.name, seed.metric_kind, seed.scoring_direction,
       seed.rep_target, seed.distance_m, seed.duration_seconds, seed.reps_per_round,
       seed.unit_label, seed.time_cap_seconds, seed.prescription_text,
       seed.leaderboard_eligible, seed.scaling_required, seed.sort_order
from (values
  -- movement_slug, slug, name, kind, direction, reps, dist, dur, rpr, unit, cap, prescription, lb, scaling, order
  ('back-squat','back-squat-1rm','Back Squat 1RM','load','higher_better',1,null::numeric,null::int,null::int,'reps',null::int,null::text,true,false,10),
  ('back-squat','back-squat-3rm','Back Squat 3RM','load','higher_better',3,null,null,null,'reps',null,null,false,false,11),
  ('back-squat','back-squat-5rm','Back Squat 5RM','load','higher_better',5,null,null,null,'reps',null,null,false,false,12),
  ('back-squat','back-squat-10rm','Back Squat 10RM','load','higher_better',10,null,null,null,'reps',null,null,false,false,13),
  ('front-squat','front-squat-1rm','Front Squat 1RM','load','higher_better',1,null,null,null,'reps',null,null,true,false,20),
  ('front-squat','front-squat-5rm','Front Squat 5RM','load','higher_better',5,null,null,null,'reps',null,null,false,false,21),
  ('overhead-squat','overhead-squat-1rm','Overhead Squat 1RM','load','higher_better',1,null,null,null,'reps',null,null,true,false,30),
  ('deadlift','deadlift-1rm','Deadlift 1RM','load','higher_better',1,null,null,null,'reps',null,null,true,false,40),
  ('deadlift','deadlift-3rm','Deadlift 3RM','load','higher_better',3,null,null,null,'reps',null,null,false,false,41),
  ('deadlift','deadlift-5rm','Deadlift 5RM','load','higher_better',5,null,null,null,'reps',null,null,false,false,42),
  ('bench-press','bench-press-1rm','Bench Press 1RM','load','higher_better',1,null,null,null,'reps',null,null,true,false,50),
  ('bench-press','bench-press-5rm','Bench Press 5RM','load','higher_better',5,null,null,null,'reps',null,null,false,false,51),
  ('strict-press','strict-press-1rm','Strict Press 1RM','load','higher_better',1,null,null,null,'reps',null,null,true,false,60),
  ('strict-press','strict-press-5rm','Strict Press 5RM','load','higher_better',5,null,null,null,'reps',null,null,false,false,61),
  ('push-press','push-press-1rm','Push Press 1RM','load','higher_better',1,null,null,null,'reps',null,null,false,false,70),
  ('power-clean','power-clean-1rm','Power Clean 1RM','load','higher_better',1,null,null,null,'reps',null,null,true,false,80),
  ('squat-clean','squat-clean-1rm','Squat Clean 1RM','load','higher_better',1,null,null,null,'reps',null,null,true,false,90),
  ('power-snatch','power-snatch-1rm','Power Snatch 1RM','load','higher_better',1,null,null,null,'reps',null,null,true,false,100),
  ('squat-snatch','squat-snatch-1rm','Squat Snatch 1RM','load','higher_better',1,null,null,null,'reps',null,null,true,false,110),
  ('clean-and-jerk','clean-and-jerk-1rm','Clean & Jerk 1RM','load','higher_better',1,null,null,null,'reps',null,null,true,false,120),
  ('thruster','thruster-1rm','Thruster 1RM','load','higher_better',1,null,null,null,'reps',null,null,false,false,130),
  ('weighted-pull-up','weighted-pull-up-1rm','Weighted Pull-up 1RM (added load)','load','higher_better',1,null,null,null,'reps',null,'Added load only, not bodyweight.',true,false,140),
  ('strict-pull-up','max-strict-pull-ups','Max Strict Pull-ups','reps','higher_better',null,null,null,null,'reps',null,'Unbroken, no kip.',true,false,150),
  ('strict-handstand-push-up','max-strict-hspu','Max Strict Handstand Push-ups','reps','higher_better',null,null,null,null,'reps',null,null,true,false,160),
  ('ring-muscle-up','max-ring-muscle-ups','Max Unbroken Ring Muscle-ups','reps','higher_better',null,null,null,null,'reps',null,null,true,false,170),
  ('double-under','max-unbroken-double-unders','Max Unbroken Double-unders','reps','higher_better',null,null,null,null,'reps',null,null,true,false,180),
  ('toes-to-bar','max-toes-to-bar','Max Unbroken Toes-to-Bar','reps','higher_better',null,null,null,null,'reps',null,null,false,false,190),
  ('handstand-hold','longest-handstand-hold','Longest Handstand Hold','time','higher_better',null,null,null,null,'reps',null,'Free-standing.',true,false,200),
  ('row-erg','row-500m','500 m Row','time','lower_better',null,500,null,null,'reps',null,null,true,false,210),
  ('row-erg','row-1000m','1000 m Row','time','lower_better',null,1000,null,null,'reps',null,null,true,false,211),
  ('row-erg','row-2000m','2000 m Row','time','lower_better',null,2000,null,null,'reps',null,null,true,false,212),
  ('row-erg','row-max-metres-4min','Max Metres Row (4 min)','distance','higher_better',null,null,240,null,'m',null,null,false,false,213),
  ('ski-erg','ski-500m','500 m SkiErg','time','lower_better',null,500,null,null,'reps',null,null,true,false,220),
  ('ski-erg','ski-1000m','1000 m SkiErg','time','lower_better',null,1000,null,null,'reps',null,null,true,false,221),
  ('air-bike','bike-max-cal-60s','Max Calories Air Bike (60 s)','reps','higher_better',null,null,null,null,'cal',null,null,true,false,230),
  ('run','run-400m','400 m Run','time','lower_better',null,400,null,null,'reps',null,null,true,false,240),
  ('run','run-1km','1 km Run','time','lower_better',null,1000,null,null,'reps',null,null,true,false,241),
  ('run','run-2km','2 km Run','time','lower_better',null,2000,null,null,'reps',null,null,true,false,242),
  ('run','run-5km','5 km Run','time','lower_better',null,5000,null,null,'reps',null,null,true,false,243),
  ('run','run-10km','10 km Run','time','lower_better',null,10000,null,null,'reps',null,null,false,false,244),
  ('farmers-carry','farmers-carry-100m','Farmer''s Carry 100 m','time','lower_better',null,100,null,null,'reps',600,'32/24 kg per hand.',false,true,250),
  ('sled-push','sled-push-20m-max','Sled Push 20 m Max Load','load','higher_better',1,null,null,null,'reps',null,'Total sled load including sled.',false,false,260),
  ('fran','fran-time','Fran','time','lower_better',null,null,null,null,'reps',1800,'21-15-9 thruster 43/30 kg, pull-up.',true,true,300),
  ('grace','grace-time','Grace','time','lower_better',null,null,null,null,'reps',1800,'30 clean & jerk 61/43 kg.',true,true,310),
  ('helen','helen-time','Helen','time','lower_better',null,null,null,null,'reps',2400,'3 rounds: 400 m run, 21 KB swing 24/16 kg, 12 pull-ups.',true,true,320),
  ('karen','karen-time','Karen','time','lower_better',null,null,null,null,'reps',2400,'150 wall balls 9/6 kg.',true,true,330),
  ('cindy','cindy-rounds','Cindy (20 min AMRAP)','rounds_reps','higher_better',null,null,1200,30,'rounds',null,'5 pull-ups, 10 push-ups, 15 air squats.',true,true,340),
  ('murph','murph-time','Murph','time','lower_better',null,null,null,null,'reps',7200,'1 mile run, 100 pull-ups, 200 push-ups, 300 squats, 1 mile run.',true,true,350),
  ('hyrox-simulation','hyrox-sim-time','HYROX Simulation','time','lower_better',null,null,null,null,'reps',14400,'8 x 1 km run plus 8 stations.',true,true,360)
) as seed(movement_slug, slug, name, metric_kind, scoring_direction, rep_target, distance_m,
          duration_seconds, reps_per_round, unit_label, time_cap_seconds, prescription_text,
          leaderboard_eligible, scaling_required, sort_order)
join public.pb_movements movement on movement.slug = seed.movement_slug
on conflict (slug) do nothing;

insert into public.xert_schema_capabilities (capability)
values ('personal_best_catalogue_seed')
on conflict (capability) do nothing;
```

## Backend

All writes are Postgres RPCs in the same migration, following the repo's `security definer set search_path = public, pg_temp` + `revoke ... from public, anon` + `grant ... to authenticated` pattern. No new Vercel function is needed — this feature has no third-party integration.

**Member RPCs**

```sql
create or replace function public.log_my_personal_best(
  p_test_id uuid, p_achieved_on date, p_unit text default 'kg',
  p_load numeric default null, p_result_seconds numeric default null,
  p_result_reps integer default null, p_result_rounds integer default null,
  p_result_distance_m numeric default null, p_bodyweight numeric default null,
  p_scaling text default 'rx', p_context_note text default null,
  p_request_id uuid default null
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_unit text := lower(btrim(coalesce(p_unit, 'kg')));
  v_factor numeric := case when v_unit = 'lb' then 0.45359237 else 1 end;
  v_existing uuid;
  v_id uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_unit not in ('kg', 'lb') then raise exception 'PB_UNIT_INVALID'; end if;
  if p_test_id is null or p_achieved_on is null then raise exception 'PB_TEST_REQUIRED'; end if;
  if p_request_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
    select id into v_existing from public.pb_records
      where user_id = v_user and request_id = p_request_id;
    if found then return v_existing; end if;
  end if;

  insert into public.pb_records (
    user_id, test_id, request_id, achieved_on, entered_unit,
    load_kg, result_seconds, result_reps, result_rounds, result_distance_m,
    bodyweight_kg, scaling, context_note, source, created_by
  ) values (
    v_user, p_test_id, p_request_id, p_achieved_on, v_unit,
    case when p_load is null then null else round(p_load * v_factor, 2) end,
    p_result_seconds, p_result_reps, p_result_rounds, p_result_distance_m,
    case when p_bodyweight is null then null else round(p_bodyweight * v_factor, 2) end,
    lower(btrim(coalesce(p_scaling, 'rx'))),
    nullif(btrim(coalesce(p_context_note, '')), ''), 'member', v_user
  ) returning id into v_id;
  return v_id;
end; $$;
```

- `public.my_personal_bests()` — `security definer stable`, returns one row per `(test, scaling)` the member has logged: current best joined to `pb_tests`/`pb_movements`, the second-best row as `previous_sort_value` / `previous_achieved_on` for the delta chip, `record_count`, `verification_status`, `verified_at`, and `coaches.name` as `verified_coach_name`. Implemented as a CTE with `row_number() over (partition by test_id, scaling order by rank_value desc, achieved_on desc, id desc)`, self-joined at `position = 2`, filtered `where user_id = auth.uid() and verification_status <> 'disputed'`, ordered `m.category, m.sort_order, t.sort_order`.
- `public.my_personal_best_history(p_test_id uuid)` — every row for that test ordered `achieved_on asc, id asc`, `limit 200`, for the progression chart.
- `public.update_my_personal_best(p_record_id uuid, ...same result params..., p_expected_updated_at timestamptz)` and `public.delete_my_personal_best(p_record_id uuid, p_expected_updated_at timestamptz)` — both `where user_id = auth.uid()`, both raise `PB_RECORD_STALE` on version mismatch; the derive trigger raises `PB_VERIFIED_RECORD_LOCKED` if the record has already been verified.
- `public.set_my_leaderboard_consent(p_opted_in boolean, p_display_alias text)` — upserts `pb_leaderboard_consents`, setting `revoked_at = now()` on opt-out (never deleting, so consent history survives an audit request). Alias must not contain '@' (`raise exception 'PB_ALIAS_INVALID'`) so an email cannot be smuggled onto a public board.
- `public.pb_leaderboard(p_test_id uuid, p_scaling text default 'rx', p_limit integer default 25)` — returns `position, display_alias, sort_value, achieved_on, is_me`. Guards, in order: `auth.uid() is not null`; `(select pb_leaderboards_enabled from public.admin_settings limit 1)` is true else `raise exception 'PB_LEADERBOARDS_DISABLED'`; test is `active and leaderboard_eligible`. Body joins `pb_records` (`verification_status = 'verified'`) to `pb_leaderboard_consents` (`revoked_at is null`), takes `distinct on (user_id)` best per member, orders `rank_value desc, achieved_on asc`, `limit least(coalesce(p_limit,25), 100)`. **It selects no name, no email, no bodyweight and no bodyweight_ratio — those columns are not in the return signature at all.**

**Staff RPCs**

- `public.admin_upsert_pb_movement(p_movement_id uuid, p_movement jsonb, p_expected_updated_at timestamptz)` and `public.admin_upsert_pb_test(p_test_id uuid, p_test jsonb, p_expected_updated_at timestamptz)` — modelled directly on `admin_update_product` in `supabase/migrations/20260714020000_catalog_optimistic_locking.sql`: `is_admin()` gate, `jsonb_to_record`, full payload validation, `select ... for update`, `if updated_at is distinct from p_expected_updated_at then raise exception 'PB_MOVEMENT_STALE' / 'PB_TEST_STALE'`. `p_*_id null` means insert. Additional guard: a test's `metric_kind` may not change once any `pb_records` row references it (`raise exception 'PB_TEST_HAS_RECORDS'`) — otherwise every historical record silently becomes garbage.
- `public.admin_pending_personal_bests(p_limit integer default 25)` — the verification queue: self-reported records newest first with member name/email, test name, formatted value and whether it would be a club best. Feeds both the Owner Command Centre and `AdminOverview`.
- `public.admin_verify_personal_best(p_record_id uuid, p_status text, p_coach_id uuid, p_note text, p_expected_updated_at timestamptz)` — `is_admin()` gate; `p_status in ('verified','disputed','self_reported')`; requires `p_coach_id` to exist in `public.coaches` when verifying; sets `verified_at/verified_by/verified_coach_id/verification_note`; clears them when reverting; `PB_RECORD_STALE` on version mismatch.
- `public.admin_log_personal_best_for_member(p_user_id uuid, ...same result params..., p_coach_id uuid, p_request_id uuid)` — coach logs a lift they watched: `source='staff'`, `verification_status='verified'`, `verified_at=now()`, `verified_by=auth.uid()`, `created_by=auth.uid()`.
- `public.admin_member_personal_bests(p_user_id uuid)` — same shape as `my_personal_bests()` for one member, for the `MembersManager` drawer and PT prep.
- **`public.admin_class_load_sheet(p_class_session_id uuid, p_test_id uuid, p_percent numeric)`** — the commercially valuable one:

```sql
returns table (
  booking_id uuid, member_id uuid, full_name text, booking_status text,
  best_record_id uuid, best_load_kg numeric, best_rep_target integer,
  reference_1rm_kg numeric, estimate_formula text, is_estimated boolean,
  prescribed_kg numeric, rounded_kg numeric, achieved_on date,
  weeks_since_pb integer, is_stale boolean, verification_status text
)
```
Guards `is_admin()`, `p_percent between 30 and 110` else `PB_PERCENT_OUT_OF_RANGE`, and requires the test's movement to have `supports_load = true` else `PB_TEST_NOT_LOADABLE`. Joins `session_bookings` (`status in ('confirmed','attended')`) for the session → `profiles` → lateral best `pb_records` for that member on any test whose movement matches the requested test's movement and whose `estimated_1rm_kg is not null`, ordered `estimated_1rm_kg desc`. Then `prescribed_kg = round(reference_1rm_kg * p_percent / 100, 2)` and
`rounded_kg = greatest(coalesce(movement.bar_weight_kg, 0), coalesce(movement.bar_weight_kg,0) + round((prescribed_kg - coalesce(movement.bar_weight_kg,0)) / movement.load_increment_kg) * movement.load_increment_kg)`
so the coach gets a weight that can actually be loaded on an Australian plate set. `weeks_since_pb = floor((current_date - achieved_on) / 7)`, `is_stale = weeks_since_pb > 12`. Members with no PB are returned with nulls so the coach sees who to test rather than silently dropping them.
- `public.admin_member_load_prescription(p_user_id uuid, p_test_id uuid, p_percent numeric)` — the single-member version for PT sessions, same rounding.

Every function ends with the repo's grant block, e.g.
`revoke execute on function public.admin_class_load_sheet(uuid, uuid, numeric) from public, anon;`
`grant execute on function public.admin_class_load_sheet(uuid, uuid, numeric) to authenticated;`

**Existing serverless code that must change**

`api/delete-account.js` — `deleteMemberAccount()` currently nulls `orders.email` and deletes `private_session_requests` before `admin.auth.admin.deleteUser`. `pb_records` and `pb_leaderboard_consents` cascade away automatically via `profiles → auth.users`, but **`pb_record_changes` does not**: it keeps `previous_snapshot`/`new_snapshot` JSONB containing the member's bodyweight after they asked to be deleted. Add, before `deleteUser`:
```js
const { error: pbAuditError } = await admin
  .from('pb_record_changes')
  .update({ previous_snapshot: null, new_snapshot: null })
  .eq('member_id', userId);
if (pbAuditError && !isMissingPTTrackingColumn(pbAuditError)) throw pbAuditError;
```
(the `pb_record_changes` immutability trigger must therefore allow the `service_role` path — add `if current_setting('request.jwt.claim.role', true) = 'service_role' then return new; end if;` to `guard_pb_record_change()` for UPDATE only, or drop the two snapshot columns to null via a dedicated `security definer` function granted to `service_role`, matching how `reconcile_stripe_order_refund` is granted. Prefer the dedicated function: `public.purge_member_pb_audit_snapshots(p_user_id uuid)`, `grant execute ... to service_role`.)

This exact gap already exists for `session_booking_changes`; flag it to the owner as pre-existing, but do not replicate it here.

## Web UI

**New pure logic — `src/lib/personalBests.js`** (no Supabase import; unit-tested like `src/lib/creditExpiry.js` and `src/lib/bookingCancellation.js`)

```js
export const LB_TO_KG = 0.45359237;
export const E1RM_MAX_REPS = 12;
export const STALE_PB_WEEKS = 12;

export const epley1RM     = (kg, reps) => kg * (1 + reps / 30);
export const brzycki1RM   = (kg, reps) => (reps >= 37 ? null : kg * 36 / (37 - reps));
export const lombardi1RM  = (kg, reps) => kg * Math.pow(reps, 0.10);

export const PERCENT_OF_1RM = Object.freeze([
  { reps: 1, percent: 100 }, { reps: 2, percent: 95 }, { reps: 3, percent: 93 },
  { reps: 4, percent: 90 },  { reps: 5, percent: 87 }, { reps: 6, percent: 85 },
  { reps: 7, percent: 83 },  { reps: 8, percent: 80 }, { reps: 9, percent: 77 },
  { reps: 10, percent: 75 }, { reps: 12, percent: 70 }, { reps: 15, percent: 65 },
]);

export const INTENSITY_BANDS = Object.freeze([
  { label: 'Technique & volume', min: 60, max: 75 },
  { label: 'Strength',           min: 75, max: 85 },
  { label: 'Heavy strength',     min: 85, max: 95 },
  { label: 'Max / testing',      min: 95, max: 100 },
]);
```
plus `kgToLb`, `lbToKg`, `roundToLoadable(kg, incrementKg, barKg)`, `estimateSpread(kg, reps)` returning `{ epley, brzycki, lombardi, spreadKg, diverges: reps > 10 }`, `formatPbValue(record, test)` (time as `m:ss.SS`, rounds as `5 + 12`, load as `120 kg (265 lb)`), `pbDelta(current, previous, direction)`, and `isStalePb(achievedOn, now)`.

**New network layer — `src/lib/personalBestData.js`** (mirrors `src/lib/bookingData.js`): `getPbCatalogue()` (`supabase.from('pb_tests').select('*, pb_movements(*)').eq('active', true).order('sort_order')`), `getMyPersonalBests()`, `getMyPersonalBestHistory(testId)`, `logPersonalBest(draft)`, `updateMyPersonalBest`, `deleteMyPersonalBest`, `setMyLeaderboardConsent`, `getPbLeaderboard(testId, scaling)`. Each maps raw Postgres error codes to member-readable copy through a `PB_ERRORS` map exactly like `BOOKING_ERRORS`/`friendlyBookingError` in `bookingData.js` (`PB_VERIFIED_RECORD_LOCKED` → "Verified records can only be changed by a coach.", `PB_ACHIEVED_ON_FUTURE` → "Pick a date on or before today.", `PB_PARTIAL_ROUND_INVALID` → "Partial reps must be fewer than one full round.").

**New member components — `src/components/account/` (new directory)**
- `PersonalBestsPanel.jsx` — the section body. Groups current bests by `pb_movements.category` using the existing `cardStyle` object and `font-display uppercase` / `font-body` idiom from `Account.jsx`. Each row: test name, formatted value, a delta chip vs previous best, `achieved_on`, and a verification pill (`Verified · Coach Jess` in `#7BA7BC`, `Self-reported` in muted `rgba(209,221,230,0.5)`, `Needs review` in `#e0b36a`). Loadable lifts show a second line `Est. 1RM 140 kg — Epley, from 120 kg × 5` where `Est.` is a `<button>` opening the estimate detail. Expanding a row reveals `PersonalBestHistoryList.jsx`.
- `LogPersonalBestDialog.jsx` — the log form. Category select → movement select → test select, all from the catalogue, **no free text for the movement**. The result field set is driven entirely by `test.metric_kind`: `load` → weight input + kg/lb toggle; `time` → mm:ss.SS masked input; `reps` → integer input labelled with `test.unit_label`; `rounds_reps` → two inputs "rounds" and "+ reps" with client-side validation `reps < test.reps_per_round`; `distance` → metres. Plus optional bodyweight, `scaling` radio (only when `test.scaling_required`), and the context note labelled **"Session context (e.g. belt, sleeves, competition standard) — please do not record medical or injury information here."** Generates a `crypto.randomUUID()` `request_id` on mount and reuses it across retries, matching `src/lib/checkoutAttempt.js`.
- `PersonalBestEstimateDetail.jsx` — the conversion table, shown on demand: the three formulas side by side with their names and equations, the spread in kg, an explicit "these are estimates, not measured lifts" line, and a hard warning when `reps > 10` ("Above ten reps the three published formulas disagree by more than 20 % — treat this as a training guide only, not a record."). Below it, the percentage-of-1RM prescription table rendered from `PERCENT_OF_1RM`, each row showing the loadable rounded weight for this member's reference 1RM.
- `PersonalBestHistoryList.jsx` — reverse-chronological rows plus an inline SVG sparkline (no chart library; the bundle is already 487 kB).
- `LeaderboardConsentCard.jsx` — rendered only when `admin_settings.pb_leaderboards_enabled` is true. Off by default, alias input, plain-language copy stating exactly what becomes visible ("your chosen alias and the result — never your name, email, bodyweight or bodyweight ratio") and a one-tap withdraw.

**Existing web files to extend**
- `src/pages/Account.jsx` — add `getMyPersonalBests().catch(() => [])` and `getPbCatalogue().catch(() => [])` to the `Promise.all` in `refresh()` (the `.catch(() => [])` pattern is already used there for additive migrations: "Event goals ship as an additive migration…"). Insert a `<section id="personal-bests" className="mb-10 scroll-mt-32">` between the Training Goals and PT Requests sections, rendering `<PersonalBestsPanel />`, and reuse the existing `initialAccountLoad` / `firstLoadFailed` / `unavailableMessage` states verbatim.
- `src/lib/adminData.js` — add `adminPbCatalogue()`, `adminUpsertPbMovement()`, `adminUpsertPbTest()`, `adminPendingPersonalBests()`, `adminVerifyPersonalBest()`, `adminLogPersonalBestForMember()`, `adminMemberPersonalBests()`, `adminClassLoadSheet()`. Version-guarded mutations go through `assertAdminMutationVersion` from `src/lib/supabaseResults.js`. Extend `adminMemberDetail(userId)` (line 1567) to add `personalBests` to its `Promise.all` with the same `error ? [] : data` degradation used for `grants`, plus a `personalBestsAvailable` flag.
- `src/lib/memberAdmin.js` — add `normalizePbMovement`, `normalizePbTest`, `normalizePbVerification`, `normalizeLoadSheetRequest`, following the existing `normalizeTargetedMemberNotice` style (throw readable `Error`s, bounded lengths, enumerated sets). These are what `test/personal-bests.test.js` asserts against.
- **New** `src/components/admin/PersonalBestsManager.jsx` — two tabs. *Catalogue*: movement list with inline test editor, active toggle, sort order, plate increment, leaderboard eligibility, using `AdminConfirmDialog` for deactivation and passing `expected_updated_at` for optimistic locking (`PB_TEST_STALE` surfaces through `assertAdminMutationVersion`'s stale-record copy). *Verification queue*: pending self-reported records with Verify / Dispute buttons and a required coach select populated from `getCoaches()`.
- `src/lib/adminNavigation.js` — add `'personal-bests'` to `ADMIN_SECTION_KEYS`.
- `src/components/admin/AdminLayout.jsx` — add `{ key: 'personal-bests', label: 'Personal Bests', icon: Trophy }` to the Operations group (import `Trophy` is already used for Events; use `Medal` from `lucide-react` to keep them distinct).
- `src/components/admin/CommandPalette.jsx` — add the same entry to the section list and `{ key: 'personal-bests', label: 'Verify a personal best', icon: BadgeCheck }` to the quick-actions list.
- `src/pages/AdminCommandCentre.jsx` — `const PersonalBestsManager = lazy(() => import('@/components/admin/PersonalBestsManager'));` and `case 'personal-bests': return <PersonalBestsManager initialAction={intent.get('action')} onIntentHandled={consumeIntent} onDirtyChange={setHasUnsavedChanges} />;`
- **New** `src/components/admin/ClassLoadSheet.jsx` — mounted inside the roster drawer of `src/components/admin/ClassCalendarAdmin.jsx` (which already calls `admin_session_roster`). Test picker + percentage slider with the `INTENSITY_BANDS` labels + a table of every confirmed member with `rounded_kg`, a `Est.` marker, and an amber `Stale` flag past 12 weeks. `downloadCsv` from `src/lib/csv.js` gives the coach a printable sheet for the whiteboard.
- `src/components/admin/MembersManager.jsx` — in `MemberDrawer`, add a "Personal Bests" block below the staff notes showing `detail.personalBests`, with a "Log a verified PB" form calling `adminLogPersonalBestForMember`.
- `src/components/admin/AdminOverview.jsx` — add a `AdminStatCard` for pending PB verifications linking to the new section.
- `src/lib/schemaCapabilities.js` — add `member_personal_bests` and `personal_best_catalogue_seed` to `REQUIRED_SCHEMA_CAPABILITIES` (this makes `OperationsHealth.jsx` and the release-readiness monitor pick the feature up with no further work). `test/schema-capabilities.test.js` has hard-coded `missing`/`actions` arrays that must be updated in the same commit or the suite fails.
- `src/pages/Privacy.jsx` — new section "Training Records" (see security).
- `src/lib/nativeTaskLinks.js` — add `['/open/account/personal-bests', '/account#personal-bests']` to `exactFallbacks`.

**New tests** (`node --test "test/**/*.test.js"`): `test/personal-bests.test.js` (formula values including the r=1 identity, the Epley/Brzycki crossover at r=10, the Brzycki r=37 pole returning null, loadable rounding, lb→kg round-trip, mm:ss formatting, rounds+reps ordering), `test/personal-best-schema.test.js` (asserts both SQL copies contain `is_admin()` gates, the `revoke ... from public, anon` / `grant ... to authenticated` pairs, `verification_status = 'verified'` in the leaderboard body, and the absence of `bodyweight` in the leaderboard return signature), `test/personal-best-load-sheet.test.js`.

## iOS UI

**New pure logic — `ios/XertFitnessApp/XertFitnessApp/PersonalBests.swift`** (top-level, alongside the existing `BookingCancellationPolicy.swift` / `ClassSessionDiscovery.swift` pure-logic files, so `XertFitnessAppTests/ModelsTests.swift` can cover it without a host app):
```swift
enum PersonalBestMath {
    static let lbToKg: Double = 0.45359237
    static let estimateMaxReps = 12
    static let staleWeeks = 12
    static func epley(_ kg: Double, reps: Int) -> Double { kg * (1 + Double(reps) / 30) }
    static func brzycki(_ kg: Double, reps: Int) -> Double? {
        reps >= 37 ? nil : kg * 36 / (37 - Double(reps))
    }
    static func lombardi(_ kg: Double, reps: Int) -> Double { kg * pow(Double(reps), 0.10) }
    static func roundToLoadable(_ kg: Double, increment: Double, bar: Double) -> Double { … }
    static let percentOf1RM: [(reps: Int, percent: Int)] = [ (1,100),(2,95),(3,93),(4,90),(5,87),
        (6,85),(7,83),(8,80),(9,77),(10,75),(12,70),(15,65) ]
}
enum PersonalBestFormatter {
    static func value(_ record: PersonalBestItem, test: PersonalBestTest) -> String { … }
    static func duration(_ seconds: Double) -> String { … }   // "1:47.30"
}
```

**New views**
- `ios/XertFitnessApp/XertFitnessApp/Views/PersonalBestsView.swift` — a `Form` inside the existing `NavigationStack` idiom, `.xertListBackground()`, `.listStyle(.plain)`, `.listRowBackground(Color.xertInk)`, section headers via `Text("Barbell").xertEyebrow()`, values via `.xertDisplay(28)`, wrapped in `.xertCardStyle()`. Rows navigate to a history detail with a sparkline drawn in `Canvas`. Honours `@Environment(\.dynamicTypeSize)` with the `dynamicTypeSize.isAccessibilitySize` vertical-stack fallback already used throughout `AccountView.swift`, and ends with `XertScrollEndSpacer()`.
- `ios/XertFitnessApp/XertFitnessApp/Views/LogPersonalBestSheet.swift` — **the quick log flow**, presented as a `.sheet` with `.presentationDetents([.medium, .large])`. Three taps to a saved PB: recent-tests row at the top (the member's last five tests, so the common case is one tap), then a metric-appropriate keypad. `metric_kind == "load"` gets a `.decimalPad` plus a kg/lb `Picker`; `"time"` gets minute/second/hundredth `Picker`s (no free text, no parsing bugs); `"rounds_reps"` gets two `Stepper`s with the partial-reps ceiling enforced from `reps_per_round`; `"reps"` and `"distance"` get `.numberPad`. Date defaults to today with a "yesterday" shortcut. A `UUID()` created when the sheet appears is sent as `p_request_id`, so a double-tap on a flaky gym wifi cannot create two records. On success, `.sensoryFeedback(.success, trigger:)` and the sheet dismisses to a "Logged — a coach will verify it" row.

**Existing iOS files to extend**
- `Models.swift` — add `case personalBests` to `XertDataSource` with `displayName` "personal bests" (the enum drives `DataAvailabilityNotice`). Add `PersonalBestMovement`, `PersonalBestTest`, `PersonalBestItem`, `PersonalBestHistoryPoint`, `PersonalBestDraft`, all `Codable, Hashable`, using snake_case property names to match the RPC columns exactly (the codebase's existing convention — see `MemberAnnouncement`, `PrivateSessionStatusItem`). Add computed `verificationLabel`, `isEstimated`, `estimateSummary` on `PersonalBestItem`.
- `Services/XertAPI.swift` — `personalBests(session:)` → `rpc(path: "my_personal_bests", body: EmptyBody(), auth: auth)`; `personalBestCatalogue(session:)` → `restRequest(path: "/rest/v1/pb_tests", queryItems: [select "*,pb_movements(*)", active eq.true, order sort_order.asc], auth: auth)`; `personalBestHistory(session:testID:)`; `logPersonalBest(session:draft:)` → `rpc(path: "log_my_personal_best", …)`; `setLeaderboardConsent(session:optedIn:alias:)`.
- `Store/XertStore.swift` — `@Published var personalBests: [PersonalBestItem] = []`, `@Published var personalBestTests: [PersonalBestTest] = []`, `@Published var isLoggingPersonalBest = false`. Add `.personalBests` to the `memberDataSources` static set (line ~53) so stale/unavailable handling and the sign-out purge at line ~933 cover it. Load both inside `performRefresh` using the existing per-source `do/catch { unavailableDataSources.insert(.personalBests) }` + `canApplyRefresh(refreshVersion)` guard pattern. Add `func logPersonalBest(_ draft: PersonalBestDraft) async -> Bool` following the `submitInterest` shape (guard on the in-flight flag, `defer` reset, `present(error)` on failure).
- `Views/AccountView.swift` — add `personalBestsSection` to `signedInSections(timeline:)` between `membershipSection` and `accountDetailsSection`: a card showing the three most recent bests, a `NavigationLink` to `PersonalBestsView`, and a prominent `Button("Log a PB")` with `.buttonStyle(.xertPrimary)` presenting `LogPersonalBestSheet`. Add `.personalBests` to the `DataAvailabilityNotice(sources:)` set at line 173-175 and to the `isDisjoint(with:)` check at line 173. Add `case personalBests` to the private `ScrollTarget` enum and extend `focusRoute(using:)` to handle the new route.
- `XertNavigation.swift` — add `case personalBests` to `XertMemberRoute`: `destination` `.account`; `navigationTitle` "Personal Bests"; `restorationValue` `"account/personal-bests"`; `isContextualTask` true; `requiresAuthentication` true; `pinnableRoute` `self`; `shareDestination` `nil` (a member's PBs are never a shareable public destination); `route(forPath:)` case `"account/personal-bests"`; `webRoute(for:)` case `("/account", "personal-bests")`.
- `Services/XertQuickActionNavigation.swift` — `static let logPersonalBestType = "com.xertfitness.app.quick.pb"` mapped to `.personalBests`.
- `Services/XertAppShortcuts.swift` — `OpenXertLogPersonalBestIntent` with `phrases: ["Log a PB in \(.applicationName)"]`, `shortTitle: "Log a PB"`, `systemImageName: "medal"`, registered in `XertAppShortcuts.appShortcuts`. This makes "Hey Siri, log a PB in XERT" open straight to the sheet — the highest-leverage placement, because members log PBs standing next to a barbell, not sitting at a laptop.
- `Views/AdminCommandCentreView.swift` + `Store/AdminStore.swift` + `AdminModels.swift` — add a "Verify PBs" section backed by `admin_pending_personal_bests`, and a "Load sheet" action on the existing roster screen backed by `admin_class_load_sheet`. This is phase 3; the member surfaces ship first.
- `XertFitnessAppTests/ModelsTests.swift` — extend with the `PersonalBestMath` and `PersonalBestFormatter` cases.
- New `test/native-personal-bests.test.js` — the repo asserts Swift source text from Node (see `test/native-notice-center.test.js`); assert the route round-trip, the `XertDataSource` case, the `App Intent` registration, and that `LogPersonalBestSheet.swift` sends `p_request_id`.

## Security, privacy and compliance

**Authorisation.** No `insert`/`update`/`delete` is granted to `authenticated` on any of the five new tables; every write goes through a `security definer` RPC that either scopes to `auth.uid()` or gates on `public.is_admin()`. A member with a raw anon key and a REST client can read only their own `pb_records` (`user_id = (select auth.uid())`) and the active catalogue. All policies use the `(select auth.uid())` / `(select public.is_admin())` wrapping introduced by `supabase/migrations/20260714007000_rls_policy_performance.sql`, so the check runs once per statement, not once per row.

**Verification integrity.** `pb_derive_record()` raises `PB_VERIFICATION_MANAGED_BY_STAFF` if a non-admin touches any verification column and `PB_VERIFIED_RECORD_LOCKED` if a non-admin edits an already-verified row. This is the same column-guard-trigger pattern as `guard_profile_write` in `booking_schema.sql`, and it closes the obvious attack: log a modest number, get a coach to verify it, then rewrite it to a club record.

**Leaderboard exposure.** Three independent gates, all server-side: the owner switch `admin_settings.pb_leaderboards_enabled` (default false), per-test `leaderboard_eligible` (default false), and per-member `pb_leaderboard_consents` with `revoked_at is null` (no row = not listed). `pb_leaderboard()` returns `display_alias` only; `full_name`, `email`, `bodyweight_kg` and `bodyweight_ratio` are not in the function's return signature, so no client bug can leak them. The alias validator rejects '@'.

**Australian Privacy Act 1988 — the part the owner has almost certainly underestimated.** A gym under $3m turnover is normally exempt as a small business (s6D). **That exemption does not apply to a business that provides a health service and holds health information** (s6D(4)(b)). This repo's `coaches.category` already enumerates `nutritionist`, `massage` and `physio`, the privacy policy already invites members to disclose "injuries or limitations", and this feature adds bodyweight. Taken together, XERT should assume the Australian Privacy Principles apply in full and stop relying on the small-business exemption. Concretely:
- **APP 3.3 — sensitive information requires consent to collect.** "Health information" includes information about an individual's health collected in providing a health service. Bodyweight is the field at risk, not the squat number. Therefore `bodyweight_kg` is **optional on every record**, is never required to save a PB, is never on a leaderboard, and the log form carries a one-line collection notice explaining why it is asked for (bodyweight-relative ratio, coaching only) and that it can be left blank.
- **APP 5 — notification of collection.** Add a "Training Records" section to `src/pages/Privacy.jsx` covering: what is collected (movement, result, optional bodyweight, optional session context, date), why (progress tracking and load prescription by your coach), who sees it (you and XERT coaching staff; nobody else unless you separately opt in to a leaderboard), and that it is deleted with your account. Bump the `updated` date on the `LegalPage`.
- **APP 6 — use and disclosure.** The leaderboard is a *disclosure* to other members. That is why it is separately consented, versioned (`consent_version`), revocable, and defaults off. Do not bundle it into the signup terms checkbox in `AccountView.swift` / `Register.jsx`; bundled consent is not consent.
- **APP 11 — security.** Covered by the RLS above plus the existing `vercel.json` headers. No new secrets, no new external processor, so no new cross-border disclosure disclosure obligation (APP 8).
- **APP 12/13 — access and correction.** `my_personal_bests()` + `my_personal_best_history()` already satisfy access. Correction is `update_my_personal_best`, but a *verified* record is locked to staff — so the admin verification queue must also accept a member's correction request. Route that through the existing `admin_member_notes` flow rather than building a new one.
- **Notifiable Data Breaches scheme.** Bodyweight plus name plus contact details is likely to cause serious harm if breached, so a PB-table breach is very likely notifiable. That raises the bar on the leaderboard RPC being the *only* path by which one member's data reaches another.

**Things I am telling you not to do, because they are bad ideas.**
1. **Do not ship bodyweight-relative leaderboards.** The owner's brief asks for bodyweight ratios and optional leaderboards; combining them is the one combination I would refuse. A public ranking of members by strength-to-bodyweight in a gym is a well-documented disordered-eating vector, it identifies people by body composition, and it is health information under the Act. Ratio stays private to the member and their coach. `pb_leaderboard()` therefore does not select it at all — that is a schema-level refusal, not a UI preference.
2. **Do not let members type movement names.** Already handled by the catalogue, but restate it: the moment "Back Squat", "back squat" and "BS" coexist, the conversion table, the load sheet and every leaderboard become meaningless. No "other / specify" escape hatch. Members who want a new movement ask a coach, who adds it once for everyone.
3. **Do not present an estimated 1RM as a 1RM anywhere.** `estimated_1rm_formula` exists precisely so the UI can never lose that distinction, and `estimated_1rm_kg` is NULL above 12 reps rather than being quietly wrong.
4. **Do not invite medical information.** The context-note field is capped at 200 characters and explicitly labelled not-for-medical-information. If members start typing injury detail into it, that field becomes health information with all the obligations above and the field should be removed rather than expanded.
5. **Minors.** The gym almost certainly has under-18 members. Publishing a minor's performance data, and any bodyweight-linked data, to other members is a materially higher risk and is squarely in scope of the Children's Online Privacy Code work. `profiles` has no date of birth and I am not recommending you collect one just for this. The safe default is therefore: leaderboards stay off, and if the owner turns them on, the owner is accepting responsibility for confirming that no consenting account belongs to a minor. Say that in the admin UI copy next to the switch, not in a wiki.

**Audit trail.** `pb_record_changes` is append-only (`PB_AUDIT_IMMUTABLE` on update/delete), admin-read-only, and records actor role, action and full before/after snapshots — identical in shape to `session_booking_changes`. Catalogue edits flow into the existing `admin_content_changes` table, so `src/components/admin/AdminAuditLog.jsx` shows movement and test changes with no new UI. The one deliberate hole punched in immutability is `purge_member_pb_audit_snapshots(uuid)`, granted only to `service_role` and called only from `api/delete-account.js`, so a deletion request actually removes the bodyweight values instead of leaving them in JSONB forever.

## Rollout

Five phases behind two independent gates: the `xert_schema_capabilities` row (which makes the whole feature degrade to invisible on any database that has not run the migration — every client read uses the `.catch(() => [])` pattern already used for event goals and PT requests in `src/pages/Account.jsx`) and `admin_settings.pb_leaderboards_enabled` (default false, owner-flipped, mirroring the `payments_enabled` soft-launch switch).

**Phase 1 — schema and catalogue (no user-visible change).** Apply `20260726000000_member_personal_bests.sql` and `20260726001000_personal_best_catalogue_seed.sql`. Register both capabilities in `src/lib/schemaCapabilities.js` and update the literal arrays in `test/schema-capabilities.test.js`. Ship `src/components/admin/PersonalBestsManager.jsx` catalogue tab so the owner can prune the seed to the movements XERT actually programmes before a single member sees it. Also update `README.md`'s schema-ordering list — the repo documents every migration there and the release-readiness check reads from it.

**Phase 2 — member logging, web + iOS.** The Account section, the log dialog and the iOS sheet, App Intent and route. Everything is self-reported at this point; nothing is comparable across members yet, so there is no way to embarrass anyone with a half-populated catalogue. Ship the `Privacy.jsx` update in this phase, not later — the collection notice must exist before the first bodyweight is stored.

**Phase 3 — verification and the load sheet.** The verification queue, `admin_verify_personal_best`, `admin_log_personal_best_for_member`, and `ClassLoadSheet.jsx` in the class roster. This is where the owner sees the return: coaches stop guessing weights at the whiteboard. Run one week of classes with the load sheet printed to CSV before wiring it into the iOS admin view.

**Phase 4 — iOS admin parity.** `AdminCommandCentreView.swift` verification and load sheet.

**Phase 5 — leaderboards, only if the owner still wants them.** Flip `pb_leaderboards_enabled` after: at least 20 verified records exist across at least 5 tests (a leaderboard with three entries is worse than none), `leaderboard_eligible` has been curated per test, and the owner has confirmed the minors question. Consent UI ships dark in phase 2 and simply becomes visible.

**Migration and backfill.** There is nothing to backfill — no PB data exists today. The two catalogue seed statements are `on conflict (slug) do nothing`, so both files are re-runnable, matching every other migration in this repo. `pb_tests.movement_id` uses `on delete restrict`, so a movement that has tests cannot be deleted; deactivation via `active = false` is the only removal path and it preserves every historical record. The one irreversible decision is `pb_tests.slug`, because it is the stable identity used by the seed and by any future import — treat slugs as immutable once shipped and enforce it in `admin_upsert_pb_test` (`PB_TEST_SLUG_IMMUTABLE` when records exist).

**Rollback.** Phases 2–5 are pure client code; revert the deploy. Phase 1's rollback is `delete from public.xert_schema_capabilities where capability in ('member_personal_bests','personal_best_catalogue_seed')`, which makes every client treat the feature as absent while the tables stay intact and no member data is lost.

## Open questions for the owner

Each has my recommended default; the engineer should build the default unless the owner says otherwise.

1. **Do leaderboards ship at all?** *Default: build them, ship them off.* `pb_leaderboards_enabled` false, revisit after 90 days of real data. A leaderboard on a soft-launch gym with eight members is demotivating, not motivating.
2. **Bodyweight-relative ratios on any shared surface?** *Default: never.* Ratio is visible to the member and to coaching staff only. If the owner pushes back, the compromise is a private "your ratio vs your own history" chart — not a comparison to other members.
3. **Under-18 members.** *Default: do not collect date of birth for this feature; keep leaderboards off; if the owner enables them, the admin UI states that the owner is confirming no consenting account is a minor.* If the gym runs a formal junior programme, collect DOB properly on `profiles` first and gate consent on it — that is a separate, larger piece of work.
4. **Gender divisions on leaderboards.** *Default: none.* `profiles` has no gender field and I am not recommending you add one — it is a new sensitive attribute for a cosmetic feature. Split by `scaling` (rx / scaled) only, which is what the benchmark prescriptions already encode (Fran at 43 kg vs 30 kg). Revisit only if members ask.
5. **Canonical e1RM formula.** *Default: Epley, capped at 12 reps.* The owner should sign this off explicitly because the number appears on printed load sheets and coaches will notice if it changes later. Changing it after launch requires recomputing `estimated_1rm_kg` for every stored record.
6. **Rep-max tests to seed per lift.** *Default: 1RM for all thirteen barbell lifts, 3RM and 5RM for squat/deadlift/bench/press, 10RM for back squat only.* More tests means more empty rows on every member's page. The owner should cut this list, not extend it.
7. **Verification workload.** *Default: any admin may verify, and must attribute the verification to a row in the existing `coaches` table.* Non-admin coach verification waits on [spec 07](07-staff-accounts-and-roles.md) Phase A + capability wiring — do not invent a private role model inside this feature.
8. **Are self-reported PBs allowed to drive the class load sheet?** *Default: yes, but flagged.* `admin_class_load_sheet` returns `verification_status` and the UI marks unverified references. Refusing to prescribe from an unverified PB would make the load sheet useless in week one.
9. **Stale-PB threshold.** *Default: 12 weeks.* A back squat 1RM from six months ago is not a safe basis for an 85 % working set.
10. **Retention of PB history after account deletion.** *Default: hard-delete with the account, and null the audit snapshots.* This matches the current promise in `src/pages/Privacy.jsx` and the behaviour of `api/delete-account.js`. The cost is that a deleted member's leaderboard entry vanishes; that is the correct trade.
11. **Member-visible unit toggle.** *Default: kg everywhere, with lb accepted on entry and echoed back on that record only.* No profile-level unit preference column. Australia is metric; the lb path exists for the occasional member quoting an American programme.
12. **Should logging a PB require having attended a class?** *Default: no.* Members train elsewhere and on weekends; blocking that just means they stop logging.
13. **Notify a member when a coach verifies their PB?** *Default: not in v1.* The push and targeted-notice infrastructure (`admin_send_member_notice`, `api/admin-publish-announcement.js`) is already there and this is a natural phase-4 addition, but every notice is a chance to annoy someone. Add it once the verification queue is actually being worked.

