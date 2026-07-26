-- Refuses a session pack priced in a currency fulfilment can never settle.
--
-- products.currency was only ever constrained to `^[a-zA-Z]{3}$`, in the CHECK
-- on the table and again in both admin_update_product overloads. Fulfilment is
-- AUD-only in two places that are far downstream of the money: the webhook
-- handler throws unless the Checkout currency is exactly 'aud', and
-- fulfill_stripe_checkout raises unless `lower(p_currency) = 'aud'`.
--
-- So an admin could set a pack to nzd through the ordinary product form, a
-- member could buy it, Stripe would charge them, and the fulfilment event would
-- fail permanently. Nothing in between caught it: the pending-order guard
-- compares the Checkout currency to the product's own currency, so an nzd/nzd
-- pair passes, and it validates only credit total and validity days. Worse,
-- api/checkout.js pauses all checkout while any fulfilment event is failed, so
-- one mispriced pack would stop the store selling anything to anyone.
--
-- api/checkout.js now requires AUD before the Checkout session is created, and
-- the launch-readiness probe shares that assertion. This is the backstop
-- underneath both, at the point the value is stored.
--
-- Existing non-AUD rows are normalised first so the constraint can be added
-- without a manual repair step; there should be none, but a row that slipped
-- through is a pack that could never have been fulfilled anyway.

update public.products set currency = 'aud' where lower(coalesce(currency, '')) <> 'aud';

alter table public.products drop constraint if exists products_currency_aud_only;
alter table public.products
  add constraint products_currency_aud_only check (lower(currency) = 'aud');

-- The version-checked overload validates the payload before it writes, so it
-- reports the same INVALID_PRODUCT_PAYLOAD the admin form already handles
-- rather than surfacing a raw constraint violation. Copied from
-- 20260714020000 with the currency rule tightened; the two-argument overload is
-- revoked from authenticated and is not reinstated here.
create or replace function public.admin_update_product(
  p_product_id uuid,
  p_product jsonb,
  p_expected_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current public.products%rowtype;
  v_update record;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_product_id is null then raise exception 'PRODUCT_REQUIRED'; end if;
  if p_product is null then raise exception 'PRODUCT_PAYLOAD_REQUIRED'; end if;
  if p_expected_updated_at is null then raise exception 'PRODUCT_VERSION_REQUIRED'; end if;

  select * into v_update
  from jsonb_to_record(p_product) as product_data(
    name text,
    description text,
    price_cents integer,
    currency text,
    sessions_count integer,
    validity_days integer,
    stripe_price_id text,
    featured boolean,
    active boolean,
    sort_order integer
  );

  if v_update.name is null or btrim(v_update.name) = ''
     or v_update.price_cents is null or v_update.price_cents <= 0
     or v_update.sessions_count is null or v_update.sessions_count <= 0
     or v_update.validity_days is null or v_update.validity_days <= 0
     or v_update.currency is null or lower(v_update.currency) <> 'aud'
     or v_update.sort_order is null or v_update.sort_order < 0
     or v_update.featured is null or v_update.active is null
     or (v_update.stripe_price_id is not null and v_update.stripe_price_id !~ '^price_[A-Za-z0-9]+$') then
    raise exception 'INVALID_PRODUCT_PAYLOAD';
  end if;

  select *
    into v_current
  from public.products
  where id = p_product_id
  for update;

  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
  if v_current.updated_at is distinct from p_expected_updated_at then
    raise exception 'PRODUCT_STALE';
  end if;

  if v_current.stripe_price_id is not null
     and v_current.stripe_price_id = v_update.stripe_price_id
     and (
       v_current.price_cents <> v_update.price_cents
       or lower(v_current.currency) <> lower(v_update.currency)
     ) then
    raise exception 'STRIPE_PRICE_REFRESH_REQUIRED';
  end if;

  update public.products
  set name = btrim(v_update.name),
      description = nullif(btrim(v_update.description), ''),
      price_cents = v_update.price_cents,
      currency = lower(v_update.currency),
      sessions_count = v_update.sessions_count,
      validity_days = v_update.validity_days,
      stripe_price_id = nullif(btrim(v_update.stripe_price_id), ''),
      featured = v_update.featured,
      active = v_update.active,
      sort_order = v_update.sort_order
  where id = p_product_id;

  return p_product_id;
end;
$$;

revoke execute on function public.admin_update_product(uuid, jsonb, timestamptz) from public, anon;
grant execute on function public.admin_update_product(uuid, jsonb, timestamptz) to authenticated;

insert into public.xert_schema_capabilities (capability)
values ('product_currency_aud_only') on conflict (capability) do nothing;
