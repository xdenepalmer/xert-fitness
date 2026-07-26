# Health waivers, APSS Stage 1 pre-exercise screening, and a coach-safe safety flag

**Effort: XL**

> Design spec produced during the July 2026 audit, from the owner requirements note.
> Not yet implemented. Reviewed against the schema and code as at commit time.

## Summary

Every member signs one versioned liability waiver plus an APSS Stage 1 pre-exercise screen (the Australian standard) before their first booking, and re-screens annually. The clinical detail lives in tables that are unreadable through PostgREST — no admin can `select *` on them; all access flows through SECURITY DEFINER RPCs that write an audit row on every READ, not just writes. Coaches get a four-state safety band plus a 140-character plain-English activity instruction and the emergency contact, and never see a condition, medication or injury. The thing the owner has most underestimated: collecting this data is almost certainly what pulls XERT inside the Privacy Act 1988 (Cth) regardless of turnover, because s 6D(4)(b) removes the small-business exemption for anyone who provides a health service and holds health information — and s 6FB reads on personal training/exercise prescription. XERT is also already collecting free-text injury data today on an anonymously-insertable lead table (`member_interest.injuries_or_limitations_optional`), which this design deletes.

## Recommendation

Use APSS Stage 1 only (ESSA / Fitness Australia / Sports Medicine Australia Adult Pre-Exercise Screening System), verbatim, seven yes/no questions, plus a small non-APSS injury/condition addendum for coaching practicality. Do not use PAR-Q+ and do not implement APSS Stage 2 or 3.

Why APSS over PAR-Q+: XERT is an Australian gym and will be measured against the Australian standard of care. APSS is the instrument named in the Fitness Australia Code of Practice and the one an Australian insurer, an ESSA-registered AEP and a Queensland court will recognise. PAR-Q+ is CSEP's (Canadian); its "yes → ePARmed-X+" escalation path maps to a professional ecosystem that does not exist here, so using it means arguing you met the standard by an unfamiliar route. There is no upside to that argument.

Why Stage 1 only: Stage 1 is the sole mandatory stage and its output is exactly the binary we need — "medical clearance recommended before exercise". Stages 2 and 3 collect blood pressure, cholesterol, glucose and risk-factor stratification that only an appropriately qualified exercise professional may interpret. A group-fitness gym that collects Stage 2 data has (a) taken custody of far more sensitive information than APP 3.1's minimum-necessary test permits, and (b) arguably assumed a clinical duty it cannot discharge. Collecting less is both safer legally and cheaper to protect.

Enforcement: hard-block the first booking on waiver + screening (a hard gate at the DB layer via a trigger on `session_bookings`, not a UI check). Do NOT block on a "clearance recommended" outcome — flag it. Blocking honest answers teaches members to lie, which is strictly worse than not screening. Overdue annual re-screen flags for 60 days, then blocks.

The coach problem is solved by inverting it: coaches never receive derived clinical facts. They receive (1) a four-state band `not_screened | clear | caution | clearance_pending`, (2) `activity_advice` — a 140-char operational instruction written by the owner after reading the detail ("no overhead pressing, no box jumps"), which carries no diagnosis, and (3) the emergency contact, which is not health information and lives in its own table. The advice line is deliberately human-authored rather than auto-derived, because any automatic derivation from the questionnaire leaks the questionnaire. It is also shown to the member in their own account — if the member can see exactly what coaches see, staff write it carefully and the member can correct it. That transparency is the strongest control in the whole design.

**Roles (superseded locally — see Integration constraints).** Staff/coach access is defined by [spec 07](07-staff-accounts-and-roles.md), not by a private `member | coach | admin` enum in this file. Coach access to the safety roster remains scoped to assigned sessions and time-boxed around the class; clinical reads use 07’s `has_capability('health_clinical')` / coach helpers. Do not ship the embedded role DDL below.

## Integration constraints

Cross-spec rules from [INTEGRATION_REVIEW.md](INTEGRATION_REVIEW.md) / [README.md](README.md). These override any conflicting DDL below until a later migration rewrite:

1. **One agreement ledger with spec 01.** Waiver *acceptance* (which version, when, IP/device evidence) lives on the shared document → version → acceptance ledger. Do **not** ship a parallel `health_document_versions` + `member_liability_waivers` acceptance family for legal text. Prefer evolving live `member_onboarding_documents` / `member_onboarding_receipts` (or the richer 01 shape that replaces them) — that foundation is the precursor to absorb, not a third ledger.
2. **Waiver is a document kind; health answers stay separate.** `liability_waiver` (and health-consent acknowledgements if needed) are kinds on the shared ledger. APSS Stage 1 answers, clearances, and activity advice stay in this spec’s tightly-scoped clinical tables with read-audit RPCs.
3. **Roles defer entirely to [spec 07](07-staff-accounts-and-roles.md).** Delete / do not implement section “0. Staff role” (`profiles_role_check` rewrite, private `is_staff()`, rewritten `admin_set_role`). Gate clinical and coach-safety RPCs with 07 helpers (`has_capability`, `is_coach`, etc.). `is_admin()` continues to mean owner.
4. **Lead-form health field vs live consent.** Live path already has `health_info_consent` on member interest / booking notes. Do not null-and-drop `injuries_or_limitations_optional` while leaving consent machinery orphaned — keep the consented lead field and funnel into full APSS later, or drop field **and** consent UI/Privacy together in one migration.
5. **Compose booking gates with 01.** Both specs add `session_bookings` before-insert checks; failure codes and order must compose, not overwrite.

## Data model

New migration: `supabase/migrations/20260726000000_member_health_screening.sql`. Conventions followed from the repo: `create table if not exists`, `alter table ... enable row level security`, `revoke all ... from public, anon, authenticated`, SECURITY DEFINER RPCs with `set search_path = public, pg_temp`, `guard_*` immutability triggers, `touch_*_updated_at` triggers, `xert_schema_capabilities` marker, `raise exception 'UPPER_SNAKE_CODE'`.

```sql
-- ============================================================================
-- XERT Fitness — Health waivers and APSS Stage 1 pre-exercise screening.
-- SENSITIVE HEALTH INFORMATION (Privacy Act 1988 (Cth), APP 3.3 / 6 / 11).
-- Design rule: no table in this file is readable through PostgREST by ANY
-- role, including admins. Every read and write goes through a SECURITY
-- DEFINER function that writes public.member_health_access_log FIRST.
-- RLS is enabled with (deliberately) no admin SELECT policy; it is NOT
-- forced, so the definer functions owned by postgres still resolve.
-- ============================================================================

-- ── 0. Staff role ───────────────────────────────────────────────────────────
-- SUPERSEDED — do not ship. Role enum, is_staff(), and admin_set_role rewrite
-- live exclusively in spec 07 (Phase A). Keep only coach_profile_id binding
-- below if still needed for roster scoping; gate RPCs with has_capability /
-- is_coach from 07 instead of the private helpers sketched here.
/*
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('member', 'coach', 'admin'));

alter table public.admin_role_changes
  drop constraint if exists admin_role_changes_previous_role_check,
  drop constraint if exists admin_role_changes_new_role_check;
alter table public.admin_role_changes
  add constraint admin_role_changes_previous_role_check
    check (previous_role in ('member', 'coach', 'admin')),
  add constraint admin_role_changes_new_role_check
    check (new_role in ('member', 'coach', 'admin'));

-- public.is_admin() is intentionally NOT redefined. Every existing policy that
-- calls it must keep meaning "owner", never "coach".
create or replace function public.is_staff()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('coach', 'admin')
  );
$$;
revoke execute on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;

create or replace function public.admin_set_role(p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare v_previous_role text;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_role not in ('member', 'coach', 'admin') then raise exception 'INVALID_ROLE'; end if;
  if p_user_id = auth.uid() and p_role <> 'admin' then raise exception 'CANNOT_DEMOTE_SELF'; end if;

  perform pg_advisory_xact_lock(hashtext('xert-admin-role-changes'));
  select role into v_previous_role from public.profiles where id = p_user_id for update;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  if v_previous_role = p_role then return; end if;
  if v_previous_role = 'admin' and p_role <> 'admin'
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'CANNOT_DEMOTE_LAST_ADMIN';
  end if;

  update public.profiles set role = p_role, updated_at = now() where id = p_user_id;
  insert into public.admin_role_changes (target_user_id, changed_by, previous_role, new_role)
  values (p_user_id, auth.uid(), v_previous_role, p_role);
end; $$;
revoke execute on function public.admin_set_role(uuid, text) from public, anon;
grant execute on function public.admin_set_role(uuid, text) to authenticated;
*/

-- class_sessions.coach_name is free text; bind the session to a real staff
-- account so coach roster access can be row-scoped. Null = no coach may read.
-- (Role privilege itself comes from profiles.role = 'coach' per spec 07.)
alter table public.class_sessions
  add column if not exists coach_profile_id uuid
    constraint class_sessions_coach_profile_id_fkey
    references public.profiles(id) on delete set null;
create index if not exists class_sessions_coach_profile_idx
  on public.class_sessions (coach_profile_id, start_time)
  where coach_profile_id is not null;

-- ── 1. Enforcement switch (separate singleton, NOT admin_settings) ──────────
-- admin_settings is guarded by guard_session_pack_payment_activation(), which
-- raises PAYMENT_SETTINGS_CHANGE_REQUIRES_PAUSE on ANY column change while
-- payments are live. Adding the health switch there would make it untoggleable
-- after launch.
create table if not exists public.health_policy_settings (
  id uuid primary key default gen_random_uuid(),
  screening_enforced boolean not null default true,
  waiver_enforced boolean not null default true,
  rescreen_interval_days integer not null default 365
    check (rescreen_interval_days between 90 and 1095),
  rescreen_grace_days integer not null default 60
    check (rescreen_grace_days between 0 and 180),
  waiver_reaccept_interval_days integer not null default 1095
    check (waiver_reaccept_interval_days between 365 and 3650),
  minimum_unaccompanied_age integer not null default 16
    check (minimum_unaccompanied_age between 12 and 18),
  retention_years integer not null default 7 check (retention_years between 3 and 12),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
create unique index if not exists health_policy_settings_singleton_idx
  on public.health_policy_settings ((true));
insert into public.health_policy_settings (id) select gen_random_uuid()
where not exists (select 1 from public.health_policy_settings);

alter table public.health_policy_settings enable row level security;
revoke all on table public.health_policy_settings from public, anon, authenticated;
drop policy if exists "health_policy_settings_admin_read" on public.health_policy_settings;
create policy "health_policy_settings_admin_read" on public.health_policy_settings
  for select to authenticated using ((select public.is_admin()));
grant select on table public.health_policy_settings to authenticated;

create or replace function public.touch_health_record_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke execute on function public.touch_health_record_updated_at() from public, anon, authenticated;
drop trigger if exists health_policy_settings_touch_updated_at on public.health_policy_settings;
create trigger health_policy_settings_touch_updated_at
  before update on public.health_policy_settings
  for each row execute function public.touch_health_record_updated_at();

-- ── 2. Versioned legal document text ───────────────────────────────────────
-- SUPERSEDED as a separate ledger: liability_waiver / health_consent version
-- bodies and acceptances belong on the shared 01 ledger (or evolved
-- member_onboarding_*). Keep APSS instrument text versioning here only if it
-- is clinical-form metadata tied to answer rows — not a second acceptance path.
-- The sketch below is retained for shape reference; do not implement as-is.
create table if not exists public.health_document_versions (
  id uuid primary key default gen_random_uuid(),
  doc_type text not null
    check (doc_type in ('liability_waiver', 'health_consent', 'apss_stage_1')),
  version integer not null check (version > 0),
  body_markdown text not null
    check (char_length(btrim(body_markdown)) between 200 and 40000),
  body_sha256 text not null check (body_sha256 ~ '^[0-9a-f]{64}$'),
  effective_from timestamptz not null default now(),
  retired_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (doc_type, version)
);
create unique index if not exists health_document_versions_current_idx
  on public.health_document_versions (doc_type) where retired_at is null;

alter table public.health_document_versions enable row level security;
revoke all on table public.health_document_versions from public, anon, authenticated;
drop policy if exists "health_document_versions_read_current" on public.health_document_versions;
create policy "health_document_versions_read_current" on public.health_document_versions
  for select to authenticated using (retired_at is null or (select public.is_admin()));
grant select on table public.health_document_versions to authenticated;

create or replace function public.guard_health_document_version_write()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then raise exception 'HEALTH_DOCUMENT_IMMUTABLE'; end if;
  if to_jsonb(new) - 'retired_at' is distinct from to_jsonb(old) - 'retired_at' then
    raise exception 'HEALTH_DOCUMENT_IMMUTABLE';
  end if;
  if old.retired_at is not null then raise exception 'HEALTH_DOCUMENT_IMMUTABLE'; end if;
  return new;
end; $$;
revoke execute on function public.guard_health_document_version_write() from public, anon, authenticated;
drop trigger if exists health_document_versions_immutable on public.health_document_versions;
create trigger health_document_versions_immutable
  before update or delete on public.health_document_versions
  for each row execute function public.guard_health_document_version_write();

-- ── 3. Emergency contact — NOT health information; kept separate on purpose ─
-- Coaches need this constantly. Splitting it out means reading it never
-- requires opening a clinical record.
create table if not exists public.member_emergency_contacts (
  user_id uuid primary key
    constraint member_emergency_contacts_user_id_fkey
    references public.profiles(id) on delete cascade,
  contact_name text not null check (char_length(btrim(contact_name)) between 2 and 120),
  contact_phone text not null check (contact_phone ~ '^[0-9 +()\-]{6,20}$'),
  relationship text check (char_length(btrim(relationship)) <= 60),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
alter table public.member_emergency_contacts enable row level security;
revoke all on table public.member_emergency_contacts from public, anon, authenticated;
drop policy if exists "member_emergency_contacts_own" on public.member_emergency_contacts;
create policy "member_emergency_contacts_own" on public.member_emergency_contacts
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "member_emergency_contacts_upsert_own" on public.member_emergency_contacts;
create policy "member_emergency_contacts_upsert_own" on public.member_emergency_contacts
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "member_emergency_contacts_update_own" on public.member_emergency_contacts;
create policy "member_emergency_contacts_update_own" on public.member_emergency_contacts
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update on table public.member_emergency_contacts to authenticated;

drop trigger if exists member_emergency_contacts_touch_updated_at on public.member_emergency_contacts;
create trigger member_emergency_contacts_touch_updated_at
  before update on public.member_emergency_contacts
  for each row execute function public.touch_health_record_updated_at();

-- ── 4. Liability waiver — immutable, versioned, survives account deletion ───
-- SUPERSEDED as a separate acceptance table: write waiver acceptances to the
-- shared ledger (01 / member_onboarding_*). Retention-after-delete and
-- identity-snapshot rules from this sketch still apply to that shared path.
-- Clinical screening rows below remain in this spec.
create table if not exists public.member_liability_waivers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  subject_full_name text not null check (char_length(btrim(subject_full_name)) between 2 and 160),
  subject_email text,
  subject_dob date not null,
  is_minor boolean not null,
  guardian_name text,
  guardian_relationship text,
  guardian_email text,
  guardian_phone text,
  guardian_signed_at timestamptz,
  waiver_version integer not null,
  waiver_sha256 text not null check (waiver_sha256 ~ '^[0-9a-f]{64}$'),
  consent_version integer not null,
  consent_sha256 text not null check (consent_sha256 ~ '^[0-9a-f]{64}$'),
  health_collection_consent boolean not null check (health_collection_consent is true),
  signature_name text not null check (char_length(btrim(signature_name)) between 2 and 160),
  signed_at timestamptz not null default now(),
  signed_ip inet,
  signed_user_agent text check (char_length(signed_user_agent) <= 400),
  expires_at timestamptz not null,
  withdrawn_at timestamptz,
  withdrawn_reason text check (char_length(withdrawn_reason) <= 300),
  superseded_at timestamptz,
  superseded_by uuid references public.member_liability_waivers(id) on delete set null,
  destroy_after date not null,
  created_at timestamptz not null default now(),
  constraint member_liability_waivers_guardian_check check (
    not is_minor
    or (guardian_name is not null and guardian_phone is not null
        and guardian_signed_at is not null)
  )
);
create unique index if not exists member_liability_waivers_current_idx
  on public.member_liability_waivers (user_id)
  where superseded_at is null and withdrawn_at is null and user_id is not null;
create index if not exists member_liability_waivers_destroy_idx
  on public.member_liability_waivers (destroy_after);

alter table public.member_liability_waivers enable row level security;
revoke all on table public.member_liability_waivers from public, anon, authenticated;
-- Deliberately NO policy. Not even an admin may read this through PostgREST.

-- ── 5. APSS Stage 1 screening — immutable, versioned ────────────────────────
create or replace function public.apss_stage_1_answers_valid(p_answers jsonb)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select p_answers is not null
     and jsonb_typeof(p_answers) = 'object'
     and (select count(*) from jsonb_object_keys(p_answers)) = 7
     and (select bool_and(key in ('q1','q2','q3','q4','q5','q6','q7')
                          and jsonb_typeof(value) = 'boolean')
          from jsonb_each(p_answers));
$$;

create table if not exists public.member_health_screenings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  subject_full_name text not null,
  subject_email text,
  subject_dob date not null,
  is_minor boolean not null,
  instrument text not null default 'apss_stage_1' check (instrument = 'apss_stage_1'),
  instrument_version integer not null,
  answers jsonb not null constraint member_health_screenings_answers_check
    check (public.apss_stage_1_answers_valid(answers)),
  clearance_recommended boolean not null,
  conditions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(conditions) = 'array' and jsonb_array_length(conditions) <= 20),
  injuries jsonb not null default '[]'::jsonb
    check (jsonb_typeof(injuries) = 'array' and jsonb_array_length(injuries) <= 20),
  medications text check (char_length(medications) <= 1000),
  pregnancy_status text not null default 'not_disclosed'
    check (pregnancy_status in ('not_disclosed', 'not_applicable', 'pregnant', 'postpartum')),
  free_text_notes text check (char_length(free_text_notes) <= 2000),
  guardian_name text,
  guardian_relationship text,
  guardian_phone text,
  guardian_signed_at timestamptz,
  signature_name text not null,
  signed_at timestamptz not null default now(),
  signed_ip inet,
  signed_user_agent text check (char_length(signed_user_agent) <= 400),
  source text not null default 'web' check (source in ('web', 'ios', 'kiosk', 'admin_transcription')),
  transcribed_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null,
  supersede_reason text check (supersede_reason in
    ('annual', 'member_reported_change', 'incident', 'pregnancy', 'return_from_layoff', 'admin_correction')),
  superseded_at timestamptz,
  superseded_by uuid references public.member_health_screenings(id) on delete set null,
  destroy_after date not null,
  created_at timestamptz not null default now(),
  constraint member_health_screenings_guardian_check check (
    not is_minor
    or (guardian_name is not null and guardian_phone is not null
        and guardian_signed_at is not null)
  ),
  constraint member_health_screenings_transcription_check check (
    source <> 'admin_transcription' or transcribed_by is not null
  )
);
create unique index if not exists member_health_screenings_current_idx
  on public.member_health_screenings (user_id)
  where superseded_at is null and user_id is not null;
create index if not exists member_health_screenings_expiry_idx
  on public.member_health_screenings (expires_at) where superseded_at is null;
create index if not exists member_health_screenings_destroy_idx
  on public.member_health_screenings (destroy_after);

alter table public.member_health_screenings enable row level security;
revoke all on table public.member_health_screenings from public, anon, authenticated;
-- Deliberately NO policy.

-- ── 6. Doctor clearance — the FACT is stored, the letter is not ────────────
create table if not exists public.member_health_clearances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  screening_id uuid references public.member_health_screenings(id) on delete set null,
  outcome text not null check (outcome in ('cleared', 'cleared_with_restrictions', 'not_cleared')),
  practitioner_name text not null check (char_length(btrim(practitioner_name)) between 2 and 160),
  practitioner_practice text check (char_length(practitioner_practice) <= 160),
  clearance_dated date not null,
  restrictions text check (char_length(restrictions) <= 500),
  sighted_by uuid not null references public.profiles(id) on delete restrict,
  sighted_at timestamptz not null default now(),
  document_retained boolean not null default false,
  valid_until date,
  revoked_at timestamptz,
  destroy_after date not null,
  created_at timestamptz not null default now(),
  constraint member_health_clearances_dated_check check (clearance_dated <= current_date)
);
create index if not exists member_health_clearances_user_idx
  on public.member_health_clearances (user_id, sighted_at desc);
alter table public.member_health_clearances enable row level security;
revoke all on table public.member_health_clearances from public, anon, authenticated;
-- Deliberately NO policy.

-- ── 7. Derived staff-visible status — the ONLY surface with a read policy ──
create table if not exists public.member_health_status (
  user_id uuid primary key
    constraint member_health_status_user_id_fkey
    references public.profiles(id) on delete cascade,
  safety_band text not null default 'not_screened'
    check (safety_band in ('not_screened', 'clear', 'caution', 'clearance_pending')),
  waiver_current boolean not null default false,
  waiver_expires_at timestamptz,
  screening_current boolean not null default false,
  screening_expires_at timestamptz,
  clearance_required boolean not null default false,
  clearance_resolved_at timestamptz,
  has_flagged_detail boolean not null default false,
  activity_advice text
    check (activity_advice is null or char_length(btrim(activity_advice)) between 3 and 140),
  advice_set_by uuid references public.profiles(id) on delete set null,
  advice_set_at timestamptz,
  booking_blocked boolean not null default true,
  block_reason text,
  updated_at timestamptz not null default now()
);
create index if not exists member_health_status_band_idx
  on public.member_health_status (safety_band, screening_expires_at);

alter table public.member_health_status enable row level security;
revoke all on table public.member_health_status from public, anon, authenticated;
-- Members may read their OWN band and the exact advice line coaches see.
-- Admins are NOT given a policy: they go through the audited RPC.
drop policy if exists "member_health_status_read_own" on public.member_health_status;
create policy "member_health_status_read_own" on public.member_health_status
  for select to authenticated using (user_id = (select auth.uid()));
grant select on table public.member_health_status to authenticated;

drop trigger if exists member_health_status_touch_updated_at on public.member_health_status;
create trigger member_health_status_touch_updated_at
  before update on public.member_health_status
  for each row execute function public.touch_health_record_updated_at();

-- ── 8. Access log — every READ as well as every write ──────────────────────
create table if not exists public.member_health_access_log (
  id uuid primary key default gen_random_uuid(),
  subject_user_id uuid,
  subject_label text not null,
  actor_id uuid references auth.users(id) on delete set null,
  actor_role text not null
    check (actor_role in ('self', 'guardian', 'coach', 'admin', 'service')),
  action text not null check (action in (
    'view_detail', 'view_flag', 'view_roster_flags', 'view_compliance_queue',
    'create_waiver', 'create_screening', 'record_clearance', 'set_advice',
    'withdraw_consent', 'export', 'destroy'
  )),
  reason text check (reason in (
    'incident_response', 'programming_review', 'clearance_followup',
    'member_request', 'complaint_or_claim', 'data_correction',
    'class_delivery', 'compliance_review', 'self_service', 'scheduled_retention'
  )),
  scope text check (char_length(scope) <= 200),
  class_session_id uuid references public.class_sessions(id) on delete set null,
  disclosed_fields text[] not null default '{}',
  record_count integer not null default 1 check (record_count >= 0),
  ip inet,
  user_agent text check (char_length(user_agent) <= 400),
  created_at timestamptz not null default now()
);
create index if not exists member_health_access_log_subject_idx
  on public.member_health_access_log (subject_user_id, created_at desc);
create index if not exists member_health_access_log_actor_idx
  on public.member_health_access_log (actor_id, created_at desc);
create index if not exists member_health_access_log_created_idx
  on public.member_health_access_log (created_at desc, id desc);

alter table public.member_health_access_log enable row level security;
revoke all on table public.member_health_access_log from public, anon, authenticated;
drop policy if exists "member_health_access_log_admin_read" on public.member_health_access_log;
create policy "member_health_access_log_admin_read" on public.member_health_access_log
  for select to authenticated using ((select public.is_admin()));
drop policy if exists "member_health_access_log_read_own" on public.member_health_access_log;
create policy "member_health_access_log_read_own" on public.member_health_access_log
  for select to authenticated using (subject_user_id = (select auth.uid()));
grant select on table public.member_health_access_log to authenticated;

create or replace function public.guard_member_health_access_log()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'HEALTH_ACCESS_LOG_IMMUTABLE';
end; $$;
revoke execute on function public.guard_member_health_access_log() from public, anon, authenticated;
drop trigger if exists member_health_access_log_immutable on public.member_health_access_log;
create trigger member_health_access_log_immutable
  before update or delete on public.member_health_access_log
  for each row execute function public.guard_member_health_access_log();

-- ── 9. Immutability of the clinical records ────────────────────────────────
create or replace function public.guard_member_health_record_write()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    if current_setting('xert.health_retention_purge', true) = 'running' then return old; end if;
    raise exception 'HEALTH_RECORD_IMMUTABLE';
  end if;
  if to_jsonb(new) - 'superseded_at' - 'superseded_by' - 'withdrawn_at'
       - 'withdrawn_reason' - 'revoked_at' - 'destroy_after'
     is distinct from
     to_jsonb(old) - 'superseded_at' - 'superseded_by' - 'withdrawn_at'
       - 'withdrawn_reason' - 'revoked_at' - 'destroy_after' then
    raise exception 'HEALTH_RECORD_IMMUTABLE';
  end if;
  return new;
end; $$;
revoke execute on function public.guard_member_health_record_write() from public, anon, authenticated;

drop trigger if exists member_liability_waivers_immutable on public.member_liability_waivers;
create trigger member_liability_waivers_immutable
  before update or delete on public.member_liability_waivers
  for each row execute function public.guard_member_health_record_write();
drop trigger if exists member_health_screenings_immutable on public.member_health_screenings;
create trigger member_health_screenings_immutable
  before update or delete on public.member_health_screenings
  for each row execute function public.guard_member_health_record_write();
drop trigger if exists member_health_clearances_immutable on public.member_health_clearances;
create trigger member_health_clearances_immutable
  before update or delete on public.member_health_clearances
  for each row execute function public.guard_member_health_record_write();

-- ── 10. Status recomputation ───────────────────────────────────────────────
create or replace function public.recompute_member_health_status(p_user_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_policy public.health_policy_settings%rowtype;
  v_waiver public.member_liability_waivers%rowtype;
  v_screen public.member_health_screenings%rowtype;
  v_clearance_ok boolean := false;
  v_flagged boolean := false;
  v_advice text;
  v_band text;
  v_blocked boolean;
  v_reason text;
begin
  if p_user_id is null then return; end if;
  select * into v_policy from public.health_policy_settings limit 1;

  select * into v_waiver from public.member_liability_waivers
   where user_id = p_user_id and superseded_at is null and withdrawn_at is null;
  select * into v_screen from public.member_health_screenings
   where user_id = p_user_id and superseded_at is null;

  if v_screen.id is not null then
    v_flagged := jsonb_array_length(v_screen.conditions) > 0
              or jsonb_array_length(v_screen.injuries) > 0
              or coalesce(nullif(btrim(v_screen.medications), ''), '') <> ''
              or v_screen.pregnancy_status in ('pregnant', 'postpartum');
    v_clearance_ok := not v_screen.clearance_recommended or exists (
      select 1 from public.member_health_clearances c
      where c.user_id = p_user_id and c.revoked_at is null
        and c.outcome in ('cleared', 'cleared_with_restrictions')
        and (c.valid_until is null or c.valid_until >= current_date)
        and c.sighted_at >= v_screen.signed_at
    );
  end if;

  select activity_advice into v_advice from public.member_health_status where user_id = p_user_id;

  v_band := case
    when v_waiver.id is null or v_screen.id is null then 'not_screened'
    when v_screen.clearance_recommended and not v_clearance_ok then 'clearance_pending'
    when v_advice is not null or v_flagged then 'caution'
    else 'clear'
  end;

  v_blocked := case
    when v_policy.waiver_enforced and v_waiver.id is null then true
    when v_policy.screening_enforced and v_screen.id is null then true
    when v_policy.screening_enforced and v_screen.expires_at
         < now() - make_interval(days => v_policy.rescreen_grace_days) then true
    else false
  end;
  v_reason := case
    when v_waiver.id is null then 'HEALTH_WAIVER_REQUIRED'
    when v_screen.id is null then 'HEALTH_SCREENING_REQUIRED'
    when v_blocked then 'HEALTH_SCREENING_EXPIRED'
    else null
  end;

  insert into public.member_health_status as s (
    user_id, safety_band, waiver_current, waiver_expires_at,
    screening_current, screening_expires_at, clearance_required,
    clearance_resolved_at, has_flagged_detail, booking_blocked, block_reason
  ) values (
    p_user_id, v_band, v_waiver.id is not null, v_waiver.expires_at,
    v_screen.id is not null and v_screen.expires_at > now(), v_screen.expires_at,
    coalesce(v_screen.clearance_recommended, false) and not v_clearance_ok,
    case when v_clearance_ok then now() else null end,
    v_flagged, v_blocked, v_reason
  )
  on conflict (user_id) do update set
    safety_band = excluded.safety_band,
    waiver_current = excluded.waiver_current,
    waiver_expires_at = excluded.waiver_expires_at,
    screening_current = excluded.screening_current,
    screening_expires_at = excluded.screening_expires_at,
    clearance_required = excluded.clearance_required,
    clearance_resolved_at = excluded.clearance_resolved_at,
    has_flagged_detail = excluded.has_flagged_detail,
    booking_blocked = excluded.booking_blocked,
    block_reason = excluded.block_reason;
end; $$;
revoke execute on function public.recompute_member_health_status(uuid) from public, anon, authenticated;

create or replace function public.sync_member_health_status()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.recompute_member_health_status(coalesce(new.user_id, old.user_id));
  return coalesce(new, old);
end; $$;
revoke execute on function public.sync_member_health_status() from public, anon, authenticated;
drop trigger if exists member_liability_waivers_sync_status on public.member_liability_waivers;
create trigger member_liability_waivers_sync_status
  after insert or update on public.member_liability_waivers
  for each row execute function public.sync_member_health_status();
drop trigger if exists member_health_screenings_sync_status on public.member_health_screenings;
create trigger member_health_screenings_sync_status
  after insert or update on public.member_health_screenings
  for each row execute function public.sync_member_health_status();
drop trigger if exists member_health_clearances_sync_status on public.member_health_clearances;
create trigger member_health_clearances_sync_status
  after insert or update on public.member_health_clearances
  for each row execute function public.sync_member_health_status();

-- ── 11. Booking gate — a trigger, so no booking path can bypass it ─────────
-- Catches book_session(), join_session_waitlist(), admin_promote_next_waitlisted()
-- and admin_set_booking_status() with one rule. Name sorts before the existing
-- session_bookings_waitlist_fifo_guard so screening fails first.
create or replace function public.enforce_member_health_gate()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_status public.member_health_status%rowtype;
begin
  if new.status not in ('requested', 'confirmed', 'waitlisted') then return new; end if;
  if tg_op = 'UPDATE' and old.status in ('requested', 'confirmed', 'waitlisted') then
    return new;
  end if;
  select * into v_status from public.member_health_status where user_id = new.user_id;
  if not found then
    perform public.recompute_member_health_status(new.user_id);
    select * into v_status from public.member_health_status where user_id = new.user_id;
  end if;
  if not found or v_status.booking_blocked then
    raise exception '%', coalesce(v_status.block_reason, 'HEALTH_WAIVER_REQUIRED');
  end if;
  return new;
end; $$;
revoke execute on function public.enforce_member_health_gate() from public, anon, authenticated;
drop trigger if exists session_bookings_health_gate on public.session_bookings;
create trigger session_bookings_health_gate
  before insert or update of status on public.session_bookings
  for each row execute function public.enforce_member_health_gate();

-- ── 12. Member self-service RPCs ───────────────────────────────────────────
create or replace function public.member_submit_health_screening(
  p_full_name text,
  p_date_of_birth date,
  p_answers jsonb,
  p_conditions jsonb default '[]'::jsonb,
  p_injuries jsonb default '[]'::jsonb,
  p_medications text default null,
  p_pregnancy_status text default 'not_disclosed',
  p_free_text_notes text default null,
  p_signature_name text default null,
  p_waiver_version integer default null,
  p_consent_version integer default null,
  p_health_collection_consent boolean default false,
  p_guardian jsonb default null,
  p_supersede_reason text default 'annual',
  p_source text default 'web'
)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_policy public.health_policy_settings%rowtype;
  v_profile public.profiles%rowtype;
  v_is_minor boolean;
  v_age integer;
  v_clearance boolean;
  v_waiver public.health_document_versions%rowtype;
  v_consent public.health_document_versions%rowtype;
  v_apss public.health_document_versions%rowtype;
  v_screening_id uuid;
  v_prev_waiver uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_health_collection_consent is not true then raise exception 'HEALTH_CONSENT_REQUIRED'; end if;
  if p_date_of_birth is null or p_date_of_birth > current_date then raise exception 'DOB_REQUIRED'; end if;
  if not public.apss_stage_1_answers_valid(p_answers) then raise exception 'SCREENING_ANSWERS_INVALID'; end if;
  if char_length(btrim(coalesce(p_signature_name, ''))) < 2 then raise exception 'SIGNATURE_REQUIRED'; end if;
  if p_pregnancy_status not in ('not_disclosed','not_applicable','pregnant','postpartum') then
    raise exception 'PREGNANCY_STATUS_INVALID';
  end if;

  select * into v_policy from public.health_policy_settings limit 1;
  select * into v_profile from public.profiles where id = v_user;
  v_age := extract(year from age(current_date, p_date_of_birth));
  v_is_minor := v_age < 18;
  if v_age < v_policy.minimum_unaccompanied_age then raise exception 'MEMBER_UNDER_MINIMUM_AGE'; end if;
  if v_is_minor and (
       p_guardian is null
       or coalesce(btrim(p_guardian ->> 'name'), '') = ''
       or coalesce(btrim(p_guardian ->> 'phone'), '') = ''
       or coalesce((p_guardian ->> 'consented')::boolean, false) is not true
     ) then
    raise exception 'GUARDIAN_CONSENT_REQUIRED';
  end if;

  select * into v_waiver from public.health_document_versions
   where doc_type = 'liability_waiver' and retired_at is null;
  select * into v_consent from public.health_document_versions
   where doc_type = 'health_consent' and retired_at is null;
  select * into v_apss from public.health_document_versions
   where doc_type = 'apss_stage_1' and retired_at is null;
  if v_waiver.id is null or v_consent.id is null or v_apss.id is null then
    raise exception 'HEALTH_DOCUMENTS_NOT_PUBLISHED';
  end if;
  if p_waiver_version is not null and p_waiver_version <> v_waiver.version then
    raise exception 'WAIVER_VERSION_STALE';
  end if;
  if p_consent_version is not null and p_consent_version <> v_consent.version then
    raise exception 'CONSENT_VERSION_STALE';
  end if;

  -- APSS Stage 1: any 'true' answer means medical clearance is RECOMMENDED.
  v_clearance := (select bool_or(value::text = 'true') from jsonb_each(p_answers));

  update public.member_health_screenings
     set superseded_at = now()
   where user_id = v_user and superseded_at is null;

  insert into public.member_health_screenings (
    user_id, subject_full_name, subject_email, subject_dob, is_minor,
    instrument_version, answers, clearance_recommended, conditions, injuries,
    medications, pregnancy_status, free_text_notes,
    guardian_name, guardian_relationship, guardian_phone, guardian_signed_at,
    signature_name, signed_ip, signed_user_agent, source,
    expires_at, supersede_reason, destroy_after
  ) values (
    v_user, btrim(p_full_name), v_profile.email, p_date_of_birth, v_is_minor,
    v_apss.version, p_answers, v_clearance,
    coalesce(p_conditions, '[]'::jsonb), coalesce(p_injuries, '[]'::jsonb),
    nullif(btrim(coalesce(p_medications, '')), ''), p_pregnancy_status,
    nullif(btrim(coalesce(p_free_text_notes, '')), ''),
    p_guardian ->> 'name', p_guardian ->> 'relationship', p_guardian ->> 'phone',
    case when v_is_minor then now() else null end,
    btrim(p_signature_name),
    nullif(current_setting('request.headers', true)::jsonb ->> 'x-forwarded-for', '')::inet,
    left(coalesce(current_setting('request.headers', true)::jsonb ->> 'user-agent', ''), 400),
    p_source,
    now() + make_interval(days => v_policy.rescreen_interval_days),
    p_supersede_reason,
    greatest(
      (current_date + make_interval(years => v_policy.retention_years))::date,
      case when v_is_minor then (p_date_of_birth + interval '25 years')::date
           else (current_date + make_interval(years => v_policy.retention_years))::date end
    )
  ) returning id into v_screening_id;

  select id into v_prev_waiver from public.member_liability_waivers
   where user_id = v_user and superseded_at is null and withdrawn_at is null;
  if v_prev_waiver is null then
    insert into public.member_liability_waivers (
      user_id, subject_full_name, subject_email, subject_dob, is_minor,
      guardian_name, guardian_relationship, guardian_email, guardian_phone, guardian_signed_at,
      waiver_version, waiver_sha256, consent_version, consent_sha256,
      health_collection_consent, signature_name, signed_ip, signed_user_agent,
      expires_at, destroy_after
    ) values (
      v_user, btrim(p_full_name), v_profile.email, p_date_of_birth, v_is_minor,
      p_guardian ->> 'name', p_guardian ->> 'relationship',
      p_guardian ->> 'email', p_guardian ->> 'phone',
      case when v_is_minor then now() else null end,
      v_waiver.version, v_waiver.body_sha256, v_consent.version, v_consent.body_sha256,
      true, btrim(p_signature_name),
      nullif(current_setting('request.headers', true)::jsonb ->> 'x-forwarded-for', '')::inet,
      left(coalesce(current_setting('request.headers', true)::jsonb ->> 'user-agent', ''), 400),
      now() + make_interval(days => v_policy.waiver_reaccept_interval_days),
      greatest(
        (current_date + make_interval(years => v_policy.retention_years))::date,
        case when v_is_minor then (p_date_of_birth + interval '25 years')::date
             else (current_date + make_interval(years => v_policy.retention_years))::date end
      )
    );
  end if;

  insert into public.member_health_access_log (
    subject_user_id, subject_label, actor_id, actor_role, action, reason,
    disclosed_fields, record_count
  ) values (
    v_user, coalesce(v_profile.full_name, v_profile.email, 'Member'),
    v_user, 'self', 'create_screening', 'self_service', '{}', 1
  );

  perform public.recompute_member_health_status(v_user);
  return v_screening_id;
end; $$;

create or replace function public.member_health_summary()
returns table (
  safety_band text, waiver_current boolean, waiver_expires_at timestamptz,
  screening_current boolean, screening_expires_at timestamptz,
  clearance_required boolean, activity_advice text,
  booking_blocked boolean, block_reason text,
  waiver_version integer, consent_version integer, apss_version integer
)
language plpgsql security definer stable set search_path = public, pg_temp as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  return query
  select s.safety_band, s.waiver_current, s.waiver_expires_at,
         s.screening_current, s.screening_expires_at, s.clearance_required,
         s.activity_advice, s.booking_blocked, s.block_reason,
         (select version from public.health_document_versions
           where doc_type = 'liability_waiver' and retired_at is null),
         (select version from public.health_document_versions
           where doc_type = 'health_consent' and retired_at is null),
         (select version from public.health_document_versions
           where doc_type = 'apss_stage_1' and retired_at is null)
  from public.member_health_status s where s.user_id = v_user;
end; $$;

create or replace function public.member_withdraw_health_consent(p_reason text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  update public.member_liability_waivers
     set withdrawn_at = now(), withdrawn_reason = left(btrim(coalesce(p_reason, '')), 300)
   where user_id = v_user and withdrawn_at is null and superseded_at is null;
  update public.session_bookings set status = 'cancelled', cancelled_at = now()
   where user_id = v_user and status in ('requested', 'confirmed', 'waitlisted');
  insert into public.member_health_access_log (
    subject_user_id, subject_label, actor_id, actor_role, action, reason
  ) select v_user, coalesce(p.full_name, p.email, 'Member'), v_user, 'self',
           'withdraw_consent', 'self_service'
      from public.profiles p where p.id = v_user;
  perform public.recompute_member_health_status(v_user);
end; $$;

-- ── 13. Coach RPC — band + advice + emergency contact. Never the detail. ───
create or replace function public.staff_session_safety_roster(p_session_id uuid)
returns table (
  booking_id uuid, member_id uuid, display_name text, booking_status text,
  safety_band text, activity_advice text,
  emergency_contact_name text, emergency_contact_phone text, emergency_relationship text
)
language plpgsql security definer stable set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_session public.class_sessions%rowtype;
  v_is_admin boolean := public.is_admin();
  v_count integer;
begin
  if not public.is_staff() then raise exception 'STAFF_ONLY'; end if;
  select * into v_session from public.class_sessions where id = p_session_id;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;

  -- Coaches: only their own assigned class, only inside a 12h/12h window.
  if not v_is_admin then
    if v_session.coach_profile_id is null or v_session.coach_profile_id <> v_actor then
      raise exception 'SESSION_NOT_ASSIGNED';
    end if;
    if now() < v_session.start_time - interval '12 hours'
       or now() > coalesce(v_session.end_time, v_session.start_time + interval '2 hours')
                  + interval '12 hours' then
      raise exception 'SESSION_OUTSIDE_ACCESS_WINDOW';
    end if;
  end if;

  select count(*) into v_count from public.session_bookings b
   where b.class_session_id = p_session_id
     and b.status in ('requested', 'confirmed', 'attended', 'no_show');

  insert into public.member_health_access_log (
    subject_user_id, subject_label, actor_id, actor_role, action, reason,
    scope, class_session_id, disclosed_fields, record_count
  ) values (
    null, coalesce(v_session.title, 'Class'), v_actor,
    case when v_is_admin then 'admin' else 'coach' end,
    'view_roster_flags', 'class_delivery',
    coalesce(v_session.title, 'Class'), p_session_id,
    array['safety_band', 'activity_advice', 'emergency_contact'], v_count
  );

  return query
  select b.id, b.user_id,
         coalesce(p.full_name, p.email, 'XERT member'),
         b.status,
         coalesce(h.safety_band, 'not_screened'),
         h.activity_advice,
         e.contact_name, e.contact_phone, e.relationship
    from public.session_bookings b
    left join public.profiles p on p.id = b.user_id
    left join public.member_health_status h on h.user_id = b.user_id
    left join public.member_emergency_contacts e on e.user_id = b.user_id
   where b.class_session_id = p_session_id
     and b.status in ('requested', 'confirmed', 'attended', 'no_show')
   order by coalesce(p.full_name, p.email), b.created_at;
end; $$;

-- ── 14. Admin RPCs — detail read requires a reason and is always logged ────
create or replace function public.admin_member_health_record(
  p_user_id uuid,
  p_reason text
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_reason text := lower(btrim(coalesce(p_reason, '')));
  v_profile public.profiles%rowtype;
  v_result jsonb;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_user_id is null then raise exception 'MEMBER_REQUIRED'; end if;
  if v_reason not in ('incident_response', 'programming_review', 'clearance_followup',
                      'member_request', 'complaint_or_claim', 'data_correction',
                      'compliance_review') then
    raise exception 'HEALTH_ACCESS_REASON_REQUIRED';
  end if;
  select * into v_profile from public.profiles where id = p_user_id;
  if not found then raise exception 'MEMBER_NOT_FOUND'; end if;

  insert into public.member_health_access_log (
    subject_user_id, subject_label, actor_id, actor_role, action, reason,
    disclosed_fields, record_count, ip, user_agent
  ) values (
    p_user_id, coalesce(v_profile.full_name, v_profile.email, 'Member'),
    v_actor, 'admin', 'view_detail', v_reason,
    array['apss_answers', 'conditions', 'injuries', 'medications',
          'pregnancy_status', 'notes', 'clearances', 'waiver'], 1,
    nullif(current_setting('request.headers', true)::jsonb ->> 'x-forwarded-for', '')::inet,
    left(coalesce(current_setting('request.headers', true)::jsonb ->> 'user-agent', ''), 400)
  );

  select jsonb_build_object(
    'status', to_jsonb(h),
    'screening', to_jsonb(s),
    'waiver', jsonb_build_object(
      'signed_at', w.signed_at, 'expires_at', w.expires_at,
      'waiver_version', w.waiver_version, 'consent_version', w.consent_version,
      'signature_name', w.signature_name, 'is_minor', w.is_minor,
      'guardian_name', w.guardian_name, 'withdrawn_at', w.withdrawn_at),
    'clearances', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.sighted_at desc)
        from public.member_health_clearances c where c.user_id = p_user_id), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'signed_at', x.signed_at, 'superseded_at', x.superseded_at,
               'clearance_recommended', x.clearance_recommended,
               'supersede_reason', x.supersede_reason) order by x.signed_at desc)
        from public.member_health_screenings x
       where x.user_id = p_user_id and x.superseded_at is not null), '[]'::jsonb)
  ) into v_result
  from public.member_health_status h
  left join public.member_health_screenings s
    on s.user_id = h.user_id and s.superseded_at is null
  left join public.member_liability_waivers w
    on w.user_id = h.user_id and w.superseded_at is null
  where h.user_id = p_user_id;

  return coalesce(v_result, jsonb_build_object('status', null));
end; $$;

create or replace function public.admin_set_member_activity_advice(
  p_user_id uuid,
  p_advice text,
  p_expected_updated_at timestamptz
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_advice text := nullif(btrim(coalesce(p_advice, '')), '');
  v_updated_at timestamptz;
  v_profile public.profiles%rowtype;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_expected_updated_at is null then raise exception 'HEALTH_STATUS_VERSION_REQUIRED'; end if;
  if v_advice is not null and char_length(v_advice) > 140 then raise exception 'ADVICE_TOO_LONG'; end if;
  select * into v_profile from public.profiles where id = p_user_id;
  if not found then raise exception 'MEMBER_NOT_FOUND'; end if;

  select updated_at into v_updated_at from public.member_health_status
   where user_id = p_user_id for update;
  if not found then raise exception 'HEALTH_STATUS_NOT_FOUND'; end if;
  if v_updated_at is distinct from p_expected_updated_at then raise exception 'HEALTH_STATUS_STALE'; end if;

  update public.member_health_status
     set activity_advice = v_advice, advice_set_by = auth.uid(), advice_set_at = now()
   where user_id = p_user_id;

  insert into public.member_health_access_log (
    subject_user_id, subject_label, actor_id, actor_role, action, reason,
    scope, disclosed_fields
  ) values (
    p_user_id, coalesce(v_profile.full_name, v_profile.email, 'Member'),
    auth.uid(), 'admin', 'set_advice', 'programming_review',
    left(coalesce(v_advice, 'cleared'), 200), array['activity_advice']
  );

  perform public.recompute_member_health_status(p_user_id);
end; $$;

create or replace function public.admin_record_health_clearance(
  p_user_id uuid, p_outcome text, p_practitioner_name text,
  p_practitioner_practice text, p_clearance_dated date,
  p_restrictions text default null, p_valid_until date default null
)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_screening uuid; v_profile public.profiles%rowtype;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_outcome not in ('cleared', 'cleared_with_restrictions', 'not_cleared') then
    raise exception 'CLEARANCE_OUTCOME_INVALID';
  end if;
  select * into v_profile from public.profiles where id = p_user_id;
  if not found then raise exception 'MEMBER_NOT_FOUND'; end if;
  select id into v_screening from public.member_health_screenings
   where user_id = p_user_id and superseded_at is null;

  insert into public.member_health_clearances (
    user_id, screening_id, outcome, practitioner_name, practitioner_practice,
    clearance_dated, restrictions, sighted_by, valid_until, destroy_after
  ) values (
    p_user_id, v_screening, p_outcome, btrim(p_practitioner_name),
    nullif(btrim(coalesce(p_practitioner_practice, '')), ''), p_clearance_dated,
    nullif(btrim(coalesce(p_restrictions, '')), ''), auth.uid(), p_valid_until,
    (current_date + interval '7 years')::date
  ) returning id into v_id;

  insert into public.member_health_access_log (
    subject_user_id, subject_label, actor_id, actor_role, action, reason, disclosed_fields
  ) values (
    p_user_id, coalesce(v_profile.full_name, v_profile.email, 'Member'),
    auth.uid(), 'admin', 'record_clearance', 'clearance_followup',
    array['clearance_outcome', 'practitioner']
  );
  return v_id;
end; $$;

create or replace function public.admin_health_compliance_queue(p_limit integer default 100)
returns table (
  user_id uuid, full_name text, email text, safety_band text,
  waiver_current boolean, screening_current boolean, screening_expires_at timestamptz,
  clearance_required boolean, has_flagged_detail boolean,
  advice_missing boolean, booking_blocked boolean
)
language plpgsql security definer stable set search_path = public, pg_temp as $$
declare v_limit integer := greatest(1, least(500, coalesce(p_limit, 100))); v_count integer;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  select count(*) into v_count from public.member_health_status h
   where h.booking_blocked or h.clearance_required
      or (h.has_flagged_detail and h.activity_advice is null)
      or h.screening_expires_at < now() + interval '30 days';
  insert into public.member_health_access_log (
    subject_user_id, subject_label, actor_id, actor_role, action, reason,
    disclosed_fields, record_count
  ) values (
    null, 'Compliance queue', auth.uid(), 'admin', 'view_compliance_queue',
    'compliance_review', array['safety_band', 'currency_dates'], v_count
  );
  return query
  select h.user_id, p.full_name, p.email, h.safety_band,
         h.waiver_current, h.screening_current, h.screening_expires_at,
         h.clearance_required, h.has_flagged_detail,
         h.has_flagged_detail and h.activity_advice is null,
         h.booking_blocked
    from public.member_health_status h
    join public.profiles p on p.id = h.user_id
   where h.booking_blocked or h.clearance_required
      or (h.has_flagged_detail and h.activity_advice is null)
      or h.screening_expires_at < now() + interval '30 days'
   order by h.booking_blocked desc, h.clearance_required desc, h.screening_expires_at nulls first
   limit v_limit;
end; $$;

-- ── 15. Retention and destruction ──────────────────────────────────────────
create table if not exists public.member_health_destructions (
  id uuid primary key default gen_random_uuid(),
  record_table text not null,
  record_id uuid not null,
  subject_label text not null,
  subject_dob date,
  signed_at timestamptz,
  destroy_after date not null,
  destroyed_at timestamptz not null default now(),
  method text not null default 'scheduled_purge'
);
alter table public.member_health_destructions enable row level security;
revoke all on table public.member_health_destructions from public, anon, authenticated;
drop policy if exists "member_health_destructions_admin_read" on public.member_health_destructions;
create policy "member_health_destructions_admin_read" on public.member_health_destructions
  for select to authenticated using ((select public.is_admin()));
grant select on table public.member_health_destructions to authenticated;
drop trigger if exists member_health_destructions_immutable on public.member_health_destructions;
create trigger member_health_destructions_immutable
  before update or delete on public.member_health_destructions
  for each row execute function public.guard_member_health_access_log();

create or replace function public.purge_expired_health_records()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_purged integer := 0; v_row record;
begin
  perform set_config('xert.health_retention_purge', 'running', true);
  for v_row in
    select 'member_health_screenings' as t, s.id, s.subject_full_name, s.subject_dob,
           s.signed_at, s.destroy_after
      from public.member_health_screenings s
     where s.destroy_after <= current_date
       and not exists (
         select 1 from public.session_bookings b
          where b.user_id = s.user_id
            and b.created_at > current_date - interval '7 years')
    union all
    select 'member_liability_waivers', w.id, w.subject_full_name, w.subject_dob,
           w.signed_at, w.destroy_after
      from public.member_liability_waivers w
     where w.destroy_after <= current_date
       and not exists (
         select 1 from public.session_bookings b
          where b.user_id = w.user_id
            and b.created_at > current_date - interval '7 years')
  loop
    insert into public.member_health_destructions (
      record_table, record_id, subject_label, subject_dob, signed_at, destroy_after
    ) values (
      v_row.t, v_row.id, v_row.subject_full_name, v_row.subject_dob,
      v_row.signed_at, v_row.destroy_after
    );
    if v_row.t = 'member_health_screenings' then
      delete from public.member_health_screenings where id = v_row.id;
    else
      delete from public.member_liability_waivers where id = v_row.id;
    end if;
    v_purged := v_purged + 1;
  end loop;
  delete from public.member_health_access_log where created_at < now() - interval '7 years';
  perform set_config('xert.health_retention_purge', '', true);
  return v_purged;
end; $$;
revoke execute on function public.purge_expired_health_records() from public, anon, authenticated;
grant execute on function public.purge_expired_health_records() to service_role;

-- ── 16. Keep health data OUT of admin_member_notes ─────────────────────────
-- This is a nudge, not a security control. It is defeated by rephrasing. The
-- real controls are the audited home above plus staff training. It exists so
-- the common accident ("BP is 160/100, told him to see his GP") is caught.
create or replace function public.guard_admin_member_note_health_content()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.body ~* '\y(asthma|diabet|epilep|seizure|angina|cardiac|heart attack|
                    stroke|blood pressure|hypertens|pregnan|medication|prescrib|
                    diagnos|physio referral|surgery|chemo|insulin|inhaler)\y' then
    raise exception 'HEALTH_NOTE_WRONG_HOME';
  end if;
  return new;
end; $$;
revoke execute on function public.guard_admin_member_note_health_content() from public, anon, authenticated;
drop trigger if exists admin_member_notes_health_guard on public.admin_member_notes;
create trigger admin_member_notes_health_guard
  before insert or update of body on public.admin_member_notes
  for each row execute function public.guard_admin_member_note_health_content();

comment on table public.admin_member_notes is
  'Operational servicing notes ONLY. Health information is prohibited here: '
  'this table has no read audit, no immutability guard and no retention clock. '
  'Health data belongs in member_health_screenings via member_submit_health_screening().';

-- ── 17. Lead-form health field (reconcile with live health_info_consent) ───
-- SUPERSEDED as written: do not drop injuries_or_limitations_optional while
-- leaving live health_info_consent / Privacy remediation orphaned. Prefer
-- keep consented lead field → funnel into APSS; or drop field + consent UI +
-- Privacy in one coordinated change (see Integration constraints §4).
-- update public.member_interest set injuries_or_limitations_optional = null ...
-- alter table public.member_interest drop column if exists ...;

-- ── 18. Grants ─────────────────────────────────────────────────────────────
revoke execute on function public.member_submit_health_screening(
  text, date, jsonb, jsonb, jsonb, text, text, text, text, integer, integer,
  boolean, jsonb, text, text) from public, anon;
revoke execute on function public.member_health_summary() from public, anon;
revoke execute on function public.member_withdraw_health_consent(text) from public, anon;
revoke execute on function public.staff_session_safety_roster(uuid) from public, anon;
revoke execute on function public.admin_member_health_record(uuid, text) from public, anon;
revoke execute on function public.admin_set_member_activity_advice(uuid, text, timestamptz) from public, anon;
revoke execute on function public.admin_record_health_clearance(
  uuid, text, text, text, date, text, date) from public, anon;
revoke execute on function public.admin_health_compliance_queue(integer) from public, anon;
grant execute on function public.member_submit_health_screening(
  text, date, jsonb, jsonb, jsonb, text, text, text, text, integer, integer,
  boolean, jsonb, text, text) to authenticated;
grant execute on function public.member_health_summary() to authenticated;
grant execute on function public.member_withdraw_health_consent(text) to authenticated;
grant execute on function public.staff_session_safety_roster(uuid) to authenticated;
grant execute on function public.admin_member_health_record(uuid, text) to authenticated;
grant execute on function public.admin_set_member_activity_advice(uuid, text, timestamptz) to authenticated;
grant execute on function public.admin_record_health_clearance(
  uuid, text, text, text, date, text, date) to authenticated;
grant execute on function public.admin_health_compliance_queue(integer) to authenticated;

insert into public.xert_schema_capabilities (capability)
values ('member_health_screening')
on conflict (capability) do nothing;
```

Also add mirror file `src/supabase/member_health_screening_upgrade.sql` (identical body) to match the repo's dual migration/upgrade convention.

## Backend

All logic is in Postgres. No new Vercel function is required except the retention cron and one change to an existing endpoint.

RPC surface (all `supabase.rpc(...)` from the existing clients):

Member: `member_submit_health_screening(...)`, `member_health_summary()`, `member_withdraw_health_consent(p_reason)`. Emergency contact is a plain RLS-protected `upsert` on `member_emergency_contacts` — no RPC needed.

Staff (coach or admin): `staff_session_safety_roster(p_session_id)`.

Admin: `admin_member_health_record(p_user_id, p_reason)`, `admin_set_member_activity_advice(p_user_id, p_advice, p_expected_updated_at)`, `admin_record_health_clearance(...)`, `admin_health_compliance_queue(p_limit)`.

Service role: `purge_expired_health_records()`.

Booking gate: the `session_bookings_health_gate` BEFORE trigger. It fires on insert and on transitions into an active status, so `book_session()`, `join_session_waitlist()`, `admin_promote_next_waitlisted()` and `admin_set_booking_status()` are all covered without touching any of those functions. New raised codes: `HEALTH_WAIVER_REQUIRED`, `HEALTH_SCREENING_REQUIRED`, `HEALTH_SCREENING_EXPIRED`.

Existing files to change:

`src/lib/bookingData.js` — add the three codes to `BOOKING_ERRORS` so `friendlyBookingError` maps them ("Complete your health screening before booking. It takes about a minute."). Add `getMyHealthSummary()`, `submitHealthScreening(payload)`, `saveEmergencyContact(contact)`, `withdrawHealthConsent(reason)`.

`src/lib/adminData.js` — add `adminMemberHealthRecord(userId, reason)`, `adminSetActivityAdvice(userId, advice, expectedUpdatedAt)` (reuse the existing `assertAdminMutationVersion` staleness message shape and map `HEALTH_STATUS_STALE`), `adminRecordHealthClearance(...)`, `adminHealthComplianceQueue(limit)`, `staffSessionSafetyRoster(sessionId)`. Extend `adminPromoteNextWaitlisted` and `adminSetBookingStatus` error mapping for the three `HEALTH_*` codes. Extend `adminMemberDetail` to include `healthStatusAvailable` — but NOT the detail; the detail is fetched on explicit click with a reason.

`src/lib/adminData.js` `getOperationsHealth()` — add a `member-health` check: counts of blocked members, clearance-pending, flagged-with-no-advice, screenings expiring in 30 days, and `attention` when any coach-assigned class today has an unscreened attendee. It follows the existing `healthCheck(key, label, fn)` helper exactly.

`api/delete-account.js` — `deleteMemberAccount()` must be extended and must NOT cascade the health record away. Add before `admin.auth.admin.deleteUser`: an insert into `member_health_access_log` (`actor_role: 'service'`, `action: 'destroy'`, `reason: 'member_request'`), and a `member_emergency_contacts` delete. The waiver/screening rows survive because `user_id` is `on delete set null` and the identity snapshot is retained; the purge job destroys them on the retention clock. Update `test/delete-account.test.js`.

New `api/health-retention.js` — Vercel cron (`vercel.json` `crons`, daily 03:00 UTC), service-role client, calls `purge_expired_health_records()`, returns `{ purged }`. Guard with the same `requestHeader`/`sendJson` helpers from `api/http.js` and a `CRON_SECRET` bearer check, matching how the other server endpoints authenticate.

`src/lib/schemaCapabilities.js` — add `member_health_screening: 'Apply supabase/migrations/20260726000000_member_health_screening.sql in Supabase.'`

`src/lib/adminAudit.js` — add `'health'` to `AUDIT_TYPES` and `AUDIT_ACTION_LABELS` ('Health record access'), and a `healthAccessEvents` branch in `buildAdminAuditEvents` sourced from `member_health_access_log`. Crucially: the audit list must show WHO read WHOSE record and WHY, never what was in it.

## Web UI

New files:

`src/pages/HealthScreening.jsx` — route `/health-screening`, lazy-loaded and registered in `src/App.jsx` alongside the other `lazy(() => import(...))` entries. Four steps: (1) identity + DOB + emergency contact, (2) the verbatim APSS Stage 1 seven questions as yes/no radios, (3) conditions/injuries/medications addendum, (4) the consent + waiver panel. Consent is three separate, individually-required checkboxes — collect health info / disclose band+advice to coaches / accept the liability waiver — never one bundled tick and never reusing `consent_to_contact`. Uses `src/components/public/PublicNav.jsx` + `PublicFooter.jsx` and `src/components/public/FormCheckbox.jsx` for consistency.

`src/components/public/HealthScreeningForm.jsx` — the stepper body, styled off `src/components/public/MemberInterestForm.jsx`.

`src/lib/healthScreening.js` — the APSS Stage 1 question text/keys as a frozen array, `apssClearanceRecommended(answers)`, `screeningPayloadError(draft)` (pure, mirrors `src/lib/memberAdmin.js` normalize-and-throw style), guardian-required age logic.

`src/lib/healthSafety.js` — pure, testable: `SAFETY_BANDS`, `safetyBandLabel(band)`, `safetyBandTone(band)` returning the existing `xert-red` / `#e0b36a` / `xert-steel` palette values, `healthGateMessage(status)`, `rescreenDueLabel(status)`.

`src/pages/CoachToday.jsx` + `src/components/CoachRoute.jsx` — route `/coach`. `CoachRoute` mirrors `src/components/admin/AdminRoute.jsx` but gates with [spec 07](07-staff-accounts-and-roles.md) helpers (`profiles.role = 'coach'` / `is_coach()`, owners via `is_admin()` as needed). Deliberately a separate route so the 55 kB `AdminCommandCentre` chunk is never shipped to a coach. Shows today's assigned classes and, per attendee, a coloured band pill, the advice line, and a tap-to-reveal emergency contact. No link anywhere to a clinical detail view.

`src/components/admin/MemberHealthPanel.jsx` — mounted inside the member drawer in `src/components/admin/MembersManager.jsx`, next to the existing "Staff notes" and "Private notices" sections. Default state shows ONLY band, currency dates and the advice editor. "View clinical detail" is a separate button that opens `src/components/admin/AdminConfirmDialog.jsx` requiring a reason from the fixed vocabulary before `adminMemberHealthRecord` is called, with the copy "This access is recorded against your name and is visible to the member." Advice editing uses the repo's `expected_updated_at` optimistic-lock pattern.

`src/components/admin/HealthComplianceManager.jsx` — new admin section. Tabs: Compliance queue (`admin_health_compliance_queue`), Access log (from `member_health_access_log`, filterable by actor and subject, CSV export via `src/lib/csv.js`), Documents (publish a new waiver/consent/APSS version, which forces re-acceptance), Policy (the `health_policy_settings` switches).

Extend:
`src/lib/adminNavigation.js` — add `'member-health'` to `ADMIN_SECTION_KEYS`. Do NOT reuse `'health'`; that key is already Operations Health.
`src/components/admin/AdminLayout.jsx` (nav array, ~line 22) and `src/components/admin/CommandPalette.jsx` (~line 15) — add the `member-health` entry with a `HeartPulse` lucide icon.
`src/pages/AdminCommandCentre.jsx` — lazy-render the new section.
`src/components/admin/ClassCalendarAdmin.jsx` — in the roster block (~line 898) render a band pill per member and the advice line, sourced from `staffSessionSafetyRoster`, not from `adminSessionRoster`. Block the "Take attendance" button copy with a warning when any attendee is `not_screened`.
`src/pages/Account.jsx` — a "Training safety" card above the bookings list: band, what coaches can see (verbatim advice line — this is the transparency control), re-screen due date, "Update my health details" and "Withdraw consent" actions. Add `getMyHealthSummary()` to the existing `Promise.all` in `refresh()` with `.catch(() => null)` so an un-migrated install never breaks the account page, matching the existing additive-migration pattern.
`src/pages/Booking.jsx` — when `booking_blocked`, replace every class action button with a single "Complete health screening" CTA to `/health-screening`; do not let members reach a failing RPC.
`src/components/public/MemberInterestForm.jsx` — DELETE the `injuries_or_limitations_optional` field (state at line ~61, label/textarea at lines ~207-209). Replace with a non-health prompt ("Anything you'd like us to know before your first session?" is still risky — use "What are you hoping to get out of training?").
`src/pages/Privacy.jsx` — new sections: health information and separate consent, who sees what (coach vs owner), the read-access log and the member's right to see it, the retention schedule, and the destruction certificate. Bump `updated`.
`src/pages/Terms.jsx` — reference the waiver without restating it.

New tests: `test/health-screening-apss.test.js` (clearance derivation over all 128 answer combinations, guardian/age rules), `test/health-safety-band.test.js` (band derivation and labels), `test/health-booking-gate.test.js` (gate message contract), `test/health-access-audit.test.js` (the reason vocabulary matches the DB check constraint — read both files, same technique as `test/booking-error-contract.test.js`). Extend `test/booking-error-contract.test.js` with the three new codes and `test/schema-capabilities.test.js` with the new capability.

## iOS UI

New files:

`ios/XertFitnessApp/XertFitnessApp/HealthScreening.swift` — `APSSQuestion` (id/text), the frozen seven-question array, `SafetyBand` enum (`notScreened/clear/caution/clearancePending`) with `label`, `tint` and `sortPriority`, `MemberHealthSummary: Codable`, `HealthScreeningDraft` with client-side validation mirroring `src/lib/healthScreening.js`. Placed at top level next to `BookingCancellationPolicy.swift` and `MemberStateVersion.swift`, matching where the repo puts pure model/policy types.

`ios/XertFitnessApp/XertFitnessApp/Views/HealthScreeningView.swift` — the same four-step flow, presented as a full-screen sheet from `BookingView` and `AccountView`. Three separate `Toggle`s for the three consents; the submit button stays disabled until all three are on. Use the existing `Theme.swift` tokens.

`ios/XertFitnessApp/XertFitnessApp/Views/CoachSafetyRosterView.swift` — the coach surface. A list of today's assigned classes and, per attendee, name + band chip + advice line + a `DisclosureGroup` for the emergency contact. No path to clinical detail exists in the binary.

Extend:

`ios/XertFitnessApp/XertFitnessApp/Models.swift` — `MemberHealthSummary`, `EmergencyContact`.
`ios/XertFitnessApp/XertFitnessApp/AdminModels.swift` — add `StaffSafetyRosterMember` (booking_id, member_id, display_name, booking_status, safety_band, activity_advice, emergency_contact_*). Add `safety_band: String?` and `activity_advice: String?` to the existing `AdminRosterMember` (line 55) so the admin roster shows the same chips.
`ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift` — `memberHealthSummary(session:)`, `submitHealthScreening(session:draft:)`, `saveEmergencyContact(session:contact:)`, `withdrawHealthConsent(session:reason:)`, `staffSessionSafetyRoster(session:classSessionID:)`, `adminMemberHealthRecord(session:memberID:reason:)`, `adminSetActivityAdvice(session:memberID:advice:expectedUpdatedAt:)`, `adminHealthComplianceQueue(session:)`. All follow the existing `/rest/v1/rpc/...` POST shape used by `adminGrantCredits` and `adminSessionRoster`.
`ios/XertFitnessApp/XertFitnessApp/Store/XertStore.swift` — `@Published var healthSummary: MemberHealthSummary?`, `@Published var isSubmittingHealthScreening = false`, load it in `performRefresh` behind the existing `unavailableDataSources` degradation so an un-migrated backend degrades instead of erroring (add an `XertDataSource` case). Add `submitHealthScreening(_:)` and `withdrawHealthConsent(_:)`.
`ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift` — `@Published var safetyRoster: [StaffSafetyRosterMember]`, `loadSafetyRoster(session:classSessionID:)`, `setActivityAdvice(...)`, `complianceQueue`.
`ios/XertFitnessApp/XertFitnessApp/BookingCancellationPolicy.swift` — add `("HEALTH_WAIVER_REQUIRED", ...)`, `("HEALTH_SCREENING_REQUIRED", ...)`, `("HEALTH_SCREENING_EXPIRED", ...)` to `BookingErrorMessage`. `test/booking-error-contract.test.js` reads this file and will fail without it.
`ios/XertFitnessApp/XertFitnessApp/Views/AccountView.swift` — a `healthSafetySection` inserted into `signedInSections` (line ~166) between `membershipSection` and `accountDetailsSection`: band, "what your coach sees" showing the literal advice string, re-screen due date, update and withdraw actions.
`ios/XertFitnessApp/XertFitnessApp/Views/BookingView.swift` — when `healthSummary?.bookingBlocked == true`, replace the per-class book buttons with one "Complete health screening" row that presents `HealthScreeningView`.
`ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift` — in `AdminClassRosterView` (line ~1455) render the band chip and advice line per member; add a "Member health" section reading the compliance queue. The clinical-detail reason prompt is a `confirmationDialog` with the fixed reason list.
`ios/XertFitnessApp/XertFitnessApp/Views/RootView.swift` — route coaches (role `coach`) to `CoachSafetyRosterView` rather than `AdminCommandCentreView`, which is admin-gated.
`ios/XertFitnessApp/XertFitnessApp/Services/AppPrivacyLock.swift` — make the privacy lock MANDATORY (not a user preference) whenever the signed-in profile role is `coach` or `admin`, since those sessions can surface safety bands. `test/native-privacy-lock.test.js` will need updating.
`ios/XertFitnessApp/XertFitnessApp/PrivacyInfo.xcprivacy` — add an `NSPrivacyCollectedDataType` entry for `NSPrivacyCollectedDataTypeHealth` and `...OtherDiagnosticData`, purpose `AppFunctionality`, linked to identity, not used for tracking. This is required or App Review will reject; also update the App Store Connect privacy nutrition labels. `test/native-privacy-manifest.test.js` asserts on this file and must be extended.

Note for the iOS engineer: do NOT touch HealthKit. Reading HealthKit would trigger App Store Guideline 5.1.3 and a much heavier review, for zero benefit here.

## Security, privacy and compliance

Threat model and controls, strongest-first.

1. No PostgREST read path exists. `member_liability_waivers`, `member_health_screenings` and `member_health_clearances` have RLS enabled and ZERO policies, with `revoke all ... from public, anon, authenticated`. `supabase.from('member_health_screenings').select('*')` returns empty for an admin, an owner, and a compromised admin JWT alike. The only way to read them is `admin_member_health_record()`, which inserts the audit row before it selects. That is what makes the read audit unbypassable rather than merely conventional. RLS is deliberately NOT forced, because the SECURITY DEFINER functions are owned by `postgres` and forcing RLS with no policies would break them.

2. Least privilege by role. `public.is_admin()` is unchanged, so a `coach` inherits nothing from the ~50 policies that call it. A coach's entire new capability is one function, `staff_session_safety_roster(uuid)`, which is row-scoped to `class_sessions.coach_profile_id = auth.uid()` and time-boxed to start−12h .. end+12h. A coach cannot list members, cannot query another coach's class, cannot read a record outside a class window, and cannot see any answer, condition, medication, injury or diagnosis. The bands are: `not_screened | clear | caution | clearance_pending`.

3. Be honest about what the band is. `safety_band` and `activity_advice` ARE health information under s 6FA — "clearance_pending" implies a condition. This design minimises rather than eliminates disclosure; do not tell members it is non-health. The consent text must say plainly: "Your coach will see a colour-coded flag and a short training instruction, and your emergency contact. Your coach will not see your answers, conditions, injuries or medications."

4. Access audit on READ. `member_health_access_log` records subject, actor, actor role, action, mandatory reason from a fixed vocabulary, disclosed field list, record count, session id, IP and user agent. It is append-only (`guard_member_health_access_log` raises on update and delete). Members can read their own access log — a member can see exactly who opened their record and why. That single policy does more for compliance behaviour than any staff policy document.

5. Write immutability. Signed waivers and screenings are never edited. A correction supersedes; the superseded row is retained because the record of what was known ON THE DAY OF INJURY is the one that matters in a claim. `guard_member_health_record_write` permits only `superseded_at`, `superseded_by`, `withdrawn_at`, `revoked_at` and `destroy_after` to change, and permits deletion only inside the retention purge, gated by the `xert.health_retention_purge` session variable — the same `current_setting` technique already used by `guard_session_pack_payment_activation`.

6. `admin_member_notes` must never hold health data, and this is now stated in a table comment plus a keyword trigger. Read `supabase/migrations/20260714003000_admin_member_notes.sql`: the table has a plain admin-wide SELECT policy, no read audit, no immutability guard, no retention clock, and its bodies are returned wholesale by `admin_list_member_notes`. Putting a blood-pressure reading there is a notifiable-breach-grade mistake with no trail. The keyword trigger is a nudge that a determined typist defeats by rephrasing; it is not a control. The controls are the audited alternative home, the table comment, and training.

7. Existing defect being fixed. `member_interest.injuries_or_limitations_optional` (see `src/components/public/MemberInterestForm.jsx` lines 61 and 207-209) collects free-text injury data on a table that `anon` can INSERT into, that any admin can SELECT wholesale, with no health-specific consent (only `consent_to_contact`), no read audit and no retention. The migration nulls and drops the column. This should be treated as a pre-existing collection to remediate, not a new feature.

8. Privacy Act applicability — the item most likely underestimated. XERT is a small business, but s 6D(4)(b) removes the small-business exemption for an entity that provides a health service and holds health information, and s 6FB defines a health service broadly enough to capture personal training and exercise prescription. Building this feature is the act that makes XERT APP-bound. That brings APP 3.3 (separate consent for sensitive info), APP 5 (collection notice), APP 6 (use/disclosure limited to the primary purpose — a screening record may NOT be used for marketing segmentation), APP 11 (security and destruction), APP 12/13 (access and correction), and Part IIIC, the Notifiable Data Breaches scheme: an unauthorised disclosure of these tables likely to cause serious harm must be reported to the OAIC and affected individuals within 30 days. Write a one-page breach response plan naming who assesses and who notifies before go-live.

9. Consent design. Three separate, individually-required checkboxes, never bundled with T&Cs or `consent_to_contact`: collect health information; disclose band + advice to coaches; accept the liability waiver. Each stores its own version number and SHA-256 of the exact text shown, alongside signature name, timestamp, IP and user agent — the same snapshot discipline already used by `20260716040000_stripe_order_terms_snapshot.sql`. Withdrawal of consent is honoured immediately by `member_withdraw_health_consent()`, which also cancels active bookings, because a member who withdraws cannot be trained. Say that in the withdrawal dialog rather than letting them discover it.

10. Retention and destruction schedule.
- Waiver and screening (adults): 7 years after the later of last training activity or account closure. Rationale: Limitation of Actions Act 1974 (Qld) s 11 gives 3 years for personal injury with a s 31 extension discretion, and s 10 gives 6 years for contract; 7 years is the defensible floor and aligns with the record-keeping horizon the business already runs for tax.
- Minors: until the subject turns 25 (18 + 7), because time does not run against a minor until majority. `destroy_after` takes the greater of the two.
- Superseded screening versions: retained on the same clock as the current one. Never destroy the version that was current on the day of an incident.
- Access log: 7 years — it is the evidence the access was appropriate.
- Doctor clearance letters: not stored digitally at all in v1. `member_health_clearances` records the fact, outcome, practitioner, date and restrictions, typed by an admin from a letter that is sighted and returned. Zero digital custody of the single most sensitive artefact. If uploads are added later they need a private bucket, short-lived signed URLs issued from a server function, and a 12-month post-departure file purge that keeps the fact and destroys the document. Do NOT reuse the `site-images` bucket from `src/supabase/storage_setup.sql`; it is public.
- `purge_expired_health_records()` writes a destruction certificate into `member_health_destructions` for every row it destroys, so the business can prove destruction happened.

11. Account deletion vs legal retention. These genuinely conflict. APP 11.2 requires destruction when no longer needed, but carves out information still needed for a permitted purpose — establishing a legal defence qualifies. Resolution: `api/delete-account.js` deletes the profile and emergency contact, nulls `user_id` on the waiver and screening, and leaves the identity snapshot so the record remains legally usable. The purge job destroys it on the clock. Say this in the deletion dialog and in `src/pages/Privacy.jsx`; a member who deletes their account and is told "everything is gone" while a waiver survives has been misled, and that is itself an APP 1 transparency failure.

12. Minors. Genuinely risky and under-scoped in the brief. A minor generally cannot be bound by an exclusion clause, and a guardian's signature operates as an indemnity rather than a waiver by the child; the enforceability question is for the gym's insurer and solicitor, not for this design. Technically: DOB is mandatory, `is_minor` is derived server-side, and the guardian block is enforced by a table check constraint so it cannot be bypassed by calling the RPC directly. Default `minimum_unaccompanied_age` is 16.

13. Operational. Enable Supabase leaked-password protection and MFA for every `admin` and `coach` account before go-live — an admin password is now the key to the clinical record. Rotate any admin who leaves. The compliance-queue and access-log CSV exports are themselves a disclosure; they are logged as `action = 'export'`.

## Rollout

Six phases. Nothing user-visible ships until phase 3, and no member is blocked until phase 5.

Phase 0 — legal, before any code (owner + solicitor + insurer, ~1 week).
Confirm APSS Stage 1 reproduction terms with ESSA / Fitness Australia and get the attribution wording. Have the liability waiver and the health collection consent notice drafted or reviewed by a solicitor — do not write these yourself and do not copy another gym's. Confirm with the insurer: minimum age, whether an unsigned waiver voids cover, and whether they require the waiver to be re-signed annually rather than every three years. Confirm the "sight and return" clearance-letter process is acceptable to them.

Phase 1 — schema, dark (1 day).
Apply `supabase/migrations/20260726000000_member_health_screening.sql`. `health_policy_settings.screening_enforced` and `waiver_enforced` both ship as `true` in the DDL, so set them BOTH to `false` in the same transaction before anything else runs, or the gate will lock out every existing member on the next booking. Do this explicitly:
```sql
update public.health_policy_settings set screening_enforced = false, waiver_enforced = false;
```
Backfill `member_health_status` for every existing profile:
```sql
insert into public.member_health_status (user_id)
select id from public.profiles on conflict do nothing;
select public.recompute_member_health_status(id) from public.profiles;
```
Publish v1 of all three documents into `health_document_versions`. Verify the capability appears in Operations Health and that `npm run build` and the test suite still pass.

Phase 2 — staff data model (1 day).
Set `class_sessions.coach_profile_id` for the classes each coach runs. Promote coaches via [spec 07](07-staff-accounts-and-roles.md) invite / `admin_set_role` (not this spec’s superseded DDL). Verify with a real coach login that `staff_session_safety_roster` returns rows for their own class and raises `SESSION_NOT_ASSIGNED` for someone else's. This is the step most likely to be skipped, and the coach surface is useless without it.

Phase 3 — member-facing, opt-in (1 week).
Ship the web and iOS screening flow, the Account "Training safety" card, and the Privacy Policy rewrite. Ship the `MemberInterestForm` field removal in the same deploy as the column drop. Invite existing members by targeted notice via the existing `admin_send_member_notice` RPC ("Complete your health screening — takes a minute"), with a `/health-screening` deep link. No blocking. Watch the compliance queue fill.

Phase 4 — staff surfaces (concurrent with 3).
Ship `HealthComplianceManager`, the `MemberHealthPanel` in the member drawer, the roster chips in `ClassCalendarAdmin` and `AdminClassRosterView`, `/coach` and `CoachSafetyRosterView`. Owner works the queue: write `activity_advice` for every member with `has_flagged_detail`, chase every `clearance_pending`. The Operations Health check is the gauge for when phase 5 is safe.

Phase 5 — enforcement (flip when ≥90% of active members are current).
`update public.health_policy_settings set waiver_enforced = true;` first, wait a week, then `screening_enforced = true`. Two separate flips so a problem is attributable. Give 14 days' notice by member notice before each. Grace: the 60-day `rescreen_grace_days` window means a lapsed annual re-screen flags before it blocks — do not set this to 0.

Phase 6 — retention (after enforcement is stable).
Deploy `api/health-retention.js` and the daily Vercel cron. Its first real destruction is seven years away, so verify it against seeded rows with a back-dated `destroy_after` in a Supabase branch, not in production.

Feature flag: `health_policy_settings.screening_enforced` / `waiver_enforced` is the kill switch and is deliberately NOT in `admin_settings`, because `guard_session_pack_payment_activation` (see `supabase/migrations/20260716060000_payment_activation_drift_guard.sql`) raises `PAYMENT_SETTINGS_CHANGE_REQUIRES_PAUSE` on ANY column change to that table while payments are live. Putting the health switch there would make it impossible to turn off during an incident without first pausing payments.

Rollback: setting both flags to `false` disables the gate instantly with no deploy and no data loss. The schema itself is additive except the `member_interest` column drop, which is intentional and one-way.

## Open questions for the owner

Each has my recommended default; if the owner does not decide, build the default.

1. APSS licensing and attribution. Reproducing APSS Stage 1 verbatim needs ESSA / Fitness Australia permitted-use terms. Paraphrasing is not an option — it breaks the validated instrument and destroys the "we used the recognised tool" defence. DEFAULT: use it verbatim with attribution and get written confirmation before phase 3. If ESSA refuses, fall back to PAR-Q+ 2024 (free for non-commercial-modification use) and accept the weaker Australian-standard argument.

2. Waiver and consent drafting. DEFAULT: do not write these in-house. Budget for a solicitor to draft the liability waiver and the health collection notice; the schema stores whatever text you publish and versions it. A cheap waiver is worse than no waiver, because it creates false confidence.

3. Minimum age and guardian policy. DEFAULT: 16 for unaccompanied class booking; 14–15 with guardian co-signature and the guardian physically present at the first session; under 14 not accepted into adult group classes. This is really an insurance question — confirm with the insurer, then set `health_policy_settings.minimum_unaccompanied_age`.

4. Whether coaches log in at all. If the owner runs every class personally, the `coach` role is unused and the coach surface is dead code. DEFAULT: build it anyway. The role change is cheap now and retrofitting minimum-necessary access after an admin-sees-everything habit has formed is expensive. But if the answer is "there will never be another coach", skip `/coach`, `CoachSafetyRosterView` and `CoachRoute`, keep `is_staff()` and `coach_profile_id`, and save roughly a week.

5. Should coaches take roll call? Attendance is currently admin-only (`admin_record_session_attendance` calls `is_admin()`). Letting coaches mark attendance is a natural next step but is outside this feature. DEFAULT: leave attendance admin-only for now; revisit once the coach role has been live for a term.

6. Walk-ins and the legacy public booking form. `public.class_bookings` accepts anonymous inserts with no account, so RLS cannot gate it — a walk-in can be in a class with no waiver. DEFAULT: a paper waiver + APSS sheet at the door for anyone without an account, transcribed by an admin via `member_submit_health_screening` with `source = 'admin_transcription'` on their first visit. A tablet kiosk flow is the phase-7 upgrade. Do not pretend the digital gate covers walk-ins; it does not.

7. Re-screen cadence. DEFAULT: annual (365 days) with a 60-day flag-then-block grace, plus forced re-screen on member-reported change, incident, pregnancy declaration, or return after 6+ months away. Waiver re-acceptance every 3 years or immediately on a new published version. If the insurer wants the waiver re-signed annually, change `waiver_reaccept_interval_days` to 365; no code change needed.

8. Doctor clearance documents. DEFAULT: sight and return, record the fact only. Zero digital custody of the most sensitive artefact, and it removes a whole class of breach exposure. If the owner insists on uploads, that is a separate piece of work: private bucket, server-issued short-lived signed URLs, 12-month post-departure file purge, and an additional access-log action.

9. Who may read clinical detail? Today `is_admin()` is one undifferentiated role, so every admin can. DEFAULT: accept it for now, because the access log plus member-visible access history is the compensating control at this scale. If the gym grows past two or three admins, add a `health_officer` capability and restrict `admin_member_health_record()` to it. Do not build that now.

10. What happens to a member who refuses consent? DEFAULT: they cannot train. There is no lawful and safe middle ground where you run someone through an unscreened session. Handle it as a membership pause with a credit-expiry freeze, not as a silent booking failure — that is a customer-service decision the owner should make explicitly, and the credit-expiry interaction (`supabase/migrations/20260713060000_credit_expiry_follow_up.sql`) is not handled in this design.

11. Notifiable breach response. DEFAULT: write a one-page plan naming who assesses a suspected breach, who notifies the OAIC, and the 30-day clock, before phase 5. It is an hour of work and it is the difference between a manageable incident and a penalty.

