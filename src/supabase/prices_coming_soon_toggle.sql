-- Public "prices coming soon" launch toggle.
--
-- Adds a single boolean to the existing single-row admin_settings table. When
-- true (the default), the public website shows "Coming soon" in place of every
-- session-pack price; the command centre Soft Launch Settings toggle flips it to
-- false to reveal real amounts once pricing is finalised.
--
-- Idempotent and safe to re-run. Defaults TRUE so pricing stays hidden until the
-- business explicitly opts in. admin_settings already allows public SELECT (the
-- public timetable reads it), so no policy change is required; writes remain
-- admin-only under the existing row-level security.
alter table public.admin_settings
  add column if not exists prices_coming_soon boolean not null default true;
