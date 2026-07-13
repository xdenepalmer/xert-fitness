-- Durable identity for manual recovery of paid Stripe checkouts.
alter table public.orders
  add column if not exists reconciled_at timestamptz,
  add column if not exists reconciled_by uuid references auth.users(id) on delete set null;

create index if not exists orders_unresolved_checkout_idx
  on public.orders(created_at desc, id desc)
  where status in ('pending', 'failed');

create table if not exists public.xert_schema_capabilities (
  capability text primary key,
  installed_at timestamptz not null default now()
);
alter table public.xert_schema_capabilities enable row level security;
insert into public.xert_schema_capabilities (capability)
values ('checkout_reconciliation') on conflict (capability) do nothing;
