# Member Terms & Conditions, versioned membership agreements with durable acceptance evidence, and a captured "my why"

**Effort: XL**

> Design spec produced during the July 2026 audit, from the owner requirements note.
> Not yet implemented. Reviewed against the schema and code as at commit time.

## Summary

Today XERT has no record of who agreed to what. `src/pages/Terms.jsx` is hardcoded JSX with a "Last updated 12 July 2026" string, and `src/pages/Register.jsx` shows a passive "By creating an account, you agree to the Terms of Use" line that is never recorded anywhere — and Google OAuth sign-up bypasses that page entirely. If a member disputes a cancellation charge, an injury claim, or a credit expiry, there is nothing to produce. This feature adds immutable published agreement versions, a server-captured acceptance ledger (timestamp, IP, user agent, surface, SHA-256 content hash, snapshotted member identity), a re-acceptance gate with a grace period, an admin authoring/publish flow, a printable executed-agreement document, and a separate member-owned "my why" that coaches see on the class roster. It follows the existing snapshot precedent in `supabase/migrations/20260716040000_stripe_order_terms_snapshot.sql` rather than inventing a competing one: snapshot the material facts onto the transactional row, make them immutable with a guard trigger, and re-verify them inside a service-role SECURITY DEFINER function before the write lands.

## Recommendation

ONE approach: **a document/version/acceptance-ledger triple in Postgres, with acceptance written only through a Vercel serverless function that captures trusted edge headers, and enforcement via a `session_bookings` guard trigger gated by a soft-launch-style switch on `admin_settings`.**

Why this and not the alternatives:

1. **Version rows are the evidence; acceptances snapshot the identity of that version, not its body.** `20260716040000_stripe_order_terms_snapshot.sql` denormalises `credit_total` / `credit_validity_days` onto `orders` and then re-verifies them inside `fulfill_stripe_checkout` before granting credits. I mirror that exactly: `member_agreement_acceptances` carries `document_slug`, `version_number`, `content_hash`, `version_effective_at`, `member_email`, `member_full_name` so the row is self-describing without a join, and `record_agreement_decision()` re-verifies the client-submitted hash against the published version before inserting. Copying the full 30–60 kB body onto every acceptance row would be the naive "durability" move; it is unnecessary because a `before update or delete` guard trigger makes published version rows immutable and `on delete restrict` on the FK makes them undeletable while any acceptance references them. The hash is what survives a dispute — it proves the bytes the member saw.

2. **Acceptance must not be a direct PostgREST RPC from the browser.** `inet_client_addr()` inside a Supabase RPC returns the pooler's address, not the member's, and `current_setting('request.headers')` carries a client-supplied `x-forwarded-for` that any member can forge with curl. Evidence that a member could have fabricated themselves is worthless in a dispute. So acceptance goes through `api/accept-agreement.js`, which reads Vercel's own `x-vercel-forwarded-for` / `x-real-ip` (set by the edge, not the client) and calls a `security definer` RPC guarded by `auth.role() = 'service_role'` — the same shape as `fulfill_stripe_checkout` and `admin_activate_session_pack_payments`.

3. **Enforcement goes in a trigger on `session_bookings`, not in the UI and not by rewriting `book_session`.** `book_session` and `join_session_waitlist` are `grant execute ... to authenticated` and directly callable; a React modal is decoration. A `before insert` guard on `session_bookings` catches every path (both RPCs plus any direct insert) in ~20 lines, matching the repo's existing `guard_profile_write` / `guard_stripe_order_terms` / `class_session_update_guard` style, without me having to re-emit two large SECURITY DEFINER function bodies and risk drifting from `booking_schema.sql`.

4. **`admin_settings.agreement_enforcement` ('off' | 'prompt' | 'enforce'), defaulting to 'prompt'.** This is the same guarded-switch pattern as `payments_enabled` in `20260716010000_guarded_payment_activation.sql`. Flipping a hard legal gate on before every existing member has re-accepted would stop every booking in the gym on day one. Ship at 'prompt', watch the acceptance rate in the Owner Command Centre, flip to 'enforce' when it plateaus.

5. **The "why" is deliberately NOT part of the contract.** See openQuestions — this is where I disagree with the note.

6. **PDF export uses zero new dependencies.** `api/agreement-document.js` returns one self-contained, print-styled HTML document for an acceptance id. Web opens it in a tab and calls `window.print()`; iOS feeds the same HTML string to `UIMarkupTextPrintFormatter` + `UIPrintPageRenderer` to produce real PDF data for a `ShareLink`. One server-side renderer means the member's copy and the owner's copy are provably the same document. This works under the existing CSP in `vercel.json` (`style-src 'self' 'unsafe-inline'` permits the inline `<style>`; the document needs no script). Adding pdfkit/puppeteer to a Vercel function for this is a 50 MB bundle to typeset six paragraphs.

## Data model

New migration: `/home/user/xert-fitness/supabase/migrations/20260726000000_member_agreements.sql`, mirrored to `/home/user/xert-fitness/src/supabase/member_agreements_upgrade.sql` per repo convention.

```sql
-- Versioned member agreements with durable acceptance evidence.
-- Follows the order-terms snapshot precedent: material facts are denormalised
-- onto the acceptance row, frozen by a guard trigger, and re-verified inside a
-- service-role function before the write lands.

-- ── documents (one row per agreement family) ────────────────────────────────
create table if not exists public.agreement_documents (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) between 3 and 60),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  kind text not null check (kind in (
    'terms_of_use', 'privacy_collection', 'membership_contract', 'health_declaration'
  )),
  acceptance_required boolean not null default true,
  requires_signed_name boolean not null default false,
  public_path text
    check (public_path is null or (left(public_path, 1) = '/' and left(public_path, 2) <> '//')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── versions (immutable once published) ─────────────────────────────────────
create table if not exists public.agreement_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null
    constraint agreement_document_versions_document_id_fkey
    references public.agreement_documents(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  title text not null check (char_length(btrim(title)) between 3 and 160),
  change_summary text check (change_summary is null or char_length(btrim(change_summary)) between 3 and 600),
  body_markdown text not null check (char_length(btrim(body_markdown)) between 200 and 60000),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'superseded', 'withdrawn')),
  effective_at timestamptz,
  grace_period_days integer not null default 14 check (grace_period_days between 0 and 90),
  published_at timestamptz,
  published_by uuid references public.profiles(id) on delete set null,
  superseded_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  last_changed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, version_number),
  constraint agreement_document_versions_publication_check check (
    (status = 'draft' and published_at is null and effective_at is null)
    or (status <> 'draft' and published_at is not null and effective_at is not null)
  )
);

-- One editable draft and at most one live version per document. This is the
-- invariant the admin UI is built on; without it "current terms" is ambiguous.
create unique index if not exists agreement_document_versions_single_draft_idx
  on public.agreement_document_versions (document_id) where status = 'draft';
create unique index if not exists agreement_document_versions_live_idx
  on public.agreement_document_versions (document_id) where status = 'published';
create index if not exists agreement_document_versions_history_idx
  on public.agreement_document_versions (document_id, version_number desc);

-- ── acceptance ledger (append-only) ─────────────────────────────────────────
-- user_id is ON DELETE SET NULL, not CASCADE: api/delete-account.js calls
-- auth.admin.deleteUser, which cascades through profiles. Contract evidence
-- must survive that, so identity is snapshotted into the row itself.
create table if not exists public.member_agreement_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  document_id uuid not null
    constraint member_agreement_acceptances_document_id_fkey
    references public.agreement_documents(id) on delete restrict,
  version_id uuid not null
    constraint member_agreement_acceptances_version_id_fkey
    references public.agreement_document_versions(id) on delete restrict,
  decision text not null check (decision in ('accepted', 'declined')),
  document_slug text not null,
  document_title text not null,
  version_number integer not null check (version_number > 0),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  version_effective_at timestamptz not null,
  member_email text check (member_email is null or char_length(member_email) <= 254),
  member_full_name text check (member_full_name is null or char_length(member_full_name) <= 200),
  signed_name text check (signed_name is null or char_length(btrim(signed_name)) between 2 and 200),
  surface text not null check (surface in ('web', 'ios')),
  app_version text check (app_version is null or char_length(app_version) <= 40),
  client_ip inet,
  user_agent text check (user_agent is null or char_length(user_agent) <= 400),
  request_id uuid,
  decided_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists member_agreement_acceptances_member_idx
  on public.member_agreement_acceptances (user_id, document_id, decided_at desc, id desc);
create index if not exists member_agreement_acceptances_version_idx
  on public.member_agreement_acceptances (version_id, decided_at desc);
-- A double-tap on the Accept button must not create two signatures.
create unique index if not exists member_agreement_acceptances_unique_accept_idx
  on public.member_agreement_acceptances (user_id, version_id) where decision = 'accepted';

-- ── the member's "why" (current value + history, NOT contract evidence) ─────
create table if not exists public.member_training_why (
  user_id uuid primary key
    constraint member_training_why_user_id_fkey
    references public.profiles(id) on delete cascade,
  statement text not null check (char_length(btrim(statement)) between 3 and 600),
  focus text check (focus is null or focus in (
    'strength', 'conditioning', 'event_prep', 'health', 'confidence',
    'community', 'rehab_return', 'other'
  )),
  coach_visible boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_by_role text not null default 'member' check (updated_by_role in ('member', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.member_training_why_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid
    constraint member_training_why_history_user_id_fkey
    references public.profiles(id) on delete cascade,
  statement text not null,
  focus text,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_by_role text not null check (changed_by_role in ('member', 'admin')),
  created_at timestamptz not null default now()
);
create index if not exists member_training_why_history_member_idx
  on public.member_training_why_history (user_id, created_at desc, id desc);

-- ── enforcement switch (soft-launch pattern, same as payments_enabled) ──────
alter table public.admin_settings
  add column if not exists agreement_enforcement text not null default 'prompt';
alter table public.admin_settings drop constraint if exists admin_settings_agreement_enforcement_check;
alter table public.admin_settings add constraint admin_settings_agreement_enforcement_check
  check (agreement_enforcement in ('off', 'prompt', 'enforce'));

-- ── content hash ────────────────────────────────────────────────────────────
create or replace function public.agreement_version_content_hash(
  p_slug text,
  p_version_number integer,
  p_title text,
  p_body_markdown text
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select encode(
    sha256(
      convert_to(
        concat_ws(
          E'\n',
          'xert.agreement.v1',
          lower(btrim(coalesce(p_slug, ''))),
          p_version_number::text,
          btrim(coalesce(p_title, '')),
          replace(btrim(coalesce(p_body_markdown, '')), E'\r\n', E'\n')
        ),
        'UTF8'
      )
    ),
    'hex'
  );
$$;

-- ── version immutability guard ──────────────────────────────────────────────
create or replace function public.guard_agreement_document_version()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_slug text;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'AGREEMENT_VERSION_IMMUTABLE'; end if;
    if exists (
      select 1 from public.member_agreement_acceptances as acceptance
      where acceptance.version_id = old.id
    ) then
      raise exception 'AGREEMENT_VERSION_HAS_ACCEPTANCES';
    end if;
    return old;
  end if;

  new.title := btrim(coalesce(new.title, ''));
  new.body_markdown := replace(btrim(coalesce(new.body_markdown, '')), E'\r\n', E'\n');
  new.updated_at := clock_timestamp();

  if tg_op = 'UPDATE' and old.status <> 'draft' then
    if new.document_id is distinct from old.document_id
       or new.version_number is distinct from old.version_number
       or new.title is distinct from old.title
       or new.body_markdown is distinct from old.body_markdown
       or new.content_hash is distinct from old.content_hash
       or new.change_summary is distinct from old.change_summary
       or new.effective_at is distinct from old.effective_at
       or new.grace_period_days is distinct from old.grace_period_days
       or new.published_at is distinct from old.published_at
       or new.published_by is distinct from old.published_by
       or new.created_at is distinct from old.created_at then
      raise exception 'AGREEMENT_VERSION_IMMUTABLE';
    end if;
    if new.status not in ('published', 'superseded', 'withdrawn')
       or (old.status = 'superseded' and new.status = 'published')
       or (old.status = 'withdrawn' and new.status <> 'withdrawn') then
      raise exception 'AGREEMENT_VERSION_STATUS_INVALID';
    end if;
    return new;
  end if;

  select document.slug into v_slug
  from public.agreement_documents as document
  where document.id = new.document_id;
  if v_slug is null then raise exception 'AGREEMENT_DOCUMENT_NOT_FOUND'; end if;

  new.content_hash := public.agreement_version_content_hash(
    v_slug, new.version_number, new.title, new.body_markdown
  );
  return new;
end;
$$;

drop trigger if exists agreement_document_versions_guard on public.agreement_document_versions;
create trigger agreement_document_versions_guard
  before insert or update or delete on public.agreement_document_versions
  for each row execute function public.guard_agreement_document_version();

-- ── acceptance immutability (same shape as admin_content_changes_immutable) ─
create or replace function public.guard_member_agreement_acceptance()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'AGREEMENT_ACCEPTANCE_IMMUTABLE';
end;
$$;

drop trigger if exists member_agreement_acceptances_immutable on public.member_agreement_acceptances;
create trigger member_agreement_acceptances_immutable
  before update or delete on public.member_agreement_acceptances
  for each row execute function public.guard_member_agreement_acceptance();

-- ── "why": touch updated_at, stamp the actor, append to history ─────────────
create or replace function public.audit_member_training_why()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_when = 'BEFORE' then
    new.statement := btrim(coalesce(new.statement, ''));
    new.updated_at := clock_timestamp();
    new.updated_by := auth.uid();
    new.updated_by_role := case when public.is_admin() then 'admin' else 'member' end;
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.statement is not distinct from old.statement
     and new.focus is not distinct from old.focus then
    return new;
  end if;

  insert into public.member_training_why_history (
    user_id, statement, focus, changed_by, changed_by_role
  ) values (
    new.user_id, new.statement, new.focus, new.updated_by, new.updated_by_role
  );
  return new;
end;
$$;

drop trigger if exists member_training_why_touch on public.member_training_why;
create trigger member_training_why_touch
  before insert or update on public.member_training_why
  for each row execute function public.audit_member_training_why();

drop trigger if exists member_training_why_audit on public.member_training_why;
create trigger member_training_why_audit
  after insert or update on public.member_training_why
  for each row execute function public.audit_member_training_why();

-- ── ROW LEVEL SECURITY ──────────────────────────────────────────────────────
-- All writes to documents, versions and acceptances go through SECURITY
-- DEFINER functions, so only SELECT is granted on those tables.

alter table public.agreement_documents enable row level security;
revoke all on table public.agreement_documents from public, anon, authenticated;
grant select on table public.agreement_documents to anon, authenticated;
drop policy if exists "agreement_documents_read" on public.agreement_documents;
create policy "agreement_documents_read"
  on public.agreement_documents for select
  to anon, authenticated
  using (true);

alter table public.agreement_document_versions enable row level security;
revoke all on table public.agreement_document_versions from public, anon, authenticated;
grant select on table public.agreement_document_versions to anon, authenticated;
drop policy if exists "agreement_versions_public_read_live" on public.agreement_document_versions;
create policy "agreement_versions_public_read_live"
  on public.agreement_document_versions for select
  to anon, authenticated
  using (status = 'published' and effective_at <= now());
drop policy if exists "agreement_versions_read_own_accepted" on public.agreement_document_versions;
create policy "agreement_versions_read_own_accepted"
  on public.agreement_document_versions for select
  to authenticated
  using (exists (
    select 1 from public.member_agreement_acceptances as acceptance
    where acceptance.version_id = agreement_document_versions.id
      and acceptance.user_id = (select auth.uid())
  ));
drop policy if exists "agreement_versions_admin_read" on public.agreement_document_versions;
create policy "agreement_versions_admin_read"
  on public.agreement_document_versions for select
  to authenticated
  using ((select public.is_admin()));

alter table public.member_agreement_acceptances enable row level security;
revoke all on table public.member_agreement_acceptances from public, anon, authenticated;
grant select on table public.member_agreement_acceptances to authenticated;
drop policy if exists "member_agreement_acceptances_read_own_or_admin"
  on public.member_agreement_acceptances;
create policy "member_agreement_acceptances_read_own_or_admin"
  on public.member_agreement_acceptances for select
  to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

alter table public.member_training_why enable row level security;
revoke all on table public.member_training_why from public, anon, authenticated;
grant select, insert, update on table public.member_training_why to authenticated;
drop policy if exists "member_training_why_read_own_or_admin" on public.member_training_why;
create policy "member_training_why_read_own_or_admin"
  on public.member_training_why for select
  to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists "member_training_why_insert_own_or_admin" on public.member_training_why;
create policy "member_training_why_insert_own_or_admin"
  on public.member_training_why for insert
  to authenticated
  with check (user_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists "member_training_why_update_own_or_admin" on public.member_training_why;
create policy "member_training_why_update_own_or_admin"
  on public.member_training_why for update
  to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()))
  with check (user_id = (select auth.uid()) or (select public.is_admin()));

alter table public.member_training_why_history enable row level security;
revoke all on table public.member_training_why_history from public, anon, authenticated;
grant select on table public.member_training_why_history to authenticated;
drop policy if exists "member_training_why_history_read_own_or_admin"
  on public.member_training_why_history;
create policy "member_training_why_history_read_own_or_admin"
  on public.member_training_why_history for select
  to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- ── member status / gate ────────────────────────────────────────────────────
create or replace function public.agreement_status_for_member(p_user_id uuid)
returns table (
  document_id uuid, slug text, title text, kind text,
  acceptance_required boolean, requires_signed_name boolean,
  current_version_id uuid, current_version_number integer,
  current_content_hash text, current_effective_at timestamptz,
  current_change_summary text, grace_ends_at timestamptz,
  accepted_version_id uuid, accepted_version_number integer,
  decided_at timestamptz, last_decision text, state text
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  with live as (
    select document.id as document_id, document.slug, document.title, document.kind,
           document.acceptance_required, document.requires_signed_name, document.sort_order,
           version.id as version_id, version.version_number, version.content_hash,
           version.effective_at, version.change_summary,
           version.effective_at + make_interval(days => version.grace_period_days) as grace_ends_at
    from public.agreement_documents as document
    join public.agreement_document_versions as version
      on version.document_id = document.id
     and version.status = 'published'
     and version.effective_at <= now()
  ), latest as (
    select distinct on (acceptance.document_id)
      acceptance.document_id, acceptance.version_id, acceptance.version_number,
      acceptance.decided_at, acceptance.decision
    from public.member_agreement_acceptances as acceptance
    where acceptance.user_id = p_user_id
    order by acceptance.document_id, acceptance.decided_at desc, acceptance.id desc
  ), joined_at as (
    select profile.created_at from public.profiles as profile where profile.id = p_user_id
  )
  select
    live.document_id, live.slug, live.title, live.kind,
    live.acceptance_required, live.requires_signed_name,
    live.version_id, live.version_number, live.content_hash, live.effective_at,
    live.change_summary, live.grace_ends_at,
    latest.version_id, latest.version_number, latest.decided_at,
    coalesce(latest.decision, 'none'),
    case
      when latest.decision = 'accepted' and latest.version_id = live.version_id then 'current'
      when latest.decision = 'declined' then 'declined'
      when latest.decision = 'accepted' then
        case when now() <= live.grace_ends_at then 'update_pending' else 'update_overdue' end
      -- Never accepted anything. A member who joined AFTER this version went
      -- live gets no grace; an existing member migrating onto it does.
      when coalesce((select created_at from joined_at), live.effective_at) >= live.effective_at
        then 'never_accepted'
      when now() <= live.grace_ends_at then 'update_pending'
      else 'update_overdue'
    end
  from live
  left join latest on latest.document_id = live.document_id
  order by live.sort_order, live.slug;
$$;

create or replace function public.my_agreement_status()
returns setof record
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select * from public.agreement_status_for_member(auth.uid());
$$;
-- Note for the implementer: declare my_agreement_status() with the same
-- explicit returns table (...) column list as agreement_status_for_member so
-- PostgREST can shape the response; `setof record` above is shorthand here.

create or replace function public.member_agreement_gate(p_user_id uuid)
returns text
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_mode text;
  v_blocked integer := 0;
  v_pending integer := 0;
begin
  if p_user_id is null then return 'blocked'; end if;
  select coalesce(settings.agreement_enforcement, 'prompt')
    into v_mode from public.admin_settings as settings limit 1;
  v_mode := coalesce(v_mode, 'prompt');
  if v_mode = 'off' then return 'ok'; end if;

  select
    count(*) filter (where status.state in ('never_accepted', 'update_overdue', 'declined')),
    count(*) filter (where status.state = 'update_pending')
    into v_blocked, v_pending
  from public.agreement_status_for_member(p_user_id) as status
  where status.acceptance_required;

  if v_blocked > 0 and v_mode = 'enforce' then return 'blocked'; end if;
  if v_blocked > 0 or v_pending > 0 then return 'grace'; end if;
  return 'ok';
end;
$$;

-- ── booking gate ────────────────────────────────────────────────────────────
-- book_session and join_session_waitlist are both granted to authenticated and
-- directly callable, so the gate lives on the table, not in the UI.
create or replace function public.guard_member_agreement_booking()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() = 'service_role' or public.is_admin() then return new; end if;
  if new.status = 'cancelled' then return new; end if;
  if public.member_agreement_gate(new.user_id) = 'blocked' then
    raise exception 'AGREEMENT_REQUIRED';
  end if;
  return new;
end;
$$;

drop trigger if exists session_bookings_agreement_gate on public.session_bookings;
create trigger session_bookings_agreement_gate
  before insert on public.session_bookings
  for each row execute function public.guard_member_agreement_booking();

-- ── record a decision (service role only, per fulfill_stripe_checkout) ──────
create or replace function public.record_agreement_decision(
  p_user_id uuid,
  p_document_slug text,
  p_version_id uuid,
  p_content_hash text,
  p_decision text,
  p_signed_name text,
  p_surface text,
  p_app_version text,
  p_client_ip inet,
  p_user_agent text,
  p_request_id uuid
)
returns table (acceptance_id uuid, recorded boolean, version_number integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_document public.agreement_documents%rowtype;
  v_version public.agreement_document_versions%rowtype;
  v_signed_name text := nullif(btrim(coalesce(p_signed_name, '')), '');
  v_email text;
  v_full_name text;
  v_id uuid;
  v_rows integer := 0;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'AGREEMENT_DECISION_REQUIRES_SERVICE_ROLE';
  end if;
  if p_user_id is null or p_version_id is null
     or p_decision not in ('accepted', 'declined')
     or p_surface not in ('web', 'ios')
     or nullif(btrim(coalesce(p_content_hash, '')), '') is null then
    raise exception 'AGREEMENT_DECISION_INVALID';
  end if;

  select document.* into v_document
  from public.agreement_documents as document
  where document.slug = lower(btrim(coalesce(p_document_slug, '')));
  if v_document.id is null then raise exception 'AGREEMENT_DOCUMENT_NOT_FOUND'; end if;

  select version.* into v_version
  from public.agreement_document_versions as version
  where version.id = p_version_id
  for share;
  if v_version.id is null then raise exception 'AGREEMENT_VERSION_NOT_FOUND'; end if;
  if v_version.document_id is distinct from v_document.id
     or v_version.status <> 'published'
     or v_version.effective_at > now() then
    raise exception 'AGREEMENT_VERSION_NOT_LIVE';
  end if;
  -- The member signs what the member saw. A stale client that renders v3 and
  -- posts against v4 is rejected, not silently bound to text it never showed.
  if v_version.content_hash is distinct from lower(btrim(p_content_hash)) then
    raise exception 'AGREEMENT_CONTENT_MISMATCH';
  end if;
  if p_decision = 'accepted' and v_document.requires_signed_name and v_signed_name is null then
    raise exception 'AGREEMENT_SIGNATURE_REQUIRED';
  end if;

  select profile.email, profile.full_name into v_email, v_full_name
  from public.profiles as profile where profile.id = p_user_id;
  if v_email is null then
    select users.email into v_email from auth.users as users where users.id = p_user_id;
  end if;

  insert into public.member_agreement_acceptances (
    user_id, document_id, version_id, decision,
    document_slug, document_title, version_number, content_hash, version_effective_at,
    member_email, member_full_name, signed_name,
    surface, app_version, client_ip, user_agent, request_id
  ) values (
    p_user_id, v_document.id, v_version.id, p_decision,
    v_document.slug, v_version.title, v_version.version_number,
    v_version.content_hash, v_version.effective_at,
    v_email, v_full_name, v_signed_name,
    p_surface, nullif(btrim(coalesce(p_app_version, '')), ''),
    p_client_ip, left(nullif(btrim(coalesce(p_user_agent, '')), ''), 400), p_request_id
  )
  on conflict (user_id, version_id) where decision = 'accepted' do nothing
  returning id into v_id;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    select acceptance.id into v_id
    from public.member_agreement_acceptances as acceptance
    where acceptance.user_id = p_user_id and acceptance.version_id = v_version.id
      and acceptance.decision = 'accepted';
  end if;

  return query select v_id, v_rows = 1, v_version.version_number;
end;
$$;

-- ── admin authoring (optimistic locking, repo convention) ───────────────────
create or replace function public.admin_save_agreement_draft(
  p_document_slug text,
  p_title text,
  p_change_summary text,
  p_body_markdown text,
  p_expected_updated_at timestamptz
)
returns setof public.agreement_document_versions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_document public.agreement_documents%rowtype;
  v_draft public.agreement_document_versions%rowtype;
  v_next integer;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  select document.* into v_document from public.agreement_documents as document
  where document.slug = lower(btrim(coalesce(p_document_slug, '')));
  if v_document.id is null then raise exception 'AGREEMENT_DOCUMENT_NOT_FOUND'; end if;
  if char_length(btrim(coalesce(p_body_markdown, ''))) < 200 then
    raise exception 'AGREEMENT_BODY_TOO_SHORT';
  end if;

  select version.* into v_draft
  from public.agreement_document_versions as version
  where version.document_id = v_document.id and version.status = 'draft'
  for update;

  if v_draft.id is null then
    select coalesce(max(version.version_number), 0) + 1 into v_next
    from public.agreement_document_versions as version
    where version.document_id = v_document.id;
    return query
    insert into public.agreement_document_versions (
      document_id, version_number, title, change_summary, body_markdown,
      content_hash, status, created_by, last_changed_by
    ) values (
      v_document.id, v_next, p_title, nullif(btrim(coalesce(p_change_summary, '')), ''),
      p_body_markdown, repeat('0', 64), 'draft', auth.uid(), auth.uid()
    ) returning *;
    return;
  end if;

  if p_expected_updated_at is null then raise exception 'AGREEMENT_DRAFT_VERSION_REQUIRED'; end if;
  if v_draft.updated_at is distinct from p_expected_updated_at then
    raise exception 'AGREEMENT_DRAFT_STALE';
  end if;

  return query
  update public.agreement_document_versions
  set title = p_title,
      change_summary = nullif(btrim(coalesce(p_change_summary, '')), ''),
      body_markdown = p_body_markdown,
      last_changed_by = auth.uid()
  where id = v_draft.id and updated_at = p_expected_updated_at
  returning *;
end;
$$;

create or replace function public.admin_publish_agreement_version(
  p_draft_id uuid,
  p_expected_updated_at timestamptz,
  p_effective_at timestamptz,
  p_grace_period_days integer
)
returns setof public.agreement_document_versions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_draft public.agreement_document_versions%rowtype;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_draft_id is null or p_expected_updated_at is null then
    raise exception 'AGREEMENT_DRAFT_VERSION_REQUIRED';
  end if;
  if p_grace_period_days is null or p_grace_period_days < 0 or p_grace_period_days > 90 then
    raise exception 'AGREEMENT_GRACE_INVALID';
  end if;
  -- Terms may not be backdated onto members who already trained under the old
  -- version. Forward-dating is fine; backdating is evidence tampering.
  if p_effective_at is null or p_effective_at < now() - interval '5 minutes' then
    raise exception 'AGREEMENT_EFFECTIVE_AT_INVALID';
  end if;

  select version.* into v_draft
  from public.agreement_document_versions as version
  where version.id = p_draft_id
  for update;
  if v_draft.id is null then raise exception 'AGREEMENT_VERSION_NOT_FOUND'; end if;
  if v_draft.status <> 'draft' then raise exception 'AGREEMENT_ALREADY_PUBLISHED'; end if;
  if v_draft.updated_at is distinct from p_expected_updated_at then
    raise exception 'AGREEMENT_DRAFT_STALE';
  end if;

  update public.agreement_document_versions
  set status = 'superseded', superseded_at = now(), last_changed_by = auth.uid()
  where document_id = v_draft.document_id and status = 'published';

  return query
  update public.agreement_document_versions
  set status = 'published',
      effective_at = p_effective_at,
      grace_period_days = p_grace_period_days,
      published_at = now(),
      published_by = auth.uid(),
      last_changed_by = auth.uid()
  where id = v_draft.id and updated_at = p_expected_updated_at
  returning *;
end;
$$;

create or replace function public.admin_agreement_overview()
returns table (
  document_id uuid, slug text, title text, kind text, acceptance_required boolean,
  live_version_id uuid, live_version_number integer, live_effective_at timestamptz,
  live_content_hash text, grace_period_days integer,
  draft_id uuid, draft_updated_at timestamptz,
  accepted_members bigint, declined_members bigint, outstanding_members bigint
)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  return query
  select
    document.id, document.slug, document.title, document.kind, document.acceptance_required,
    live.id, live.version_number, live.effective_at, live.content_hash, live.grace_period_days,
    draft.id, draft.updated_at,
    coalesce(counted.accepted, 0), coalesce(counted.declined, 0),
    greatest((select count(*) from public.profiles where role = 'member')
             - coalesce(counted.accepted, 0), 0)
  from public.agreement_documents as document
  left join public.agreement_document_versions as live
    on live.document_id = document.id and live.status = 'published'
  left join public.agreement_document_versions as draft
    on draft.document_id = document.id and draft.status = 'draft'
  left join lateral (
    select
      count(distinct acceptance.user_id) filter (
        where acceptance.decision = 'accepted' and acceptance.version_id = live.id) as accepted,
      count(distinct acceptance.user_id) filter (
        where acceptance.decision = 'declined' and acceptance.version_id = live.id) as declined
    from public.member_agreement_acceptances as acceptance
    where acceptance.document_id = document.id
  ) as counted on true
  order by document.sort_order, document.slug;
end;
$$;

create or replace function public.admin_member_agreement_history(p_user_id uuid)
returns setof public.member_agreement_acceptances
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_user_id is null then raise exception 'MEMBER_REQUIRED'; end if;
  return query
  select acceptance.* from public.member_agreement_acceptances as acceptance
  where acceptance.user_id = p_user_id
  order by acceptance.decided_at desc, acceptance.id desc
  limit 200;
end;
$$;

-- ── grants ──────────────────────────────────────────────────────────────────
revoke execute on function public.guard_agreement_document_version() from public, anon, authenticated;
revoke execute on function public.guard_member_agreement_acceptance() from public, anon, authenticated;
revoke execute on function public.guard_member_agreement_booking() from public, anon, authenticated;
revoke execute on function public.audit_member_training_why() from public, anon, authenticated;
revoke execute on function public.agreement_status_for_member(uuid) from public, anon, authenticated;
revoke execute on function public.record_agreement_decision(
  uuid, text, uuid, text, text, text, text, text, inet, text, uuid
) from public, anon, authenticated;
grant execute on function public.record_agreement_decision(
  uuid, text, uuid, text, text, text, text, text, inet, text, uuid
) to service_role;
revoke execute on function public.my_agreement_status() from public, anon;
revoke execute on function public.member_agreement_gate(uuid) from public, anon;
revoke execute on function public.admin_save_agreement_draft(text, text, text, text, timestamptz) from public, anon;
revoke execute on function public.admin_publish_agreement_version(uuid, timestamptz, timestamptz, integer) from public, anon;
revoke execute on function public.admin_agreement_overview() from public, anon;
revoke execute on function public.admin_member_agreement_history(uuid) from public, anon;
grant execute on function public.my_agreement_status() to authenticated;
grant execute on function public.member_agreement_gate(uuid) to authenticated, service_role;
grant execute on function public.admin_save_agreement_draft(text, text, text, text, timestamptz) to authenticated;
grant execute on function public.admin_publish_agreement_version(uuid, timestamptz, timestamptz, integer) to authenticated;
grant execute on function public.admin_agreement_overview() to authenticated;
grant execute on function public.admin_member_agreement_history(uuid) to authenticated;

-- ── reuse the existing content-change audit (do not build a second one) ─────
alter table public.admin_content_changes drop constraint if exists admin_content_changes_resource_type_check;
alter table public.admin_content_changes add constraint admin_content_changes_resource_type_check
  check (resource_type in (
    'site_content', 'coach', 'event', 'product', 'launch_settings',
    'agreement_document', 'agreement_version'
  ));
-- Then extend public.audit_admin_content_change(): add
--   when 'agreement_documents' then 'agreement_document'
--   when 'agreement_document_versions' then 'agreement_version'
-- to the v_resource_type case, and
--   when 'agreement_document' then coalesce(nullif(trim(v_record ->> 'title'), ''), 'Agreement')
--   when 'agreement_version' then coalesce(nullif(trim(v_record ->> 'title'), ''), 'Agreement version')
-- to the v_subject_label case, then attach:
drop trigger if exists agreement_documents_audit_admin_change on public.agreement_documents;
create trigger agreement_documents_audit_admin_change
  after insert or update or delete on public.agreement_documents
  for each row execute function public.audit_admin_content_change();
drop trigger if exists agreement_versions_audit_admin_change on public.agreement_document_versions;
create trigger agreement_versions_audit_admin_change
  after insert or update or delete on public.agreement_document_versions
  for each row execute function public.audit_admin_content_change();

-- ── seed the document families (no bodies; v1 is authored in the admin UI) ──
insert into public.agreement_documents (slug, title, kind, acceptance_required, requires_signed_name, public_path, sort_order)
values
  ('terms-of-use', 'Terms of Use', 'terms_of_use', true, false, '/terms', 10),
  ('privacy-collection', 'Privacy Collection Statement', 'privacy_collection', true, false, '/privacy', 20),
  ('membership-contract', 'Membership Agreement', 'membership_contract', false, true, null, 30),
  ('health-declaration', 'Pre-Exercise Health Declaration', 'health_declaration', false, false, null, 40)
on conflict (slug) do nothing;

insert into public.xert_schema_capabilities (capability)
values ('member_agreements')
on conflict (capability) do update set installed_at = excluded.installed_at;
```

Also register the capability in `/home/user/xert-fitness/src/lib/schemaCapabilities.js` (`member_agreements: 'Apply supabase/migrations/20260726000000_member_agreements.sql in Supabase.'`) and in the `required` VALUES list of `/home/user/xert-fitness/src/supabase/release_readiness_check.sql`.

## Backend

**New: `/home/user/xert-fitness/api/accept-agreement.js`** (POST). Follows the `api/checkout.js` shape — `createRequestTrace(response)`, bearer token → `admin.auth.getUser(token)`, service-role client.

```js
// Vercel's edge sets these; the client-supplied x-forwarded-for is NEVER used.
export function clientIPFromHeaders(get) {
  const vercel = String(get('x-vercel-forwarded-for') || '').split(',')[0].trim();
  const real = String(get('x-real-ip') || '').trim();
  return vercel || real || null;
}
export function normalizeAgreementDecision(body) { /* slug, version_id (UUID), content_hash /^[0-9a-f]{64}$/, decision in accepted|declined, signed_name <= 200, surface in web|ios, app_version <= 40 */ }
```
Handler: validate, then
```js
const { data, error } = await admin.rpc('record_agreement_decision', {
  p_user_id: user.id, p_document_slug: slug, p_version_id: versionId,
  p_content_hash: contentHash, p_decision: decision, p_signed_name: signedName,
  p_surface: surface, p_app_version: appVersion,
  p_client_ip: clientIPFromHeaders(name => requestHeader(request, name)),
  p_user_agent: requestHeader(request, 'user-agent'),
  p_request_id: trace.requestId,
});
```
Error mapping: `AGREEMENT_CONTENT_MISMATCH` → 409 "These terms were updated while you were reading them. Reload and review the current version."; `AGREEMENT_VERSION_NOT_LIVE` → 409; `AGREEMENT_SIGNATURE_REQUIRED` → 400; anything else → 500 with the `request_id` already attached by `createRequestTrace`. Returns `{ acceptance_id, recorded, version_number }`.

**New: `/home/user/xert-fitness/api/agreement-document.js`** (GET `?acceptance_id=`). Returns `Content-Type: text/html; charset=utf-8` — the executed agreement: XERT header, member name/email, document title, version number, effective date, decision, decided_at rendered in `Australia/Brisbane`, surface, IP, truncated user agent, the full SHA-256 hash, then the body. Authorises the caller as the acceptance owner or an admin (`profiles.role = 'admin'`, same check as `api/admin-publish-announcement.js`). Exports pure, unit-testable functions:
```js
export function escapeHTML(value)                      // & < > " '
export function renderAgreementMarkdown(markdown)      // ## heading, blank-line paragraph, "- " bullet ONLY; everything escaped first
export function renderAgreementDocumentHTML(acceptance, version)  // full <html> with inline <style> and @page margins
```
Do not run a general markdown parser server-side — this document is same-origin and an unsanitised parser is a stored-XSS sink. The restricted renderer is ~40 lines and covers every construct the authoring UI produces.

**Edit `/home/user/xert-fitness/api/checkout.js`**: after `const { data: { user } } = await admin.auth.getUser(token)`, add
```js
const gate = await admin.rpc('member_agreement_gate', { p_user_id: user.id });
if (!gate.error && gate.data === 'blocked') {
  return json({ error: 'Please review and accept the current XERT terms before purchasing a pack.' }, 409);
}
```
Deliberately **fail open** on `gate.error` — unlike `paymentFulfillmentIsReady` and friends, which fail closed. Those guard against taking money without delivering credits; this one guards against a member booking under a superseded T&C, which is far less harmful than a schema hiccup halting all revenue. The previously accepted version still binds them. Surface the failure in `getOperationsHealth()` instead.

**Edit `/home/user/xert-fitness/api/delete-account.js`**: add a comment in `deleteMemberAccount` recording that `member_agreement_acceptances.user_id` is `ON DELETE SET NULL` by design and that the snapshotted `member_email` / `member_full_name` are retained under legal hold. Add the retention purge as a `scripts/` job later (see rollout); do not silently widen deletion.

**No changes needed to `book_session` / `join_session_waitlist`** — the `session_bookings` trigger covers both. Add `AGREEMENT_REQUIRED: 'Please review and accept the current XERT terms before booking.'` to the `BOOKING_ERRORS` map in `/home/user/xert-fitness/src/lib/bookingData.js` so `friendlyBookingError` renders it.

## Web UI

**New `/home/user/xert-fitness/src/lib/agreements.js`** — pure, dependency-free logic (this is where the tests go, matching `src/lib/bookingCancellation.js` / `src/lib/creditExpiry.js`):
`outstandingAgreements(statusRows)`, `blockingAgreements(statusRows)`, `graceDaysRemaining(row, now)`, `agreementPromptCopy(row)` (returns the headline/body for each of the five states), `AGREEMENT_ERRORS` message map, `normalizeAgreementDraft({ title, changeSummary, bodyMarkdown })` mirroring `src/lib/siteContentAdmin.js`.

**New `/home/user/xert-fitness/src/lib/agreementData.js`** — mirrors `src/lib/accountData.js`: `getMyAgreementStatus()` (`supabase.rpc('my_agreement_status')`), `getLiveAgreementVersion(slug)` (plain select on `agreement_document_versions` joined to `agreement_documents`, allowed by the public-read policy), `recordAgreementDecision(accessToken, payload)` (POST `/api/accept-agreement`), `getMyAgreementRecords()`, `getMyWhy()` / `saveMyWhy({ statement, focus, coachVisible })` (direct upsert on `member_training_why`).

**New `/home/user/xert-fitness/src/components/public/AgreementGate.jsx`** — mounted once in `src/App.jsx` inside `<SupabaseAuthProvider>`, above `<AppRoutes />`. Reads `useSupabaseAuth()`; when a session exists, loads status once and renders a Radix dialog from `@/components/ui/dialog` (non-dismissible when any row is `never_accepted` / `update_overdue` / `declined`, dismissible with a "You have N days" banner when `update_pending`). Body renders `body_markdown` with `react-markdown` (already a dependency, no raw HTML, CSP-safe). Requires the member to scroll to the end before the Accept button enables (`onScroll` + `scrollHeight - scrollTop <= clientHeight + 8`) — this is the single cheapest thing that makes a clickwrap survive a challenge. Submits `{ slug, version_id, content_hash, decision, signed_name, surface: 'web' }`. On `409 AGREEMENT_CONTENT_MISMATCH`, refetches and re-renders rather than retrying. Declining opens a confirm step spelling out exactly what stops working.

**New `/home/user/xert-fitness/src/components/public/MemberWhyCard.jsx`** — the "my why" editor. 600-char textarea, focus chip selector, and a "Let my coach see this" switch bound to `coach_visible`. Rendered in `src/pages/Account.jsx` next to the existing credits/goals cards, and shown as a one-time prompt in `AgreementGate.jsx` immediately after the first acceptance completes (this is the onboarding capture point — sequential, not bundled).

**New `/home/user/xert-fitness/src/pages/AgreementRecord.jsx`** — route `/account/agreements`. Lists the member's acceptance ledger (document, version, date, hash prefix) with a "View / print signed copy" button opening `/api/agreement-document?acceptance_id=…` in a new tab.

**New `/home/user/xert-fitness/src/components/admin/AgreementsManager.jsx`** — modelled directly on `src/components/admin/ContentManager.jsx`: per-document card, markdown editor, live preview pane using the same `react-markdown` renderer the member sees, `expectedUpdatedAt` optimistic locking, `onDirtyChange` wired to the unsaved-changes guard, and localStorage draft recovery via `src/lib/siteContentDraft.js`. Publish opens `AdminConfirmDialog` showing the computed version number, effective date picker (default now + 7 days), grace-period input (default 14), and the count of members who will be re-prompted. Shows the live version's content hash so the owner can prove which text is current.

**Edits:**
- `src/App.jsx` — `const AgreementRecord = lazy(() => import('./pages/AgreementRecord'))`, add `<Route path="/account/agreements" element={<AgreementRecord />} />`, and mount `<AgreementGate />`.
- `src/lib/adminNavigation.js` — add `'agreements'` to `ADMIN_SECTION_KEYS`.
- `src/pages/AdminCommandCentre.jsx` — lazy import + `case 'agreements': return <AgreementsManager onDirtyChange={setHasUnsavedChanges} />;`.
- `src/components/admin/AdminLayout.jsx` — nav item `{ key: 'agreements', label: 'Terms & Contracts', icon: FileSignature }` in the same group as `content` (line ~47).
- `src/pages/Terms.jsx` — fetch the live `terms-of-use` version and render `body_markdown`; keep the existing hardcoded `sections` array as the fallback when no version is published or the capability is missing. This is the repo's standard additive-rollout pattern and it means `/terms` and the in-app gate can never show different text.
- `src/lib/pageMetadata.js` — add `'/account/agreements'` to `NOINDEX_PATHS` (the Set is exact-match, so it would otherwise fall through to the "Page Not Found" title).
- `src/components/admin/MembersManager.jsx` — in `MemberDrawer`, add an "Agreements & why" block: the why statement with `coach_visible` state and last-changed attribution, plus the acceptance ledger from `adminMemberAgreementHistory(member.id)`, each row linking to the printable copy.
- `src/lib/adminData.js` — add `getAgreementOverview()`, `saveAgreementDraft(slug, draft, expectedUpdatedAt)`, `publishAgreementVersion(draftId, expectedUpdatedAt, effectiveAt, graceDays)`, `adminMemberAgreementHistory(userId)`, and include the why + acceptance ledger in `adminMemberDetail()` (line 1567) using the same `.catch(() => [])` additive-tolerance style already used there for `grants`/`notes`/`notices`.
- `src/lib/adminAudit.js` — extend the `contentEvents` `resourceLabel` ternary chain (~line 200) with `'agreement_document'` → "Agreement" and `'agreement_version'` → "Agreement version".
- `src/lib/bookingData.js` — `AGREEMENT_REQUIRED` in `BOOKING_ERRORS`.
- `src/index.css` — `@media print` block hiding `PublicNav` / `PublicFooter` (only relevant if the owner prints the SPA page rather than the API document).
- `src/pages/Register.jsx` — replace the passive "By creating an account, you agree…" paragraph with a neutral "You'll be asked to review and accept the XERT terms after confirming your email." Recording acceptance at signup is impossible: `supabase.auth.signUp` returns no session until email confirmation, and the Google OAuth button bypasses the form entirely. The post-auth gate is the only place acceptance can be captured for every member.

**New tests** (`node --test "test/**/*.test.js"`): `test/member-agreements.test.js` (state machine, grace boundaries, new-member-vs-existing-member branch), `test/agreement-acceptance-api.test.js` (`clientIPFromHeaders` ignores client `x-forwarded-for`; `normalizeAgreementDecision` rejects bad hashes), `test/agreement-document-render.test.js` (`escapeHTML` / `renderAgreementMarkdown` neutralise `<script>`, `javascript:`, and attribute-breaking quotes).

## iOS UI

**New `/home/user/xert-fitness/ios/XertFitnessApp/XertFitnessApp/Agreements.swift`** — `Codable` models (`AgreementStatusRow`, `AgreementVersion`, `AgreementAcceptance`, `MemberTrainingWhy`) using the repo's snake_case field style (`AdminModels.swift` convention: `let version_number: Int`, no custom CodingKeys), plus pure logic mirroring `src/lib/agreements.js` so both platforms compute the same gate: `func blockingAgreements(_ rows: [AgreementStatusRow]) -> [AgreementStatusRow]`, `func graceDaysRemaining(_ row: AgreementStatusRow, now: Date) -> Int?`, `enum AgreementGateMode { case none, prompt, block }`.

**New `/home/user/xert-fitness/ios/XertFitnessApp/XertFitnessApp/Views/AgreementGateView.swift`** — presented from `RootView.swift` as `.fullScreenCover` when `store.agreementGate == .block` and `.sheet` when `.prompt`. Same scroll-to-end rule as web: a `ScrollView` with a `GeometryReader` bottom sentinel that flips `hasReachedEnd`. Body rendered with `Text(AttributedString(markdown:))` for headings/paragraphs (iOS 16 deployment target — `AttributedString(markdown:options:)` handles the inline subset; render `##` headings as separate `Text` runs with `XertTheme` display styling from `Theme.swift`). Accept sends `content_hash` back so a stale cached copy is rejected server-side. `requires_signed_name` documents show a `TextField` bound to `signedName`.

**New `/home/user/xert-fitness/ios/XertFitnessApp/XertFitnessApp/Views/AgreementRecordView.swift`** — the member's acceptance ledger, pushed from `AccountView.swift`. Each row has a `ShareLink` producing a real PDF.

**New `/home/user/xert-fitness/ios/XertFitnessApp/XertFitnessApp/Services/AgreementDocumentPrinter.swift`** — zero-dependency PDF from the server-rendered HTML:
```swift
enum AgreementDocumentPrinter {
    static func pdfData(html: String) -> Data {
        let formatter = UIMarkupTextPrintFormatter(markupText: html)
        let renderer = UIPrintPageRenderer()
        renderer.addPrintFormatter(formatter, startingAtPageAt: 0)
        let page = CGRect(x: 0, y: 0, width: 595.2, height: 841.8) // A4 @ 72dpi
        renderer.setValue(page, forKey: "paperRect")
        renderer.setValue(page.insetBy(dx: 36, dy: 36), forKey: "printableRect")
        let data = NSMutableData()
        UIGraphicsBeginPDFContextToData(data, page, nil)
        for index in 0..<max(renderer.numberOfPages, 1) {
            UIGraphicsBeginPDFPage()
            renderer.drawPage(at: index, in: UIGraphicsGetPDFContextBounds())
        }
        UIGraphicsEndPDFContext()
        return data as Data
    }
}
```
The HTML comes from `/api/agreement-document`, so the member's PDF is byte-for-byte the same document the owner prints from the web admin.

**New `/home/user/xert-fitness/ios/XertFitnessApp/XertFitnessApp/Views/MemberWhyEditorView.swift`** — 600-char `TextEditor` with a live counter, focus `Picker`, and a `Toggle` for `coach_visible`. Presented from `AccountView.swift` and, once, immediately after the first acceptance in `AgreementGateView.swift`.

**Edits:**
- `Services/XertAPI.swift` — add `agreementStatus(session:)` (`rpc(path: "my_agreement_status", body: EmptyBody(), auth:)`, matching `announcements(session:)` at line 289), `liveAgreementVersion(slug:)`, `recordAgreementDecision(session:decision:)` (POSTs to `AppConfig.webURL(path: "api/accept-agreement")` with the bearer token — same shape as `checkout(session:productSlug:attemptID:)` at line 1641), `agreementDocumentHTML(session:acceptanceID:)`, `myWhy(session:)`, `saveMyWhy(session:_:)`, and `adminMemberAgreementHistory(session:memberID:)`.
- `Store/XertStore.swift` — `@Published var agreementStatus: [AgreementStatusRow] = []`, `@Published private(set) var agreementGate: AgreementGateMode = .none`, `@Published var isRecordingAgreementDecision = false`, `@Published var trainingWhy: MemberTrainingWhy?`. Fetch inside the existing `refresh()` (line 109) alongside `announcements`, guarded by the same `MemberStateVersion` snapshot pattern and added to `unavailableDataSources` on failure so a missing migration degrades instead of blocking. Add `XertDataSource.agreements`.
- `Views/RootView.swift` — attach the cover/sheet to the `memberTabs` branch (line ~38), driven by `store.agreementGate`. It must sit **inside** the privacy-lock branch so a locked app does not show contract text.
- `Views/AccountView.swift` — "My why" card and an "Agreements" row linking to `AgreementRecordView`.
- `Views/BookingView.swift` — when `store.agreementGate == .block`, replace the Book/Waitlist buttons with a "Review terms to book" button that opens the gate, and map the `AGREEMENT_REQUIRED` Postgres error to the same copy (the server-side trigger is the real enforcement; this just avoids a confusing raw error).
- `AdminModels.swift` + `Store/AdminStore.swift` + `Views/AdminCommandCentreView.swift` — the member detail surface gains the why (respecting `coach_visible`) and the acceptance ledger. Add the why to the roll-call roster card: extend `admin_session_roster` to return `training_why text` (`left join member_training_why on ... and coach_visible`) and `AdminRosterMember` (line 55 of `AdminModels.swift`) to carry it. **This is the "coaches see their why" surface** — see openQuestions on why there is no coach role.
- `XertFitnessAppTests/AgreementsTests.swift` — new, alongside `ModelsTests.swift`; covers the gate logic and decoding. XcodeGen picks up new files automatically (`project.yml` sources are directory paths).

## Security, privacy and compliance

**Evidence integrity.** Published version rows are immutable and undeletable (`guard_agreement_document_version` + `on delete restrict` from acceptances). Acceptance rows are immutable and undeletable (`guard_member_agreement_acceptance`, the same pattern as `admin_content_changes_immutable`). The SHA-256 hash covers slug + version number + title + normalised body, so the exact bytes are provable years later. `record_agreement_decision` rejects a submitted hash that does not match the live version — a member can never be bound to text a stale client did not render.

**Evidence the member cannot fabricate.** IP and user agent come from Vercel's `x-vercel-forwarded-for` / `x-real-ip` in `api/accept-agreement.js`, never from a client-supplied `x-forwarded-for`. The RPC refuses any caller that is not `service_role`, so a member cannot POST directly to PostgREST and mint a self-serving record. This is the same trust boundary `fulfill_stripe_checkout` and `admin_activate_session_pack_payments` already use.

**Enforcement is server-side.** `book_session` and `join_session_waitlist` are `grant execute … to authenticated` and directly callable from any HTTP client, so UI gating is theatre. The gate is a `before insert` trigger on `session_bookings` plus the check in `api/checkout.js`.

**Authorisation.** Every new admin function starts with `if not public.is_admin() then raise exception 'ADMIN_ONLY'`. RLS: documents are world-readable metadata; version bodies are readable only when published-and-effective, or by the member who accepted that exact version, or by an admin — so a member cannot read an unpublished draft of terms the owner is still working on. Acceptances are own-or-admin. `member_training_why` is own-or-admin for read and write. `api/agreement-document.js` re-checks ownership server-side; the acceptance id is a UUID but must not be treated as a bearer token.

**Australian Privacy Act / APP compliance.**
- *APP 3/6 (collection and use).* The "why" is free text a member may fill with health information — "recovering from a hysterectomy", "managing depression", "post-cancer". Health information is **sensitive information** under s 6 of the Privacy Act and needs express consent plus a higher handling standard. Mitigations built in: the field is optional, capped at 600 characters, its label and helper text steer toward goals rather than diagnoses ("What are you training for?" — not "any medical conditions?"), and `coach_visible` lets the member keep it owner-only. Health screening belongs in the separate `health_declaration` document with its own consent, not in this field.
- *APP 11 (security).* No new secret material. Acceptance IP is stored as `inet`, not free text, so it cannot carry an injection payload into the printed document.
- *APP 12/13 (access and correction).* `/account/agreements` gives the member their full record; `member_training_why` is member-editable with a versioned history so a correction is a new row, not a silent overwrite. Acceptance records are deliberately not correctable — that is the point of evidence — and the Privacy page must say so.
- *Retention vs. erasure — the sharp edge.* `api/delete-account.js` calls `auth.admin.deleteUser`, which cascades through `profiles`. Because acceptance rows reference `auth.users` with `on delete set null` and carry a snapshotted `member_email` / `member_full_name`, they survive deletion. That is a deliberate legal hold: without it, anyone who deleted their account after an incident would erase the evidence of the waiver they signed. APP 11.2 requires destruction once information is no longer needed, and the defensible position is that it *is* still needed until the limitation period expires (six years for a simple contract in Queensland under the *Limitation of Actions Act 1974*). **Set the retention at seven years from the last agreement event and disclose it in `src/pages/Privacy.jsx` before you ship.** Retaining it without disclosing it is the actual compliance failure — not the retention itself. Ship a `scripts/purge-agreement-evidence.mjs` in phase 4 that replaces `member_email` / `member_full_name` / `client_ip` with nulls past that horizon while keeping the hash, version, and timestamp, so a de-identified proof of acceptance survives forever.
- *Electronic Transactions Act 1999 (Cth) / Electronic Transactions (Queensland) Act 2001.* An electronic signature needs a reliable method to identify the person and indicate their approval. Authenticated session + scroll-to-end + affirmative tap + typed full name on the contract + IP/UA/timestamp/hash is comfortably above that bar for a suburban gym.

**Audit trail.** Authoring and publishing flow into the existing `admin_content_changes` ledger (which is itself immutable), so "who changed the terms and when" appears in `src/components/admin/AdminAuditLog.jsx` with zero new audit machinery.

**What this system does NOT do:** it does not make the *contents* of the agreement legally sound. See openQuestions.

## Rollout

**Phase 1 — schema and evidence, no member-visible change (1–2 days).** Apply `20260726000000_member_agreements.sql`. `agreement_enforcement` defaults to `'prompt'` but no document has a published version yet, so `agreement_status_for_member` returns zero rows and `member_agreement_gate` returns `'ok'` for everyone. The `session_bookings` trigger is live but inert. Register the capability in `schemaCapabilities.js` and `release_readiness_check.sql`, and confirm `getOperationsHealth()` shows it green. Ship `api/accept-agreement.js` and `api/agreement-document.js`. Nothing changes for members.

**Phase 2 — admin authoring (2–3 days).** Ship `AgreementsManager.jsx` and the nav wiring. The owner pastes the current `src/pages/Terms.jsx` copy into the `terms-of-use` draft as markdown, previews it, and — **after a Queensland lawyer has reviewed it** — publishes v1 with `effective_at` a week out and `grace_period_days = 14`. `src/pages/Terms.jsx` starts serving the published body; the hardcoded fallback stays in the file so a Supabase outage still renders terms. Same for `privacy-collection`.

**Phase 3 — member prompt, no blocking (1 week live).** Ship `AgreementGate.jsx`, `agreementData.js`, `MemberWhyCard.jsx`, the iOS gate, and the "my why" surfaces. Enforcement stays at `'prompt'`: existing members see a dismissible banner with a countdown, brand-new signups see a non-dismissible cover (`never_accepted` — no grace, because they joined after the version went live). Watch `admin_agreement_overview().outstanding_members` in the Owner Command Centre. Send one `admin_send_member_notice` reminder at day 7 — the targeted-notice plumbing and APNs push already exist.

**Phase 4 — enforce (1 day, reversible).** When outstanding members plateau (realistically under 5% for a soft-launch-scale gym), flip `admin_settings.agreement_enforcement` to `'enforce'` from Soft Launch Settings. New bookings, waitlist joins, and pack purchases now require a current acceptance. Reverting is a single field update — that reversibility is why the switch exists. Then ship the retention purge script.

**Backfill / migration.** No data backfill exists to do: there are no historical acceptances, and inventing them would be fabricating evidence. Every existing member is genuinely un-accepted and goes through phase 3 honestly. The one seeded asymmetry is the `never_accepted` vs `update_pending` branch in `agreement_status_for_member`, which gives members who joined before the version went live their full grace period while blocking new signups immediately.

**Feature flag.** `admin_settings.agreement_enforcement` ('off' | 'prompt' | 'enforce'), a singleton row (`admin_settings_singleton_idx`), read by the DB gate, the checkout API, and both clients. `'off'` is the emergency stop.

**Rollback.** Phase 4 → phase 3 is a field flip. Phases 1–3 roll back by setting `'off'`; the tables can stay because they are additive and every read path tolerates their absence (`.catch(() => [])` in `adminData.js`, `unavailableDataSources` on iOS). Never drop `member_agreement_acceptances` — that is the evidence.

## Open questions for the owner

**1. "Contracts for members incl their why" — I am not building the why into the contract, and you should not want me to.** *My recommendation:* capture the why in the same onboarding flow, one screen after acceptance, but store it in `member_training_why`, entirely separate from the acceptance ledger. Three reasons. (a) A member must be able to change their why the week they switch from "lose 10 kg" to "finish the Kingaroy 10k" — if it is a contract term, changing it means re-executing an agreement. (b) A why frequently contains health information, which is *sensitive information* under the Privacy Act; freezing it into an immutable contract snapshot collides with the APP 13 correction right and with the erasure expectations members have. (c) The whole value of the why is that it is live and coach-facing, and the whole value of a contract is that it is dead and frozen. They are opposite artefacts. Sequential capture gets you everything you asked for without welding them together.

**2. You are not currently selling memberships.** Everything in this codebase is prepaid session packs: one-time Stripe payments (`mode: 'payment'` in `api/checkout.js`), `credit_batches` with an expiry, no subscriptions, no direct debit. A "membership contract" normally means an ongoing obligation with recurring billing, minimum terms, and cancellation rights. *My recommendation:* publish `terms-of-use`, `privacy-collection`, and `health-declaration` now, and leave `membership-contract` seeded but unpublished (`acceptance_required = false`) until you actually sell a recurring product. If and when you do, the recurring-billing work — Stripe subscriptions, dunning, mid-term price changes, cooling-off — is a much bigger project than this one, and this agreement system is a prerequisite for it, not a substitute.

**3. This system delivers agreements; it does not draft them.** Queensland regulates fitness-industry contracts through a code of practice under the *Fair Trading Act*, with prescribed content, cooling-off, and termination requirements, and the Australian Consumer Law's unfair-contract-term regime applies to standard-form consumer contracts — with penalties since the 2023 amendments. The current `src/pages/Terms.jsx` copy is a decent plain-English starting point but it was clearly not drafted by a lawyer, and clauses like "Cancellations within 12 hours generally use the credit" and the liability limitation are exactly the kind of terms that get scrutinised. *My recommendation:* budget a few hundred dollars for a Queensland small-business lawyer to review the v1 text before you publish it in phase 2. Publishing v1 through this system makes bad wording *durably binding on every member*, which is worse than the current situation where nothing is recorded at all. This is the single highest-risk item in the whole feature.

**4. There is no coach role in this system.** `public.coaches` is a marketing content table with no `auth.users` link, and `profiles.role` only accepts `'member'` and `'admin'`. So "surfaced to coaches" today means "surfaced to whoever is signed in as admin", most likely on a shared iPad at the front desk. *My recommendation:* ship it that way — put the why on the roll-call roster card gated by `coach_visible`, which is exactly where a coach looks before a class. Do **not** build a coach role for this feature alone. Revisit when you hire a second coach who needs their own login, and treat it as its own project (role enum, RLS across every member-data table, admin-vs-coach scoping in ~15 policies). Tell members plainly that "your coach" means gym staff.

**5. Grace period and what a decline actually costs.** *My recommended defaults:* 14 days' grace from `effective_at`; a decline or an overdue acceptance blocks new bookings, waitlist joins, and pack purchases, and nothing else. Members keep viewing their account, keep their existing confirmed bookings, can still cancel them, and — critically — **never forfeit credits they have paid for**. Confiscating prepaid credits because someone declined a T&C update would be a consumer-guarantee problem and probably an unfair contract term. If they decline permanently, that is a conversation and a refund, not an automated punishment.

**6. Does the membership contract need a typed signature?** *My recommended default:* yes for `membership_contract` (`requires_signed_name = true`, already seeded), no for terms and privacy where an authenticated tap plus scroll-to-end plus the evidence bundle is proportionate. Do not add a drawn-signature canvas — it adds real complexity, a whole storage and rendering path, and no legal weight over a typed name under the Electronic Transactions Act.

**7. Retention after account deletion.** *My recommended default:* keep acceptance evidence — including the snapshotted email and name — for seven years after the member's last agreement event, then de-identify (null the email, name, and IP; keep the hash, version, and timestamp). This must be written into `src/pages/Privacy.jsx` before phase 3. If you would rather delete everything on request, say so now, because that changes the FK from `on delete set null` to `on delete cascade` and you accept that a member can erase their own waiver.

**8. Minors.** Nothing in the current signup flow asks for a date of birth, and a person under 18 generally cannot be bound to a gym contract without a guardian. *My recommended default:* add a date-of-birth field at signup, and where the member is under 18 do not let them self-accept — flag the account for a guardian-countersigned paper agreement that an admin records manually against the member. That admin path is not in this design; tell me if you train under-18s and I will add it, because if you do and you ship without it, every under-18 acceptance you collect is worth nothing.

