-- Stops every Account page load sequentially scanning the whole orders table.
--
-- public.orders carries indexes on (status, created_at desc, id desc) and a
-- partial one for unresolved checkouts, but none on user_id. The member
-- purchase-history query supplies no user_id predicate either — it relies
-- entirely on the RLS policy to pick its own rows, and that policy is a
-- disjunction:
--
--   user_id = (select auth.uid()) or (select public.is_admin())
--
-- which compiles to `Filter: (user_id = $0) OR $1`. A filter cannot drive an
-- index scan, so every member opening their account reads every order ever
-- placed. It is invisible today because the table is small and correct results
-- come back regardless; it degrades in exact proportion to sales.
--
-- The index makes the lookup possible; the client change that supplies an
-- explicit user_id equality is what lets the planner use it. Both are needed —
-- the index alone would still be ignored under the disjunctive filter.

create index if not exists orders_user_created_idx
  on public.orders (user_id, created_at desc, id desc);

insert into public.xert_schema_capabilities (capability)
values ('member_history_index') on conflict (capability) do nothing;
