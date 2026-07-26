-- Stops a roll-call correction charging the member a second credit.
--
-- admin_set_booking_status treats any move into 'requested'/'confirmed' from a
-- status outside ('requested', 'confirmed') as taking a NEW place, so it
-- consumes a credit:
--
--   if p_status in ('requested', 'confirmed')
--      and v_current not in ('requested', 'confirmed') then
--     ... select a credit batch ... update credit_batches set remaining = remaining - 1
--
-- 'attended' and 'no_show' are only reachable FROM 'confirmed' (the function
-- enforces that), so a booking in either state has ALREADY consumed its credit
-- and was never refunded — the refund branch fires only for 'waitlisted',
-- 'declined' and 'cancelled'. Correcting a roll call back to 'confirmed'
-- therefore charged a second credit for the same class.
--
-- The window is ordinary front-desk behaviour: staff mark people in as they
-- arrive, before the class start time, then fix a mis-tap. Once start_time has
-- passed the same transition instead fails with SESSION_IN_PAST, so the web
-- roster dropdown (src/components/admin/ClassCalendarAdmin.jsx) offers an
-- option that either double-charges the member or errors confusingly.
--
-- Verified against PostgreSQL 16: a flip from 'attended' back to 'confirmed'
-- took a member from 9 remaining credits to 8; with this fix it stays at 9.
--
-- 'attended' and 'no_show' now count as already holding their place, for both
-- the credit charge and the waitlist-order check — the member never gave the
-- place up, so no one else can have queued ahead of them for it.
--
-- The refund branch is widened to match. Once 'attended'/'no_show' are treated
-- as holding a credit, cancelling or declining from those states has to return
-- it, or the credit is stranded: charged at confirmation and never given back.
-- That stranding already existed; making the charge side correct without the
-- refund side would have entrenched it.
--
-- Re-run safe: later helpers put credit returns through refund_credits_to_batch
-- (skips Stripe-refunded packs). Keep that shape; this bootstrap still inlines
-- remaining+1 for databases that have never received the helper.

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
    update public.credit_batches set remaining = remaining + 1 where id = v_batch;
  end if;
end; $body$;
$fn$;
  end if;
end;
$install_admin_set_booking_status$;

revoke execute on function public.admin_set_booking_status(uuid, text) from public, anon;
grant execute on function public.admin_set_booking_status(uuid, text) to authenticated;
