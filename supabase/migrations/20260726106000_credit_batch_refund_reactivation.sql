-- Shared credit refund + expired-pack reactivation, and class-cancel completeness.
--
-- 1. admin_cancel_class_session only targeted requested|confirmed|waitlisted.
--    Staff who marked attended/no_show early, then cancelled the class, left
--    those bookings holding an unrefunded credit forever.
-- 2. cancel_booking already reactivates an expired pack on refund, but class
--    cancel, admin_set_booking_status and roll-call release only bumped
--    remaining — expires_at stayed in the past so the credit stayed unusable.
--
-- One helper owns the expiry-extension rule. Every refund path calls it (or the
-- pure expires_at expression it wraps). Waitlisted places still never refund.
-- Attended/no_show refund only when credit_batch_id is present (they hold the
-- credit; cancelling them must not double-count a null batch).
--
-- Re-run safe: 26112 / operator mirrors add o.status = 'refunded' skips on the
-- helper, roll-call release and class-cancel restore. Keep those newer bodies.

create or replace function public.credit_batch_expires_at_after_refund(
  p_expires_at timestamptz,
  p_anchor timestamptz
) returns timestamptz
language sql
stable
parallel safe
set search_path = public, pg_temp
as $$
  select case
    when p_expires_at is not null and p_expires_at <= now()
      then greatest(coalesce(p_anchor, now()), now() + interval '12 hours')
    else p_expires_at
  end;
$$;

do $install_refund_credits_to_batch$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'refund_credits_to_batch'
    and pg_get_function_identity_arguments(p.oid) = 'p_batch_id uuid, p_count integer, p_anchor timestamp with time zone';
  if v_def is not null and v_def ilike '%status = ''refunded''%' then
    raise notice 'keeping newer refund_credits_to_batch';
  else
    execute $fn$
create or replace function public.refund_credits_to_batch(
  p_batch_id uuid,
  p_count integer,
  p_anchor timestamptz default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $body$
begin
  if p_batch_id is null or p_count is null or p_count <= 0 then
    return;
  end if;
  update public.credit_batches
     set remaining = remaining + p_count,
         expires_at = public.credit_batch_expires_at_after_refund(expires_at, p_anchor)
   where id = p_batch_id;
end;
$body$;
$fn$;
  end if;
end;
$install_refund_credits_to_batch$;

revoke all on function public.credit_batch_expires_at_after_refund(timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function public.refund_credits_to_batch(uuid, integer, timestamptz)
  from public, anon, authenticated;

-- Re-run safe: keep helper-backed cancel/status bodies (Stripe-refunded pack skip).
do $install_cancel_booking$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'cancel_booking'
    and pg_get_function_identity_arguments(p.oid) = 'p_booking_id uuid';
  if v_def is not null and v_def ilike '%refund_credits_to_batch%' then
    raise notice 'keeping newer cancel_booking';
  else
    execute $fn$
create or replace function public.cancel_booking(p_booking_id uuid)
returns void language plpgsql security definer set search_path = public as $body$
declare
  v_user   uuid := auth.uid();
  v_batch  uuid;
  v_start  timestamptz;
  v_status text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  select b.credit_batch_id, s.start_time, b.status
    into v_batch, v_start, v_status
    from public.session_bookings b
    join public.class_sessions s on s.id = b.class_session_id
    where b.id = p_booking_id and b.user_id = v_user
    for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_status not in ('requested', 'confirmed', 'waitlisted') then raise exception 'NOT_CANCELLABLE'; end if;

  update public.session_bookings
  set status = 'cancelled', cancelled_at = now()
  where id = p_booking_id;

  if (v_status = 'requested' or (v_status = 'confirmed' and v_start - now() > interval '12 hours'))
     and v_batch is not null then
    perform public.refund_credits_to_batch(v_batch, 1, v_start);
  end if;
end;
$body$;
$fn$;
  end if;
end;
$install_cancel_booking$;

revoke execute on function public.cancel_booking(uuid) from public, anon;
grant execute on function public.cancel_booking(uuid) to authenticated;

do $install_admin_set_booking_status$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'admin_set_booking_status'
    and pg_get_function_identity_arguments(p.oid) = 'p_booking_id uuid, p_status text';
  if v_def is not null and v_def ilike '%refund_credits_to_batch%' then
    raise notice 'keeping newer admin_set_booking_status';
  else
    execute $fn$
create or replace function public.admin_set_booking_status(p_booking_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $body$
declare
  v_batch uuid;
  v_current text;
  v_user uuid;
  v_session uuid;
  v_capacity integer;
  v_start timestamptz;
  v_session_status text;
  v_active_count integer;
  v_new_batch uuid;
  v_first_waitlisted uuid;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_status not in ('requested', 'confirmed', 'waitlisted', 'cancelled', 'declined', 'attended', 'no_show') then
    raise exception 'INVALID_STATUS';
  end if;

  select credit_batch_id, status, user_id, class_session_id
    into v_batch, v_current, v_user, v_session
    from public.session_bookings where id = p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if p_status = v_current then return; end if;
  if p_status in ('attended', 'no_show') and v_current <> 'confirmed' then
    raise exception 'STATUS_TRANSITION_NOT_ALLOWED';
  end if;

  if p_status in ('requested', 'confirmed')
     and v_current not in ('requested', 'confirmed', 'attended', 'no_show') then
    select id into v_first_waitlisted
      from public.session_bookings
      where class_session_id = v_session and status = 'waitlisted'
      order by created_at, id limit 1;
    if v_first_waitlisted is not null
      and (v_current <> 'waitlisted' or v_first_waitlisted is distinct from p_booking_id) then
      raise exception 'WAITLIST_ORDER_REQUIRED';
    end if;
  end if;

  if p_status in ('requested', 'confirmed')
     and v_current not in ('requested', 'confirmed', 'attended', 'no_show') then
    select capacity, start_time, status into v_capacity, v_start, v_session_status
      from public.class_sessions where id = v_session for update;
    if not found then raise exception 'SESSION_NOT_FOUND'; end if;
    if v_session_status <> 'published' then raise exception 'SESSION_NOT_BOOKABLE'; end if;
    if v_start <= now() then raise exception 'SESSION_IN_PAST'; end if;

    select count(*) into v_active_count from public.session_bookings
      where class_session_id = v_session and status in ('requested', 'confirmed');
    if v_capacity is not null and v_active_count >= v_capacity then raise exception 'SESSION_FULL'; end if;

    select id into v_new_batch from public.credit_batches
      where user_id = v_user and remaining > 0
        and (expires_at is null or expires_at > now())
      order by expires_at asc nulls last, created_at asc limit 1 for update;
    if v_new_batch is null then raise exception 'NO_CREDITS'; end if;
    update public.credit_batches set remaining = remaining - 1 where id = v_new_batch;
    v_batch := v_new_batch;
  end if;

  update public.session_bookings
    set status = p_status,
        credit_batch_id = v_batch,
        cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end
    where id = p_booking_id;

  if p_status in ('waitlisted', 'declined', 'cancelled')
    and v_current in ('requested', 'confirmed', 'attended', 'no_show') and v_batch is not null then
    if v_start is null then
      select start_time into v_start from public.class_sessions where id = v_session;
    end if;
    perform public.refund_credits_to_batch(v_batch, 1, v_start);
  end if;
end;
$body$;
$fn$;
  end if;
end;
$install_admin_set_booking_status$;

revoke execute on function public.admin_set_booking_status(uuid, text) from public, anon;
grant execute on function public.admin_set_booking_status(uuid, text) to authenticated;

do $install_admin_record_session_attendance$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'admin_record_session_attendance'
    and pg_get_function_identity_arguments(p.oid) = 'p_session_id uuid, p_attended_ids uuid[], p_no_show_ids uuid[]';
  if v_def is not null and v_def ilike '%status = ''refunded''%' then
    raise notice 'keeping newer admin_record_session_attendance';
  else
    execute $fn$
create or replace function public.admin_record_session_attendance(
  p_session_id uuid,
  p_attended_ids uuid[],
  p_no_show_ids uuid[]
)
returns integer language plpgsql security definer set search_path = public as $body$
declare
  v_session_status text;
  v_start_time timestamptz;
  v_eligible_count integer;
  v_input_count integer;
  v_updated_count integer;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_session_id is null then raise exception 'SESSION_REQUIRED'; end if;

  p_attended_ids := coalesce(p_attended_ids, array[]::uuid[]);
  p_no_show_ids := coalesce(p_no_show_ids, array[]::uuid[]);
  v_input_count := cardinality(p_attended_ids) + cardinality(p_no_show_ids);
  if v_input_count = 0 then raise exception 'ATTENDANCE_REQUIRED'; end if;
  if cardinality(p_attended_ids) <> (select count(distinct id) from unnest(p_attended_ids) as ids(id))
     or cardinality(p_no_show_ids) <> (select count(distinct id) from unnest(p_no_show_ids) as ids(id))
     or p_attended_ids && p_no_show_ids then
    raise exception 'DUPLICATE_BOOKING';
  end if;

  select status, start_time into v_session_status, v_start_time
    from public.class_sessions where id = p_session_id for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if v_session_status not in ('published', 'full', 'completed') then raise exception 'SESSION_NOT_OPEN_FOR_ATTENDANCE'; end if;
  if v_start_time > now() then raise exception 'SESSION_NOT_STARTED'; end if;

  perform 1 from public.session_bookings
    where class_session_id = p_session_id and status in ('requested', 'confirmed', 'attended', 'no_show')
    for update;
  select count(*) into v_eligible_count
    from public.session_bookings
    where class_session_id = p_session_id and status in ('confirmed', 'attended', 'no_show');

  if v_input_count <> v_eligible_count
     or exists (
       select 1 from unnest(p_attended_ids || p_no_show_ids) as ids(id)
       where not exists (
         select 1 from public.session_bookings b
         where b.id = ids.id and b.class_session_id = p_session_id
           and b.status in ('confirmed', 'attended', 'no_show')
       )
     ) then
    raise exception 'INCOMPLETE_ROLL_CALL';
  end if;

  update public.session_bookings
     set status = case when id = any(p_attended_ids) then 'attended' else 'no_show' end,
         attendance_marked_at = now(),
         attendance_marked_by = auth.uid()
   where class_session_id = p_session_id
     and id = any(p_attended_ids || p_no_show_ids);
  get diagnostics v_updated_count = row_count;

  update public.credit_batches batch
     set remaining = batch.remaining + released.credits,
         expires_at = public.credit_batch_expires_at_after_refund(batch.expires_at, v_start_time)
    from (
      select credit_batch_id, count(*) as credits
      from public.session_bookings
      where class_session_id = p_session_id
        and status = 'requested'
        and credit_batch_id is not null
      group by credit_batch_id
    ) as released
   where batch.id = released.credit_batch_id;

  update public.session_bookings
     set status = 'cancelled', cancelled_at = now()
   where class_session_id = p_session_id
     and status = 'requested';

  update public.class_sessions
     set status = 'completed', public_visible = false, updated_at = now()
   where id = p_session_id;

  return v_updated_count;
end; $body$;
$fn$;
  end if;
end;
$install_admin_record_session_attendance$;

revoke execute on function public.admin_record_session_attendance(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.admin_record_session_attendance(uuid, uuid[], uuid[]) to authenticated;

create or replace function public.create_class_cancellation_notice(p_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_title text;
  v_start_time timestamptz;
  v_announcement_id uuid;
  v_member_booking_count integer := 0;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;

  select title, start_time
    into v_title, v_start_time
    from public.class_sessions
    where id = p_session_id;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;

  select count(*)::integer
    into v_member_booking_count
    from public.session_bookings
    where class_session_id = p_session_id
      and status in ('requested', 'confirmed', 'waitlisted', 'attended', 'no_show');

  if v_member_booking_count = 0 then return null; end if;

  insert into public.member_announcements (
      title, body, tone, cta_label, cta_url, audience, source_kind, source_id,
      published_at, expires_at, created_by, last_changed_by
    ) values (
      'Class cancelled: ' || coalesce(nullif(btrim(v_title), ''), 'XERT class'),
      format(
        'Unfortunately, XERT has cancelled %s on %s. Reserved credits on open credit places are returned when the pack is still live; waitlist places never held a credit. Open XERT to choose another class, or contact us if you need help.',
        coalesce(nullif(btrim(v_title), ''), 'your class'),
        to_char(v_start_time at time zone 'Australia/Brisbane', 'FMDay FMDD FMMonth at FMHH12:MI am')
      ),
      'urgent',
      'Choose another class',
      '/booking',
      'targeted',
      'class_cancellation',
      p_session_id,
      now(),
      now() + interval '30 days',
      auth.uid(),
      auth.uid()
    )
    on conflict (source_kind, source_id)
      where source_kind is not null and source_id is not null
    do update set
      title = excluded.title,
      body = excluded.body,
      expires_at = greatest(public.member_announcements.expires_at, excluded.expires_at),
      updated_at = now(),
      last_changed_by = auth.uid()
  returning id into v_announcement_id;

  insert into public.member_announcement_targets (announcement_id, user_id)
    select v_announcement_id, booking.user_id
    from public.session_bookings booking
    where booking.class_session_id = p_session_id
      and booking.status in ('requested', 'confirmed', 'waitlisted', 'attended', 'no_show')
    group by booking.user_id
  on conflict (announcement_id, user_id) do nothing;

  return v_announcement_id;
end;
$$;

revoke all on function public.create_class_cancellation_notice(uuid) from public, anon, authenticated;

do $install_admin_cancel_class_session$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'admin_cancel_class_session'
    and pg_get_function_identity_arguments(p.oid) = 'p_session_id uuid';
  if v_def is not null and v_def ilike '%status = ''refunded''%' then
    raise notice 'keeping newer admin_cancel_class_session';
  else
    execute $fn$
create or replace function public.admin_cancel_class_session(p_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $body$
declare
  v_status text;
  v_start timestamptz;
  v_cancelled_count integer := 0;
  v_enquiry_cancelled_count integer := 0;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;

  select status, start_time into v_status, v_start
    from public.class_sessions
    where id = p_session_id
    for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if v_status = 'completed' then raise exception 'SESSION_ALREADY_COMPLETED'; end if;

  if to_regprocedure('public.create_class_cancellation_notice(uuid)') is not null then
    perform public.create_class_cancellation_notice(p_session_id);
  end if;

  -- Snapshot pre-update status. RETURNING after the cancel write would only
  -- ever see 'cancelled' and refund nothing. Include attended/no_show because
  -- those states still hold the credit charged at confirmation. Waitlisted
  -- places are cancelled but never refunded (they never consumed a credit).
  with targets as (
    select id, credit_batch_id, status as previous_status
      from public.session_bookings
     where class_session_id = p_session_id
       and status in ('requested', 'confirmed', 'waitlisted', 'attended', 'no_show')
     for update
  ), cancelled_bookings as (
    update public.session_bookings booking
       set status = 'cancelled', cancelled_at = now()
      from targets
     where booking.id = targets.id
     returning targets.credit_batch_id as credit_batch_id,
               targets.previous_status as previous_status
  ), restored_credits as (
    update public.credit_batches credits
       set remaining = credits.remaining + refunds.credit_count,
           expires_at = public.credit_batch_expires_at_after_refund(credits.expires_at, v_start)
      from (
        select credit_batch_id, count(*)::integer as credit_count
          from cancelled_bookings
         where previous_status in ('requested', 'confirmed', 'attended', 'no_show')
           and credit_batch_id is not null
         group by credit_batch_id
      ) refunds
     where credits.id = refunds.credit_batch_id
     returning credits.id
  )
  select count(*) into v_cancelled_count from cancelled_bookings;

  if to_regclass('public.class_bookings') is not null then
    execute $query$
      update public.class_bookings
         set status = 'cancelled'
       where class_session_id = $1
         and status in ('requested', 'confirmed', 'waitlisted')
    $query$ using p_session_id;
    get diagnostics v_enquiry_cancelled_count = row_count;
  end if;

  update public.class_sessions
     set status = 'cancelled', updated_at = now()
   where id = p_session_id;

  return v_cancelled_count + v_enquiry_cancelled_count;
end;
$body$;
$fn$;
  end if;
end;
$install_admin_cancel_class_session$;

revoke all on function public.admin_cancel_class_session(uuid) from public, anon;
grant execute on function public.admin_cancel_class_session(uuid) to authenticated;

insert into public.xert_schema_capabilities (capability)
values ('credit_batch_refund_reactivation') on conflict (capability) do nothing;
