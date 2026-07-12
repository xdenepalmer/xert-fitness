-- Run in Supabase SQL Editor for existing XERT projects.
-- Supports exact paged dashboard revenue and active-credit scans.

create index if not exists orders_status_created_idx
  on public.orders(status, created_at desc, id desc);

create index if not exists credit_batches_active_idx
  on public.credit_batches(id)
  where remaining > 0;
