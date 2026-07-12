-- ============================================================================
-- XERT Fitness -- Stripe fulfilment hardening
-- ============================================================================
-- Run this once in the Supabase SQL Editor for an EXISTING XERT installation
-- before deploying the idempotent Stripe webhook.
--
-- Each Stripe Checkout order can grant exactly one credit batch. This lets a
-- webhook retry repair a partial failure without duplicating a member's pack.
-- The migration is idempotent. It fails safely if historical duplicate grants
-- already exist, so those need an administrator's review rather than deletion.
-- ============================================================================

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.credit_batches'::regclass
      and conname = 'credit_batches_order_id_key'
  ) then
    alter table public.credit_batches
      add constraint credit_batches_order_id_key unique (order_id);
  end if;
end $$;

-- Safe post-run check:
-- select order_id, count(*) from public.credit_batches
-- where order_id is not null group by order_id having count(*) > 1;
