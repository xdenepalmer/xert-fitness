-- Certify older manually-applied upgrades only when their live database
-- objects still satisfy the release contract. This repairs missing markers
-- without ever treating an absent function, trigger, index, column or policy
-- as installed.

do $$
declare
  v_table text;
  v_policy text;
  v_check text;
begin
  if to_regprocedure('public.enforce_session_waitlist_fifo()') is null
    or to_regprocedure('public.join_session_waitlist(uuid)') is null
    or to_regprocedure('public.admin_promote_next_waitlisted(uuid)') is null
    or to_regprocedure('public.admin_waitlist_overview(integer)') is null
    or not exists (
      select 1
      from pg_trigger
      where tgrelid = 'public.session_bookings'::regclass
        and tgname = 'session_bookings_waitlist_fifo_guard'
        and not tgisinternal
    ) then
    raise exception 'WAITLIST_FIFO_PROMOTION_NOT_INSTALLED';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'private_session_requests'
      and column_name = 'user_id'
      and data_type = 'uuid'
  ) or to_regclass('public.private_session_requests_user_created_idx') is null
    or not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'private_session_requests'
        and policyname = 'members_read_own_private_session_requests'
        and cmd = 'SELECT'
        and lower(coalesce(qual, '')) like '%user_id = auth.uid()%'
    ) then
    raise exception 'MEMBER_PT_REQUEST_TRACKING_NOT_INSTALLED';
  end if;

  for v_table, v_policy, v_check in
    values
      ('member_interest', 'public_insert_member_interest', 'new'),
      ('trainer_interest', 'public_insert_trainer_interest', 'new'),
      ('partner_interest', 'public_insert_partner_interest', 'new'),
      ('class_bookings', 'public_insert_class_bookings', 'requested'),
      ('private_session_requests', 'public_insert_private_session_requests', 'requested')
  loop
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = v_table
        and policyname = v_policy
        and cmd = 'INSERT'
        and roles @> array['anon'::name, 'authenticated'::name]
        and lower(coalesce(with_check, '')) like '%status%'
        and lower(coalesce(with_check, '')) like '%' || v_check || '%'
        and lower(coalesce(with_check, '')) like '%consent_to_contact%'
    ) then
      raise exception 'PUBLIC_FORM_INTEGRITY_NOT_INSTALLED:%', v_table;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'private_session_requests'
      and policyname = 'public_insert_private_session_requests'
      and lower(coalesce(with_check, '')) like '%user_id%auth.uid()%'
  ) then
    raise exception 'PUBLIC_FORM_OWNERSHIP_NOT_INSTALLED';
  end if;
end;
$$;

insert into public.xert_schema_capabilities (capability)
values
  ('waitlist_fifo_promotion'),
  ('member_pt_request_tracking'),
  ('public_form_integrity')
on conflict (capability) do nothing;
