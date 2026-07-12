-- ============================================================================
-- XERT Fitness -- Member event goals upgrade
-- ============================================================================
-- Run in the Supabase SQL Editor for an EXISTING XERT installation. Members
-- can choose an event to train toward; admins can see the training group for
-- every event. Requires booking_schema.sql and its public.is_admin() helper.
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
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "member_event_goals_insert_own" on public.member_event_goals
  for insert to authenticated with check (user_id = auth.uid());
create policy "member_event_goals_delete_own_or_admin" on public.member_event_goals
  for delete to authenticated using (user_id = auth.uid() or public.is_admin());

-- Safe post-run check:
-- select e.name, e.event_date, count(g.id) as members_training
-- from public.events e
-- left join public.member_event_goals g on g.event_id = e.id
-- group by e.id
-- order by e.event_date;
