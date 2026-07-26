-- Refuses a public "Request spot" enquiry against a class that has already run.
--
-- The signed-in booking path is bounded server side: sessions_with_availability
-- filters `s.start_time > now()` and join_session_waitlist raises
-- SESSION_IN_PAST. The public timetable writes somewhere else.
-- requestClassBooking inserts into class_bookings, whose policy checked only
-- the workflow state and consent, and enforce_booking_time_conflict is attached
-- to session_bookings rather than this table. getClassSessions also had no time
-- filter, so /timetable rendered every class ever published, oldest first, each
-- with a live Request spot button. An enquiry against a finished class landed
-- as a live `requested` row in the staff queue.
--
-- The client no longer offers the button for a class that has started; this is
-- the guard behind it, so a stale tab or a direct PostgREST call cannot do it
-- either. The class must exist, be published, be publicly visible and still be
-- ahead of now().
--
-- This extends the shared installer from 20260726010000 rather than writing the
-- policy out again, so the four other scripts that recreate the public form
-- policies pick the guard up too. It also keeps the member-interest health
-- consent clause when that column exists, so re-running this file cannot strip
-- member_interest_health_consent.

create or replace function public.install_public_form_insert_policies()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_table text;
  v_status text;
  v_extra text;
  v_owner text;
  v_session text;
  v_health text;
begin
  foreach v_table in array array[
    'member_interest', 'trainer_interest', 'partner_interest',
    'class_bookings', 'private_session_requests'
  ] loop
    if to_regclass('public.' || v_table) is null then
      continue;
    end if;

    v_status := case v_table
      when 'class_bookings' then 'requested'
      when 'private_session_requests' then 'requested'
      else 'new'
    end;

    v_owner := '';
    if v_table = 'private_session_requests' and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = v_table and column_name = 'user_id'
    ) then
      v_owner := $owner$
      and (
        (auth.uid() is null and user_id is null)
        or (auth.uid() is not null and user_id = auth.uid())
      )
      $owner$;
    end if;

    v_session := '';
    if v_table = 'class_bookings' and to_regclass('public.class_sessions') is not null then
      v_session := $session$
      and exists (
        select 1
        from public.class_sessions session
        where session.id = class_bookings.class_session_id
          and session.status = 'published'
          and session.public_visible is true
          and session.start_time > now()
      )
      $session$;
    end if;

    v_extra := '';
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = v_table and column_name = 'admin_notes'
    ) then
      v_extra := $notes$ and coalesce(btrim(admin_notes), '') = '' $notes$;
    end if;

    v_health := '';
    if v_table = 'member_interest'
      and exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = v_table
          and column_name = 'injuries_or_limitations_optional'
      )
      and exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = v_table
          and column_name = 'health_info_consent'
      )
    then
      v_health := $health$
      and (
        coalesce(btrim(injuries_or_limitations_optional), '') = ''
        or health_info_consent is true
      )
      $health$;
    elsif v_table in ('class_bookings', 'private_session_requests')
      and exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = v_table
          and column_name = 'notes'
      )
      and exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = v_table
          and column_name = 'health_info_consent'
      )
    then
      v_health := $health$
      and (
        coalesce(btrim(notes), '') = ''
        or health_info_consent is true
      )
      $health$;
    end if;

    execute format('alter table public.%I enable row level security', v_table);
    execute format('drop policy if exists %I on public.%I', 'public_insert_' || v_table, v_table);
    execute format(
      'create policy %I on public.%I for insert to anon, authenticated '
      || 'with check (status = %L and consent_to_contact is true%s%s%s%s)',
      'public_insert_' || v_table, v_table, v_status, v_extra, v_owner, v_session, v_health
    );
  end loop;
end;
$$;

revoke execute on function public.install_public_form_insert_policies() from public, anon, authenticated;

select public.install_public_form_insert_policies();

insert into public.xert_schema_capabilities (capability)
values ('public_enquiry_time_guard') on conflict (capability) do nothing;
