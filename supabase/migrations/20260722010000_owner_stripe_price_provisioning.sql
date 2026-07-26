-- Link a server-verified Stripe Price to an exact private pack revision.
-- Remote Stripe creation happens first and is idempotent; this transaction is
-- the compare-and-set commit point and never publishes the pack.
create or replace function public.admin_link_verified_product_price(
  p_product_id uuid,
  p_stripe_price_id text,
  p_expected_updated_at timestamptz,
  p_actor_id uuid
)
returns public.products
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_product public.products%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'SERVER_ONLY'; end if;
  if p_actor_id is null or not exists (
    select 1 from public.profiles where id = p_actor_id and role = 'admin'
  ) then
    raise exception 'ADMIN_ONLY';
  end if;
  if p_product_id is null
     or p_expected_updated_at is null
     or p_stripe_price_id is null
     or btrim(p_stripe_price_id) !~ '^price_[A-Za-z0-9]+$' then
    raise exception 'INVALID_PRODUCT_PRICE_LINK';
  end if;

  select * into v_product
  from public.products
  where id = p_product_id
  for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
  if v_product.updated_at is distinct from p_expected_updated_at then raise exception 'PRODUCT_STALE'; end if;
  if v_product.active or v_product.stripe_price_id is not null then
    raise exception 'PRODUCT_PRICE_ALREADY_LINKED';
  end if;

  -- Preserve immutable audit authorship even though the trusted server owns
  -- the service-role database connection.
  perform set_config('request.jwt.claim.sub', p_actor_id::text, true);
  update public.products
  set stripe_price_id = btrim(p_stripe_price_id)
  where id = p_product_id
    and active is false
    and stripe_price_id is null
    and updated_at = p_expected_updated_at
  returning * into v_product;
  if not found then raise exception 'PRODUCT_STALE'; end if;
  if v_product.active or v_product.stripe_price_id <> btrim(p_stripe_price_id) then
    raise exception 'PRODUCT_PRICE_LINK_FAILED';
  end if;
  return v_product;
end;
$$;

revoke all on function public.admin_link_verified_product_price(uuid, text, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_link_verified_product_price(uuid, text, timestamptz, uuid)
  to service_role;

insert into public.xert_schema_capabilities (capability)
values ('owner_stripe_price_provisioning')
on conflict (capability) do update set installed_at = excluded.installed_at;
