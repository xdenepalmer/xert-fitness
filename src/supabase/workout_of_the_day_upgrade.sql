-- Workout of the day for the in-club TV display.
--
-- Operating model confirmed by the business: ONE workout per day, shared by
-- every class that day, changing daily. workout_date is therefore the primary
-- key, which structurally prevents a second workout existing for the same day
-- rather than relying on application code to enforce it.
--
-- The gym TV runs a public kiosk page: no keyboard, no login, so a PUBLISHED
-- workout must be readable by anon. Unpublished drafts stay admin-only, so a
-- coach can write tomorrow's session without it appearing on the screen.
--
-- Idempotent and safe to re-run.

create table if not exists public.workouts_of_the_day (
  workout_date date primary key,
  title text
    check (title is null or pg_catalog.char_length(pg_catalog.btrim(title)) between 1 and 120),
  body text not null
    check (pg_catalog.char_length(pg_catalog.btrim(body)) between 1 and 4000),
  published_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  last_changed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create index if not exists workouts_of_the_day_published_idx
  on public.workouts_of_the_day (workout_date desc)
  where published_at is not null;

create or replace function public.touch_workout_of_the_day_updated_at()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists workouts_of_the_day_touch_updated_at on public.workouts_of_the_day;
create trigger workouts_of_the_day_touch_updated_at
  before update on public.workouts_of_the_day
  for each row execute function public.touch_workout_of_the_day_updated_at();

alter table public.workouts_of_the_day enable row level security;

-- Published workouts are world-readable: the TV cannot authenticate.
drop policy if exists "workouts_of_the_day_public_read" on public.workouts_of_the_day;
create policy "workouts_of_the_day_public_read" on public.workouts_of_the_day
  for select to anon, authenticated
  using (published_at is not null and published_at <= pg_catalog.now());

-- Admins additionally see drafts and future days.
drop policy if exists "workouts_of_the_day_admin_read" on public.workouts_of_the_day;
create policy "workouts_of_the_day_admin_read" on public.workouts_of_the_day
  for select to authenticated using (public.is_admin());

drop policy if exists "workouts_of_the_day_admin_insert" on public.workouts_of_the_day;
create policy "workouts_of_the_day_admin_insert" on public.workouts_of_the_day
  for insert to authenticated with check (public.is_admin());

drop policy if exists "workouts_of_the_day_admin_update" on public.workouts_of_the_day;
create policy "workouts_of_the_day_admin_update" on public.workouts_of_the_day
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "workouts_of_the_day_admin_delete" on public.workouts_of_the_day;
create policy "workouts_of_the_day_admin_delete" on public.workouts_of_the_day
  for delete to authenticated using (public.is_admin());
