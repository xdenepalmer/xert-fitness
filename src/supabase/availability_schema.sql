-- ============================================================================
-- XERT Fitness -- Availability and blackout schema
-- ============================================================================
-- Run after booking_schema.sql and admin_cms_schema.sql. This migration is
-- idempotent and fills the tables used by the Admin Availability / Blackouts
-- workspace. It keeps operational planning records private to administrators.
-- ============================================================================

create table if not exists public.availability_blocks (
  id uuid primary key default gen_random_uuid(),
  start_time timestamptz not null,
  end_time timestamptz not null,
  type text not null,
  coach_name text,
  notes text,
  is_bookable boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.availability_blocks
  add column if not exists type text not null default 'PT available',
  add column if not exists coach_name text,
  add column if not exists notes text,
  add column if not exists is_bookable boolean not null default false,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.availability_blocks
  drop constraint if exists availability_blocks_valid_range;
alter table public.availability_blocks
  add constraint availability_blocks_valid_range
  check (end_time > start_time) not valid;

create index if not exists availability_blocks_start_time_idx
  on public.availability_blocks(start_time);

create table if not exists public.blackout_periods (
  id uuid primary key default gen_random_uuid(),
  start_time timestamptz not null,
  end_time timestamptz not null,
  affects text not null default 'all',
  reason text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.blackout_periods
  add column if not exists affects text not null default 'all',
  add column if not exists reason text not null default 'facility maintenance',
  add column if not exists notes text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.blackout_periods
  drop constraint if exists blackout_periods_valid_range;
alter table public.blackout_periods
  add constraint blackout_periods_valid_range
  check (end_time > start_time) not valid;
alter table public.blackout_periods
  drop constraint if exists blackout_periods_affects_check;
alter table public.blackout_periods
  add constraint blackout_periods_affects_check
  check (affects in ('all', 'group_classes', 'pt_only', 'facility_only', 'coach_only')) not valid;

create index if not exists blackout_periods_start_time_idx
  on public.blackout_periods(start_time);

create or replace function public.touch_availability_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists availability_blocks_touch_updated_at on public.availability_blocks;
create trigger availability_blocks_touch_updated_at
  before update on public.availability_blocks
  for each row execute function public.touch_availability_updated_at();

drop trigger if exists blackout_periods_touch_updated_at on public.blackout_periods;
create trigger blackout_periods_touch_updated_at
  before update on public.blackout_periods
  for each row execute function public.touch_availability_updated_at();

alter table public.availability_blocks enable row level security;
alter table public.blackout_periods enable row level security;

drop policy if exists "admin_all_availability_blocks" on public.availability_blocks;
drop policy if exists "admins_manage_availability_blocks" on public.availability_blocks;
create policy "admins_manage_availability_blocks" on public.availability_blocks
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admin_all_blackout_periods" on public.blackout_periods;
drop policy if exists "admins_manage_blackout_periods" on public.blackout_periods;
create policy "admins_manage_blackout_periods" on public.blackout_periods
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
