-- Durable full-refund reconciliation. Stripe remains the payment authority;
-- this function records the completed refund and atomically revokes only the
-- unused credits from the corresponding order.

alter table public.orders
  add column if not exists refunded_at timestamptz,
  add column if not exists refunded_amount_cents integer not null default 0,
  add column if not exists stripe_charge_id text;

alter table public.orders
  drop constraint if exists orders_refunded_amount_nonnegative_check;
alter table public.orders
  add constraint orders_refunded_amount_nonnegative_check
  check (refunded_amount_cents >= 0) not valid;

create table if not exists public.stripe_refunds (
  refund_id text primary key,
  stripe_event_id text not null unique,
  order_id uuid not null unique references public.orders(id),
  stripe_charge_id text,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null check (currency ~ '^[a-zA-Z]{3}$'),
  credits_revoked integer not null default 0 check (credits_revoked >= 0),
  credits_consumed integer not null default 0 check (credits_consumed >= 0),
  bookings_cancelled integer not null default 0 check (bookings_cancelled >= 0),
  refunded_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists stripe_refunds_refunded_at_idx
  on public.stripe_refunds(refunded_at desc);

create or replace function public.reconcile_stripe_order_refund(
  p_refund_id text,
  p_event_id text,
  p_payment_intent_id text,
  p_charge_id text,
  p_amount_cents integer,
  p_currency text,
  p_refunded_at timestamptz
)
returns table (order_id uuid, credits_revoked integer, credits_consumed integer, bookings_cancelled integer)
language plpgsql
security definer
set search_path = public
as $$
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
     or p_refunded_at is null then
    raise exception 'INVALID_REFUND_PAYLOAD';
  end if;

  perform 1 from public.orders
  where stripe_payment_intent_id = p_payment_intent_id
  for update;
  select count(*)::integer into v_match_count
  from public.orders where stripe_payment_intent_id = p_payment_intent_id;
  if v_match_count = 0 then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_match_count > 1 then raise exception 'AMBIGUOUS_PAYMENT_INTENT'; end if;

  select * into v_order from public.orders
  where stripe_payment_intent_id = p_payment_intent_id;
  if v_order.amount_cents <> p_amount_cents
     or lower(v_order.currency) <> lower(p_currency) then
    raise exception 'REFUND_ORDER_MISMATCH';
  end if;

  select * into v_existing from public.stripe_refunds
  where stripe_refunds.order_id = v_order.id;
  if found then
    return query select v_existing.order_id, v_existing.credits_revoked, v_existing.credits_consumed, v_existing.bookings_cancelled;
    return;
  end if;

  select * into v_batch from public.credit_batches
  where credit_batches.order_id = v_order.id
  for update;

  bookings_cancelled := 0;
  if v_batch.id is not null then
    perform 1 from public.session_bookings
    where credit_batch_id = v_batch.id and status in ('requested', 'confirmed')
    for update;
    select count(*)::integer into bookings_cancelled from public.session_bookings
    where credit_batch_id = v_batch.id and status in ('requested', 'confirmed');
    update public.session_bookings
    set status = 'cancelled', cancelled_at = coalesce(cancelled_at, p_refunded_at)
    where credit_batch_id = v_batch.id and status in ('requested', 'confirmed');
  end if;
  v_reclaimable := least(coalesce(v_batch.total, 0), coalesce(v_batch.remaining, 0) + bookings_cancelled);
  credits_revoked := greatest(v_reclaimable, 0);
  credits_consumed := greatest(coalesce(v_batch.total, 0) - v_reclaimable, 0);
  order_id := v_order.id;

  if v_batch.id is not null then
    update public.credit_batches set remaining = 0 where id = v_batch.id;
  end if;

  update public.orders
  set status = 'refunded',
      refunded_at = p_refunded_at,
      refunded_amount_cents = p_amount_cents,
      stripe_charge_id = nullif(btrim(p_charge_id), '')
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

revoke execute on function public.reconcile_stripe_order_refund(text, text, text, text, integer, text, timestamptz) from public, anon, authenticated;
grant execute on function public.reconcile_stripe_order_refund(text, text, text, text, integer, text, timestamptz) to service_role;

alter table public.stripe_refunds enable row level security;
drop policy if exists "stripe_refunds_admin_read" on public.stripe_refunds;
create policy "stripe_refunds_admin_read" on public.stripe_refunds
  for select to authenticated using (public.is_admin());

create table if not exists public.xert_schema_capabilities (
  capability text primary key,
  installed_at timestamptz not null default now()
);
alter table public.xert_schema_capabilities enable row level security;
insert into public.xert_schema_capabilities (capability)
values ('stripe_refund_reconciliation') on conflict (capability) do nothing;
