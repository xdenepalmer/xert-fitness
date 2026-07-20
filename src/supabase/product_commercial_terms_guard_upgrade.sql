drop function if exists public.admin_update_product(uuid, jsonb, timestamptz);
create function public.admin_update_product(
  p_product_id uuid,
  p_product jsonb,
  p_expected_updated_at timestamptz
)
returns public.products
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current public.products%rowtype;
  v_update record;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_ONLY';
  end if;
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
     or length(btrim(v_update.name)) > 120
     or length(coalesce(btrim(v_update.description), '')) > 2000
     or v_update.price_cents is null or v_update.price_cents <= 0
     or v_update.sessions_count is null or v_update.sessions_count not between 1 and 1000
     or v_update.validity_days is null or v_update.validity_days not between 1 and 3650
     or v_update.currency is null or v_update.currency !~ '^[a-zA-Z]{3}$'
     or v_update.sort_order is null or v_update.sort_order not between 0 and 10000
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
       or v_current.sessions_count <> v_update.sessions_count
       or v_current.validity_days <> v_update.validity_days
     ) then
    raise exception 'STRIPE_PRICE_REFRESH_REQUIRED';
  end if;

  if v_update.active and (
       not v_current.active
       or v_current.stripe_price_id is distinct from nullif(btrim(v_update.stripe_price_id), '')
       or v_current.price_cents <> v_update.price_cents
       or lower(v_current.currency) <> lower(v_update.currency)
       or v_current.sessions_count <> v_update.sessions_count
       or v_current.validity_days <> v_update.validity_days
     ) then
    raise exception 'PRODUCT_ACTIVATION_VERIFICATION_REQUIRED';
  end if;

  if v_update.active and nullif(btrim(v_update.stripe_price_id), '') is null then
    raise exception 'ACTIVE_PRODUCT_REQUIRES_STRIPE_PRICE';
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
  where id = p_product_id
  returning * into v_current;

  return v_current;
end;
$$;

revoke execute on function public.admin_update_product(uuid, jsonb, timestamptz) from public, anon;
grant execute on function public.admin_update_product(uuid, jsonb, timestamptz) to authenticated;

create or replace function public.admin_create_product(p_slug text, p_product jsonb)
returns public.products
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_product record;
  v_created public.products%rowtype;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_ONLY';
  end if;
  if p_product is null then raise exception 'PRODUCT_PAYLOAD_REQUIRED'; end if;

  select * into v_product
  from jsonb_to_record(p_product) as product_data(
    name text,
    description text,
    price_cents integer,
    currency text,
    sessions_count integer,
    validity_days integer,
    featured boolean,
    sort_order integer
  );

  if p_slug is null
     or length(p_slug) > 80
     or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     or v_product.name is null or btrim(v_product.name) = ''
     or length(btrim(v_product.name)) > 120
     or length(coalesce(btrim(v_product.description), '')) > 2000
     or v_product.price_cents is null or v_product.price_cents <= 0
     or v_product.currency is null or v_product.currency !~ '^[a-zA-Z]{3}$'
     or v_product.sessions_count is null or v_product.sessions_count not between 1 and 1000
     or v_product.validity_days is null or v_product.validity_days not between 1 and 3650
     or v_product.featured is null
     or v_product.sort_order is null or v_product.sort_order not between 0 and 10000 then
    raise exception 'INVALID_PRODUCT_PAYLOAD';
  end if;

  insert into public.products (
    slug, name, description, price_cents, currency, sessions_count,
    validity_days, stripe_price_id, featured, active, sort_order
  ) values (
    p_slug,
    btrim(v_product.name),
    nullif(btrim(v_product.description), ''),
    v_product.price_cents,
    lower(v_product.currency),
    v_product.sessions_count,
    v_product.validity_days,
    null,
    v_product.featured,
    false,
    v_product.sort_order
  )
  returning * into v_created;

  return v_created;
end;
$$;

revoke all on function public.admin_create_product(text, jsonb) from public, anon;
grant execute on function public.admin_create_product(text, jsonb) to authenticated;

create or replace function public.admin_apply_verified_product(
  p_product_id uuid,
  p_product jsonb,
  p_expected_updated_at timestamptz,
  p_actor_id uuid
)
returns public.products
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current public.products%rowtype;
  v_update record;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'SERVER_ONLY'; end if;
  if p_actor_id is null or not exists (
    select 1 from public.profiles where id = p_actor_id and role = 'admin'
  ) then
    raise exception 'ADMIN_ONLY';
  end if;
  if p_product_id is null or p_product is null or p_expected_updated_at is null then
    raise exception 'PRODUCT_ACTIVATION_REQUIRED';
  end if;

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
     or length(btrim(v_update.name)) > 120
     or length(coalesce(btrim(v_update.description), '')) > 2000
     or v_update.price_cents is null or v_update.price_cents <= 0
     or v_update.sessions_count is null or v_update.sessions_count not between 1 and 1000
     or v_update.validity_days is null or v_update.validity_days not between 1 and 3650
     or v_update.currency is null or v_update.currency !~ '^[a-zA-Z]{3}$'
     or v_update.stripe_price_id is null or v_update.stripe_price_id !~ '^price_[A-Za-z0-9]+$'
     or v_update.featured is null or v_update.active is distinct from true
     or v_update.sort_order is null or v_update.sort_order not between 0 and 10000 then
    raise exception 'INVALID_PRODUCT_PAYLOAD';
  end if;

  select * into v_current
  from public.products
  where id = p_product_id
  for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
  if v_current.updated_at is distinct from p_expected_updated_at then raise exception 'PRODUCT_STALE'; end if;

  perform set_config('request.jwt.claim.sub', p_actor_id::text, true);
  update public.products
  set name = btrim(v_update.name),
      description = nullif(btrim(v_update.description), ''),
      price_cents = v_update.price_cents,
      currency = lower(v_update.currency),
      sessions_count = v_update.sessions_count,
      validity_days = v_update.validity_days,
      stripe_price_id = btrim(v_update.stripe_price_id),
      featured = v_update.featured,
      active = true,
      sort_order = v_update.sort_order
  where id = p_product_id
  returning * into v_current;

  return v_current;
end;
$$;

revoke all on function public.admin_apply_verified_product(uuid, jsonb, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.admin_apply_verified_product(uuid, jsonb, timestamptz, uuid) to service_role;

drop policy if exists "products_admin_insert" on public.products;
revoke insert on table public.products from anon, authenticated;

insert into public.xert_schema_capabilities (capability)
values ('product_commercial_terms_guard')
on conflict (capability) do update set installed_at = excluded.installed_at;
