-- Class template bank
-- Reusable class presets the owner curates in the Command Centre calendar.
-- Pressing a calendar date offers these entries for one-tap scheduling; the
-- entries themselves are admin-only operational data and never public.

create table if not exists public.class_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  class_type text not null,
  title text not null,
  description text,
  coach_name text,
  duration_minutes integer not null default 60,
  capacity integer not null default 8,
  location_zone text,
  beginner_friendly boolean not null default false,
  intensity_level text not null default 'Moderate',
  booking_mode text not null default 'request_to_book',
  default_start_minute integer,
  notes text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_templates_name_length check (char_length(btrim(name)) between 1 and 80),
  constraint class_templates_title_length check (char_length(btrim(title)) between 1 and 160),
  constraint class_templates_description_length check (coalesce(char_length(description), 0) <= 4000),
  constraint class_templates_notes_length check (coalesce(char_length(notes), 0) <= 4000),
  constraint class_templates_class_type_check check (class_type in (
    'XERT Foundation', 'XERT Strength', 'XERT Engine', 'XERT Hybrid', 'XERT Event Prep', 'XERT Team'
  )),
  constraint class_templates_intensity_check check (intensity_level in ('Low', 'Moderate', 'High', 'Very high')),
  constraint class_templates_booking_mode_check check (booking_mode in ('interest_only', 'request_to_book', 'instant_book')),
  constraint class_templates_duration_check check (duration_minutes between 1 and 1440),
  constraint class_templates_capacity_check check (capacity between 1 and 500),
  constraint class_templates_start_minute_check check (
    default_start_minute is null or default_start_minute between 0 and 1439
  )
);

create index if not exists class_templates_name_idx
  on public.class_templates (lower(name), created_at desc);

create or replace function public.touch_class_template_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists class_templates_touch_updated_at on public.class_templates;
create trigger class_templates_touch_updated_at
  before update on public.class_templates
  for each row execute function public.touch_class_template_updated_at();

alter table public.class_templates enable row level security;

drop policy if exists "class_templates_admin_all" on public.class_templates;
create policy "class_templates_admin_all" on public.class_templates
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke all on public.class_templates from anon, authenticated;
grant select, insert, update, delete on public.class_templates to authenticated;
