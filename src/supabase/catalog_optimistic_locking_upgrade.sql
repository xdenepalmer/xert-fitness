alter table public.products
  add column if not exists updated_at timestamptz not null default now();

alter table public.coaches
  add column if not exists updated_at timestamptz not null default now();

alter table public.events
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.touch_catalog_record_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

revoke execute on function public.touch_catalog_record_updated_at() from public, anon, authenticated;

drop trigger if exists products_touch_updated_at on public.products;
create trigger products_touch_updated_at
  before update on public.products
  for each row execute function public.touch_catalog_record_updated_at();

drop trigger if exists coaches_touch_updated_at on public.coaches;
create trigger coaches_touch_updated_at
  before update on public.coaches
  for each row execute function public.touch_catalog_record_updated_at();

drop trigger if exists events_touch_updated_at on public.events;
create trigger events_touch_updated_at
  before update on public.events
  for each row execute function public.touch_catalog_record_updated_at();

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
     or v_update.currency is null or v_update.currency !~ '^[a-zA-Z]{3}$'
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

revoke execute on function public.admin_update_product(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.admin_update_product(uuid, jsonb, timestamptz) from public, anon;
grant execute on function public.admin_update_product(uuid, jsonb, timestamptz) to authenticated;

insert into public.xert_schema_capabilities (capability)
values ('catalog_optimistic_locking')
on conflict (capability) do nothing;
