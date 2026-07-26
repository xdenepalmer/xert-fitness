-- Align waitlist / follow-up RPC defaults with the desk ceiling (50).
-- App helpers already pass 50; omitted-arg PostgREST callers and null
-- coalesce fallbacks still collapsed queues to 20 and hid later rows.

drop function if exists public.admin_member_follow_up_queue(integer);
create function public.admin_member_follow_up_queue(p_limit integer default 50)
returns table (
  id uuid, full_name text, email text, phone text, role text, joined_at timestamptz,
  credits_remaining bigint, bookings_count bigint, last_attended_at timestamptz,
  next_booking_at timestamptz, last_follow_up_at timestamptz, reason text, priority integer,
  credits_expiring bigint, next_credit_expiry timestamptz
) language plpgsql security definer stable set search_path = public as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 50));
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  return query
  with member_activity as materialized (
    select p.id, p.full_name, p.email, p.phone, p.role, p.created_at as joined_at,
           coalesce((select sum(cb.remaining) from public.credit_batches cb
                     where cb.user_id = p.id and cb.remaining > 0
                       and (cb.expires_at is null or cb.expires_at > now())), 0) as credits_remaining,
           coalesce((select sum(cb.remaining) from public.credit_batches cb
                     where cb.user_id = p.id and cb.remaining > 0
                       and cb.expires_at > now()
                       and cb.expires_at <= now() + interval '7 days'), 0) as credits_expiring,
           (select min(cb.expires_at) from public.credit_batches cb
             where cb.user_id = p.id and cb.remaining > 0
               and cb.expires_at > now()
               and cb.expires_at <= now() + interval '7 days') as next_credit_expiry,
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
             when a.credits_expiring > 0 then 'credits_expiring'
             when a.credits_remaining > 0 and a.next_booking_at is null
               and coalesce(a.last_attended_at, a.joined_at) < now() - interval '14 days' then 'idle_credits'
             when a.credits_remaining = 0 and a.next_booking_at is null
               and a.last_attended_at >= now() - interval '30 days' then 'renewal_due'
           end as reason,
           case
             when a.bookings_count = 0 and a.joined_at < now() - interval '7 days' then 1
             when a.credits_expiring > 0 then 1
             when a.credits_remaining > 0 and a.next_booking_at is null
               and coalesce(a.last_attended_at, a.joined_at) < now() - interval '14 days' then 2
             else 3
           end as priority
    from member_activity a
    where a.last_follow_up_at is null or a.last_follow_up_at < now() - interval '7 days'
  )
  select c.id, c.full_name, c.email, c.phone, c.role, c.joined_at,
         c.credits_remaining, c.bookings_count, c.last_attended_at,
         c.next_booking_at, c.last_follow_up_at, c.reason, c.priority,
         c.credits_expiring, c.next_credit_expiry
  from candidates c
  where c.reason is not null
  order by c.priority, c.next_credit_expiry nulls last,
           coalesce(c.last_attended_at, c.joined_at), c.id
  limit v_limit;
end; $$;

create or replace function public.admin_waitlist_overview(p_limit integer default 50)
returns table (
  session_id uuid, title text, start_time timestamptz, capacity integer,
  active_count bigint, waitlist_count bigint, spots_available integer,
  can_promote boolean, next_booking_id uuid, next_member_id uuid,
  next_full_name text, next_email text, next_phone text,
  next_booked_at timestamptz, next_available_credits bigint
) language plpgsql security definer stable set search_path = public as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 50));
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  return query
  with queued_sessions as materialized (
    select s.id, s.title, s.start_time, s.capacity,
           count(b.id) filter (where b.status in ('requested', 'confirmed')) as active_count,
           count(b.id) filter (where b.status = 'waitlisted') as waitlist_count
      from public.class_sessions s
      left join public.session_bookings b on b.class_session_id = s.id
     where s.status = 'published' and s.start_time > now()
     group by s.id, s.title, s.start_time, s.capacity
    having count(b.id) filter (where b.status = 'waitlisted') > 0
  )
  select q.id, q.title, q.start_time, q.capacity,
         q.active_count, q.waitlist_count,
         case when q.capacity is null then null
              else greatest(q.capacity - q.active_count, 0)::integer end,
         q.capacity is null or q.active_count < q.capacity,
         head.id, head.user_id, p.full_name, p.email, p.phone, head.created_at,
         coalesce((select sum(cb.remaining) from public.credit_batches cb
                    where cb.user_id = head.user_id and cb.remaining > 0
                      and (cb.expires_at is null or cb.expires_at > now())), 0)
    from queued_sessions q
    join lateral (
      select b.id, b.user_id, b.created_at
        from public.session_bookings b
       where b.class_session_id = q.id and b.status = 'waitlisted'
       order by b.created_at, b.id
       limit 1
    ) head on true
    left join public.profiles p on p.id = head.user_id
   order by (q.capacity is null or q.active_count < q.capacity) desc,
            q.start_time, q.id
   limit v_limit;
end; $$;

revoke execute on function public.admin_member_follow_up_queue(integer) from public, anon;
grant execute on function public.admin_member_follow_up_queue(integer) to authenticated;
revoke execute on function public.admin_waitlist_overview(integer) from public, anon;
grant execute on function public.admin_waitlist_overview(integer) to authenticated;

insert into public.xert_schema_capabilities (capability)
values ('admin_desk_rpc_ceiling_defaults')
on conflict (capability) do nothing;
