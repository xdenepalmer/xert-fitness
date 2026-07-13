-- Additive, idempotent admin command-palette member search.
-- Filters profiles before calculating member aggregates and caps every result.

create or replace function public.admin_search_members(
  p_search text,
  p_limit integer default 12
)
returns table (
  id uuid, full_name text, email text, phone text, role text, joined_at timestamptz,
  credits_remaining bigint, bookings_count bigint, orders_count bigint, total_spent_cents bigint
) language plpgsql security definer stable set search_path = public as $$
declare
  v_search text := btrim(coalesce(p_search, ''));
  v_limit integer := greatest(1, least(coalesce(p_limit, 12), 20));
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if char_length(v_search) < 2 or char_length(v_search) > 100 then return; end if;

  return query
  select p.id, p.full_name, p.email, p.phone, p.role, p.created_at,
         coalesce((select sum(cb.remaining) from credit_batches cb
                   where cb.user_id = p.id and (cb.expires_at is null or cb.expires_at > now())), 0),
         (select count(*) from session_bookings sb where sb.user_id = p.id),
         (select count(*) from orders o where o.user_id = p.id and o.status = 'paid'),
         coalesce((select sum(o.amount_cents) from orders o where o.user_id = p.id and o.status = 'paid'), 0)
  from profiles p
  where p.full_name ilike '%' || v_search || '%'
     or p.email ilike '%' || v_search || '%'
     or p.phone ilike '%' || v_search || '%'
  order by p.created_at desc, p.id desc
  limit v_limit;
end; $$;

revoke execute on function public.admin_search_members(text, integer) from public, anon;
grant execute on function public.admin_search_members(text, integer) to authenticated;
