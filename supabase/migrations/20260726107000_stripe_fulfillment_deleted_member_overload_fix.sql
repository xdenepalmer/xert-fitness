-- Repair: 20260726002000 accidentally CREATE OR REPLACEd the retired
-- p_expires_at overload of fulfill_stripe_checkout. Postgres treats different
-- argument lists as separate functions, so the live
-- (..., integer, integer) / p_credit_validity_days overload — the one
-- api/stripe-webhook.js calls via checkoutFulfillmentRPCPayload — never
-- received the deleted-member tolerance.
--
-- Result: a NULL orders.user_id (ON DELETE SET NULL after account deletion)
-- still raised 'Stripe fulfillment does not match the recorded order', the
-- webhook ledger stayed failed, and paymentFulfillmentDeliveryIsHealthy()
-- paused checkout for every member.
--
-- This migration drops the dead overload and applies the null-user settle
-- behaviour to the authoritative live signature only.

drop function if exists public.fulfill_stripe_checkout(
  text, uuid, uuid, text, integer, text, text, timestamptz, integer, timestamptz
);

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
as $$
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
      email = coalesce(nullif(btrim(p_email), ''), orders.email),
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
$$;

revoke execute on function public.fulfill_stripe_checkout(
  text, uuid, uuid, text, integer, text, text, timestamptz, integer, integer
) from public, anon, authenticated;
grant execute on function public.fulfill_stripe_checkout(
  text, uuid, uuid, text, integer, text, text, timestamptz, integer, integer
) to service_role;

insert into public.xert_schema_capabilities (capability)
values ('stripe_fulfillment_deleted_member')
on conflict (capability) do update set installed_at = excluded.installed_at;
