-- Clear credit_batch_id when a reserved credit is released.
--
-- admin_set_booking_status refunded remaining when demoting
-- requested/confirmed/attended/no_show → waitlisted|declined|cancelled, but left
-- credit_batch_id pointing at the restored pack. Waitlisted places must never
-- hold a credit (join_session_waitlist inserts null), yet a demoted row still
-- looked reserved. cancel_booking had the same leftover marker after a refund.
-- Class cancel now nulls the column when it cancels an active place.
--
-- Clearing the FK after release keeps roster/notice consumers honest and stops
-- any later path from treating an already-refunded place as still charged.

create or replace function public.cancel_booking(p_booking_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user   uuid := auth.uid();
  v_batch  uuid;
  v_start  timestamptz;
  v_status text;
  v_refund boolean := false;
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

  v_refund := (v_status = 'requested' or (v_status = 'confirmed' and v_start - now() > interval '12 hours'))
    and v_batch is not null;

  update public.session_bookings
  set status = 'cancelled',
      cancelled_at = now(),
      credit_batch_id = case when v_refund then null else credit_batch_id end
  where id = p_booking_id;

  if v_refund then
    perform public.refund_credits_to_batch(v_batch, 1, v_start);
  end if;
end; $$;

revoke execute on function public.cancel_booking(uuid) from public, anon;
grant execute on function public.cancel_booking(uuid) to authenticated;

create or replace function public.admin_set_booking_status(p_booking_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
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
  v_release_credit boolean := false;
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

  v_release_credit := p_status in ('waitlisted', 'declined', 'cancelled')
    and v_current in ('requested', 'confirmed', 'attended', 'no_show')
    and v_batch is not null;

  update public.session_bookings
    set status = p_status,
        -- Waitlisted places never hold a credit. Cancel/decline after a held
        -- place also clear the FK once the refund path owns the release.
        credit_batch_id = case
          when p_status = 'waitlisted' then null
          when v_release_credit then null
          else v_batch
        end,
        cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end
    where id = p_booking_id;

  if v_release_credit then
    if v_start is null then
      select start_time into v_start from public.class_sessions where id = v_session;
    end if;
    perform public.refund_credits_to_batch(v_batch, 1, v_start);
  end if;
end; $$;

revoke execute on function public.admin_set_booking_status(uuid, text) from public, anon;
grant execute on function public.admin_set_booking_status(uuid, text) to authenticated;

create or replace function public.admin_cancel_class_session(p_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

  with targets as (
    select id, credit_batch_id, status as previous_status
      from public.session_bookings
     where class_session_id = p_session_id
       and status in ('requested', 'confirmed', 'waitlisted', 'attended', 'no_show')
     for update
  ), cancelled_bookings as (
    update public.session_bookings booking
       set status = 'cancelled',
           cancelled_at = now(),
           credit_batch_id = null
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
       and not exists (
         select 1
           from public.orders o
          where o.id = credits.order_id
            and o.status = 'refunded'
       )
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
$$;

revoke all on function public.admin_cancel_class_session(uuid) from public, anon;
grant execute on function public.admin_cancel_class_session(uuid) to authenticated;

insert into public.xert_schema_capabilities (capability)
values ('booking_credit_release_clears_batch')
on conflict (capability) do update set installed_at = excluded.installed_at;
