-- Clear credit_batch_id on the remaining release / revoke paths that 26119
-- missed.
--
-- 1. admin_record_session_attendance refunds remaining for unactioned
--    requested places, then cancels them — but left credit_batch_id set. The
--    booking desk "Credit reserved" badge and any later consumer still treated
--    those cancelled rows as charged after the pack was topped back up.
-- 2. reconcile_stripe_order_refund cancels open requested/confirmed places on
--    a Stripe-refunded pack and zeroes remaining, but also left the FK. Those
--    cancelled rows kept looking reserved against a pack that no longer exists.
--
-- Attended / no_show rows still keep credit_batch_id so refund_credits_to_batch
-- / class-cancel release can refuse to restore credits onto Stripe-refunded
-- packs (refund_skips_stripe_refunded_batches).

create or replace function public.admin_record_session_attendance(
  p_session_id uuid,
  p_attended_ids uuid[],
  p_no_show_ids uuid[]
)
returns integer language plpgsql security definer set search_path = public as $$
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
   where batch.id = released.credit_batch_id
     and not exists (
       select 1
         from public.orders o
        where o.id = batch.order_id
          and o.status = 'refunded'
     );

  -- Release path: credit was returned above (or skipped for a Stripe-refunded
  -- pack). Either way the cancelled request must not keep looking charged.
  update public.session_bookings
     set status = 'cancelled',
         cancelled_at = now(),
         credit_batch_id = null
   where class_session_id = p_session_id
     and status = 'requested';

  update public.class_sessions
     set status = 'completed', public_visible = false, updated_at = now()
   where id = p_session_id;

  return v_updated_count;
end; $$;

revoke execute on function public.admin_record_session_attendance(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.admin_record_session_attendance(uuid, uuid[], uuid[]) to authenticated;

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
values ('roll_call_stripe_refund_clears_credit_batch')
on conflict (capability) do update set installed_at = excluded.installed_at;
