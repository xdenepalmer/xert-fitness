-- Additive, idempotent server-side admin member directory pagination.

create or replace function public.admin_list_members_page(
  p_search text default null,
  p_role text default 'all',
  p_credit text default 'all',
  p_limit integer default 50,
  p_offset integer default 0,
  p_user_id uuid default null
)
returns table (
  id uuid, full_name text, email text, phone text, role text, joined_at timestamptz,
  credits_remaining bigint, bookings_count bigint, orders_count bigint,
  total_spent_cents bigint, total_count bigint
) language plpgsql security definer stable set search_path = public as $$
declare
  v_search text := btrim(coalesce(p_search, ''));
  v_role text := lower(btrim(coalesce(p_role, 'all')));
  v_credit text := lower(btrim(coalesce(p_credit, 'all')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if char_length(v_search) > 100 then raise exception 'INVALID_MEMBER_SEARCH'; end if;
  if v_role not in ('all', 'member', 'admin') then raise exception 'INVALID_MEMBER_ROLE_FILTER'; end if;
  if v_credit not in ('all', 'available', 'none') then raise exception 'INVALID_MEMBER_CREDIT_FILTER'; end if;

  return query
  with member_rows as materialized (
    select p.id, p.full_name, p.email, p.phone, p.role, p.created_at as joined_at,
           coalesce((select sum(cb.remaining) from credit_batches cb
                     where cb.user_id = p.id and cb.remaining > 0
                       and (cb.expires_at is null or cb.expires_at > now())), 0) as credits_remaining,
           (select count(*) from session_bookings sb where sb.user_id = p.id) as bookings_count,
           (select count(*) from orders o where o.user_id = p.id and o.status = 'paid') as orders_count,
           coalesce((select sum(o.amount_cents) from orders o where o.user_id = p.id and o.status = 'paid'), 0) as total_spent_cents
    from profiles p
    where (p_user_id is null or p.id = p_user_id)
      and (v_role = 'all' or p.role = v_role)
      and (
        v_search = ''
        or p.full_name ilike '%' || v_search || '%'
        or p.email ilike '%' || v_search || '%'
        or p.phone ilike '%' || v_search || '%'
      )
  )
  select m.id, m.full_name, m.email, m.phone, m.role, m.joined_at,
         m.credits_remaining, m.bookings_count, m.orders_count,
         m.total_spent_cents, count(*) over() as total_count
  from member_rows m
  where v_credit = 'all'
     or (v_credit = 'available' and m.credits_remaining > 0)
     or (v_credit = 'none' and m.credits_remaining <= 0)
  order by m.joined_at desc, m.id desc
  limit v_limit offset v_offset;
end; $$;

revoke execute on function public.admin_list_members_page(text, text, text, integer, integer, uuid) from public, anon;
grant execute on function public.admin_list_members_page(text, text, text, integer, integer, uuid) to authenticated;
