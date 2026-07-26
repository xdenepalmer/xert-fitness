-- Route browser product edits through a transactional guard. A stored Stripe
-- Price ID represents a fixed amount and currency, so retaining it while
-- changing either field would make checkout reject every purchase.

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
     or v_update.currency is null or v_update.currency !~ '^[a-zA-Z]{3}$'
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
       or lower(v_current.currency) <> lower(v_update.currency)
       or v_current.sessions_count <> v_update.sessions_count
       or v_current.validity_days <> v_update.validity_days) then
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

revoke execute on function public.admin_update_product(uuid, jsonb) from public, anon;
grant execute on function public.admin_update_product(uuid, jsonb) to authenticated;

-- Admins still read inactive packs and create drafts directly. Updates are
-- exclusively performed by the SECURITY DEFINER function above.
drop policy if exists "products_admin_all" on public.products;
drop policy if exists "products_admin_read" on public.products;
drop policy if exists "products_admin_insert" on public.products;
create policy "products_admin_read" on public.products
  for select to authenticated using (public.is_admin());
create policy "products_admin_insert" on public.products
  for insert to authenticated with check (public.is_admin());

create table if not exists public.xert_schema_capabilities (
  capability text primary key,
  installed_at timestamptz not null default now()
);
alter table public.xert_schema_capabilities enable row level security;
drop policy if exists "xert_schema_capabilities_admin_read" on public.xert_schema_capabilities;
create policy "xert_schema_capabilities_admin_read" on public.xert_schema_capabilities
  for select to authenticated using (public.is_admin());
insert into public.xert_schema_capabilities (capability)
values ('product_update_guard') on conflict (capability) do nothing;

create or replace function public.xert_public_capabilities()
returns table (capability text)
language sql security definer stable set search_path = public as $$
  select c.capability from public.xert_schema_capabilities c order by c.capability;
$$;
revoke execute on function public.xert_public_capabilities() from public;
grant execute on function public.xert_public_capabilities() to anon, authenticated;
