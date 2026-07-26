-- Adversarial pass on fulfill_stripe_checkout / cancel+refund paths /
-- delete_member_account follow-on settlement.
--
-- 1. delete_member_account nulls orders.email before removing auth.users.
--    A later checkout.session.completed (or admin reconcile) still called
--    fulfill_stripe_checkout, which wrote Stripe's p_email back onto the
--    orphaned order — re-identifying a deleted buyer on a retained financial
--    row. Force email null whenever orders.user_id is already null.
--
-- 2. reconcile_stripe_order_refund zeroes remaining and marks the order
--    refunded, but leaves attended/no_show bookings holding credit_batch_id.
--    A later cancel_booking helper path, admin_set_booking_status,
--    admin_cancel_class_session or roll-call release then restored credits onto
--    a pack the member had already been paid back for. Skip refunds when the
--    batch's order is refunded (manual grants with null order_id still refund).
--
-- Re-run safe: keep bodies that already erase deleted-buyer email and skip
-- Stripe-refunded packs on refund / roll-call / class-cancel paths.

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
  update public.credit_batches batch
     set remaining = batch.remaining + p_count,
         expires_at = public.credit_batch_expires_at_after_refund(batch.expires_at, p_anchor)
   where batch.id = p_batch_id
     and not exists (
       select 1
         from public.orders o
        where o.id = batch.order_id
          and o.status = 'refunded'
     );
end;
$body$;
$fn$;
  end if;
end;
$install_refund_credits_to_batch$;

revoke all on function public.refund_credits_to_batch(uuid, integer, timestamptz)
  from public, anon, authenticated;

do $install_fulfill_stripe_checkout$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'fulfill_stripe_checkout'
    and pg_get_function_identity_arguments(p.oid) = 'p_checkout_session_id text, p_user_id uuid, p_product_id uuid, p_email text, p_amount_cents integer, p_currency text, p_payment_intent_id text, p_paid_at timestamp with time zone, p_credit_total integer, p_credit_validity_days integer';
  if v_def is not null and v_def ilike '%user_id is null then null%' then
    raise notice 'keeping newer fulfill_stripe_checkout';
  else
    execute $fn$
create or replace function public.fulfill_stripe_checkout(
  p_checkout_session_id text,
  p_user_id uuid,
  p_product_id uuid,
  p_email text,
  p_amount_cents integer,
  p_currency text,
  p_payment_intent_id text,
  p_paid_at timestamptz,
  p_credit_total integer,
  p_credit_validity_days integer
)
returns table(fulfilled_order_id uuid, final_status text, credit_created boolean)
language plpgsql
security definer
set search_path = ''
as $body$
declare
  v_order public.orders%rowtype;
  v_credit_rows integer := 0;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Stripe fulfillment requires service role';
  end if;
  if nullif(btrim(p_checkout_session_id), '') is null
     or nullif(btrim(p_payment_intent_id), '') is null
     or p_user_id is null
     or p_product_id is null
     or p_amount_cents is null or p_amount_cents <= 0
     or lower(coalesce(p_currency, '')) <> 'aud'
     or p_paid_at is null
     or p_credit_total is null or p_credit_total <= 0
     or p_credit_validity_days is null or p_credit_validity_days <= 0 then
    raise exception 'Invalid Stripe fulfillment payload';
  end if;

  select orders.* into v_order
  from public.orders as orders
  where orders.stripe_checkout_session_id = p_checkout_session_id
  for update;

  if v_order.id is null then
    raise exception 'Stripe fulfillment requires a recorded pending order';
  end if;

  -- A NULL user_id means the buyer deleted their account after this order was
  -- recorded. Every other identity field must still match exactly.
  if (v_order.user_id is not null and v_order.user_id is distinct from p_user_id)
     or v_order.product_id is distinct from p_product_id
     or v_order.amount_cents is distinct from p_amount_cents
     or lower(coalesce(v_order.currency, '')) <> lower(p_currency)
     or v_order.credit_total is distinct from p_credit_total
     or v_order.credit_validity_days is distinct from p_credit_validity_days
     or (v_order.stripe_payment_intent_id is not null
         and v_order.stripe_payment_intent_id <> p_payment_intent_id) then
    raise exception 'Stripe fulfillment does not match the recorded order';
  end if;

  if v_order.status = 'refunded' then
    return query select v_order.id, v_order.status, false;
    return;
  end if;
  if v_order.status not in ('pending', 'failed', 'paid') then
    raise exception 'Stripe order has an unsupported state: %', v_order.status;
  end if;

  update public.orders as orders
  set status = 'paid',
      -- Account deletion nulls email; never re-attach Stripe's address onto an
      -- orphaned financial row, and clear any leftover address if auth was
      -- removed outside delete_member_account.
      email = case
        when orders.user_id is null then null
        else coalesce(nullif(btrim(p_email), ''), orders.email)
      end,
      stripe_payment_intent_id = coalesce(orders.stripe_payment_intent_id, p_payment_intent_id),
      paid_at = coalesce(orders.paid_at, p_paid_at)
  where orders.id = v_order.id
  returning orders.* into v_order;

  -- No account left to credit. The payment is still settled above so the order
  -- and the webhook ledger stay accurate and checkout is not gated.
  if v_order.user_id is not null then
    insert into public.credit_batches (
      user_id, product_id, order_id, total, remaining, expires_at
    ) values (
      v_order.user_id, p_product_id, v_order.id, v_order.credit_total, v_order.credit_total,
      v_order.paid_at + make_interval(days => v_order.credit_validity_days)
    )
    on conflict (order_id) do nothing;
    get diagnostics v_credit_rows = row_count;
  end if;

  return query select v_order.id, v_order.status, v_credit_rows = 1;
end;
$body$;
$fn$;
  end if;
end;
$install_fulfill_stripe_checkout$;

revoke execute on function public.fulfill_stripe_checkout(
  text, uuid, uuid, text, integer, text, text, timestamptz, integer, integer
) from public, anon, authenticated;
grant execute on function public.fulfill_stripe_checkout(
  text, uuid, uuid, text, integer, text, text, timestamptz, integer, integer
) to service_role;

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
  if v_def is not null
     and v_def ilike '%status = ''requested''%'
     and v_def ilike '%status = ''refunded''%' then
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
   where batch.id = released.credit_batch_id
     and not exists (
       select 1
         from public.orders o
        where o.id = batch.order_id
          and o.status = 'refunded'
     );

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
  if v_def is not null
     and v_def ilike '%attended%'
     and v_def ilike '%no_show%'
     and v_def ilike '%status = ''refunded''%' then
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
$body$;
$fn$;
  end if;
end;
$install_admin_cancel_class_session$;

revoke all on function public.admin_cancel_class_session(uuid) from public, anon;
grant execute on function public.admin_cancel_class_session(uuid) to authenticated;

insert into public.xert_schema_capabilities (capability)
values ('stripe_fulfillment_deleted_email_erasure') on conflict (capability) do nothing;
insert into public.xert_schema_capabilities (capability)
values ('refund_skips_stripe_refunded_batches') on conflict (capability) do nothing;
