-- Read-only owner activation visibility derived from authoritative member data.
-- Readiness is deliberately a current, non-linear state: publishing a new
-- required document can move a member back to readiness_complete = false.

create index if not exists orders_member_paid_at_idx
  on public.orders (user_id, paid_at)
  where status = 'paid';

drop function if exists public.admin_member_activation_overview();
drop function if exists public.admin_member_activation_overview(integer);
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
  v_cohort_days integer := pg_catalog.greatest(1, pg_catalog.least(pg_catalog.coalesce(p_cohort_days, 30), 3650));
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

drop function if exists public.admin_member_activation_queue(integer);
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
  v_limit integer := pg_catalog.greatest(1, pg_catalog.least(pg_catalog.coalesce(p_limit, 12), 100));
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
        pg_catalog.char_length(pg_catalog.btrim(pg_catalog.coalesce(profile.full_name, ''))) between 2 and 100
        and pg_catalog.strpos(pg_catalog.coalesce(profile.full_name, ''), pg_catalog.chr(10)) = 0
        and pg_catalog.strpos(pg_catalog.coalesce(profile.full_name, ''), pg_catalog.chr(13)) = 0
        and pg_catalog.char_length(pg_catalog.btrim(pg_catalog.coalesce(profile.phone, ''))) between 6 and 32
        and pg_catalog.btrim(pg_catalog.coalesce(profile.phone, '')) operator(pg_catalog.~) '^\+?[0-9 ()-]+$'
        and pg_catalog.char_length(
          pg_catalog.regexp_replace(pg_catalog.coalesce(profile.phone, ''), '[^0-9]', '', 'g')
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
      select pg_catalog.coalesce(pg_catalog.sum(batch.remaining), 0)::bigint as credits_remaining
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
      select pg_catalog.coalesce(pg_catalog.sum(orders.amount_cents), 0)::bigint as total_spent_cents
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

revoke all on function public.admin_member_activation_overview(integer) from public, anon, authenticated;
revoke all on function public.admin_member_activation_queue(integer) from public, anon, authenticated;
grant execute on function public.admin_member_activation_overview(integer) to authenticated;
grant execute on function public.admin_member_activation_queue(integer) to authenticated;

insert into public.xert_schema_capabilities (capability)
values ('member_activation_cockpit')
on conflict (capability) do update set installed_at = excluded.installed_at;
