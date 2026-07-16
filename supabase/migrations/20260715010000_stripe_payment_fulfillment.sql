-- Atomically settle a verified Stripe Checkout Session without allowing an
-- older webhook retry to reverse a later refund or duplicate member credits.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.credit_batches'::regclass
      and conname = 'credit_batches_order_id_key'
  ) then
    alter table public.credit_batches
      add constraint credit_batches_order_id_key unique (order_id);
  end if;
end $$;

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
  p_expires_at timestamptz
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
  if nullif(btrim(p_checkout_session_id), '') is null
     or nullif(btrim(p_payment_intent_id), '') is null
     or p_user_id is null
     or p_product_id is null
     or p_amount_cents is null or p_amount_cents <= 0
     or lower(coalesce(p_currency, '')) <> 'aud'
     or p_paid_at is null
     or p_credit_total is null or p_credit_total <= 0 then
    raise exception 'Invalid Stripe fulfillment payload';
  end if;

  select orders.* into v_order
  from public.orders as orders
  where orders.stripe_checkout_session_id = p_checkout_session_id
  for update;

  if v_order.id is null then
    raise exception 'Stripe fulfillment requires a recorded pending order';
  end if;
  if v_order.user_id is distinct from p_user_id
     or v_order.product_id is distinct from p_product_id
     or v_order.amount_cents is distinct from p_amount_cents
     or lower(coalesce(v_order.currency, '')) <> lower(p_currency)
     or (v_order.stripe_payment_intent_id is not null
         and v_order.stripe_payment_intent_id <> p_payment_intent_id) then
    raise exception 'Stripe fulfillment does not match the recorded order';
  end if;

  -- Refund is terminal. A delayed success delivery must never restore the
  -- order or recreate a credit batch after refund reconciliation.
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

  insert into public.credit_batches (
    user_id, product_id, order_id, total, remaining, expires_at
  ) values (
    p_user_id, p_product_id, v_order.id, p_credit_total, p_credit_total, p_expires_at
  )
  on conflict (order_id) do nothing;
  get diagnostics v_credit_rows = row_count;

  return query select v_order.id, v_order.status, v_credit_rows = 1;
end;
$$;

revoke execute on function public.fulfill_stripe_checkout(
  text, uuid, uuid, text, integer, text, text, timestamptz, integer, timestamptz
) from public, anon, authenticated;
grant execute on function public.fulfill_stripe_checkout(
  text, uuid, uuid, text, integer, text, text, timestamptz, integer, timestamptz
) to service_role;

create table if not exists public.xert_schema_capabilities (
  capability text primary key,
  installed_at timestamptz not null default now()
);
alter table public.xert_schema_capabilities enable row level security;
insert into public.xert_schema_capabilities (capability)
values ('stripe_payment_fulfillment') on conflict (capability) do nothing;
insert into public.xert_schema_capabilities (capability)
values ('stripe_pending_order_guard') on conflict (capability) do nothing;
