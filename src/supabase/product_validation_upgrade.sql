-- ============================================================================
-- XERT Fitness -- Product validation upgrade
-- ============================================================================
-- Run in the Supabase SQL Editor for an EXISTING XERT installation. The
-- constraints are NOT VALID so any historical anomaly can be reviewed without
-- blocking the migration, while all new product inserts and edits are checked.
-- ============================================================================

alter table public.products
  drop constraint if exists products_positive_price_cents_check;
alter table public.products
  add constraint products_positive_price_cents_check
  check (price_cents > 0) not valid;

alter table public.products
  drop constraint if exists products_currency_code_check;
alter table public.products
  add constraint products_currency_code_check
  check (currency ~ '^[a-zA-Z]{3}$') not valid;

alter table public.products
  drop constraint if exists products_positive_sessions_count_check;
alter table public.products
  add constraint products_positive_sessions_count_check
  check (sessions_count > 0) not valid;

alter table public.products
  drop constraint if exists products_positive_validity_days_check;
alter table public.products
  add constraint products_positive_validity_days_check
  check (validity_days > 0) not valid;

-- Safe post-run check:
-- select slug, price_cents, currency, sessions_count, validity_days
-- from public.products
-- where price_cents <= 0
--    or sessions_count <= 0
--    or validity_days <= 0
--    or currency !~ '^[a-zA-Z]{3}$';
