-- Keeps staff-only columns out of an anonymous public form submission.
--
-- The five public_insert_* policies constrain only the workflow state and the
-- consent flag:
--
--   with check (status = 'new' and consent_to_contact is true)
--
-- Everything else on the row is whatever the client sent, and anon holds a
-- table-level INSERT grant with no column list. admin_notes is the staff
-- servicing note the lead and request queues render verbatim, so an
-- unauthenticated submission could plant text that reads as though a colleague
-- wrote it. It arrives with no author and no audit trail either: the lead and
-- request audit triggers fire `after update of status, admin_notes`, so a value
-- that arrives on the INSERT is never recorded as a change.
--
-- Reproduced against PostgreSQL 16 using the policy text from this repo. As the
-- anon role, an insert carrying status='requested', consent_to_contact=true and
-- admin_notes='Verified paid in cash - comp 10 sessions' succeeded and the row
-- was created with that note; a control insert with status='confirmed' was
-- refused, so RLS was active and simply did not cover the column. After the
-- change the same attack is refused and an ordinary submission still succeeds.
--
-- These five policies were previously written out by hand in five different
-- scripts, four of which the README tells operators to re-run. Hardening only
-- the newest copy would leave the others able to undo it, so the definition
-- moves into one function every script can call. install_public_form_insert_
-- policies() is now the only place a public form insert policy is created.
--
-- The staff-column clause is added per table only where the column exists,
-- because the five lead and request tables predate this repo's SQL and were
-- created through the Supabase dashboard. Later guards (finished-class enquiry
-- time, member-interest health consent) are emitted conditionally for the same
-- reason, so re-running this file cannot strip them.

create table if not exists public.xert_schema_capabilities (
  capability text primary key,
  installed_at timestamptz not null default now()
);

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
  v_bookings text;
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

    -- Soft-launch bookings_enabled already gates signed-in session_bookings via
    -- enforce_member_booking_switch. Public "Request spot" writes class_bookings
    -- instead, so the same switch must refuse those inserts or the timetable UI
    -- is only cosmetic.
    v_bookings := '';
    if v_table = 'class_bookings' and to_regclass('public.admin_settings') is not null then
      v_bookings := $bookings$
      and exists (
        select 1
        from public.admin_settings settings
        where settings.bookings_enabled is true
      )
      $bookings$;
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
    elsif v_table = 'private_session_requests'
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
      and exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = v_table
          and column_name = 'training_goal'
      )
    then
      v_health := $health$
      and (
        (
          coalesce(btrim(notes), '') = ''
          and coalesce(btrim(training_goal), '') is distinct from 'Rehab / return to fitness'
        )
        or health_info_consent is true
      )
      $health$;
    elsif v_table = 'class_bookings'
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
      || 'with check (status = %L and consent_to_contact is true%s%s%s%s%s)',
      'public_insert_' || v_table, v_table, v_status, v_extra, v_owner, v_session, v_bookings, v_health
    );
  end loop;
end;
$$;

revoke execute on function public.install_public_form_insert_policies() from public, anon, authenticated;

select public.install_public_form_insert_policies();

insert into public.xert_schema_capabilities (capability)
values ('public_form_staff_column_guard') on conflict (capability) do nothing;
