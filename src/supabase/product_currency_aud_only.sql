-- Fulfilment hard-requires AUD (fulfill_stripe_checkout and checkout
-- fulfillment both reject any other currency). The products table and admin
-- update RPCs previously accepted any 3-letter code, so an admin typo (nzd)
-- could charge a member and then fail fulfillment — leaving a failed webhook
-- ledger row that pauses store-wide checkout.
--
-- Lock products to AUD at the table constraint and in both product update
-- RPC overloads so the catalog cannot drift from what fulfilment will accept.

-- Normalize any historical non-AUD rows before tightening the constraint.
update public.products
set currency = 'aud'
where lower(currency) is distinct from 'aud';

alter table public.products
  drop constraint if exists products_currency_code_check;
alter table public.products
  drop constraint if exists products_currency_check;
alter table public.products
  drop constraint if exists products_currency_aud_check;
alter table public.products
  add constraint products_currency_aud_check
  check (lower(currency) = 'aud');

create or replace function public.admin_update_product(
  p_product_id uuid,
  p_product jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.products%rowtype;
  v_update record;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_product_id is null then raise exception 'PRODUCT_REQUIRED'; end if;
  if p_product is null then raise exception 'PRODUCT_PAYLOAD_REQUIRED'; end if;

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

  select * into v_current
  from public.products
  where id = p_product_id
  for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;

  if v_current.stripe_price_id is not null
     and v_current.stripe_price_id = v_update.stripe_price_id
     and (v_current.price_cents <> v_update.price_cents
       or lower(v_current.currency) <> lower(v_update.currency)) then
    raise exception 'STRIPE_PRICE_REFRESH_REQUIRED';
  end if;

  update public.products
  set name = btrim(v_update.name),
      description = nullif(btrim(v_update.description), ''),
      price_cents = v_update.price_cents,
      currency = 'aud',
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
      currency = 'aud',
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

revoke execute on function public.admin_update_product(uuid, jsonb) from public, anon;
grant execute on function public.admin_update_product(uuid, jsonb) to authenticated;
revoke execute on function public.admin_update_product(uuid, jsonb, timestamptz) from public, anon;
grant execute on function public.admin_update_product(uuid, jsonb, timestamptz) to authenticated;

insert into public.xert_schema_capabilities (capability)
values ('product_currency_aud_only') on conflict (capability) do nothing;
