-- Finding one person in the timetable meant opening classes one at a time and
-- reading each roster, because there are two separate ways into a class: a
-- public sign-up from the timetable and a booking from a member account. This
-- searches both at once and says which class, when, and how they got there.
--
-- The search is by name, email or phone. Matching is loose enough to survive
-- how staff actually type ("holly", "0439 570 959", "COLLINS") but the query is
-- always used as a literal, never as a pattern, so a name containing % or _
-- cannot turn into a wildcard.
--
-- Email matches only the part before the @ unless the query itself contains
-- one. Searching the whole address meant "co" matched every hotmail.com and
-- gmail.com on file, which buried the person actually being looked for.

create or replace function public.admin_search_class_attendees(
  p_query text,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 100
)
returns table(
  source text,
  booking_id uuid,
  member_id uuid,
  full_name text,
  email text,
  phone text,
  status text,
  booked_at timestamptz,
  session_id uuid,
  session_title text,
  session_start timestamptz,
  coach_name text,
  location_zone text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_query text := lower(btrim(coalesce(p_query, '')));
  v_digits text := regexp_replace(coalesce(p_query, ''), '[^0-9]', '', 'g');
  v_whole_email boolean := position('@' in v_query) > 0;
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  -- Two characters is enough for "Jo" but stops an empty box returning the
  -- entire history of the club.
  if length(v_query) < 2 then return; end if;

  return query
  with matches as (
    -- Someone who signed up from the public timetable.
    select
      'signup'::text as source,
      c.id as booking_id,
      null::uuid as member_id,
      c.full_name,
      c.email,
      c.phone,
      c.status,
      c.created_at as booked_at,
      s.id as session_id,
      s.title as session_title,
      s.start_time as session_start,
      s.coach_name,
      s.location_zone
    from public.class_bookings c
    join public.class_sessions s on s.id = c.class_session_id
    where (p_from is null or s.start_time >= p_from)
      and (p_to is null or s.start_time <= p_to)
      and (
        position(v_query in lower(coalesce(c.full_name, ''))) > 0
        or position(v_query in lower(coalesce(
          case when v_whole_email then c.email else split_part(c.email, '@', 1) end, ''))) > 0
        or (v_digits <> '' and position(v_digits in regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g')) > 0)
      )

    union all

    -- Someone who booked from their member account.
    select
      'member'::text as source,
      b.id as booking_id,
      b.user_id as member_id,
      pr.full_name,
      pr.email,
      pr.phone,
      b.status,
      b.created_at as booked_at,
      s.id as session_id,
      s.title as session_title,
      s.start_time as session_start,
      s.coach_name,
      s.location_zone
    from public.session_bookings b
    join public.class_sessions s on s.id = b.class_session_id
    left join public.profiles pr on pr.id = b.user_id
    where (p_from is null or s.start_time >= p_from)
      and (p_to is null or s.start_time <= p_to)
      and (
        position(v_query in lower(coalesce(pr.full_name, ''))) > 0
        or position(v_query in lower(coalesce(
          case when v_whole_email then pr.email else split_part(pr.email, '@', 1) end, ''))) > 0
        or (v_digits <> '' and position(v_digits in regexp_replace(coalesce(pr.phone, ''), '[^0-9]', '', 'g')) > 0)
      )
  )
  select * from matches
  order by matches.session_start asc, lower(coalesce(matches.full_name, '')) asc
  limit v_limit;
end;
$function$;

revoke all on function public.admin_search_class_attendees(text, timestamptz, timestamptz, integer) from public, anon;
grant execute on function public.admin_search_class_attendees(text, timestamptz, timestamptz, integer) to authenticated, service_role;

insert into public.xert_schema_capabilities (capability)
values ('class_attendee_search') on conflict (capability) do nothing;
