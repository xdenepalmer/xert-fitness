-- Privacy-minimised member onboarding foundation.
--
-- This migration intentionally stores no screening answers, date of birth,
-- medical details, free-text safety notes, waiver, or clearance decision. It
-- records an emergency contact, immutable published acknowledgement versions,
-- member acceptance receipts, and metadata-only administrator reveal events.

create table if not exists public.member_emergency_contacts (
  user_id uuid primary key
    references public.profiles(id) on delete cascade,
  contact_name text not null
    check (
      pg_catalog.char_length(pg_catalog.btrim(contact_name)) between 2 and 100
      and pg_catalog.strpos(contact_name, pg_catalog.chr(10)) = 0
      and pg_catalog.strpos(contact_name, pg_catalog.chr(13)) = 0
    ),
  contact_phone text not null
    check (
      pg_catalog.char_length(pg_catalog.btrim(contact_phone)) between 6 and 32
      and contact_phone operator(pg_catalog.~) '^\+?[0-9 ()-]+$'
      and pg_catalog.char_length(pg_catalog.regexp_replace(contact_phone, '[^0-9]', '', 'g')) between 6 and 15
    ),
  relationship text not null
    check (
      pg_catalog.char_length(pg_catalog.btrim(relationship)) between 2 and 60
      and pg_catalog.strpos(relationship, pg_catalog.chr(10)) = 0
      and pg_catalog.strpos(relationship, pg_catalog.chr(13)) = 0
    ),
  contact_awareness_confirmed_at timestamptz not null default pg_catalog.now(),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists public.member_onboarding_documents (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  document_key text not null
    check (document_key operator(pg_catalog.~) '^[a-z][a-z0-9_]{2,79}$'),
  version text not null
    check (pg_catalog.char_length(pg_catalog.btrim(version)) between 1 and 40),
  title text not null
    check (pg_catalog.char_length(pg_catalog.btrim(title)) between 3 and 160),
  body text not null
    check (pg_catalog.char_length(pg_catalog.btrim(body)) between 40 and 5000),
  source_url text not null
    check (
      pg_catalog.char_length(source_url) between 12 and 500
      and source_url operator(pg_catalog.~) '^https://'
    ),
  content_sha256 text not null
    check (content_sha256 operator(pg_catalog.~) '^[0-9a-f]{64}$'),
  required boolean not null default true,
  published_at timestamptz not null,
  retired_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  constraint member_onboarding_documents_key_version_key unique (document_key, version),
  constraint member_onboarding_documents_receipt_identity_key
    unique (id, document_key, version, content_sha256),
  constraint member_onboarding_documents_lifecycle_check
    check (retired_at is null or retired_at >= published_at)
);

-- A required document key has exactly one current published version. A new
-- version must retire the previous version without rewriting its legal copy.
create unique index if not exists member_onboarding_documents_current_required_idx
  on public.member_onboarding_documents (document_key)
  where required is true and retired_at is null;

create table if not exists public.member_onboarding_receipts (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null
    references public.profiles(id) on delete cascade,
  document_id uuid not null,
  document_key text not null,
  document_version text not null,
  content_sha256 text not null,
  source text not null check (source in ('ios_app', 'web_app')),
  accepted_at timestamptz not null default pg_catalog.now(),
  constraint member_onboarding_receipts_document_fkey
    foreign key (document_id, document_key, document_version, content_sha256)
    references public.member_onboarding_documents (id, document_key, version, content_sha256)
    on delete restrict,
  constraint member_onboarding_receipts_member_document_key
    unique (user_id, document_id)
);

create index if not exists member_onboarding_receipts_user_accepted_idx
  on public.member_onboarding_receipts (user_id, accepted_at desc, id desc);

-- The audit table contains only who revealed whose emergency contact and when.
-- It deliberately does not duplicate any contact value.
create table if not exists public.member_emergency_contact_reveals (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  member_user_id uuid not null
    references public.profiles(id) on delete cascade,
  revealed_by uuid
    references public.profiles(id) on delete set null,
  revealed_at timestamptz not null default pg_catalog.now()
);

create index if not exists member_emergency_contact_reveals_member_created_idx
  on public.member_emergency_contact_reveals (member_user_id, revealed_at desc, id desc);

alter table public.member_emergency_contacts enable row level security;
alter table public.member_onboarding_documents enable row level security;
alter table public.member_onboarding_receipts enable row level security;
alter table public.member_emergency_contact_reveals enable row level security;

revoke all on table public.member_emergency_contacts from public, anon, authenticated;
revoke all on table public.member_onboarding_documents from public, anon, authenticated;
revoke all on table public.member_onboarding_receipts from public, anon, authenticated;
revoke all on table public.member_emergency_contact_reveals from public, anon, authenticated;

-- Published acknowledgement content and proof fields never change in place.
-- Retirement is the sole permitted lifecycle update and is performed only by
-- a database migration because the table has no client write grant.
create or replace function public.guard_member_onboarding_document()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'ONBOARDING_DOCUMENT_IMMUTABLE';
  end if;

  if old.published_at is not null and (
    (pg_catalog.to_jsonb(new) - 'retired_at') is distinct from
      (pg_catalog.to_jsonb(old) - 'retired_at')
    or old.retired_at is not null
    or new.retired_at is null
  ) then
    raise exception 'ONBOARDING_DOCUMENT_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists member_onboarding_documents_immutable
  on public.member_onboarding_documents;
create trigger member_onboarding_documents_immutable
  before update or delete on public.member_onboarding_documents
  for each row execute function public.guard_member_onboarding_document();

-- Receipts and reveal events are append-only during normal operation. Deletes
-- remain available to foreign-key cascades when the member deletes the account.
create or replace function public.guard_member_onboarding_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- An administrator may later delete their own account. PostgreSQL implements
  -- the revealed_by foreign key's ON DELETE SET NULL action as an UPDATE, so
  -- permit only that single-field identity redaction. Contact values are never
  -- stored in this audit table and every other audit field remains immutable.
  if tg_table_schema = 'public'
     and tg_table_name = 'member_emergency_contact_reveals' then
    if old.revealed_by is not null
       and new.revealed_by is null
       and (pg_catalog.to_jsonb(new) - 'revealed_by') =
         (pg_catalog.to_jsonb(old) - 'revealed_by') then
      return new;
    end if;
  end if;

  raise exception 'MEMBER_ONBOARDING_AUDIT_IMMUTABLE';
end;
$$;

drop trigger if exists member_onboarding_receipts_no_update
  on public.member_onboarding_receipts;
create trigger member_onboarding_receipts_no_update
  before update on public.member_onboarding_receipts
  for each row execute function public.guard_member_onboarding_append_only();

drop trigger if exists member_emergency_contact_reveals_no_update
  on public.member_emergency_contact_reveals;
create trigger member_emergency_contact_reveals_no_update
  before update on public.member_emergency_contact_reveals
  for each row execute function public.guard_member_onboarding_append_only();

revoke all on function public.guard_member_onboarding_document()
  from public, anon, authenticated;
revoke all on function public.guard_member_onboarding_append_only()
  from public, anon, authenticated;

-- The exact acknowledgement copy and hash are a reviewed, static contract.
-- SHA-256 is calculated over the UTF-8 body below with no trailing newline.
insert into public.member_onboarding_documents (
  id,
  document_key,
  version,
  title,
  body,
  source_url,
  content_sha256,
  required,
  published_at
) values (
  '6b2b521e-7f49-4a8b-9a76-3b9e3dc0e501',
  'adult_readiness_acknowledgement',
  '2026-07-21.1',
  'Adult pre-exercise readiness acknowledgement',
  $document$I confirm that I am 18 years of age or older. Before participating in XERT Fitness training, I have reviewed the Australian Adult Pre-Exercise Screening System (APSS) information published by AUSactive at https://ausactive.org.au/policies-guidelines/adult-pre-exercise-screening-system/. I understand that this acknowledgement records only my review of that resource. It is not medical advice, diagnosis, treatment or medical clearance. If the APSS indicates that I should seek guidance, or if I am unsure whether exercise is appropriate for me, I will seek guidance from an appropriately qualified health professional before participating.$document$,
  'https://ausactive.org.au/policies-guidelines/adult-pre-exercise-screening-system/',
  'edd59a910635b592e61a1a3c044830bb06dec29fc6cdf1cf7e09ec8629f50c3a',
  true,
  '2026-07-21 00:00:00+10'::timestamptz
)
on conflict (document_key, version) do nothing;

do $$
begin
  if not exists (
    select 1
    from public.member_onboarding_documents as document
    where document.id = '6b2b521e-7f49-4a8b-9a76-3b9e3dc0e501'
      and document.document_key = 'adult_readiness_acknowledgement'
      and document.version = '2026-07-21.1'
      and document.source_url = 'https://ausactive.org.au/policies-guidelines/adult-pre-exercise-screening-system/'
      and document.content_sha256 = 'edd59a910635b592e61a1a3c044830bb06dec29fc6cdf1cf7e09ec8629f50c3a'
      and document.required is true
      and document.retired_at is null
  ) then
    raise exception 'ONBOARDING_DOCUMENT_DRIFT';
  end if;
end;
$$;

-- Private state composer shared by the member read and atomic save RPCs.
create or replace function public.member_onboarding_state(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile record;
  v_contact record;
  v_required_documents jsonb;
  v_accepted_documents jsonb;
  v_required_count integer;
  v_accepted_count integer;
  v_profile_complete boolean;
  v_emergency_contact_complete boolean;
  v_documents_complete boolean;
begin
  if p_user_id is null then raise exception 'AUTH_REQUIRED'; end if;

  select profile.full_name, profile.phone, profile.updated_at
    into v_profile
    from public.profiles as profile
   where profile.id = p_user_id;
  if not found then raise exception 'MEMBER_PROFILE_NOT_FOUND'; end if;

  select contact.user_id, contact.contact_name, contact.contact_phone,
         contact.relationship, contact.contact_awareness_confirmed_at,
         contact.updated_at
    into v_contact
    from public.member_emergency_contacts as contact
   where contact.user_id = p_user_id;

  select
    pg_catalog.coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', document.id,
          'document_key', document.document_key,
          'version', document.version,
          'title', document.title,
          'body', document.body,
          'source_url', document.source_url,
          'content_sha256', document.content_sha256,
          'published_at', document.published_at
        ) order by document.document_key, document.version
      ),
      '[]'::jsonb
    ),
    pg_catalog.count(*)::integer
    into v_required_documents, v_required_count
    from public.member_onboarding_documents as document
   where document.required is true
     and document.published_at <= pg_catalog.now()
     and document.retired_at is null;

  select
    pg_catalog.coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'document_id', receipt.document_id,
          'document_key', receipt.document_key,
          'version', receipt.document_version,
          'content_sha256', receipt.content_sha256,
          'accepted_at', receipt.accepted_at,
          'source', receipt.source
        ) order by receipt.document_key, receipt.document_version
      ),
      '[]'::jsonb
    ),
    pg_catalog.count(*)::integer
    into v_accepted_documents, v_accepted_count
    from public.member_onboarding_receipts as receipt
    join public.member_onboarding_documents as document
      on document.id = receipt.document_id
   where receipt.user_id = p_user_id
     and document.required is true
     and document.published_at <= pg_catalog.now()
     and document.retired_at is null;

  v_profile_complete :=
    pg_catalog.char_length(pg_catalog.btrim(pg_catalog.coalesce(v_profile.full_name, ''))) between 2 and 100
    and pg_catalog.strpos(pg_catalog.coalesce(v_profile.full_name, ''), pg_catalog.chr(10)) = 0
    and pg_catalog.strpos(pg_catalog.coalesce(v_profile.full_name, ''), pg_catalog.chr(13)) = 0
    and pg_catalog.char_length(pg_catalog.btrim(pg_catalog.coalesce(v_profile.phone, ''))) between 6 and 32
    and pg_catalog.btrim(pg_catalog.coalesce(v_profile.phone, '')) operator(pg_catalog.~) '^\+?[0-9 ()-]+$'
    and pg_catalog.char_length(
      pg_catalog.regexp_replace(pg_catalog.coalesce(v_profile.phone, ''), '[^0-9]', '', 'g')
    ) between 6 and 15;
  v_emergency_contact_complete := v_contact.user_id is not null
    and v_contact.contact_awareness_confirmed_at is not null;
  v_documents_complete := v_required_count > 0 and v_accepted_count = v_required_count;

  return pg_catalog.jsonb_build_object(
    'user_id', p_user_id,
    'profile', pg_catalog.jsonb_build_object(
      'full_name', v_profile.full_name,
      'phone', v_profile.phone,
      'updated_at', v_profile.updated_at
    ),
    'emergency_contact', case
      when v_contact.user_id is null then 'null'::jsonb
      else pg_catalog.jsonb_build_object(
        'name', v_contact.contact_name,
        'phone', v_contact.contact_phone,
        'relationship', v_contact.relationship,
        'contact_awareness_confirmed_at', v_contact.contact_awareness_confirmed_at,
        'updated_at', v_contact.updated_at
      )
    end,
    'required_documents', v_required_documents,
    'accepted_documents', v_accepted_documents,
    'profile_complete', v_profile_complete,
    'emergency_contact_complete', v_emergency_contact_complete,
    'documents_complete', v_documents_complete,
    'is_complete', v_profile_complete and v_emergency_contact_complete and v_documents_complete
  );
end;
$$;

revoke all on function public.member_onboarding_state(uuid)
  from public, anon, authenticated;

create or replace function public.my_member_onboarding()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  return public.member_onboarding_state(v_user_id);
end;
$$;

create or replace function public.save_my_member_onboarding(
  p_full_name text,
  p_phone text,
  p_emergency_contact_name text,
  p_emergency_contact_phone text,
  p_emergency_contact_relationship text,
  p_contact_is_aware boolean,
  p_accepted_document_ids uuid[],
  p_source text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_full_name text := pg_catalog.btrim(pg_catalog.coalesce(p_full_name, ''));
  v_phone text := pg_catalog.btrim(pg_catalog.coalesce(p_phone, ''));
  v_contact_name text := pg_catalog.btrim(pg_catalog.coalesce(p_emergency_contact_name, ''));
  v_contact_phone text := pg_catalog.btrim(pg_catalog.coalesce(p_emergency_contact_phone, ''));
  v_relationship text := pg_catalog.btrim(pg_catalog.coalesce(p_emergency_contact_relationship, ''));
  v_source text := pg_catalog.lower(pg_catalog.btrim(pg_catalog.coalesce(p_source, '')));
  v_required_ids uuid[];
  v_accepted_ids uuid[];
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from public.profiles as profile where profile.id = v_user_id) then
    raise exception 'MEMBER_PROFILE_NOT_FOUND';
  end if;

  if pg_catalog.char_length(v_full_name) not between 2 and 100
     or pg_catalog.strpos(v_full_name, pg_catalog.chr(10)) > 0
     or pg_catalog.strpos(v_full_name, pg_catalog.chr(13)) > 0 then
    raise exception 'INVALID_FULL_NAME';
  end if;
  if pg_catalog.char_length(v_phone) not between 6 and 32
     or not (v_phone operator(pg_catalog.~) '^\+?[0-9 ()-]+$')
     or pg_catalog.char_length(pg_catalog.regexp_replace(v_phone, '[^0-9]', '', 'g')) not between 6 and 15 then
    raise exception 'INVALID_MEMBER_PHONE';
  end if;
  if pg_catalog.char_length(v_contact_name) not between 2 and 100
     or pg_catalog.strpos(v_contact_name, pg_catalog.chr(10)) > 0
     or pg_catalog.strpos(v_contact_name, pg_catalog.chr(13)) > 0 then
    raise exception 'INVALID_EMERGENCY_CONTACT_NAME';
  end if;
  if pg_catalog.char_length(v_contact_phone) not between 6 and 32
     or not (v_contact_phone operator(pg_catalog.~) '^\+?[0-9 ()-]+$')
     or pg_catalog.char_length(pg_catalog.regexp_replace(v_contact_phone, '[^0-9]', '', 'g')) not between 6 and 15 then
    raise exception 'INVALID_EMERGENCY_CONTACT_PHONE';
  end if;
  if pg_catalog.char_length(v_relationship) not between 2 and 60
     or pg_catalog.strpos(v_relationship, pg_catalog.chr(10)) > 0
     or pg_catalog.strpos(v_relationship, pg_catalog.chr(13)) > 0 then
    raise exception 'INVALID_EMERGENCY_CONTACT_RELATIONSHIP';
  end if;
  if p_contact_is_aware is distinct from true then
    raise exception 'CONTACT_AWARENESS_REQUIRED';
  end if;
  if v_source not in ('ios_app', 'web_app') then
    raise exception 'INVALID_ONBOARDING_SOURCE';
  end if;

  select pg_catalog.array_agg(document.id order by document.id)
    into v_required_ids
    from public.member_onboarding_documents as document
   where document.required is true
     and document.published_at <= pg_catalog.now()
     and document.retired_at is null;
  if pg_catalog.coalesce(pg_catalog.cardinality(v_required_ids), 0) = 0
     or pg_catalog.coalesce(pg_catalog.cardinality(p_accepted_document_ids), 0) = 0 then
    raise exception 'ONBOARDING_DOCUMENTS_REQUIRED';
  end if;

  select pg_catalog.array_agg(accepted.document_id order by accepted.document_id)
    into v_accepted_ids
    from (
      select distinct supplied.document_id
      from pg_catalog.unnest(p_accepted_document_ids) as supplied(document_id)
      where supplied.document_id is not null
    ) as accepted;

  if pg_catalog.cardinality(p_accepted_document_ids) <> pg_catalog.cardinality(v_accepted_ids)
     or v_accepted_ids is distinct from v_required_ids then
    raise exception 'ONBOARDING_DOCUMENTS_STALE';
  end if;

  update public.profiles
     set full_name = v_full_name,
         phone = v_phone,
         updated_at = pg_catalog.now()
   where id = v_user_id;

  insert into public.member_emergency_contacts (
    user_id,
    contact_name,
    contact_phone,
    relationship,
    contact_awareness_confirmed_at,
    created_at,
    updated_at
  ) values (
    v_user_id,
    v_contact_name,
    v_contact_phone,
    v_relationship,
    pg_catalog.now(),
    pg_catalog.now(),
    pg_catalog.now()
  )
  on conflict (user_id) do update
    set contact_name = excluded.contact_name,
        contact_phone = excluded.contact_phone,
        relationship = excluded.relationship,
        contact_awareness_confirmed_at = pg_catalog.now(),
        updated_at = pg_catalog.now();

  insert into public.member_onboarding_receipts (
    user_id,
    document_id,
    document_key,
    document_version,
    content_sha256,
    source,
    accepted_at
  )
  select
    v_user_id,
    document.id,
    document.document_key,
    document.version,
    document.content_sha256,
    v_source,
    pg_catalog.now()
  from public.member_onboarding_documents as document
  where document.id = any(v_required_ids)
  on conflict (user_id, document_id) do nothing;

  return public.member_onboarding_state(v_user_id);
end;
$$;

-- Bulk-safe owner status contains completion signals only. Emergency-contact
-- values and document bodies never enter the directory, search, or export RPC.
create or replace function public.admin_member_onboarding_summary(p_user_ids uuid[])
returns table (
  user_id uuid,
  profile_complete boolean,
  emergency_contact_complete boolean,
  documents_complete boolean,
  onboarding_complete boolean,
  accepted_required_count integer,
  required_document_count integer
)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_user_ids is null
     or pg_catalog.cardinality(p_user_ids) not between 1 and 100
     or exists (select 1 from pg_catalog.unnest(p_user_ids) as requested(id) where requested.id is null)
     or (select pg_catalog.count(distinct requested.id) from pg_catalog.unnest(p_user_ids) as requested(id))
        <> pg_catalog.cardinality(p_user_ids) then
    raise exception 'INVALID_MEMBER_SELECTION';
  end if;

  return query
  with required_documents as (
    select pg_catalog.count(*)::integer as required_count
      from public.member_onboarding_documents as document
     where document.required is true
       and document.published_at <= pg_catalog.now()
       and document.retired_at is null
  ), requested_members as (
    select requested.id
      from pg_catalog.unnest(p_user_ids) as requested(id)
  )
  select
    profile.id,
    pg_catalog.char_length(pg_catalog.btrim(pg_catalog.coalesce(profile.full_name, ''))) between 2 and 100
      and pg_catalog.strpos(pg_catalog.coalesce(profile.full_name, ''), pg_catalog.chr(10)) = 0
      and pg_catalog.strpos(pg_catalog.coalesce(profile.full_name, ''), pg_catalog.chr(13)) = 0
      and pg_catalog.char_length(pg_catalog.btrim(pg_catalog.coalesce(profile.phone, ''))) between 6 and 32
      and pg_catalog.btrim(pg_catalog.coalesce(profile.phone, '')) operator(pg_catalog.~) '^\+?[0-9 ()-]+$'
      and pg_catalog.char_length(
        pg_catalog.regexp_replace(pg_catalog.coalesce(profile.phone, ''), '[^0-9]', '', 'g')
      ) between 6 and 15,
    contact.user_id is not null and contact.contact_awareness_confirmed_at is not null,
    required.required_count > 0 and accepted.accepted_count = required.required_count,
    (
      pg_catalog.char_length(pg_catalog.btrim(pg_catalog.coalesce(profile.full_name, ''))) between 2 and 100
      and pg_catalog.strpos(pg_catalog.coalesce(profile.full_name, ''), pg_catalog.chr(10)) = 0
      and pg_catalog.strpos(pg_catalog.coalesce(profile.full_name, ''), pg_catalog.chr(13)) = 0
      and pg_catalog.char_length(pg_catalog.btrim(pg_catalog.coalesce(profile.phone, ''))) between 6 and 32
      and pg_catalog.btrim(pg_catalog.coalesce(profile.phone, '')) operator(pg_catalog.~) '^\+?[0-9 ()-]+$'
      and pg_catalog.char_length(
        pg_catalog.regexp_replace(pg_catalog.coalesce(profile.phone, ''), '[^0-9]', '', 'g')
      ) between 6 and 15
      and contact.user_id is not null
      and contact.contact_awareness_confirmed_at is not null
      and required.required_count > 0
      and accepted.accepted_count = required.required_count
    ),
    accepted.accepted_count,
    required.required_count
  from requested_members as requested
  join public.profiles as profile on profile.id = requested.id
  left join public.member_emergency_contacts as contact on contact.user_id = profile.id
  cross join required_documents as required
  cross join lateral (
    select pg_catalog.count(*)::integer as accepted_count
      from public.member_onboarding_receipts as receipt
      join public.member_onboarding_documents as document
        on document.id = receipt.document_id
     where receipt.user_id = profile.id
       and document.required is true
       and document.published_at <= pg_catalog.now()
       and document.retired_at is null
  ) as accepted
  order by profile.id;
end;
$$;

-- Exact emergency-contact values require a deliberate, admin-only RPC. Every
-- successful reveal first writes a metadata-only access event in the same
-- transaction, so a failed audit insert cannot leak the contact.
create or replace function public.admin_reveal_member_emergency_contact(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_contact record;
  v_reveal_id uuid;
  v_revealed_at timestamptz;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_user_id is null then raise exception 'MEMBER_REQUIRED'; end if;

  select contact.contact_name, contact.contact_phone, contact.relationship,
         contact.contact_awareness_confirmed_at, contact.updated_at
    into v_contact
    from public.member_emergency_contacts as contact
   where contact.user_id = p_user_id;
  if not found then raise exception 'EMERGENCY_CONTACT_NOT_FOUND'; end if;

  insert into public.member_emergency_contact_reveals (
    member_user_id,
    revealed_by,
    revealed_at
  ) values (
    p_user_id,
    v_admin_id,
    pg_catalog.now()
  )
  returning id, revealed_at into v_reveal_id, v_revealed_at;

  return pg_catalog.jsonb_build_object(
    'audit_event_id', v_reveal_id,
    'revealed_at', v_revealed_at,
    'user_id', p_user_id,
    'emergency_contact', pg_catalog.jsonb_build_object(
      'name', v_contact.contact_name,
      'phone', v_contact.contact_phone,
      'relationship', v_contact.relationship,
      'contact_awareness_confirmed_at', v_contact.contact_awareness_confirmed_at,
      'updated_at', v_contact.updated_at
    )
  );
end;
$$;

revoke all on function public.my_member_onboarding()
  from public, anon, authenticated;
revoke all on function public.save_my_member_onboarding(text, text, text, text, text, boolean, uuid[], text)
  from public, anon, authenticated;
revoke all on function public.admin_member_onboarding_summary(uuid[])
  from public, anon, authenticated;
revoke all on function public.admin_reveal_member_emergency_contact(uuid)
  from public, anon, authenticated;

grant execute on function public.my_member_onboarding() to authenticated;
grant execute on function public.save_my_member_onboarding(text, text, text, text, text, boolean, uuid[], text)
  to authenticated;
grant execute on function public.admin_member_onboarding_summary(uuid[]) to authenticated;
grant execute on function public.admin_reveal_member_emergency_contact(uuid) to authenticated;

insert into public.xert_schema_capabilities (capability)
values ('member_onboarding_foundation')
on conflict (capability) do update set installed_at = excluded.installed_at;
