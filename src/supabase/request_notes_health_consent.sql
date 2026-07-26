-- PT and booking request free-text notes can carry health information
-- (injuries, rehab constraints) with only consent_to_contact. APP 3.3 needs a
-- separate, informed consent — the same shape already used for member_interest
-- injuries. Adds health_info_consent on both request tables, extends the public
-- form installer so notes without consent are refused, and exposes a narrow
-- admin reveal for member-interest injuries (kept out of list/CSV selects).

alter table public.class_bookings
  add column if not exists health_info_consent boolean not null default false;

alter table public.private_session_requests
  add column if not exists health_info_consent boolean not null default false;

-- Keep the member-interest injuries guard when this installer re-runs after
-- member_interest_health_consent (column may already exist).
alter table public.member_interest
  add column if not exists health_info_consent boolean not null default false;

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

-- Narrow reveal bootstrap: injuries stay out of admin list/CSV selects; staff
-- fetch them only for a single lead when consent was recorded.
-- Re-run safe: do not replace the audited member_interest_health_reveal_authz
-- body (writes member_interest_health_reveals + audit_event_id).
do $install_admin_reveal_member_interest_health$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'admin_reveal_member_interest_health'
    and pg_get_function_identity_arguments(p.oid) = 'p_lead_id uuid';
  if v_def is not null
     and (
       v_def ilike '%member_interest_health_reveals%'
       or v_def ilike '%audit_event_id%'
       or to_regclass('public.member_interest_health_reveals') is not null
     ) then
    raise notice 'keeping audited admin_reveal_member_interest_health';
  else
    execute $fn$
create or replace function public.admin_reveal_member_interest_health(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $body$
declare
  v_consent boolean;
  v_injuries text;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'ADMIN_ONLY';
  end if;
  if p_lead_id is null then
    raise exception 'LEAD_REQUIRED';
  end if;

  select health_info_consent,
         nullif(btrim(injuries_or_limitations_optional), '')
    into v_consent, v_injuries
  from public.member_interest
  where id = p_lead_id;

  if not found then
    raise exception 'LEAD_NOT_FOUND';
  end if;

  if v_consent is not true or v_injuries is null then
    return jsonb_build_object(
      'lead_id', p_lead_id,
      'available', false,
      'injuries_or_limitations_optional', null
    );
  end if;

  return jsonb_build_object(
    'lead_id', p_lead_id,
    'available', true,
    'injuries_or_limitations_optional', v_injuries
  );
end;
$body$;
$fn$;
  end if;
end;
$install_admin_reveal_member_interest_health$;

revoke all on function public.admin_reveal_member_interest_health(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_reveal_member_interest_health(uuid)
  to authenticated;

insert into public.xert_schema_capabilities (capability)
values ('request_notes_health_consent')
on conflict (capability) do nothing;
