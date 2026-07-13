-- Additive admin member follow-up queue. Apply after admin_member_notes_upgrade.sql.

create index if not exists session_bookings_member_status_session_idx
  on public.session_bookings (user_id, status, class_session_id);

create or replace function public.admin_member_follow_up_queue(p_limit integer default 20)
returns table (
  id uuid, full_name text, email text, phone text, role text, joined_at timestamptz,
  credits_remaining bigint, bookings_count bigint, last_attended_at timestamptz,
  next_booking_at timestamptz, last_follow_up_at timestamptz, reason text, priority integer
) language plpgsql security definer stable set search_path = public as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  return query
  with member_activity as materialized (
    select p.id, p.full_name, p.email, p.phone, p.role, p.created_at as joined_at,
           coalesce((select sum(cb.remaining) from public.credit_batches cb
                     where cb.user_id = p.id and cb.remaining > 0
                       and (cb.expires_at is null or cb.expires_at > now())), 0) as credits_remaining,
           (select count(*) from public.session_bookings sb where sb.user_id = p.id) as bookings_count,
           (select max(cs.start_time) from public.session_bookings sb
             join public.class_sessions cs on cs.id = sb.class_session_id
            where sb.user_id = p.id and sb.status = 'attended') as last_attended_at,
           (select min(cs.start_time) from public.session_bookings sb
             join public.class_sessions cs on cs.id = sb.class_session_id
            where sb.user_id = p.id and sb.status in ('requested', 'confirmed') and cs.start_time > now()) as next_booking_at,
           (select max(n.created_at) from public.admin_member_notes n
            where n.user_id = p.id and n.category = 'follow_up' and n.archived_at is null) as last_follow_up_at
    from public.profiles p
    where p.role = 'member'
  ), candidates as (
    select a.*,
           case
             when a.bookings_count = 0 and a.joined_at < now() - interval '7 days' then 'no_first_booking'
             when a.credits_remaining > 0 and a.next_booking_at is null
               and coalesce(a.last_attended_at, a.joined_at) < now() - interval '14 days' then 'idle_credits'
             when a.credits_remaining = 0 and a.next_booking_at is null
               and a.last_attended_at >= now() - interval '30 days' then 'renewal_due'
           end as reason,
           case
             when a.bookings_count = 0 and a.joined_at < now() - interval '7 days' then 1
             when a.credits_remaining > 0 and a.next_booking_at is null
               and coalesce(a.last_attended_at, a.joined_at) < now() - interval '14 days' then 2
             else 3
           end as priority
    from member_activity a
    where a.last_follow_up_at is null or a.last_follow_up_at < now() - interval '7 days'
  )
  select c.id, c.full_name, c.email, c.phone, c.role, c.joined_at,
         c.credits_remaining, c.bookings_count, c.last_attended_at,
         c.next_booking_at, c.last_follow_up_at, c.reason, c.priority
  from candidates c
  where c.reason is not null
  order by c.priority, coalesce(c.last_attended_at, c.joined_at), c.id
  limit v_limit;
end; $$;

revoke execute on function public.admin_member_follow_up_queue(integer) from public, anon;
grant execute on function public.admin_member_follow_up_queue(integer) to authenticated;
