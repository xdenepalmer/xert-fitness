-- Repair pg_catalog-qualified SQL syntax constructs
-- A schema-qualification hardening pass rewrote COALESCE/GREATEST/LEAST as
-- pg_catalog.coalesce(...) etc. Those are SQL grammar constructs, not real
-- functions, so PL/pgSQL raises 42883 (function pg_catalog.coalesce does not
-- exist) the first time each statement executes. The migrations applied
-- cleanly but the member activation cockpit RPCs fail on every call and the
-- member onboarding functions fail once a real profile reaches the affected
-- expressions. Recreates the five affected functions with the constructs
-- unqualified; being grammar-level, they cannot be shadowed by search_path.

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
    coalesce(
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
    coalesce(
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
    pg_catalog.char_length(pg_catalog.btrim(coalesce(v_profile.full_name, ''))) between 2 and 100
    and pg_catalog.strpos(coalesce(v_profile.full_name, ''), pg_catalog.chr(10)) = 0
    and pg_catalog.strpos(coalesce(v_profile.full_name, ''), pg_catalog.chr(13)) = 0
    and pg_catalog.char_length(pg_catalog.btrim(coalesce(v_profile.phone, ''))) between 6 and 32
    and pg_catalog.btrim(coalesce(v_profile.phone, '')) operator(pg_catalog.~) '^\+?[0-9 ()-]+$'
    and pg_catalog.char_length(
      pg_catalog.regexp_replace(coalesce(v_profile.phone, ''), '[^0-9]', '', 'g')
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
  v_full_name text := pg_catalog.btrim(coalesce(p_full_name, ''));
  v_phone text := pg_catalog.btrim(coalesce(p_phone, ''));
  v_contact_name text := pg_catalog.btrim(coalesce(p_emergency_contact_name, ''));
  v_contact_phone text := pg_catalog.btrim(coalesce(p_emergency_contact_phone, ''));
  v_relationship text := pg_catalog.btrim(coalesce(p_emergency_contact_relationship, ''));
  v_source text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_source, '')));
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
  if coalesce(pg_catalog.cardinality(v_required_ids), 0) = 0
     or coalesce(pg_catalog.cardinality(p_accepted_document_ids), 0) = 0 then
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
    pg_catalog.char_length(pg_catalog.btrim(coalesce(profile.full_name, ''))) between 2 and 100
      and pg_catalog.strpos(coalesce(profile.full_name, ''), pg_catalog.chr(10)) = 0
      and pg_catalog.strpos(coalesce(profile.full_name, ''), pg_catalog.chr(13)) = 0
      and pg_catalog.char_length(pg_catalog.btrim(coalesce(profile.phone, ''))) between 6 and 32
      and pg_catalog.btrim(coalesce(profile.phone, '')) operator(pg_catalog.~) '^\+?[0-9 ()-]+$'
      and pg_catalog.char_length(
        pg_catalog.regexp_replace(coalesce(profile.phone, ''), '[^0-9]', '', 'g')
      ) between 6 and 15,
    contact.user_id is not null and contact.contact_awareness_confirmed_at is not null,
    required.required_count > 0 and accepted.accepted_count = required.required_count,
    (
      pg_catalog.char_length(pg_catalog.btrim(coalesce(profile.full_name, ''))) between 2 and 100
      and pg_catalog.strpos(coalesce(profile.full_name, ''), pg_catalog.chr(10)) = 0
      and pg_catalog.strpos(coalesce(profile.full_name, ''), pg_catalog.chr(13)) = 0
      and pg_catalog.char_length(pg_catalog.btrim(coalesce(profile.phone, ''))) between 6 and 32
      and pg_catalog.btrim(coalesce(profile.phone, '')) operator(pg_catalog.~) '^\+?[0-9 ()-]+$'
      and pg_catalog.char_length(
        pg_catalog.regexp_replace(coalesce(profile.phone, ''), '[^0-9]', '', 'g')
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

create or replace function public.admin_member_activation_overview(p_cohort_days integer default 30)
returns table (
  as_of timestamptz,
  cohort_days integer,
  accounts_created bigint,
  readiness_complete bigint,
  training_access bigint,
  first_booking bigint,
  first_attended bigint,
  returned bigint
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_as_of timestamptz := pg_catalog.now();
  v_cohort_days integer := greatest(1, least(coalesce(p_cohort_days, 30), 3650));
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;

  return query
  with required_documents as (
    select pg_catalog.count(*)::integer as required_count
    from public.member_onboarding_documents document
    where document.required is true
      and document.published_at <= v_as_of
      and document.retired_at is null
  ), cohort as materialized (
    select
      profile.id,
      (
        pg_catalog.char_length(pg_catalog.btrim(coalesce(profile.full_name, ''))) between 2 and 100
        and pg_catalog.strpos(coalesce(profile.full_name, ''), pg_catalog.chr(10)) = 0
        and pg_catalog.strpos(coalesce(profile.full_name, ''), pg_catalog.chr(13)) = 0
        and pg_catalog.char_length(pg_catalog.btrim(coalesce(profile.phone, ''))) between 6 and 32
        and pg_catalog.btrim(coalesce(profile.phone, '')) operator(pg_catalog.~) '^\+?[0-9 ()-]+$'
        and pg_catalog.char_length(
          pg_catalog.regexp_replace(coalesce(profile.phone, ''), '[^0-9]', '', 'g')
        ) between 6 and 15
        and contact.user_id is not null
        and contact.contact_awareness_confirmed_at is not null
        and required.required_count > 0
        and accepted.accepted_count = required.required_count
      ) as readiness_complete,
      access.has_training_access,
      confirmed.first_confirmed_at,
      attendance.attended_count
    from public.profiles profile
    cross join required_documents required
    left join public.member_emergency_contacts contact on contact.user_id = profile.id
    cross join lateral (
      select pg_catalog.count(*)::integer as accepted_count
      from public.member_onboarding_receipts receipt
      join public.member_onboarding_documents document on document.id = receipt.document_id
      where receipt.user_id = profile.id
        and document.required is true
        and document.published_at <= v_as_of
        and document.retired_at is null
    ) accepted
    left join lateral (
      select pg_catalog.min(session.start_time) as first_confirmed_at
      from public.session_bookings booking
      join public.class_sessions session on session.id = booking.class_session_id
      where booking.user_id = profile.id
        and booking.status in ('confirmed', 'attended', 'no_show')
    ) confirmed on true
    cross join lateral (
      select
        exists (
          select 1 from public.orders orders
          where orders.user_id = profile.id and orders.status = 'paid'
        )
        or exists (
          select 1 from public.credit_batches batch
          where batch.user_id = profile.id
            and batch.remaining > 0
            and (batch.expires_at is null or batch.expires_at > v_as_of)
        )
        or confirmed.first_confirmed_at is not null as has_training_access
    ) access
    cross join lateral (
      select pg_catalog.count(distinct booking.class_session_id)::integer as attended_count
      from public.session_bookings booking
      where booking.user_id = profile.id and booking.status = 'attended'
    ) attendance
    where profile.role = 'member'
      and profile.created_at >= v_as_of - pg_catalog.make_interval(days => v_cohort_days)
      and profile.created_at <= v_as_of
  )
  select
    v_as_of,
    v_cohort_days,
    pg_catalog.count(*)::bigint,
    pg_catalog.count(*) filter (where member.readiness_complete)::bigint,
    pg_catalog.count(*) filter (
      where member.readiness_complete and member.has_training_access
    )::bigint,
    pg_catalog.count(*) filter (
      where member.readiness_complete and member.has_training_access
        and member.first_confirmed_at is not null
    )::bigint,
    pg_catalog.count(*) filter (
      where member.readiness_complete and member.has_training_access
        and member.first_confirmed_at is not null and member.attended_count >= 1
    )::bigint,
    pg_catalog.count(*) filter (
      where member.readiness_complete and member.has_training_access
        and member.first_confirmed_at is not null and member.attended_count >= 2
    )::bigint
  from cohort member;
end;
$$;

create or replace function public.admin_member_activation_queue(p_limit integer default 12)
returns table (
  id uuid,
  full_name text,
  email text,
  phone text,
  role text,
  joined_at timestamptz,
  credits_remaining bigint,
  bookings_count bigint,
  total_spent_cents bigint,
  reason text,
  has_training_access boolean,
  profile_complete boolean,
  emergency_contact_complete boolean,
  documents_complete boolean,
  readiness_complete boolean
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_as_of timestamptz := pg_catalog.now();
  v_limit integer := greatest(1, least(coalesce(p_limit, 12), 100));
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;

  return query
  with required_documents as (
    select pg_catalog.count(*)::integer as required_count
    from public.member_onboarding_documents document
    where document.required is true
      and document.published_at <= v_as_of
      and document.retired_at is null
  ), member_facts as materialized (
    select
      profile.id,
      profile.full_name,
      profile.email,
      profile.phone,
      profile.role,
      profile.created_at as joined_at,
      (
        pg_catalog.char_length(pg_catalog.btrim(coalesce(profile.full_name, ''))) between 2 and 100
        and pg_catalog.strpos(coalesce(profile.full_name, ''), pg_catalog.chr(10)) = 0
        and pg_catalog.strpos(coalesce(profile.full_name, ''), pg_catalog.chr(13)) = 0
        and pg_catalog.char_length(pg_catalog.btrim(coalesce(profile.phone, ''))) between 6 and 32
        and pg_catalog.btrim(coalesce(profile.phone, '')) operator(pg_catalog.~) '^\+?[0-9 ()-]+$'
        and pg_catalog.char_length(
          pg_catalog.regexp_replace(coalesce(profile.phone, ''), '[^0-9]', '', 'g')
        ) between 6 and 15
      ) as profile_complete,
      contact.user_id is not null and contact.contact_awareness_confirmed_at is not null
        as emergency_contact_complete,
      required.required_count > 0 and accepted.accepted_count = required.required_count
        as documents_complete,
      credits.credits_remaining,
      bookings.bookings_count,
      paid.total_spent_cents,
      confirmed.first_confirmed_at,
      confirmed.past_confirmed_at,
      attendance.attended_count
    from public.profiles profile
    cross join required_documents required
    left join public.member_emergency_contacts contact on contact.user_id = profile.id
    cross join lateral (
      select pg_catalog.count(*)::integer as accepted_count
      from public.member_onboarding_receipts receipt
      join public.member_onboarding_documents document on document.id = receipt.document_id
      where receipt.user_id = profile.id
        and document.required is true
        and document.published_at <= v_as_of
        and document.retired_at is null
    ) accepted
    cross join lateral (
      select coalesce(pg_catalog.sum(batch.remaining), 0)::bigint as credits_remaining
      from public.credit_batches batch
      where batch.user_id = profile.id
        and batch.remaining > 0
        and (batch.expires_at is null or batch.expires_at > v_as_of)
    ) credits
    cross join lateral (
      select pg_catalog.count(*)::bigint as bookings_count
      from public.session_bookings booking
      where booking.user_id = profile.id
    ) bookings
    cross join lateral (
      select coalesce(pg_catalog.sum(orders.amount_cents), 0)::bigint as total_spent_cents
      from public.orders orders
      where orders.user_id = profile.id and orders.status = 'paid'
    ) paid
    cross join lateral (
      select
        pg_catalog.min(session.start_time) as first_confirmed_at,
        pg_catalog.min(session.start_time) filter (where session.start_time <= v_as_of) as past_confirmed_at
      from public.session_bookings booking
      join public.class_sessions session on session.id = booking.class_session_id
      where booking.user_id = profile.id
        and booking.status in ('confirmed', 'attended', 'no_show')
    ) confirmed
    cross join lateral (
      select pg_catalog.count(distinct booking.class_session_id)::integer as attended_count
      from public.session_bookings booking
      where booking.user_id = profile.id and booking.status = 'attended'
    ) attendance
    where profile.role = 'member'
  ), classified as (
    select facts.*,
      facts.profile_complete
        and facts.emergency_contact_complete
        and facts.documents_complete as readiness_complete,
      facts.credits_remaining > 0
        or facts.total_spent_cents > 0
        or facts.first_confirmed_at is not null as has_training_access,
      case
        when (not facts.profile_complete or not facts.emergency_contact_complete)
          and facts.joined_at <= v_as_of - interval '48 hours' then 'setup_incomplete'
        when not facts.documents_complete
          and facts.joined_at <= v_as_of - interval '48 hours' then 'readiness_incomplete'
        when facts.credits_remaining = 0 and facts.total_spent_cents = 0
          and facts.first_confirmed_at is null
          and facts.joined_at <= v_as_of - interval '48 hours' then 'no_training_access'
        when facts.first_confirmed_at is null
          and facts.joined_at <= v_as_of - interval '3 days' then 'no_first_booking'
        when facts.attended_count = 0 and facts.past_confirmed_at is not null then 'no_first_attendance'
      end as reason
    from member_facts facts
  )
  select
    member.id,
    member.full_name,
    member.email,
    member.phone,
    member.role,
    member.joined_at,
    member.credits_remaining,
    member.bookings_count,
    member.total_spent_cents,
    member.reason,
    member.has_training_access,
    member.profile_complete,
    member.emergency_contact_complete,
    member.documents_complete,
    member.readiness_complete
  from classified member
  where member.reason is not null
    and not exists (
      select 1
      from public.admin_member_notes note
      where note.user_id = member.id
        and note.category = 'follow_up'
        and note.archived_at is null
        and note.created_at > v_as_of - interval '7 days'
    )
  order by
    case member.reason
      when 'setup_incomplete' then 1
      when 'readiness_incomplete' then 2
      when 'no_training_access' then 3
      when 'no_first_booking' then 4
      else 5
    end,
    member.joined_at asc,
    member.id
  limit v_limit;
end;
$$;
