-- Clear leftover credit_batch_id on terminal / waitlisted places that never
-- (or no longer) hold a reserved credit.
--
-- 1. cancel_booking / admin skip of a waitlisted place left any pre-26119
--    leftover FK in place (waitlist never holds a credit).
-- 2. Stripe full-refund cancelled open requested/confirmed and nulled those
--    FKs (26120), but late member cancels that already sat at status=cancelled
--    with a consumed credit_batch_id kept pointing at the now-refunded pack.
--    Exports and any credit_batch_id-only consumer still looked "reserved".
--
-- Attended / no_show rows still keep credit_batch_id so
-- refund_skips_stripe_refunded_batches can refuse to restore credits onto a
-- Stripe-refunded pack.

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
      -- Waitlist never holds a credit; clear any leftover marker on withdraw.
      credit_batch_id = case
        when v_refund then null
        when v_status = 'waitlisted' then null
        else credit_batch_id
      end
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
        credit_batch_id = case
          when p_status = 'waitlisted' then null
          when v_release_credit then null
          -- Waitlist skip / cancel must not keep a leftover reserved marker.
          when p_status in ('cancelled', 'declined') and v_current = 'waitlisted' then null
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

create or replace function public.reconcile_stripe_order_refund(
  p_refund_id text, p_event_id text, p_payment_intent_id text, p_charge_id text,
  p_amount_cents integer, p_currency text, p_refunded_at timestamptz
)
returns table (order_id uuid, credits_revoked integer, credits_consumed integer, bookings_cancelled integer)
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
  v_batch public.credit_batches%rowtype;
  v_match_count integer;
  v_existing public.stripe_refunds%rowtype;
  v_reclaimable integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_ONLY'; end if;
  if p_refund_id is null or btrim(p_refund_id) = ''
     or p_event_id is null or btrim(p_event_id) = ''
     or p_payment_intent_id is null or btrim(p_payment_intent_id) = ''
     or p_amount_cents is null or p_amount_cents <= 0
     or p_currency is null or p_currency !~ '^[a-zA-Z]{3}$'
     or p_refunded_at is null then raise exception 'INVALID_REFUND_PAYLOAD'; end if;

  perform 1 from public.orders where stripe_payment_intent_id = p_payment_intent_id for update;
  select count(*)::integer into v_match_count from public.orders where stripe_payment_intent_id = p_payment_intent_id;
  if v_match_count = 0 then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_match_count > 1 then raise exception 'AMBIGUOUS_PAYMENT_INTENT'; end if;
  select * into v_order from public.orders where stripe_payment_intent_id = p_payment_intent_id;
  if v_order.amount_cents <> p_amount_cents or lower(v_order.currency) <> lower(p_currency) then
    raise exception 'REFUND_ORDER_MISMATCH';
  end if;

  select * into v_existing from public.stripe_refunds where stripe_refunds.order_id = v_order.id;
  if found then
    return query select v_existing.order_id, v_existing.credits_revoked, v_existing.credits_consumed, v_existing.bookings_cancelled;
    return;
  end if;
  select * into v_batch from public.credit_batches where credit_batches.order_id = v_order.id for update;
  bookings_cancelled := 0;
  if v_batch.id is not null then
    perform 1 from public.session_bookings
    where credit_batch_id = v_batch.id and status in ('requested', 'confirmed') for update;
    select count(*)::integer into bookings_cancelled from public.session_bookings
    where credit_batch_id = v_batch.id and status in ('requested', 'confirmed');
    -- Pack is being revoked: clear the FK so cancelled places do not keep a
    -- "Credit reserved" marker against a zeroed / refunded batch. Attended /
    -- no_show rows are intentionally left alone for the refunded-pack skip.
    update public.session_bookings
       set status = 'cancelled',
           cancelled_at = coalesce(cancelled_at, p_refunded_at),
           credit_batch_id = null
     where credit_batch_id = v_batch.id
       and status in ('requested', 'confirmed');
    -- Late cancels / waitlist leftovers already terminal still pointed at this
    -- pack after remaining was zeroed — clear those markers too.
    update public.session_bookings
       set credit_batch_id = null
     where credit_batch_id = v_batch.id
       and status in ('cancelled', 'declined', 'waitlisted');
  end if;
  v_reclaimable := least(coalesce(v_batch.total, 0), coalesce(v_batch.remaining, 0) + bookings_cancelled);
  credits_revoked := greatest(v_reclaimable, 0);
  credits_consumed := greatest(coalesce(v_batch.total, 0) - v_reclaimable, 0);
  order_id := v_order.id;
  if v_batch.id is not null then update public.credit_batches set remaining = 0 where id = v_batch.id; end if;
  update public.orders set status = 'refunded', refunded_at = p_refunded_at,
    refunded_amount_cents = p_amount_cents, stripe_charge_id = nullif(btrim(p_charge_id), '')
  where id = v_order.id;
  insert into public.stripe_refunds (
    refund_id, stripe_event_id, order_id, stripe_charge_id, amount_cents,
    currency, credits_revoked, credits_consumed, bookings_cancelled, refunded_at
  ) values (
    btrim(p_refund_id), btrim(p_event_id), v_order.id, nullif(btrim(p_charge_id), ''),
    p_amount_cents, lower(p_currency), credits_revoked, credits_consumed, bookings_cancelled, p_refunded_at
  );
  return next;
end;
$$;

revoke execute on function public.reconcile_stripe_order_refund(text, text, text, text, integer, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.reconcile_stripe_order_refund(text, text, text, text, integer, text, timestamptz)
  to service_role;

create table if not exists public.xert_schema_capabilities (
  capability text primary key,
  installed_at timestamptz not null default now()
);
alter table public.xert_schema_capabilities enable row level security;
drop policy if exists "xert_schema_capabilities_admin_read" on public.xert_schema_capabilities;
create policy "xert_schema_capabilities_admin_read" on public.xert_schema_capabilities
  for select to authenticated using ((select public.is_admin()));
insert into public.xert_schema_capabilities (capability)
values ('terminal_booking_clears_stale_credit_batch')
on conflict (capability) do update set installed_at = excluded.installed_at;
