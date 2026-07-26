-- Privacy: selecting the PT training goal "Rehab / return to fitness" discloses
-- health-related status. Require the same health_info_consent gate already used
-- for free-text notes, so a public insert cannot store that goal without
-- APP 3.3 consent. Extends install_public_form_insert_policies without changing
-- owner, session, or staff-column guards.

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
      || 'with check (status = %L and consent_to_contact is true%s%s%s%s)',
      'public_insert_' || v_table, v_table, v_status, v_extra, v_owner, v_session, v_health
    );
  end loop;
end;
$$;

revoke execute on function public.install_public_form_insert_policies() from public, anon, authenticated;

select public.install_public_form_insert_policies();

insert into public.xert_schema_capabilities (capability)
values ('pt_rehab_goal_health_consent')
on conflict (capability) do nothing;
