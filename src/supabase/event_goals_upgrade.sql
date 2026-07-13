-- ============================================================================
-- XERT Fitness -- Member event goals upgrade
-- ============================================================================
-- Run in the Supabase SQL Editor for an EXISTING XERT installation. Members
-- can choose an event to train toward; admins can see the training group for
-- every event. Requires booking_schema.sql plus admin_cms_schema.sql for the
-- public.is_admin() helper and member email field.
-- ============================================================================

create table if not exists public.member_event_goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  event_id    uuid not null references public.events(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (user_id, event_id)
);
create index if not exists member_event_goals_event_idx on public.member_event_goals(event_id);

alter table public.member_event_goals enable row level security;
drop policy if exists "member_event_goals_select_own_or_admin" on public.member_event_goals;
drop policy if exists "member_event_goals_insert_own" on public.member_event_goals;
drop policy if exists "member_event_goals_delete_own_or_admin" on public.member_event_goals;
create policy "member_event_goals_select_own_or_admin" on public.member_event_goals
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "member_event_goals_insert_own" on public.member_event_goals
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "member_event_goals_delete_own_or_admin" on public.member_event_goals
  for delete to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));

-- Admin-only event roster. SECURITY DEFINER permits the function to read the
-- member contact fields, while the explicit guard keeps it inaccessible to
-- ordinary authenticated members.
create or replace function public.admin_event_goal_members(p_event_id uuid)
returns table (
  user_id uuid,
  full_name text,
  email text,
  phone text,
  selected_at timestamptz
) language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_event_id is null then raise exception 'EVENT_ID_REQUIRED'; end if;

  return query
  select g.user_id, p.full_name, p.email, p.phone, g.created_at
  from public.member_event_goals g
  left join public.profiles p on p.id = g.user_id
  where g.event_id = p_event_id
  order by g.created_at asc;
end; $$;

revoke execute on function public.admin_event_goal_members(uuid) from public, anon;
grant execute on function public.admin_event_goal_members(uuid) to authenticated;

-- Safe post-run check:
-- select e.name, e.event_date, count(g.id) as members_training
-- from public.events e
-- left join public.member_event_goals g on g.event_id = e.id
-- group by e.id
-- order by e.event_date;
