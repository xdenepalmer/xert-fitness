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

alter table public.orders
  add column if not exists credit_total integer,
  add column if not exists credit_validity_days integer;

alter table public.orders drop constraint if exists orders_credit_total_check;
alter table public.orders add constraint orders_credit_total_check
  check (credit_total is null or credit_total > 0) not valid;
alter table public.orders drop constraint if exists orders_credit_validity_days_check;
alter table public.orders add constraint orders_credit_validity_days_check
  check (credit_validity_days is null or credit_validity_days > 0) not valid;

create or replace function public.guard_stripe_order_terms()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.stripe_checkout_session_id is not null
     and (new.credit_total is null or new.credit_validity_days is null) then
    raise exception 'Stripe orders require a purchased credit terms snapshot';
  end if;
  if tg_op = 'UPDATE' and (
    new.credit_total is distinct from old.credit_total
    or new.credit_validity_days is distinct from old.credit_validity_days
  ) then
    raise exception 'Stripe order credit terms are immutable';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_stripe_order_terms_trigger on public.orders;
create trigger guard_stripe_order_terms_trigger
before insert or update on public.orders
for each row execute function public.guard_stripe_order_terms();

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

  -- No account left to credit when the buyer has deleted their membership.
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

create table if not exists public.xert_schema_capabilities (
  capability text primary key,
  installed_at timestamptz not null default now()
);
alter table public.xert_schema_capabilities enable row level security;
insert into public.xert_schema_capabilities (capability)
values ('stripe_payment_fulfillment') on conflict (capability) do nothing;
insert into public.xert_schema_capabilities (capability)
values ('stripe_pending_order_guard') on conflict (capability) do nothing;
insert into public.xert_schema_capabilities (capability)
values ('stripe_order_terms_snapshot') on conflict (capability) do nothing;
insert into public.xert_schema_capabilities (capability)
values ('stripe_fulfillment_deleted_member') on conflict (capability) do nothing;
