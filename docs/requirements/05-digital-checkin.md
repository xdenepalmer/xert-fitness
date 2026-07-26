# Digital tag check-in, online pre-registration, and on-arrival booking

**Effort: XL**

> Design spec produced during the July 2026 audit, from the owner requirements note.
> Not yet implemented. Reviewed against the schema and code as at commit time.

## Summary

Members already pre-register online today — `book_session()` plus `src/pages/Booking.jsx` is exactly that, so this feature is mostly about closing the loop at the door rather than building booking again. This adds a member-held digital pass (a rotating, cryptographically signed QR shown in the iOS app or web account), a staffed kiosk that scans it, and an arrival ledger (`public.check_ins`) that stamps `session_bookings.checked_in_at` and pre-fills the roll call you already run in `ClassCalendarAdmin.jsx`. A tap with no booking triggers on-arrival booking against real capacity, credit and waitlist rules; a tap when the network is down is queued on the device, verified offline against a cached public key, and reconciled server-side with explicit conflict rules. The business value is that attendance stops being a manual roll call, no-shows become measurable, and walk-ins convert into credit-consuming bookings at the door instead of being waved through unrecorded.

## Recommendation

PRIMARY: a rotating, ECDSA-P256-signed QR code shown by the member (iOS app via Secure Enclave, web via a non-extractable WebCrypto key), scanned by a staff-side kiosk — an iPad in Guided Access running a new `/checkin` route of the existing React SPA.

FALLBACK: a physical MIFARE DESFire EV3 fob (AUD $2.50–4.50 each) on a desk reader (Elatec TWN4 MultiTech or HID OMNIKEY 5427CK, AUD $250–400) for members without a usable smartphone, plus a staff manual name/phone search that is always available.

Why this and not the alternatives:

• Rotating QR wins because it is the only option with zero per-member hardware cost, works identically on iOS/Android/desktop, needs no platform approval, and — critically — the signature makes screenshot sharing useless within 30 seconds. Payload is `XERT1.<public_id>.<counter36>.<sig_b64url>` where counter = floor(unix/30) and the signature is raw r||s over `XERT1.<public_id>.<counter36>`. ~115 chars, QR version 6, scans instantly. Because it is asymmetric, the kiosk caches only PUBLIC keys, so a stolen lobby iPad cannot mint credentials — this is what makes the offline story safe.

• Apple/Google Wallet pass with a barcode: deferred to a later phase, not rejected. It is genuinely nicer UX (lock-screen, no app open, no battery-dead-app problem). But the barcode in a Wallet pass is static — you cannot rotate it per-30-seconds; the pass web service push updates are minutes-scale. That directly undermines the tag-sharing requirement you asked me to solve. It also needs a Pass Type ID cert + a Node signing service on Vercel, and a separate Google Wallet Issuer onboarding with business verification. That is roughly two to three weeks of work for a UX gain, with a security regression. Do it in Phase 5 once volumes justify it, and issue Wallet passes as a static-credential class flagged `kind='wallet'` so anti-passback treats them like fobs.

• NFC phone tap: reject, and be honest about why. Apple does not let a third-party app emulate an access card by default — HCE via `CardSession` requires the NFC & SE Platform entitlement, which Apple grants under a commercial agreement aimed at banks, transit and enterprise access-control vendors; a single Queensland gym will not get it. Apple Wallet passes with NFC require Apple's VAS certificates and a VAS-capable reader, and Apple gates who may issue NFC-enabled passes. What IS available is CoreNFC reading: a foregrounded iOS app (iPhone 7+, `com.apple.developer.nfc.readersession.formats` entitlement) can read an NTAG sticker on the wall; background NDEF tag reading (iPhone XS+) launches the app via the system, which is too slow and too unreliable for a door. Note the direction reversal — that design has the member's phone read the door, not the door read the phone, which means the phone still has to be unlocked and the app opened, so it buys nothing over the QR while adding an Apple entitlement dependency. Android HCE is open, so an NFC design would work on Android and not iOS — unacceptable asymmetry for a gym whose flagship app is iOS.

• BLE proximity / auto check-in: reject. iBeacon region monitoring can wake the app in the background, but it requires "Always" location permission (an App Store review conversation and a privacy cost you do not need), the beacon UUID/major/minor is broadcast in clear and is trivially spoofed by anyone with a phone, and 5–10 m range means people walking past the shopfront get checked in. Battery drain on member phones will generate support load. The one legitimate use is passive dwell-time analytics, which is not what was asked for.

• Physical RFID as PRIMARY: reject on cost and cloning. A $30 EM4100/125 kHz reader-and-fob kit is what most small gyms buy, and a $15 Proxmark-class device clones those fobs in seconds — it is security theatre. Doing RFID properly means DESFire EV3 with diversified keys and a SAM-capable reader, which lands at AUD $250–400 for the reader before you have written a line of integration code, plus $2.50–4.50 per member. As a fallback for the ~5% of members without a suitable phone, that cost is fine. As the primary channel for everyone, it is a needless several-thousand-dollar rollout that still leaves you writing the QR path for the app.

Explicitly out of scope for v1, and I recommend you resist it: wiring this to a physical door strike/turnstile for unattended access. Everything below assumes staff are present. Unattended door release turns a bug in `record_check_in` into a physical security incident and changes your insurance position.

## Data model

New migration `supabase/migrations/20260726000000_door_check_in.sql`, mirrored verbatim at `src/supabase/door_check_in_upgrade.sql` (the repo keeps both paths — see `schemaCapabilities.js` and `release_readiness_check.sql`).

IMPORTANT DESIGN CONSTRAINT DISCOVERED IN THE REPO: door policy must NOT go on `public.admin_settings`. Migration `20260716060000_payment_activation_drift_guard.sql` installs `guard_session_pack_payment_activation()` as `admin_settings_z_guard_payment_activation`, which raises `PAYMENT_SETTINGS_CHANGE_REQUIRES_PAUSE` when `to_jsonb(new) is distinct from to_jsonb(old)` and payments are live. Adding `check_in_*` columns there would mean the owner cannot retune the late cutoff without first pausing Stripe. Hence a separate singleton.

```sql
-- XERT door check-in: member-held credentials, kiosk devices, and the arrival
-- ledger that feeds the existing roll call. Idempotent; safe to re-run.

-- ── 1. Door policy singleton ────────────────────────────────────────────────
create table if not exists public.check_in_settings (
  id                         uuid primary key default gen_random_uuid(),
  check_in_enabled           boolean not null default false,
  on_arrival_booking_enabled boolean not null default true,
  opens_minutes_before       integer not null default 30,
  late_cutoff_minutes        integer not null default 15,
  anti_passback_seconds      integer not null default 90,
  auto_checkout_minutes      integer not null default 240,
  offline_grace_minutes      integer not null default 10,
  directory_ttl_hours        integer not null default 12,
  updated_at                 timestamptz not null default now(),
  updated_by                 uuid references auth.users(id) on delete set null
);

create unique index if not exists check_in_settings_singleton_idx
  on public.check_in_settings ((true));

alter table public.check_in_settings drop constraint if exists check_in_settings_window_check;
alter table public.check_in_settings add constraint check_in_settings_window_check check (
  opens_minutes_before between 0 and 240
  and late_cutoff_minutes between 0 and 120
  and anti_passback_seconds between 0 and 3600
  and auto_checkout_minutes between 30 and 720
  and offline_grace_minutes between 0 and 120
  and directory_ttl_hours between 1 and 72
);

insert into public.check_in_settings (check_in_enabled)
select false where not exists (select 1 from public.check_in_settings);

-- ── 2. Member-held credentials ──────────────────────────────────────────────
create table if not exists public.member_check_in_credentials (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  kind           text not null check (kind in ('device', 'fob')),
  label          text not null check (char_length(btrim(label)) between 1 and 60),
  public_id      text not null unique check (public_id ~ '^[0-9A-HJKMNP-TV-Z]{16}$'),
  public_key     bytea,
  fob_uid_hash   bytea,
  enrolled_by    uuid references auth.users(id) on delete set null,
  last_used_at   timestamptz,
  revoked_at     timestamptz,
  revoked_by     uuid references auth.users(id) on delete set null,
  revoked_reason text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint member_check_in_credentials_material_check check (
    (kind = 'device' and public_key is not null
      and octet_length(public_key) between 70 and 120 and fob_uid_hash is null)
    or (kind = 'fob' and fob_uid_hash is not null
      and octet_length(fob_uid_hash) = 32 and public_key is null)
  ),
  constraint member_check_in_credentials_revocation_check check (
    (revoked_at is null and revoked_reason is null)
    or (revoked_at is not null
        and char_length(btrim(coalesce(revoked_reason, ''))) between 3 and 200)
  )
);

create unique index if not exists member_check_in_credentials_fob_uid_idx
  on public.member_check_in_credentials (fob_uid_hash)
  where fob_uid_hash is not null and revoked_at is null;
create index if not exists member_check_in_credentials_user_idx
  on public.member_check_in_credentials (user_id, revoked_at, created_at desc);
create index if not exists member_check_in_credentials_active_idx
  on public.member_check_in_credentials (public_id) where revoked_at is null;

create or replace function public.enforce_check_in_credential_limit()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_active integer;
begin
  if new.revoked_at is not null then return new; end if;
  select count(*) into v_active from public.member_check_in_credentials
   where user_id = new.user_id and kind = new.kind and revoked_at is null
     and id is distinct from new.id;
  if new.kind = 'device' and v_active >= 3 then raise exception 'CHECK_IN_DEVICE_LIMIT'; end if;
  if new.kind = 'fob' and v_active >= 2 then raise exception 'CHECK_IN_FOB_LIMIT'; end if;
  return new;
end; $$;
revoke execute on function public.enforce_check_in_credential_limit() from public, anon, authenticated;
drop trigger if exists member_check_in_credentials_limit on public.member_check_in_credentials;
create trigger member_check_in_credentials_limit
  before insert or update on public.member_check_in_credentials
  for each row execute function public.enforce_check_in_credential_limit();

-- ── 3. Door / kiosk devices ─────────────────────────────────────────────────
create table if not exists public.check_in_devices (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(btrim(name)) between 2 and 60),
  location_zone  text,
  mode           text not null default 'kiosk' check (mode in ('kiosk', 'staff')),
  api_key_hash   bytea not null unique check (octet_length(api_key_hash) = 32),
  api_key_prefix text not null check (api_key_prefix ~ '^[0-9a-f]{8}$'),
  enabled        boolean not null default true,
  last_seen_at   timestamptz,
  last_sync_at   timestamptz,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists check_in_devices_enabled_idx
  on public.check_in_devices (enabled, last_seen_at desc);

-- ── 4. Arrival ledger ───────────────────────────────────────────────────────
create table if not exists public.check_ins (
  id                 uuid primary key default gen_random_uuid(),
  client_event_id    uuid not null unique,
  user_id            uuid references auth.users(id) on delete set null,
  credential_id      uuid references public.member_check_in_credentials(id) on delete set null,
  device_id          uuid references public.check_in_devices(id) on delete set null,
  class_session_id   uuid references public.class_sessions(id) on delete set null,
  booking_id         uuid references public.session_bookings(id) on delete set null,
  method             text not null check (method in ('device_qr', 'fob', 'staff_manual')),
  outcome            text not null check (outcome in (
    'attended', 'on_arrival_booked', 'on_arrival_waitlisted', 'duplicate_ignored',
    'denied_check_in_disabled', 'denied_device_disabled', 'denied_unknown_credential',
    'denied_revoked_credential', 'denied_signature', 'denied_replay',
    'denied_early', 'denied_late', 'denied_no_session', 'denied_capacity',
    'denied_conflict', 'denied_no_credit', 'denied_session_closed'
  )),
  verification       text not null check (verification in (
    'online_signature', 'offline_signature', 'fob_uid', 'staff_witness'
  )),
  captured_offline   boolean not null default false,
  credential_counter bigint,
  occurred_at        timestamptz not null,
  recorded_at        timestamptz not null default now(),
  clock_skew_seconds integer,
  duplicate_of       uuid references public.check_ins(id) on delete set null,
  checked_out_at     timestamptz,
  checked_out_by     uuid references auth.users(id) on delete set null,
  exception_note     text,
  resolved_at        timestamptz,
  resolved_by        uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists check_ins_recent_idx on public.check_ins (occurred_at desc, id desc);
create index if not exists check_ins_session_idx on public.check_ins (class_session_id, occurred_at desc);
create index if not exists check_ins_member_idx on public.check_ins (user_id, occurred_at desc);
create index if not exists check_ins_open_idx on public.check_ins (occurred_at desc)
  where checked_out_at is null and outcome in ('attended', 'on_arrival_booked');
create index if not exists check_ins_exception_idx on public.check_ins (occurred_at desc)
  where resolved_at is null and (outcome like 'denied_%' or exception_note is not null);

-- Replay guard: one counter window may be spent once, ever.
create table if not exists public.check_in_credential_uses (
  credential_id      uuid not null references public.member_check_in_credentials(id) on delete cascade,
  credential_counter bigint not null,
  check_in_id        uuid references public.check_ins(id) on delete set null,
  used_at            timestamptz not null default now(),
  primary key (credential_id, credential_counter)
);
create index if not exists check_in_credential_uses_prune_idx
  on public.check_in_credential_uses (used_at);

-- ── 5. Extend the existing booking row (do NOT change status at the door) ────
alter table public.session_bookings
  add column if not exists checked_in_at timestamptz,
  add column if not exists check_in_id uuid references public.check_ins(id) on delete set null,
  add column if not exists origin text not null default 'online';
alter table public.session_bookings drop constraint if exists session_bookings_origin_check;
alter table public.session_bookings add constraint session_bookings_origin_check
  check (origin in ('online', 'on_arrival', 'admin')) not valid;
create index if not exists session_bookings_checked_in_idx
  on public.session_bookings (class_session_id) where checked_in_at is not null;

-- ── 6. Immutable admin history for credentials, devices and policy ──────────
create table if not exists public.check_in_admin_events (
  id           uuid primary key default gen_random_uuid(),
  entity       text not null check (entity in ('credential', 'device', 'settings', 'exception')),
  entity_id    uuid,
  member_id    uuid references auth.users(id) on delete set null,
  actor_id     uuid references auth.users(id) on delete set null,
  actor_role   text not null check (actor_role in ('member', 'admin', 'system')),
  action       text not null check (action in (
    'enrolled', 'revoked', 'rotated', 'enabled', 'disabled', 'updated', 'resolved', 'excused'
  )),
  detail       text not null,
  previous_snapshot jsonb,
  new_snapshot jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists check_in_admin_events_created_idx
  on public.check_in_admin_events (created_at desc, id desc);
create index if not exists check_in_admin_events_member_idx
  on public.check_in_admin_events (member_id, created_at desc, id desc);

create or replace function public.guard_check_in_admin_event()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'CHECK_IN_AUDIT_IMMUTABLE';
end; $$;
drop trigger if exists check_in_admin_events_immutable on public.check_in_admin_events;
create trigger check_in_admin_events_immutable
  before update or delete on public.check_in_admin_events
  for each row execute function public.guard_check_in_admin_event();

create or replace function public.audit_check_in_credential_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_action text; v_role text;
begin
  if tg_op = 'INSERT' then v_action := 'enrolled';
  elsif old.revoked_at is null and new.revoked_at is not null then v_action := 'revoked';
  elsif to_jsonb(old) = to_jsonb(new) then return new;
  else v_action := 'updated';
  end if;
  if v_action = 'updated' and old.last_used_at is distinct from new.last_used_at
     and old.revoked_at is not distinct from new.revoked_at then return new; end if;
  v_role := case when auth.uid() is null then 'system'
                 when public.is_admin() then 'admin' else 'member' end;
  insert into public.check_in_admin_events (
    entity, entity_id, member_id, actor_id, actor_role, action, detail,
    previous_snapshot, new_snapshot
  ) values (
    'credential', new.id, new.user_id, auth.uid(), v_role, v_action,
    new.kind || ' credential ' || new.public_id,
    case when tg_op = 'INSERT' then null else to_jsonb(old) - 'public_key' end,
    to_jsonb(new) - 'public_key'
  );
  return new;
end; $$;
revoke execute on function public.audit_check_in_credential_change() from public, anon, authenticated;
drop trigger if exists member_check_in_credentials_audit on public.member_check_in_credentials;
create trigger member_check_in_credentials_audit
  after insert or update on public.member_check_in_credentials
  for each row execute function public.audit_check_in_credential_change();

-- ── 7. updated_at (reuse the shared toucher from 20260714019000) ────────────
drop trigger if exists check_in_settings_touch_updated_at on public.check_in_settings;
create trigger check_in_settings_touch_updated_at before update on public.check_in_settings
  for each row execute function public.touch_shared_admin_record_updated_at();
drop trigger if exists member_check_in_credentials_touch_updated_at on public.member_check_in_credentials;
create trigger member_check_in_credentials_touch_updated_at before update on public.member_check_in_credentials
  for each row execute function public.touch_shared_admin_record_updated_at();
drop trigger if exists check_in_devices_touch_updated_at on public.check_in_devices;
create trigger check_in_devices_touch_updated_at before update on public.check_in_devices
  for each row execute function public.touch_shared_admin_record_updated_at();
drop trigger if exists check_ins_touch_updated_at on public.check_ins;
create trigger check_ins_touch_updated_at before update on public.check_ins
  for each row execute function public.touch_shared_admin_record_updated_at();

-- ── 8. ROW LEVEL SECURITY (complete) ────────────────────────────────────────
alter table public.check_in_settings enable row level security;
alter table public.member_check_in_credentials enable row level security;
alter table public.check_in_devices enable row level security;
alter table public.check_ins enable row level security;
alter table public.check_in_credential_uses enable row level security;
alter table public.check_in_admin_events enable row level security;

-- Table privileges first; RLS narrows what remains.
revoke all on table public.check_in_settings from public, anon, authenticated;
grant select on table public.check_in_settings to anon, authenticated;

revoke all on table public.member_check_in_credentials from public, anon, authenticated;
grant select (id, user_id, kind, label, public_id, last_used_at, revoked_at,
              revoked_reason, created_at, updated_at)
  on table public.member_check_in_credentials to authenticated;

revoke all on table public.check_in_devices from public, anon, authenticated;
grant select (id, name, location_zone, mode, api_key_prefix, enabled,
              last_seen_at, last_sync_at, created_at, updated_at)
  on table public.check_in_devices to authenticated;

revoke all on table public.check_ins from public, anon, authenticated;
grant select on table public.check_ins to authenticated;

revoke all on table public.check_in_credential_uses from public, anon, authenticated;

revoke all on table public.check_in_admin_events from public, anon, authenticated;
grant select on table public.check_in_admin_events to authenticated;

-- check_in_settings: everyone may read the door policy (the kiosk and the
-- member pass both need the windows); only the admin RPC may write.
drop policy if exists "check_in_settings_public_read" on public.check_in_settings;
create policy "check_in_settings_public_read" on public.check_in_settings
  for select to anon, authenticated using (true);

-- member_check_in_credentials: a member sees their own; admins see all.
-- Writes are RPC-only (no insert/update/delete policy exists at all).
drop policy if exists "member_check_in_credentials_select_own_or_admin"
  on public.member_check_in_credentials;
create policy "member_check_in_credentials_select_own_or_admin"
  on public.member_check_in_credentials
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- check_in_devices: admin-only, and api_key_hash is not column-granted at all.
drop policy if exists "check_in_devices_admin_read" on public.check_in_devices;
create policy "check_in_devices_admin_read" on public.check_in_devices
  for select to authenticated using ((select public.is_admin()));

-- check_ins: a member sees their own arrivals; admins see everything.
drop policy if exists "check_ins_select_own_or_admin" on public.check_ins;
create policy "check_ins_select_own_or_admin" on public.check_ins
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- check_in_credential_uses: no policy, no grant. SECURITY DEFINER only.
drop policy if exists "check_in_credential_uses_no_access" on public.check_in_credential_uses;

-- check_in_admin_events: admin read only, and immutable by trigger.
drop policy if exists "check_in_admin_events_admin_read" on public.check_in_admin_events;
create policy "check_in_admin_events_admin_read" on public.check_in_admin_events
  for select to authenticated using ((select public.is_admin()));

-- ── 9. Member-facing RPCs ───────────────────────────────────────────────────
create or replace function public.member_enrol_check_in_device(
  p_label text, p_public_key bytea
) returns table (credential_id uuid, public_id text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_label text := btrim(coalesce(p_label, ''));
  v_public_id text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if char_length(v_label) < 1 or char_length(v_label) > 60 then raise exception 'LABEL_INVALID'; end if;
  if p_public_key is null or octet_length(p_public_key) not between 70 and 120 then
    raise exception 'PUBLIC_KEY_INVALID';
  end if;
  if exists (select 1 from public.member_check_in_credentials
              where public_key = p_public_key and revoked_at is null) then
    raise exception 'PUBLIC_KEY_ALREADY_ENROLLED';
  end if;
  -- 16 Crockford base32 chars (no I, L, O, U) from 10 random bytes.
  v_public_id := upper(translate(
    encode(gen_random_bytes(10), 'base32'), 'ILOU=', 'JKPR'
  ));
  v_public_id := left(regexp_replace(v_public_id, '[^0-9A-HJKMNP-TV-Z]', 'X', 'g'), 16);
  insert into public.member_check_in_credentials (
    user_id, kind, label, public_id, public_key, enrolled_by
  ) values (v_user, 'device', v_label, v_public_id, p_public_key, v_user)
  returning id, public_id into credential_id, public_id;
  return next;
end; $$;

create or replace function public.my_check_in_pass()
returns table (
  credential_id uuid, public_id text, label text, created_at timestamptz,
  check_in_enabled boolean, opens_minutes_before integer, late_cutoff_minutes integer,
  next_session_id uuid, next_title text, next_start_time timestamptz,
  next_location_zone text, available_credits bigint
)
language plpgsql security definer stable set search_path = public, pg_temp as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  return query
  select c.id, c.public_id, c.label, c.created_at,
         s.check_in_enabled, s.opens_minutes_before, s.late_cutoff_minutes,
         nxt.class_session_id, nxt.title, nxt.start_time, nxt.location_zone,
         coalesce((select sum(cb.remaining) from public.credit_batches cb
                    where cb.user_id = v_user and cb.remaining > 0
                      and (cb.expires_at is null or cb.expires_at > now())), 0)
    from public.member_check_in_credentials c
    cross join public.check_in_settings s
    left join lateral (
      select b.class_session_id, cs.title, cs.start_time, cs.location_zone
        from public.session_bookings b
        join public.class_sessions cs on cs.id = b.class_session_id
       where b.user_id = v_user and b.status = 'confirmed'
         and cs.start_time > now() - make_interval(mins => s.late_cutoff_minutes)
       order by cs.start_time asc limit 1
    ) nxt on true
   where c.user_id = v_user and c.kind = 'device' and c.revoked_at is null
   order by c.created_at desc limit 1;
end; $$;

create or replace function public.member_revoke_check_in_credential(
  p_credential_id uuid, p_reason text default 'Revoked by member'
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  update public.member_check_in_credentials
     set revoked_at = now(), revoked_by = v_user,
         revoked_reason = left(btrim(coalesce(p_reason, 'Revoked by member')), 200)
   where id = p_credential_id and user_id = v_user and revoked_at is null;
  if not found then raise exception 'CREDENTIAL_NOT_FOUND'; end if;
end; $$;

-- ── 10. On-arrival booking (a deliberate sibling of book_session) ───────────
-- book_session() refuses `v_start <= now()`, so it CANNOT serve a member who
-- arrives two minutes after the class starts. This function permits the late
-- window and nothing else; book_session is left untouched.
create or replace function public.check_in_book_on_arrival(
  p_user_id uuid, p_session_id uuid, p_now timestamptz
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_capacity integer; v_start timestamptz; v_status text; v_mode text;
  v_booked integer; v_batch uuid; v_booking uuid;
  v_late integer; v_early integer;
begin
  if auth.role() is distinct from 'service_role' and not public.is_admin() then
    raise exception 'SERVICE_ROLE_OR_ADMIN_ONLY';
  end if;
  select late_cutoff_minutes, opens_minutes_before into v_late, v_early
    from public.check_in_settings limit 1;

  select capacity, start_time, status, coalesce(booking_mode, 'instant_book')
    into v_capacity, v_start, v_status, v_mode
    from public.class_sessions where id = p_session_id for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if v_status <> 'published' then raise exception 'SESSION_NOT_BOOKABLE'; end if;
  if v_mode <> 'instant_book' then raise exception 'SESSION_NOT_INSTANT_BOOK'; end if;
  if p_now < v_start - make_interval(mins => v_early) then raise exception 'SESSION_TOO_EARLY'; end if;
  if p_now > v_start + make_interval(mins => v_late) then raise exception 'SESSION_TOO_LATE'; end if;

  if exists (select 1 from public.session_bookings
              where user_id = p_user_id and class_session_id = p_session_id
                and status in ('requested', 'confirmed', 'waitlisted')) then
    raise exception 'ALREADY_BOOKED';
  end if;

  -- enforce_session_waitlist_fifo() would raise WAITLIST_PRIORITY anyway;
  -- surface it as a clear denial instead of a trigger error.
  if exists (select 1 from public.session_bookings
              where class_session_id = p_session_id and status = 'waitlisted') then
    raise exception 'WAITLIST_AHEAD';
  end if;

  select count(*) into v_booked from public.session_bookings
   where class_session_id = p_session_id and status in ('requested', 'confirmed');
  if v_capacity is not null and v_booked >= v_capacity then raise exception 'SESSION_FULL'; end if;

  select id into v_batch from public.credit_batches
   where user_id = p_user_id and remaining > 0
     and (expires_at is null or expires_at > now())
   order by expires_at asc nulls last, created_at asc limit 1 for update;
  if v_batch is null then raise exception 'NO_CREDITS'; end if;
  update public.credit_batches set remaining = remaining - 1 where id = v_batch;

  insert into public.session_bookings (
    user_id, class_session_id, credit_batch_id, status, origin
  ) values (p_user_id, p_session_id, v_batch, 'confirmed', 'on_arrival')
  returning id into v_booking;
  return v_booking;
end; $$;

-- ── 11. The core door RPC ───────────────────────────────────────────────────
-- Called only by /api/check-in and /api/check-in-sync with the service role.
-- Signature verification happens in Node (pgcrypto has no ECDSA verify), so
-- p_signature_valid is an assertion by that trusted caller, exactly as
-- fulfill_stripe_checkout() trusts the Stripe webhook.
create or replace function public.record_check_in(
  p_device_id uuid,
  p_client_event_id uuid,
  p_credential_public_id text,
  p_method text,
  p_verification text,
  p_signature_valid boolean,
  p_credential_counter bigint,
  p_occurred_at timestamptz,
  p_captured_offline boolean,
  p_requested_session_id uuid default null,
  p_allow_on_arrival boolean default true,
  p_manual_user_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_settings public.check_in_settings%rowtype;
  v_device public.check_in_devices%rowtype;
  v_cred public.member_check_in_credentials%rowtype;
  v_existing public.check_ins%rowtype;
  v_user uuid;
  v_now timestamptz := now();
  v_occurred timestamptz;
  v_skew integer;
  v_booking public.session_bookings%rowtype;
  v_session public.class_sessions%rowtype;
  v_outcome text;
  v_note text;
  v_check_in uuid;
  v_dup uuid;
  v_candidate uuid;
  v_new_booking uuid;
  v_display text;
  v_credits bigint;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_ONLY'; end if;
  if p_client_event_id is null then raise exception 'CLIENT_EVENT_ID_REQUIRED'; end if;

  -- (a) Idempotency: a resent offline event returns its original verdict.
  select * into v_existing from public.check_ins where client_event_id = p_client_event_id;
  if found then
    return jsonb_build_object('replayed', true, 'check_in_id', v_existing.id,
      'outcome', v_existing.outcome, 'class_session_id', v_existing.class_session_id,
      'booking_id', v_existing.booking_id, 'note', v_existing.exception_note);
  end if;

  select * into v_settings from public.check_in_settings limit 1;
  select * into v_device from public.check_in_devices where id = p_device_id for update;

  -- (b) Clock discipline. Device time is advisory; server time is truth.
  v_skew := extract(epoch from (coalesce(p_occurred_at, v_now) - v_now))::integer;
  v_occurred := least(greatest(coalesce(p_occurred_at, v_now), v_now - interval '48 hours'), v_now);

  v_outcome := null;
  if not found or not v_device.enabled then v_outcome := 'denied_device_disabled';
  elsif not v_settings.check_in_enabled then v_outcome := 'denied_check_in_disabled';
  end if;

  if v_outcome is null then
    if p_method = 'staff_manual' then
      v_user := p_manual_user_id;
      if v_user is null then v_outcome := 'denied_unknown_credential'; end if;
    else
      select * into v_cred from public.member_check_in_credentials
       where public_id = p_credential_public_id for update;
      if not found then v_outcome := 'denied_unknown_credential';
      elsif v_cred.revoked_at is not null then v_outcome := 'denied_revoked_credential';
      elsif p_method = 'device_qr' and p_signature_valid is not true then v_outcome := 'denied_signature';
      else v_user := v_cred.user_id;
      end if;
    end if;
  end if;

  -- (c) Replay: a counter window is spendable exactly once, ever.
  if v_outcome is null and p_credential_counter is not null and v_cred.id is not null then
    begin
      insert into public.check_in_credential_uses (credential_id, credential_counter)
      values (v_cred.id, p_credential_counter);
    exception when unique_violation then v_outcome := 'denied_replay';
    end;
  end if;

  -- (d) Anti-passback: a second tap inside the window is idempotent, not an error.
  if v_outcome is null then
    select id into v_dup from public.check_ins
     where user_id = v_user
       and outcome in ('attended', 'on_arrival_booked')
       and occurred_at > v_occurred - make_interval(secs => v_settings.anti_passback_seconds)
     order by occurred_at desc limit 1;
    if v_dup is not null then v_outcome := 'duplicate_ignored'; end if;
  end if;

  -- (e) Match an existing confirmed booking inside the door window.
  if v_outcome is null then
    select b.* into v_booking
      from public.session_bookings b
      join public.class_sessions cs on cs.id = b.class_session_id
     where b.user_id = v_user
       and b.status in ('confirmed', 'attended', 'no_show')
       and (p_requested_session_id is null or b.class_session_id = p_requested_session_id)
       and v_occurred >= cs.start_time - make_interval(mins => v_settings.opens_minutes_before)
       and v_occurred <= cs.start_time + make_interval(mins => v_settings.late_cutoff_minutes)
     order by abs(extract(epoch from (cs.start_time - v_occurred))) asc
     limit 1 for update of b;

    if found then
      select * into v_session from public.class_sessions where id = v_booking.class_session_id;
      if v_session.status = 'cancelled' then
        v_outcome := 'denied_session_closed';
      else
        -- The door NEVER writes session_bookings.status. Capacity counting in
        -- sessions_with_availability() and the waitlist FIFO trigger both key
        -- off 'requested'/'confirmed'; flipping to 'attended' here would free a
        -- seat mid-class. Attendance stays a roll-call decision.
        v_outcome := 'attended';
        if v_booking.status = 'no_show' then
          v_note := 'Arrived at the door after the roll call recorded a no show.';
        end if;
      end if;
    end if;
  end if;

  -- (f) No booking: offer on-arrival booking.
  if v_outcome is null then
    if not (v_settings.on_arrival_booking_enabled and p_allow_on_arrival) then
      v_outcome := 'denied_no_session';
    else
      select cs.id into v_candidate from public.class_sessions cs
       where cs.status = 'published'
         and coalesce(cs.booking_mode, 'instant_book') = 'instant_book'
         and (p_requested_session_id is null or cs.id = p_requested_session_id)
         and v_occurred >= cs.start_time - make_interval(mins => v_settings.opens_minutes_before)
         and v_occurred <= cs.start_time + make_interval(mins => v_settings.late_cutoff_minutes)
       order by abs(extract(epoch from (cs.start_time - v_occurred))) asc limit 1;

      if v_candidate is null then
        v_outcome := 'denied_no_session';
      else
        begin
          v_new_booking := public.check_in_book_on_arrival(v_user, v_candidate, v_occurred);
          v_outcome := 'on_arrival_booked';
          select * into v_booking from public.session_bookings where id = v_new_booking;
        exception
          when others then
            v_note := sqlerrm;
            v_outcome := case
              when sqlerrm like '%NO_CREDITS%' then 'denied_no_credit'
              when sqlerrm like '%SESSION_FULL%' or sqlerrm like '%WAITLIST_AHEAD%' then 'denied_capacity'
              when sqlerrm like '%BOOKING_TIME_CONFLICT%' or sqlerrm like '%ALREADY_BOOKED%' then 'denied_conflict'
              when sqlerrm like '%SESSION_TOO_LATE%' then 'denied_late'
              when sqlerrm like '%SESSION_TOO_EARLY%' then 'denied_early'
              else 'denied_no_session' end;
        end;
      end if;
    end if;
  end if;

  insert into public.check_ins (
    client_event_id, user_id, credential_id, device_id, class_session_id, booking_id,
    method, outcome, verification, captured_offline, credential_counter,
    occurred_at, clock_skew_seconds, duplicate_of, exception_note
  ) values (
    p_client_event_id, v_user, v_cred.id, p_device_id,
    coalesce(v_booking.class_session_id, v_candidate), v_booking.id,
    p_method, v_outcome, p_verification, coalesce(p_captured_offline, false),
    p_credential_counter, v_occurred, v_skew, v_dup, v_note
  ) returning id into v_check_in;

  update public.check_in_credential_uses
     set check_in_id = v_check_in
   where credential_id = v_cred.id and credential_counter = p_credential_counter;

  if v_outcome in ('attended', 'on_arrival_booked') and v_booking.id is not null then
    update public.session_bookings
       set checked_in_at = coalesce(checked_in_at, v_occurred),
           check_in_id = coalesce(check_in_id, v_check_in)
     where id = v_booking.id;
  end if;

  if v_cred.id is not null then
    update public.member_check_in_credentials set last_used_at = v_occurred where id = v_cred.id;
  end if;
  update public.check_in_devices set last_seen_at = greatest(coalesce(last_seen_at, v_now), v_now)
   where id = p_device_id;

  -- Lobby screens are public. Return a first name and last initial only.
  select case when coalesce(btrim(p.full_name), '') = '' then 'Member'
              else split_part(btrim(p.full_name), ' ', 1)
                   || case when position(' ' in btrim(p.full_name)) > 0
                           then ' ' || left(split_part(btrim(p.full_name), ' ', 2), 1) || '.'
                           else '' end end
    into v_display from public.profiles p where p.id = v_user;
  select coalesce(sum(cb.remaining), 0) into v_credits from public.credit_batches cb
   where cb.user_id = v_user and cb.remaining > 0
     and (cb.expires_at is null or cb.expires_at > now());

  return jsonb_build_object(
    'replayed', false, 'check_in_id', v_check_in, 'outcome', v_outcome,
    'display_name', v_display, 'class_session_id', coalesce(v_booking.class_session_id, v_candidate),
    'booking_id', v_booking.id, 'credits_remaining', v_credits, 'note', v_note
  );
end; $$;

-- ── 12. Offline directory bundle (public keys only — never secrets) ────────
create or replace function public.check_in_directory_snapshot(p_device_id uuid)
returns jsonb language plpgsql security definer stable set search_path = public, pg_temp as $$
declare v_settings public.check_in_settings%rowtype; v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_ONLY'; end if;
  if not exists (select 1 from public.check_in_devices where id = p_device_id and enabled) then
    raise exception 'DEVICE_NOT_ENABLED';
  end if;
  select * into v_settings from public.check_in_settings limit 1;
  select jsonb_build_object(
    'generated_at', now(),
    'expires_at', now() + make_interval(hours => v_settings.directory_ttl_hours),
    'settings', to_jsonb(v_settings) - 'updated_by',
    'credentials', coalesce((
      select jsonb_agg(jsonb_build_object(
        'public_id', c.public_id, 'kind', c.kind,
        'public_key', encode(c.public_key, 'base64'),
        'fob_uid_hash', encode(c.fob_uid_hash, 'hex'),
        'display_name', split_part(btrim(coalesce(p.full_name, 'Member')), ' ', 1)))
      from public.member_check_in_credentials c
      join public.profiles p on p.id = c.user_id
     where c.revoked_at is null
       and (exists (select 1 from public.session_bookings b
                     join public.class_sessions cs on cs.id = b.class_session_id
                    where b.user_id = c.user_id and b.status = 'confirmed'
                      and cs.start_time between now() - interval '6 hours' and now() + interval '36 hours')
         or c.last_used_at > now() - interval '14 days')), '[]'::jsonb),
    'bookings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'booking_id', b.id, 'user_id', b.user_id, 'session_id', cs.id,
        'title', cs.title, 'start_time', cs.start_time, 'end_time', cs.end_time,
        'checked_in_at', b.checked_in_at))
      from public.session_bookings b
      join public.class_sessions cs on cs.id = b.class_session_id
     where b.status = 'confirmed'
       and cs.start_time between now() - interval '6 hours' and now() + interval '36 hours'), '[]'::jsonb)
  ) into v_result;
  update public.check_in_devices set last_sync_at = now() where id = p_device_id;
  return v_result;
end; $$;

-- ── 13. Staff views ────────────────────────────────────────────────────────
create or replace function public.admin_room_occupancy()
returns table (
  check_in_id uuid, member_id uuid, full_name text, phone text,
  class_session_id uuid, class_title text, start_time timestamptz, end_time timestamptz,
  coach_name text, location_zone text, method text, verification text,
  captured_offline boolean, occurred_at timestamptz, minutes_in_room integer
) language plpgsql security definer stable set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  return query
  select ci.id, ci.user_id, p.full_name, p.phone,
         cs.id, cs.title, cs.start_time, cs.end_time, cs.coach_name, cs.location_zone,
         ci.method, ci.verification, ci.captured_offline, ci.occurred_at,
         (extract(epoch from (now() - ci.occurred_at)) / 60)::integer
    from public.check_ins ci
    left join public.profiles p on p.id = ci.user_id
    left join public.class_sessions cs on cs.id = ci.class_session_id
   where ci.checked_out_at is null
     and ci.outcome in ('attended', 'on_arrival_booked')
     and ci.occurred_at > now() - interval '12 hours'
   order by ci.occurred_at desc limit 200;
end; $$;

create or replace function public.admin_check_in_exceptions(p_limit integer default 25)
returns table (
  check_in_id uuid, member_id uuid, full_name text, outcome text, method text,
  verification text, captured_offline boolean, class_session_id uuid, class_title text,
  occurred_at timestamptz, recorded_at timestamptz, clock_skew_seconds integer,
  exception_note text, device_name text
) language plpgsql security definer stable set search_path = public, pg_temp as $$
declare v_limit integer := greatest(1, least(coalesce(p_limit, 25), 100));
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  return query
  select ci.id, ci.user_id, p.full_name, ci.outcome, ci.method, ci.verification,
         ci.captured_offline, ci.class_session_id, cs.title, ci.occurred_at, ci.recorded_at,
         ci.clock_skew_seconds, ci.exception_note, d.name
    from public.check_ins ci
    left join public.profiles p on p.id = ci.user_id
    left join public.class_sessions cs on cs.id = ci.class_session_id
    left join public.check_in_devices d on d.id = ci.device_id
   where ci.resolved_at is null
     and (ci.outcome like 'denied_%' or ci.exception_note is not null)
     and ci.occurred_at > now() - interval '7 days'
   order by ci.occurred_at desc, ci.id desc limit v_limit;
end; $$;

create or replace function public.admin_resolve_check_in_exception(
  p_check_in_id uuid, p_note text
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_note text := btrim(coalesce(p_note, ''));
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if char_length(v_note) < 3 or char_length(v_note) > 500 then raise exception 'RESOLUTION_NOTE_REQUIRED'; end if;
  update public.check_ins
     set resolved_at = now(), resolved_by = auth.uid(),
         exception_note = coalesce(exception_note || ' | ', '') || v_note
   where id = p_check_in_id and resolved_at is null;
  if not found then raise exception 'EXCEPTION_NOT_FOUND'; end if;
  insert into public.check_in_admin_events (entity, entity_id, actor_id, actor_role, action, detail)
  values ('exception', p_check_in_id, auth.uid(), 'admin', 'resolved', v_note);
end; $$;

create or replace function public.admin_check_out_member(p_check_in_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  update public.check_ins set checked_out_at = now(), checked_out_by = auth.uid()
   where id = p_check_in_id and checked_out_at is null;
  if not found then raise exception 'CHECK_IN_NOT_OPEN'; end if;
end; $$;

-- Sweep: closes rooms after the class ends or the hard cap, whichever is first.
create or replace function public.close_stale_check_ins()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_closed integer; v_cap integer;
begin
  if auth.role() is distinct from 'service_role' and not public.is_admin() then
    raise exception 'SERVICE_ROLE_OR_ADMIN_ONLY';
  end if;
  select auto_checkout_minutes into v_cap from public.check_in_settings limit 1;
  update public.check_ins ci
     set checked_out_at = now()
    from public.class_sessions cs
   where cs.id = ci.class_session_id
     and ci.checked_out_at is null
     and ci.outcome in ('attended', 'on_arrival_booked')
     and now() > least(coalesce(cs.end_time, cs.start_time + interval '90 minutes') + interval '30 minutes',
                       ci.occurred_at + make_interval(mins => v_cap));
  get diagnostics v_closed = row_count;
  delete from public.check_in_credential_uses where used_at < now() - interval '30 days';
  return v_closed;
end; $$;

-- ── 14. No-show relief (nothing existing can do this) ──────────────────────
-- admin_set_booking_status() refuses to move a booking OUT of 'no_show'
-- (attended/no_show require v_current = 'confirmed'), so returning a credit
-- after a roll call needs its own audited path.
create or replace function public.admin_excuse_no_show(p_booking_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_booking public.session_bookings%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_expires timestamptz;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 500 then raise exception 'EXCUSE_REASON_REQUIRED'; end if;
  select * into v_booking from public.session_bookings where id = p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.status <> 'no_show' then raise exception 'BOOKING_NOT_NO_SHOW'; end if;
  if v_booking.credit_batch_id is null then raise exception 'NO_CREDIT_TO_RETURN'; end if;
  select expires_at into v_expires from public.credit_batches
   where id = v_booking.credit_batch_id for update;
  if v_expires is not null and v_expires <= now() then raise exception 'CREDIT_BATCH_EXPIRED'; end if;
  update public.credit_batches set remaining = remaining + 1 where id = v_booking.credit_batch_id;
  insert into public.check_in_admin_events (
    entity, entity_id, member_id, actor_id, actor_role, action, detail
  ) values ('exception', p_booking_id, v_booking.user_id, auth.uid(), 'admin', 'excused', v_reason);
end; $$;

-- ── 15. Admin device + fob + settings management ───────────────────────────
create or replace function public.admin_register_check_in_device(
  p_name text, p_location_zone text, p_mode text,
  p_api_key_hash bytea, p_api_key_prefix text
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_api_key_hash is null or octet_length(p_api_key_hash) <> 32 then raise exception 'DEVICE_KEY_INVALID'; end if;
  if p_api_key_prefix !~ '^[0-9a-f]{8}$' then raise exception 'DEVICE_KEY_PREFIX_INVALID'; end if;
  if coalesce(p_mode, 'kiosk') not in ('kiosk', 'staff') then raise exception 'DEVICE_MODE_INVALID'; end if;
  insert into public.check_in_devices (
    name, location_zone, mode, api_key_hash, api_key_prefix, created_by
  ) values (
    btrim(p_name), nullif(btrim(coalesce(p_location_zone, '')), ''),
    coalesce(p_mode, 'kiosk'), p_api_key_hash, p_api_key_prefix, auth.uid()
  ) returning id into v_id;
  insert into public.check_in_admin_events (entity, entity_id, actor_id, actor_role, action, detail)
  values ('device', v_id, auth.uid(), 'admin', 'enrolled', btrim(p_name));
  return v_id;
end; $$;

create or replace function public.admin_set_check_in_device_enabled(
  p_device_id uuid, p_enabled boolean, p_expected_updated_at timestamptz
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_updated_at timestamptz; v_name text;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_expected_updated_at is null then raise exception 'DEVICE_VERSION_REQUIRED'; end if;
  select updated_at, name into v_updated_at, v_name
    from public.check_in_devices where id = p_device_id for update;
  if not found then raise exception 'DEVICE_NOT_FOUND'; end if;
  if v_updated_at is distinct from p_expected_updated_at then raise exception 'DEVICE_STALE'; end if;
  update public.check_in_devices set enabled = p_enabled where id = p_device_id;
  insert into public.check_in_admin_events (entity, entity_id, actor_id, actor_role, action, detail)
  values ('device', p_device_id, auth.uid(), 'admin',
          case when p_enabled then 'enabled' else 'disabled' end, v_name);
end; $$;

create or replace function public.admin_enrol_check_in_fob(
  p_user_id uuid, p_fob_uid_hash bytea, p_label text
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_public_id text;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_user_id is null or not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'MEMBER_NOT_FOUND';
  end if;
  if p_fob_uid_hash is null or octet_length(p_fob_uid_hash) <> 32 then raise exception 'FOB_UID_INVALID'; end if;
  v_public_id := left(upper(translate(encode(gen_random_bytes(10), 'base32'), 'ILOU=', 'JKPR')), 16);
  insert into public.member_check_in_credentials (
    user_id, kind, label, public_id, fob_uid_hash, enrolled_by
  ) values (p_user_id, 'fob', btrim(p_label), v_public_id, p_fob_uid_hash, auth.uid())
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.admin_revoke_check_in_credential(
  p_credential_id uuid, p_reason text
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 200 then raise exception 'REVOKE_REASON_REQUIRED'; end if;
  update public.member_check_in_credentials
     set revoked_at = now(), revoked_by = auth.uid(), revoked_reason = v_reason
   where id = p_credential_id and revoked_at is null;
  if not found then raise exception 'CREDENTIAL_NOT_FOUND'; end if;
end; $$;

create or replace function public.admin_update_check_in_settings(
  p_settings jsonb, p_expected_updated_at timestamptz
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_current public.check_in_settings%rowtype; v_next record;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_expected_updated_at is null then raise exception 'CHECK_IN_SETTINGS_VERSION_REQUIRED'; end if;
  select * into v_current from public.check_in_settings limit 1 for update;
  if not found then raise exception 'CHECK_IN_SETTINGS_NOT_FOUND'; end if;
  if v_current.updated_at is distinct from p_expected_updated_at then
    raise exception 'CHECK_IN_SETTINGS_STALE';
  end if;
  select * into v_next from jsonb_to_record(p_settings) as s(
    check_in_enabled boolean, on_arrival_booking_enabled boolean,
    opens_minutes_before integer, late_cutoff_minutes integer,
    anti_passback_seconds integer, auto_checkout_minutes integer,
    offline_grace_minutes integer, directory_ttl_hours integer
  );
  update public.check_in_settings set
    check_in_enabled = coalesce(v_next.check_in_enabled, v_current.check_in_enabled),
    on_arrival_booking_enabled = coalesce(v_next.on_arrival_booking_enabled, v_current.on_arrival_booking_enabled),
    opens_minutes_before = coalesce(v_next.opens_minutes_before, v_current.opens_minutes_before),
    late_cutoff_minutes = coalesce(v_next.late_cutoff_minutes, v_current.late_cutoff_minutes),
    anti_passback_seconds = coalesce(v_next.anti_passback_seconds, v_current.anti_passback_seconds),
    auto_checkout_minutes = coalesce(v_next.auto_checkout_minutes, v_current.auto_checkout_minutes),
    offline_grace_minutes = coalesce(v_next.offline_grace_minutes, v_current.offline_grace_minutes),
    directory_ttl_hours = coalesce(v_next.directory_ttl_hours, v_current.directory_ttl_hours),
    updated_by = auth.uid()
  where id = v_current.id;
  insert into public.check_in_admin_events (
    entity, entity_id, actor_id, actor_role, action, detail, previous_snapshot, new_snapshot
  ) values ('settings', v_current.id, auth.uid(), 'admin', 'updated', 'Door policy updated',
            to_jsonb(v_current), p_settings);
end; $$;

-- ── 16. Extend the two existing staff read models (return type changes need
--        a DROP first — same pattern as my_bookings() in 20260714004100) ────
drop function if exists public.admin_session_roster(uuid);
create function public.admin_session_roster(p_session_id uuid)
returns table (
  booking_id uuid, member_id uuid, full_name text, email text, phone text,
  status text, booked_at timestamptz, origin text,
  checked_in_at timestamptz, check_in_method text, check_in_offline boolean
) language plpgsql security definer stable set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  return query
  select b.id, b.user_id, p.full_name, p.email, p.phone, b.status, b.created_at,
         b.origin, b.checked_in_at, ci.method, ci.captured_offline
    from public.session_bookings b
    left join public.profiles p on p.id = b.user_id
    left join public.check_ins ci on ci.id = b.check_in_id
   where b.class_session_id = p_session_id
   order by b.created_at asc;
end; $$;

drop function if exists public.admin_daily_operations();
create function public.admin_daily_operations()
returns table (
  session_id uuid, title text, class_type text, start_time timestamptz,
  end_time timestamptz, status text, capacity integer, coach_name text,
  location_zone text, booking_mode text, requested_count bigint,
  confirmed_count bigint, waitlist_count bigint, attended_count bigint,
  no_show_count bigint, public_request_count bigint, checked_in_count bigint,
  attendance_due boolean
) language plpgsql security definer stable set search_path = public, pg_temp as $$
declare
  v_local_day date := (now() at time zone 'Australia/Brisbane')::date;
  v_day_start timestamptz; v_day_end timestamptz;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  v_day_start := v_local_day::timestamp at time zone 'Australia/Brisbane';
  v_day_end := (v_local_day + 1)::timestamp at time zone 'Australia/Brisbane';
  return query
  select s.id, s.title, s.class_type, s.start_time, s.end_time, s.status, s.capacity,
         s.coach_name, s.location_zone, s.booking_mode,
         coalesce(mc.requested_count, 0), coalesce(mc.confirmed_count, 0),
         coalesce(mc.waitlist_count, 0), coalesce(mc.attended_count, 0),
         coalesce(mc.no_show_count, 0), coalesce(pc.request_count, 0),
         coalesce(mc.checked_in_count, 0),
         s.start_time <= now() and s.status in ('published', 'full', 'completed')
           and coalesce(mc.confirmed_count, 0) > 0
    from public.class_sessions s
    left join lateral (
      select count(*) filter (where b.status = 'requested') as requested_count,
             count(*) filter (where b.status = 'confirmed') as confirmed_count,
             count(*) filter (where b.status = 'waitlisted') as waitlist_count,
             count(*) filter (where b.status = 'attended') as attended_count,
             count(*) filter (where b.status = 'no_show') as no_show_count,
             count(*) filter (where b.checked_in_at is not null) as checked_in_count
        from public.session_bookings b where b.class_session_id = s.id
    ) mc on true
    left join lateral (
      select count(*) filter (where r.status = 'requested') as request_count
        from public.class_bookings r where r.class_session_id = s.id
    ) pc on true
   where s.start_time >= v_day_start and s.start_time < v_day_end and s.status <> 'draft'
   order by s.start_time, s.id limit 50;
end; $$;

-- ── 17. Grants ─────────────────────────────────────────────────────────────
revoke execute on function public.record_check_in(
  uuid, uuid, text, text, text, boolean, bigint, timestamptz, boolean, uuid, boolean, uuid
) from public, anon, authenticated;
grant execute on function public.record_check_in(
  uuid, uuid, text, text, text, boolean, bigint, timestamptz, boolean, uuid, boolean, uuid
) to service_role;
revoke execute on function public.check_in_directory_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.check_in_directory_snapshot(uuid) to service_role;
revoke execute on function public.check_in_book_on_arrival(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.check_in_book_on_arrival(uuid, uuid, timestamptz) to authenticated, service_role;
revoke execute on function public.close_stale_check_ins() from public, anon;
grant execute on function public.close_stale_check_ins() to authenticated, service_role;

revoke execute on function public.member_enrol_check_in_device(text, bytea) from public, anon;
revoke execute on function public.my_check_in_pass() from public, anon;
revoke execute on function public.member_revoke_check_in_credential(uuid, text) from public, anon;
revoke execute on function public.admin_room_occupancy() from public, anon;
revoke execute on function public.admin_check_in_exceptions(integer) from public, anon;
revoke execute on function public.admin_resolve_check_in_exception(uuid, text) from public, anon;
revoke execute on function public.admin_check_out_member(uuid) from public, anon;
revoke execute on function public.admin_excuse_no_show(uuid, text) from public, anon;
revoke execute on function public.admin_register_check_in_device(text, text, text, bytea, text) from public, anon;
revoke execute on function public.admin_set_check_in_device_enabled(uuid, boolean, timestamptz) from public, anon;
revoke execute on function public.admin_enrol_check_in_fob(uuid, bytea, text) from public, anon;
revoke execute on function public.admin_revoke_check_in_credential(uuid, text) from public, anon;
revoke execute on function public.admin_update_check_in_settings(jsonb, timestamptz) from public, anon;
revoke execute on function public.admin_session_roster(uuid) from public, anon;
revoke execute on function public.admin_daily_operations() from public, anon;

grant execute on function public.member_enrol_check_in_device(text, bytea) to authenticated;
grant execute on function public.my_check_in_pass() to authenticated;
grant execute on function public.member_revoke_check_in_credential(uuid, text) to authenticated;
grant execute on function public.admin_room_occupancy() to authenticated;
grant execute on function public.admin_check_in_exceptions(integer) to authenticated;
grant execute on function public.admin_resolve_check_in_exception(uuid, text) to authenticated;
grant execute on function public.admin_check_out_member(uuid) to authenticated;
grant execute on function public.admin_excuse_no_show(uuid, text) to authenticated;
grant execute on function public.admin_register_check_in_device(text, text, text, bytea, text) to authenticated;
grant execute on function public.admin_set_check_in_device_enabled(uuid, boolean, timestamptz) to authenticated;
grant execute on function public.admin_enrol_check_in_fob(uuid, bytea, text) to authenticated;
grant execute on function public.admin_revoke_check_in_credential(uuid, text) to authenticated;
grant execute on function public.admin_update_check_in_settings(jsonb, timestamptz) to authenticated;
grant execute on function public.admin_session_roster(uuid) to authenticated;
grant execute on function public.admin_daily_operations() to authenticated;

comment on function public.record_check_in(
  uuid, uuid, text, text, text, boolean, bigint, timestamptz, boolean, uuid, boolean, uuid
) is 'Service-role door check-in. Stamps session_bookings.checked_in_at; never writes booking status.';

insert into public.xert_schema_capabilities (capability)
values ('door_check_in') on conflict (capability) do nothing;
```

Retention job (add to `close_stale_check_ins()` or a separate Vercel cron): `delete from public.check_ins where occurred_at < now() - interval '24 months'` after aggregating monthly counts — see security.

## Backend

The kiosk never holds a Supabase session. It authenticates with a device key to three new Vercel functions, which use the service-role client exactly like `api/stripe-webhook.js` and `api/push-subscription.js` do today.

NEW `api/checkInVerify.js` (shared helper module, same non-route precedent as `api/apns.js`):
- `export function parseCheckInPayload(text)` → `{ version, publicId, counter, signatureB64 }` from `XERT1.<public_id>.<counter36>.<sig_b64url>`; rejects anything not matching `/^XERT1\.[0-9A-HJKMNP-TV-Z]{16}\.[0-9a-z]{1,12}\.[A-Za-z0-9_-]{86}$/`.
- `export function verifyCheckInSignature({ payload, publicKeyDer })` → `crypto.createPublicKey({ key: publicKeyDer, format: 'der', type: 'spki' })` then `crypto.verify('sha256', Buffer.from(signedPart), { key, dsaEncoding: 'ieee-p1363' }, sigBuffer)`. Raw r||s, so `ieee-p1363` is required — DER would fail.
- `export function counterWindowOk(counter, now, toleranceWindows)` → `Math.abs(counter - Math.floor(now/30)) <= toleranceWindows`.
- `export async function authenticateDevice(admin, keyHeader)` → sha256 the raw key, `admin.from('check_in_devices').select('id,name,mode,enabled').eq('api_key_hash', hashBuffer).maybeSingle()`; returns null on miss. Constant-time comparison is unnecessary because the lookup is by hash.
All four are pure/near-pure and get a `test/check-in-verify.test.js`.

NEW `api/check-in.js` — POST, online single tap.
1. `createRequestTrace(response)` from `api/http.js` (matches `api-request-trace.test.js` expectations).
2. Header `X-Xert-Device-Key`; `authenticateDevice`; 401 on miss, 403 if `enabled === false`.
3. Body `{ client_event_id, payload | fob_uid | manual_user_id, occurred_at, requested_session_id, allow_on_arrival }`.
4. For `payload`: parse, load `member_check_in_credentials` by `public_id` (service role reads `public_key`), verify signature, check `counterWindowOk(counter, now, 2)` — ±60 s online.
5. For `fob_uid`: sha256 the reader UID hex; `method='fob'`, `verification='fob_uid'`, `signature_valid=true`, `counter=null`.
6. `admin.rpc('record_check_in', { ... })`; return the jsonb verdict with a 200 even for denials — the kiosk renders the reason, it does not need HTTP error codes for business outcomes. Only auth/shape failures are 4xx.
7. Per-device rate limit: reject if the device recorded > 60 check-ins in the trailing 60 s (`admin.from('check_ins').select('id', { count: 'exact', head: true })`), returning 429.

NEW `api/check-in-sync.js` — POST, offline batch replay. `export const config = { maxDuration: 60 }`.
- Body `{ events: [...] }`, hard-capped at 200 events per request; the kiosk pages.
- Sort by `occurred_at` ascending before dispatch — ordering matters for anti-passback and capacity.
- Each event carries `verification: 'offline_signature'` and `captured_offline: true`, plus the counter the kiosk already verified against the cached public key. The server re-verifies the signature (it has the key) but accepts a wider window: `counterWindowOk(counter, occurredAt, Math.ceil(offline_grace_minutes * 2))`, i.e. verified against the *device-claimed* time rather than server now. If the signature fails re-verification the event is recorded with `p_signature_valid=false` → `denied_signature`; it is never silently dropped.
- Calls `record_check_in` once per event, sequentially, catching per-event errors so one poison event cannot fail the batch. Returns `{ results: [{ client_event_id, outcome, check_in_id }] }`; the kiosk deletes only the acknowledged rows from IndexedDB.

NEW `api/check-in-directory.js` — GET, offline bundle. Device-key auth, then `admin.rpc('check_in_directory_snapshot', { p_device_id })`. Response `Cache-Control: private, no-store` (already forced for `/api/*` by `vercel.json`).

EXTEND `api/admin-commerce-health.js` pattern with NEW `api/check-in-health.js` — admin bearer-token auth copied verbatim from `api/admin-push-health.js` lines 44-60 (getUser → profiles.role === 'admin'). Returns device last_seen ages, unsynced offline counts, exception counts in 24 h, and `check_in_settings.check_in_enabled`. This is what `OperationsHealth.jsx` renders.

SCHEDULED WORK — add to `vercel.json` a `crons` block (new key, none exists today):
```json
"crons": [
  { "path": "/api/check-in-sweep", "schedule": "*/15 * * * *" }
]
```
NEW `api/check-in-sweep.js` verifies `Authorization: Bearer ${process.env.CRON_SECRET}` and calls `close_stale_check_ins()`. Note Vercel Hobby allows only daily crons — if the project is on Hobby, run the sweep from the kiosk instead (it is already polling) or upgrade to Pro.

EXISTING code touched, not duplicated:
- `public.book_session()`, `cancel_booking()`, `join_session_waitlist()`, `admin_set_booking_status()`, `admin_promote_next_waitlisted()`, `admin_record_session_attendance()` are all UNCHANGED. On-arrival booking gets its own `check_in_book_on_arrival()` precisely because `book_session()` must keep refusing to book a class that has already started.
- `admin_session_roster()` and `admin_daily_operations()` are dropped and recreated with additive columns. Swift `Decodable` and the JS callers both ignore unknown keys, so old clients keep working; but `AdminDailyOperation` and `AdminRosterMember` in `ios/.../AdminModels.swift` need the new optional fields to surface them.
- `src/lib/attendanceDraft.js` gains one function; `admin_record_session_attendance` is still the only writer of attendance status.

## Web UI

NEW FILES

`src/pages/CheckInKiosk.jsx` — route `/checkin`, registered in `src/App.jsx` as `const CheckInKiosk = lazy(() => import('./pages/CheckInKiosk'))` with `<Route path="/checkin" element={<CheckInKiosk />} />`. Deliberately NOT wrapped in `AdminRoute` — the kiosk has no Supabase session. First run shows a device-key paste field (key generated in `CheckInDesk.jsx`, shown once); the key is stored in IndexedDB, never `localStorage`. Full-screen dark layout using the existing `xert-navy`/`xert-orange` Tailwind tokens. Three states: idle camera viewfinder, verdict card (2.5 s auto-dismiss), and the on-arrival sheet. Verdict card shows only the first name + last initial that `record_check_in` returns — no email, no phone, no full surname on a lobby screen.

`src/lib/checkInPass.js` — pure, fully unit-testable, no browser APIs. `encodeCheckInPayload({ publicId, counter, signatureBytes })`, `parseCheckInPayload(text)`, `checkInCounter(nowMs)` = `Math.floor(nowMs / 30000)`, `counterSecondsRemaining(nowMs)`, `signedMessage(publicId, counter)`. Mirrors the shape of `src/lib/bookingUi.js` — pure functions the tests import directly.

`src/lib/checkInCrypto.js` — WebCrypto wrappers. `generateMemberKeyPair()` → `crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])` (non-extractable), `exportSpki(publicKey)`, `signCounter(privateKey, message)` returning raw r||s, `importVerifyKey(spkiBytes)`, `verifyPayload(key, message, signature)` using `{ name: 'ECDSA', hash: 'SHA-256' }`. The kiosk uses only the verify half; the member pass uses only the sign half.

`src/lib/checkInQueue.js` — offline queue and conflict policy, written as pure reducers over a store interface so `test/check-in-queue.test.js` can drive it with an in-memory fake. Exports `enqueueCheckIn(store, event)`, `pendingBatch(store, limit = 200)` (sorted by `occurred_at` ascending), `applySyncResults(store, results)` (deletes only acknowledged `client_event_id`s), `reconcileVerdict(localVerdict, serverOutcome)` returning `{ needsStaffAttention, message }`, and `directoryIsFresh(bundle, now)`.

`src/lib/checkInData.js` — kiosk transport. `postCheckIn(deviceKey, event)`, `syncCheckIns(deviceKey, events)`, `fetchDirectory(deviceKey)`. Error strings go through the existing `apiErrorMessage` from `src/lib/apiError.js`.

`src/lib/memberCheckInPass.js` — member side. `ensureCheckInCredential()` (reads IndexedDB for an existing key, else generates one and calls `supabase.rpc('member_enrol_check_in_device', { p_label, p_public_key })`), `currentPassPayload()`, `getMyCheckInPass()` wrapping `supabase.rpc('my_check_in_pass')`.

`src/components/public/CheckInPassCard.jsx` — renders the QR on a `<canvas>` via the new `qrcode` dependency, a 30-second countdown ring, the member's next class, and remaining credits. Includes a "Trouble scanning? Show this code to staff" fallback that displays the 16-char `public_id` in 4-char groups so staff can type it into kiosk staff mode.

`src/components/admin/CheckInDesk.jsx` — the new admin section. Four panels: (1) live room, polling `adminRoomOccupancy()` every 10 s with `@tanstack/react-query` `refetchInterval` — deliberately polling rather than Supabase Realtime, because this repo uses zero realtime subscriptions today and `connect-src` already permits `wss://*.supabase.co` if you later upgrade; (2) exceptions queue from `adminCheckInExceptions()` with a resolve dialog using `AdminConfirmDialog.jsx`; (3) devices — register (generates a 32-byte key with `crypto.getRandomValues`, sends only the SHA-256 to `admin_register_check_in_device`, shows the raw key exactly once), enable/disable with `expected_updated_at` optimistic locking, last-seen age; (4) door policy form calling `admin_update_check_in_settings` with `p_expected_updated_at`, wired to `onDirtyChange` so the unsaved-changes guard in `AdminCommandCentre.jsx` protects it.

`test/check-in-pass.test.js`, `test/check-in-queue.test.js`, `test/check-in-verify.test.js`, `test/door-check-in-schema.test.js` (asserts the migration installs the RLS policies, the service-role guard, the capability marker, and that `record_check_in` never writes `session_bookings.status` — a regex assertion in the style of `test/attendance-roll-call.test.js`).

EXISTING FILES TO EXTEND

`src/App.jsx` — add the lazy import and the `/checkin` route.

`src/lib/adminNavigation.js` — add `'check-in'` to `ADMIN_SECTION_KEYS` (place it after `'calendar'` so `/admin/check-in` resolves).

`src/components/admin/AdminLayout.jsx` — add `{ key: 'check-in', label: 'Door Check-In', icon: ScanLine }` to the Operations group (the block at lines 37-40, next to `calendar` and `bookings`); import `ScanLine` from `lucide-react`.

`src/pages/AdminCommandCentre.jsx` — `const CheckInDesk = lazy(() => import('@/components/admin/CheckInDesk'))` and `case 'check-in': return <CheckInDesk onDirtyChange={setHasUnsavedChanges} />;`.

`src/lib/attendanceDraft.js` — add `attendanceDraftFromCheckIns(roster)` returning `'attended'` where `member.checked_in_at` is set and `'no_show'` otherwise, and `countCheckedIn(roster)`. It must reuse the existing `attendanceRosterMembers()` filter so eligibility rules stay in one place.

`src/components/admin/ClassCalendarAdmin.jsx` — in the roster block around lines 927-950, render a door badge when `r.checked_in_at` is present (plus a small "offline" chip when `r.check_in_offline`), and add a "Use door check-ins" button next to the existing "Take attendance" button (line ~913) that calls `setAttendanceDraft(attendanceDraftFromCheckIns(roster))`. Staff still press Save, which still goes through the untouched `adminRecordSessionAttendance`. Also add an "Excuse no-show" action on rows whose status is `no_show`, calling the new `adminExcuseNoShow`.

`src/lib/adminData.js` — add, in the "Class rosters" section next to `adminSessionRoster` (line ~1008): `adminRoomOccupancy()`, `adminCheckInExceptions(limit)`, `adminResolveCheckInException(id, note)`, `adminCheckOutMember(id)`, `adminExcuseNoShow(bookingId, reason)`, `adminRegisterCheckInDevice(...)`, `adminSetCheckInDeviceEnabled(...)`, `adminEnrolCheckInFob(...)`, `adminRevokeCheckInCredential(...)`, `getCheckInSettings()`, `updateCheckInSettings(settings, expectedUpdatedAt)`. Follow the existing `functionUnavailable` graceful-degradation shape used by `getAdminDailyOperations` (lines 1028-1035) so an un-migrated database shows "not installed" rather than crashing the section.

`src/lib/adminRequests.js` — add `normalizeCheckInExceptionResolution`, `normalizeNoShowExcuse`, `normalizeCheckInDeviceRegistration`, `normalizeCheckInSettings`, matching the existing `normalizeSessionAttendanceMutation` style (validate before the RPC, throw member-readable errors).

`src/lib/schemaCapabilities.js` — add `door_check_in: 'Apply supabase/migrations/20260726000000_door_check_in.sql in Supabase.'`.

`src/supabase/release_readiness_check.sql` — add `('door_check_in', 'supabase/migrations/20260726000000_door_check_in.sql')` to the `required` VALUES list.

`src/components/admin/OperationsHealth.jsx` — add a "Door check-in" check fed by `/api/check-in-health` (stale device > 30 min, unresolved exceptions, offline events awaiting sync).

`src/components/admin/MembersManager.jsx` — in the member detail drawer, list `member_check_in_credentials` with revoke buttons, add a "Enrol fob" action (reads the UID from a keyboard-wedge reader into a text input, hashes it client-side with `crypto.subtle.digest('SHA-256', ...)`, calls `adminEnrolCheckInFob`), and show a 60-day no-show count.

`src/pages/Account.jsx` — add a "Your check-in code" card rendering `CheckInPassCard`, plus a device list with "Forget this device" calling `member_revoke_check_in_credential`.

`src/pages/Booking.jsx` — after a successful `bookSession`, extend the toast to "Booked. Show your check-in code at the door from 30 minutes before."

`src/pages/Terms.jsx` — add a "Check-in and attendance" clause to the existing "Bookings And Cancellations" section stating plainly that a confirmed booking not attended uses the credit, that the late check-in cutoff is 15 minutes, and that on-arrival bookings consume a credit at the moment of the tap.

`src/pages/Privacy.jsx` — add a paragraph naming attendance/check-in records as collected information, why (attendance, safety, capacity), the 24-month retention, and that XERT does not use facial recognition or other biometric identification.

`vercel.json` — REQUIRED CHANGE, this currently blocks the whole feature: `Permissions-Policy` is `camera=(), microphone=(), geolocation=(), payment=()`, which disables `getUserMedia` on every route including same-origin. Change to `camera=(self), microphone=(), geolocation=(), payment=()`. Nothing else in the header set needs to move; `script-src 'self'` is fine because `jsqr` and `qrcode` are bundled by Vite, and `connect-src 'self'` already covers `/api/check-in*`.

`package.json` — add `"qrcode": "^1.5.4"` and `"jsqr": "^1.4.0"`. Both are pure JS with no WASM, so no `wasm-unsafe-eval` CSP relaxation is needed (a `zxing-wasm`-based scanner would have forced one). Route-level code splitting already means these land in the `CheckInKiosk` and `Account` chunks, not the 487 kB main bundle.

`public/sw.js` — add `/checkin` to `APP_SHELL` and bump `CACHE_NAME` to `xert-runtime-v6` so the kiosk shell survives a network drop.

## iOS UI

NEW FILES

`ios/XertFitnessApp/XertFitnessApp/CheckInPass.swift` — pure payload logic, no UIKit, so it is unit-testable in the existing test target. `struct CheckInPass { static func counter(at date: Date) -> Int64`, `static func signedMessage(publicID: String, counter: Int64) -> Data`, `static func payload(publicID: String, counter: Int64, signature: Data) -> String }`. Base64url encoding without padding, matching `parseCheckInPayload` on the server exactly.

`ios/XertFitnessApp/XertFitnessApp/Services/CheckInPassKeyStore.swift` — modelled on the existing `Services/KeychainStore.swift`. Uses CryptoKit: `SecureEnclave.P256.Signing.PrivateKey(accessControl:)` with `.privateKeyUsage` and `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`; persists `dataRepresentation` in the Keychain. `publicKey.derRepresentation` is SPKI DER — exactly what `member_enrol_check_in_device(p_public_key bytea)` expects. `try key.signature(for: message).rawRepresentation` is the raw 64-byte r||s the Node and WebCrypto verifiers require; do NOT use `SecKeyCreateSignature`, which returns DER and will fail verification. Falls back to a software `P256.Signing.PrivateKey` on simulators without a Secure Enclave.

`ios/XertFitnessApp/XertFitnessApp/Views/CheckInPassView.swift` — full-screen member pass. Generates the QR locally with CoreImage `CIFilter.qrCodeGenerator()` (no third-party dependency, unlike the web). Sets `UIScreen.main.brightness = 1.0` on appear and restores on disappear — scanners fail on dim OLED screens and this is the single biggest real-world scan-failure cause. A `TimelineView(.periodic(from: .now, by: 1))` redraws the QR on every 30-second counter boundary with a countdown ring. Renders the next confirmed booking and remaining credits from `my_check_in_pass`. Works with no network once the key is enrolled — that is the whole point of the local-signing design.

`ios/XertFitnessApp/XertFitnessApp/Views/DoorModeView.swift` — admin-only Door Mode (Phase 4). `AVCaptureSession` with `AVCaptureMetadataOutput` and `metadataObjectTypes = [.qr]`, wrapped in a `UIViewRepresentable`. Reuses the same device-key transport as the web kiosk, holding the key in the Keychain. Includes an occupancy strip driven by `AdminStore`, and a "staff manual" search that calls `record_check_in` with `p_method='staff_manual'`.

`ios/XertFitnessApp/XertFitnessAppTests/CheckInPassTests.swift` — counter boundaries, payload round-trip, base64url without padding, and a known-answer signature/verify pair. Follows the structure of the existing `ModelsTests.swift`.

EXISTING FILES TO EXTEND

`ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift` — in the member section near `profile(session:)` (line ~300) add `enrolCheckInCredential(session:label:publicKeyDER:)` and `myCheckInPass(session:)` as `rpc(path:)` calls. In the "Native admin command centre" section (line ~319, alongside `adminDailyOperations`) add `adminRoomOccupancy(session:)`, `adminCheckInExceptions(session:limit:)`, `adminResolveCheckInException(session:checkInID:note:)`, `adminExcuseNoShow(session:bookingID:reason:)`. Door Mode's scan submission goes to the Vercel function, not PostgREST, so add `recordDoorCheckIn(deviceKey:event:)` following the pattern of the existing Vercel-bound calls.

`ios/XertFitnessApp/XertFitnessApp/AdminModels.swift` — add `AdminRoomOccupant` and `AdminCheckInException` `Decodable` structs; add `checked_in_count` as an optional to `AdminDailyOperation` and `checked_in_at` / `origin` / `check_in_method` as optionals to `AdminRosterMember` (optional so a pre-migration database still decodes); add `"door_check_in"` to the required-capability list at line 976.

`ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift` — add `roomOccupancy` and `checkInExceptions` published state, loaded in the same `async let` fan-out as `adminDailyOperations` (lines 114 and 573) so the Owner Command Centre gets them in one round trip. Add `resolveCheckInException` and `excuseNoShow` mutations that refresh occupancy the way the existing mutations refresh `dailyOperations`.

`ios/XertFitnessApp/XertFitnessApp/Store/XertStore.swift` — add `checkInPass` state, `ensureCheckInCredential()` (enrol on first use), and expose `currentPassPayload()` for the view.

`ios/XertFitnessApp/XertFitnessApp/OwnerNavigation.swift` — add `case doorDesk` to `XertOwnerWorkspace` with `title = "Door Desk"`, `detail = "See who is in the room and clear check-in exceptions"`, placed in the `.operate` section next to `.classDesk`.

`ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift` — add the `case .doorDesk:` branch to the workspace switch (the block at lines 772-833) rendering a new `private struct AdminDoorDeskView: View`, and add it to the operate-section quick links near `case .classDesk` (line ~750). Extend `AdminClassRosterView` (line 1455) with a door badge and a "Use door check-ins" button that pre-fills the attendance selection, mirroring the web change.

`ios/XertFitnessApp/XertFitnessApp/Views/AccountView.swift` — add a "Check-in code" row that pushes `CheckInPassView`, plus a credential list with revoke.

`ios/XertFitnessApp/XertFitnessApp/Views/HomeView.swift` — when a confirmed booking starts within `opens_minutes_before`, promote a primary "Show check-in code" button above the fold. This is the single highest-value UI change for door throughput.

`ios/XertFitnessApp/XertFitnessApp/Services/ClassReminderScheduler.swift` — add a local notification at T-30 minutes ("Your XERT class starts soon — tap to show your check-in code") deep-linking to the pass, alongside the existing class reminders.

`ios/XertFitnessApp/XertFitnessApp/Services/XertQuickActionNavigation.swift` and `Info.plist` — add a `com.xertfitness.app.quick.checkin` shortcut item ("Check in", symbol `qrcode`) to the existing `UIApplicationShortcutItems` array so the pass is one long-press from the home screen.

`ios/XertFitnessApp/XertFitnessApp/Info.plist` — add `NSCameraUsageDescription` ("XERT scans member check-in codes at the front desk.") for Door Mode only. Do NOT add `com.apple.developer.nfc.readersession.formats` to `XertFitnessApp.entitlements`; the design has no CoreNFC path, and an unused NFC entitlement is an App Review question you do not want to answer.

## Integration constraints

Cross-spec rules from [INTEGRATION_REVIEW.md](INTEGRATION_REVIEW.md) / [README.md](README.md):

1. **Roles defer to [spec 07](07-staff-accounts-and-roles.md).** Desk RPCs use `has_capability('door_desk')` / `'roll_call'` (not a private Phase-5 `role='coach'` sketch). Device registration stays owner-only (`is_admin()` / money-admin capabilities). Do not redefine `is_admin()` to mean “any staff”.
2. **Check-in feeds `attendanceDraft` / existing roll-call only.** Stamp `checked_in_at`; `admin_record_session_attendance` remains the only status writer. No second credit mutation on check-in.
3. **Policy stays on `check_in_settings` singleton** (already correct — not `admin_settings`).

## Security, privacy and compliance

AUTHORIZATION
- Desk / operational RPCs: prefer `has_capability('door_desk')` / `'roll_call'` per [spec 07](07-staff-accounts-and-roles.md) once Phase A exists; until then `is_admin()` gates remain acceptable. Owner-only paths (device registration, payment-adjacent) stay `is_admin()`. Every service-role RPC starts with `if auth.role() is distinct from 'service_role'`, matching `fulfill_stripe_checkout()` and `reconcile_stripe_order_refund()`.
- The kiosk holds a device key, never a Supabase session. This is the most important decision here: an iPad left signed in as an admin gives anyone who picks it up refunds (`/api/admin-refund-order`), member PII, and the payment activation switch. The device key can only reach `record_check_in`, `check_in_directory_snapshot` and `close_stale_check_ins`.
- `check_in_devices.api_key_hash` is stored as a 32-byte SHA-256 and is NOT in the column grant to `authenticated`, so even an admin's PostgREST session cannot read it back. Raw keys are shown once at registration and are revocable in one click.
- ROLE MODEL: superseded private “Phase 5 coach role” advice — use [spec 07](07-staff-accounts-and-roles.md) `front_desk` / `coach` + capabilities. Until 07 Phase A/B lands, do not hand out owner admin accounts to casual door staff.

RLS
- All six new tables have `enable row level security` plus explicit policies (written in full above). `member_check_in_credentials` and `check_ins` follow the established `user_id = (select auth.uid()) or (select public.is_admin())` shape from `session_bookings`, including the `(select ...)` wrapper that migration `20260714007000_rls_policy_performance.sql` introduced for InitPlan caching.
- `check_in_credential_uses` has no grant and no policy at all — it is reachable only from SECURITY DEFINER code.
- `member_check_in_credentials.public_key` is deliberately excluded from the column grant, so a member cannot enumerate other members' keys even though they cannot forge signatures with a public key anyway.
- `check_in_admin_events` is admin-read and immutable via `guard_check_in_admin_event()`, matching `session_booking_changes`.

CREDENTIAL SECURITY
- Asymmetric by design: the server never holds anything that can mint a valid pass. A database dump does not yield working credentials. This is strictly better than the TOTP/shared-secret design most gym systems ship.
- Replay: `check_in_credential_uses` PK `(credential_id, credential_counter)` means each 30-second window is spendable exactly once, ever. Screenshot sharing gives an attacker at most one entry inside a 60-second window while staff are standing there.
- BE HONEST WITH THE OWNER: no QR or fob system prevents tag sharing. It makes sharing *detectable and inconvenient*, not impossible. A member can hand their unlocked phone to a friend. The only technical fixes are staff eyes, a photo on the verdict screen, or biometrics — and see the legal note below on why biometrics is the wrong answer. Detection is via `admin_check_in_exceptions()` plus a monthly report on credentials with unusual velocity; the enforcement is a conversation, not an algorithm.

OFFLINE / KIOSK DATA
- The directory bundle contains public keys and first names only — never emails, phone numbers, surnames, payment data or health notes — and is scoped to members with a booking in the next 36 hours or a check-in in the last 14 days. It expires after `directory_ttl_hours` (12) and the kiosk refuses to use a stale bundle, so a stolen iPad's cache is dead within half a day.
- Offline check-ins are recorded as `verification='offline_signature'` and `captured_offline=true` and are re-verified server-side at sync. They are visually distinguished in the roster and the exceptions queue so staff never mistake an unreconciled arrival for a confirmed one.

PII / HEALTH SENSITIVITY AND AUSTRALIAN PRIVACY LAW — READ THIS PROPERLY
- Check-in records are a timestamped log of an identified individual's physical presence. Combined with class type, they say something about a person's health and fitness activity. Under the Privacy Act 1988 (Cth), s 6FA, "health information" includes information about a health service provided to an individual, and a "health service" includes an activity performed to assess or maintain a person's health. A gym running structured, coached, semi-private training plausibly falls inside that.
- This matters more than it looks. The small business exemption (annual turnover under $3 million) does NOT apply to an organisation that provides a health service and holds health information — s 6D(4)(b). XERT is likely to be a small business by turnover, so the owner may currently assume the Privacy Act does not apply. Building an attendance database is exactly the thing that removes that assumption. Get this confirmed by an Australian privacy lawyer before Phase 2; it is a cheap opinion and it changes the compliance posture of the whole platform. `src/pages/Privacy.jsx` is currently one short page and would need to become a real APP 1 privacy policy.
- Consequences if covered: APP 3.3 requires consent for collecting health information; APP 5 requires notification at the point of collection (put it on the enrol screen, not buried in Terms); APP 11 requires reasonable security steps (the RLS and key design above); APP 11.2 requires destruction or de-identification when no longer needed — hence the 24-month retention with monthly aggregation; APP 12/13 access and correction requests must include check-in history, so `delete-account.js` must be extended to purge `check_ins` and `member_check_in_credentials` (the cascade on `auth.users` handles credentials; `check_ins.user_id` is `on delete set null`, which correctly preserves anonymised occupancy counts — confirm that is the intent).
- DO NOT ADD FACIAL RECOGNITION, and push back if it is suggested as the fix for tag sharing. Biometric templates used for automated verification are "sensitive information" under s 6(1). The OAIC's determinations against 7-Eleven (2021) and Bunnings (November 2024) both found that deploying facial recognition without valid consent breached the APPs, and the Bunnings determination specifically rejected the "loss prevention" justification as insufficient to make collection reasonably necessary. A gym check-in kiosk has an even weaker justification. The proportionate alternative, if sharing is measured and material, is showing a staff-only member photo on the verdict screen for human comparison — which is not automated biometric collection, and which the member consents to at enrolment.
- The kiosk verdict screen is in a public lobby. `record_check_in` deliberately returns only a first name and last initial. Do not "improve" this to the full name.

CONSUMER LAW
- `cancel_booking()` already forfeits the credit for a confirmed booking cancelled inside 12 hours, and a no-show forfeits it by simply never being refunded. Making that forfeiture visible and automatic through a door system raises its profile. Under the Australian Consumer Law, unfair contract terms in standard-form consumer contracts have been prohibited with civil penalties since November 2023. A forfeiture term is far more defensible when it is prominently disclosed at the point of purchase, proportionate, and paired with a discretionary relief mechanism. That is why `admin_excuse_no_show()` exists and why the forfeiture must be surfaced in `SessionPacks.jsx` and `Terms.jsx`, not only in the policy page.

AUDIT
- Credential enrolment and revocation, device registration and enable/disable, policy changes, exception resolutions and no-show excusals all write immutable `check_in_admin_events` rows. The `check_ins` table is itself the arrival audit trail. Booking-side changes continue to flow through the existing `session_booking_changes` trigger from `20260714014000`, so an on-arrival booking appears in the existing Admin Audit view with no extra work.
- Extend `src/components/admin/AdminAuditLog.jsx` and `src/lib/adminAudit.js` with a `checkInEvents` source so the new events show in the same timeline as the other seven.

## Rollout

Feature flag: `check_in_settings.check_in_enabled`, default FALSE, plus per-device `check_in_devices.enabled`. Both are independently killable. Deliberately not on `admin_settings`, because `guard_session_pack_payment_activation()` would force the owner to pause Stripe payments to change a door setting.

PHASE 0 — schema only, one day. Apply `20260726000000_door_check_in.sql`. `check_in_enabled` stays false; nothing in the product changes. Add `door_check_in` to `src/lib/schemaCapabilities.js` and `src/supabase/release_readiness_check.sql` so the existing Operations Health page and the TestFlight readiness query start tracking it. Ship the additive `admin_session_roster` / `admin_daily_operations` columns now, ahead of any client that reads them — the web and iOS clients ignore unknown keys, so this is safe and de-risks the later releases.

PHASE 1 — member pass + staff manual check-in, ~1 week. Ship `CheckInPassCard.jsx` in `Account.jsx`, `CheckInPassView.swift` in the iOS app, and a "Mark arrived" button on each roster row in `ClassCalendarAdmin.jsx` that calls `record_check_in` with `p_method='staff_manual'` through a staff-mode device record. No camera, no CSP change, no new hardware. This proves the single most important thing — that `checked_in_at` correctly pre-fills the roll call and that `attendanceDraftFromCheckIns` produces the draft staff expect — before any kiosk exists. Turn `check_in_enabled` on for two weeks and compare door-derived attendance against the manual roll call every day.

PHASE 2 — online kiosk, ~1 week. Ship `vercel.json` with `camera=(self)`, `/checkin`, `api/check-in.js`, `CheckInDesk.jsx`, and on-arrival booking. Deploy on one iPad in Guided Access at reception. Online only — if the network is down, staff fall back to the roster. Run it alongside the manual roll call for two weeks; do not retire the manual path until the exception rate is under 1%.

PHASE 3 — offline queue, ~1 week. Ship `checkInQueue.js`, `api/check-in-sync.js`, `api/check-in-directory.js`, the `sw.js` shell cache, and the exceptions panel. Test by pulling the WiFi during a live class.

PHASE 4 — fobs and iOS Door Mode, ~1 week. Enrol fobs for the members who have asked. Ship `DoorModeView.swift` if iPad Safari camera performance proves inadequate (measure first; it usually does not).

PHASE 5 — optional, only if justified by usage: Apple/Google Wallet passes. Staff role split is **not** owned here — see [spec 07](07-staff-accounts-and-roles.md).

MIGRATION AND BACKFILL
- No backfill is required or wanted. `checked_in_at` stays NULL for all historical bookings, which is honest — you did not check them in.
- `session_bookings.origin` defaults to `'online'` for existing rows. That is accurate for every booking created by `book_session()`; the small number created by `admin_set_booking_status()` will be mislabelled as `'online'`, which is acceptable and not worth a heuristic backfill.
- The `drop function` / `create function` pair for `admin_session_roster` and `admin_daily_operations` is momentarily disruptive. Run the migration outside class hours; PostgREST reloads its schema cache automatically, but `src/lib/adminData.js` already handles `PGRST202` gracefully for `admin_daily_operations`, so a stale cache degrades to "not installed" rather than an error. Add the same guard to `adminSessionRoster`.

ROLLBACK
- `check_in_enabled = false` disables the door in one write, and the roll call keeps working exactly as it does today because nothing in the existing attendance path was modified.
- Full rollback: revoke device keys, drop the six new tables, drop the new functions, and re-apply `src/supabase/attendance_roll_call_upgrade.sql` and `supabase/migrations/20260714016000_admin_daily_operations.sql` to restore the original two function signatures. `session_bookings` keeps three harmless nullable columns.

## Open questions for the owner

Each of these is a business call, not an engineering one. My recommended default is stated first; build that unless the owner says otherwise.

1. Does a no-show forfeit the credit? DEFAULT: YES, keep it forfeited. Note that this is already the current behaviour — `book_session()` spends the credit at booking time and `cancel_booking()` only returns it if the member cancels more than 12 hours out, so a no-show silently costs a credit today. The door system just makes it visible. Keep the forfeiture (otherwise members hold seats with no downside and your waitlisted members lose out), and use the new one-tap "Excuse no-show" for genuine cases. MEMBER-RELATIONS CONSEQUENCE, stated plainly: the first month the roll call is automated, you will burn more credits than you ever have, because staff who used to quietly not mark someone absent no longer make that call. Budget for a handful of angry conversations, publish the rule in advance, and give every member one free excusal in their first 90 days.

2. Late check-in cutoff. DEFAULT: 15 minutes after start. Beyond that the member is not marked attended and the class is treated as a no-show. Semi-private coaching with a warm-up makes a 20-minute-late arrival disruptive and arguably unsafe; 15 minutes is the standard and it is a single number in `check_in_settings` you can retune without a deploy.

3. Is on-arrival booking allowed for everyone? DEFAULT: yes, but only for classes whose `booking_mode` is `instant_book`, only inside the door window, and only when the class has NO waitlist. That last constraint is not optional — the existing `enforce_session_waitlist_fifo` trigger will reject it anyway, and letting a walk-in jump a queued member would destroy trust in the waitlist you already built.

4. What happens when a walk-in has no credits? DEFAULT for v1: the kiosk says "See the front desk" and staff either grant a credit (`admin_grant_credits_v2`, already audited) or sell a pack. Do NOT put Stripe checkout on the lobby iPad — it is a poor payment flow, it entangles the door with the payment activation switch, and the switch may be paused during soft launch.

5. Fobs: who gets one and at what price? DEFAULT: issue on request only, AUD $10 refundable deposit, expect 5-10% uptake. Buy MIFARE DESFire EV3 (AUD $2.50-4.50 each in lots of 100) and an Elatec TWN4 MultiTech or HID OMNIKEY 5427CK reader (AUD $250-400). Do not buy a $30 EM4100 kit — those fobs clone in seconds with a $15 device and you would be handing out counterfeit-able credentials.

6. Unattended access outside staffed hours? DEFAULT: NO, and I would push back hard on this. Everything above assumes a human is present. Wiring this to a door strike turns a software bug into a physical security and duty-of-care incident, changes your public liability position, and would need a completely different reliability standard. If 24/7 access is a real business goal, buy a purpose-built commercial access control system (AUD $1,500-4,000 installed) and integrate it to XERT as a separate project.

7. Show a member photo on the kiosk verdict screen to deter sharing? DEFAULT: NO for v1. Add it only if measured sharing exceeds ~2% of check-ins, and if you do, make it staff-facing on a screen the queue cannot see, collect the photo with explicit consent at enrolment, and note in the privacy policy that it is used for identity verification. Under no circumstances add automated facial recognition — see the security section.

8. Retention of check-in records. DEFAULT: 24 months of individual records, then aggregate to monthly attendance counts per member and delete the rows. Long enough for retention analysis and any incident investigation, short enough to be defensible under APP 11.2.

9. Guests and trials who "pre-register" without an account. DEFAULT: reuse what exists. The public `class_bookings` table already captures request-to-book submissions from `BookingRequestForm.jsx`. Surface those on the kiosk in staff mode, searchable by phone, so a walk-in who filled the web form is found and converted at the desk. Do NOT build a second guest-booking system — you already have two booking tables (`class_bookings` and `session_bookings`) and adding a third would be the worst decision available here.

10. Who is allowed to operate the door desk? DEFAULT until [spec 07](07-staff-accounts-and-roles.md) Phase B/C: owner/`is_admin()` only. After 07, door desk uses `has_capability('door_desk')` (typically `front_desk`); roll-call assist may include coaches per 07’s matrix. Do not solve this by giving casual staff `role = 'admin'`.

