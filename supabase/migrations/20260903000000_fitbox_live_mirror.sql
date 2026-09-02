-- FitBox live mirror through the Zapier MCP gateway.
-- XERT keeps a bounded, admin-readable copy of FitBox members, memberships,
-- class bookings and classes so the Command Centre can show them without a
-- provider round trip. FitBox stays authoritative; XERT never writes these
-- rows from the browser and never stores DOB, gender, body measurements,
-- street addresses or custom fields.

create table if not exists public.fitbox_users (
  id uuid primary key default gen_random_uuid(),
  fitbox_gym_id text not null,
  fitbox_user_id text not null,
  first_name text,
  last_name text,
  email text,
  phone text,
  city text,
  state text,
  postcode text,
  country text,
  status text,
  role text,
  anniversary_date date,
  provider_created_at timestamptz,
  provider_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  constraint fitbox_users_gym_check check (fitbox_gym_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  constraint fitbox_users_user_check check (fitbox_user_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  constraint fitbox_users_first_name_check check (first_name is null or char_length(first_name) <= 80),
  constraint fitbox_users_last_name_check check (last_name is null or char_length(last_name) <= 80),
  constraint fitbox_users_email_check check (email is null or char_length(email) <= 320),
  constraint fitbox_users_phone_check check (phone is null or char_length(phone) <= 60),
  constraint fitbox_users_status_check check (status is null or status ~ '^[a-z0-9_ -]{1,80}$'),
  constraint fitbox_users_role_check check (role is null or role ~ '^[a-z0-9_ -]{1,80}$')
);
create unique index if not exists fitbox_users_provider_unique on public.fitbox_users (fitbox_gym_id, fitbox_user_id);
create index if not exists fitbox_users_email_idx on public.fitbox_users (lower(email)) where email is not null;
create index if not exists fitbox_users_status_idx on public.fitbox_users (status, synced_at desc);

create table if not exists public.fitbox_subscriptions (
  id uuid primary key default gen_random_uuid(),
  fitbox_gym_id text not null,
  fitbox_subscription_id text not null,
  fitbox_user_id text not null,
  email text,
  product_id text,
  product_name text,
  status text,
  payment_gateway text,
  price_in_cents integer,
  setup_price_in_cents integer,
  discount_percentage integer,
  start_date date,
  expiration_date date,
  sessions_count integer,
  sessions_count_last_reset date,
  provider_created_at timestamptz,
  provider_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  constraint fitbox_subscriptions_gym_check check (fitbox_gym_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  constraint fitbox_subscriptions_id_check check (fitbox_subscription_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  constraint fitbox_subscriptions_user_check check (fitbox_user_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  constraint fitbox_subscriptions_product_check check (product_id is null or product_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  constraint fitbox_subscriptions_product_name_check check (product_name is null or char_length(product_name) <= 160),
  constraint fitbox_subscriptions_status_check check (status is null or status ~ '^[a-z0-9_ -]{1,80}$'),
  constraint fitbox_subscriptions_price_check check (price_in_cents is null or price_in_cents >= 0)
);
create unique index if not exists fitbox_subscriptions_provider_unique on public.fitbox_subscriptions (fitbox_gym_id, fitbox_subscription_id);
create index if not exists fitbox_subscriptions_user_idx on public.fitbox_subscriptions (fitbox_gym_id, fitbox_user_id, status);

create table if not exists public.fitbox_attendance (
  id uuid primary key default gen_random_uuid(),
  fitbox_gym_id text not null,
  fitbox_attendance_id text not null,
  fitbox_event_id text,
  fitbox_class_id text,
  class_name text,
  fitbox_user_id text not null,
  session_start_time timestamptz,
  status text,
  feed text not null,
  synced_at timestamptz not null default now(),
  constraint fitbox_attendance_gym_check check (fitbox_gym_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  constraint fitbox_attendance_id_check check (fitbox_attendance_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  constraint fitbox_attendance_event_check check (fitbox_event_id is null or fitbox_event_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  constraint fitbox_attendance_class_check check (fitbox_class_id is null or fitbox_class_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  constraint fitbox_attendance_user_check check (fitbox_user_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  constraint fitbox_attendance_class_name_check check (class_name is null or char_length(class_name) <= 160),
  constraint fitbox_attendance_status_check check (status is null or status ~ '^[a-z0-9_ -]{1,80}$'),
  constraint fitbox_attendance_feed_check check (feed in ('booked', 'cancelled', 'first_session', 'next_session'))
);
create unique index if not exists fitbox_attendance_provider_unique on public.fitbox_attendance (fitbox_gym_id, fitbox_attendance_id);
create index if not exists fitbox_attendance_session_idx on public.fitbox_attendance (fitbox_gym_id, session_start_time desc);
create index if not exists fitbox_attendance_user_idx on public.fitbox_attendance (fitbox_gym_id, fitbox_user_id, session_start_time desc);

create table if not exists public.fitbox_classes (
  id uuid primary key default gen_random_uuid(),
  fitbox_gym_id text not null,
  fitbox_class_id text not null,
  name text not null,
  synced_at timestamptz not null default now(),
  constraint fitbox_classes_gym_check check (fitbox_gym_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  constraint fitbox_classes_id_check check (fitbox_class_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  constraint fitbox_classes_name_check check (char_length(name) between 1 and 160)
);
create unique index if not exists fitbox_classes_provider_unique on public.fitbox_classes (fitbox_gym_id, fitbox_class_id);

-- One row per gateway call so the owner can see what synced, when and how.
create table if not exists public.fitbox_sync_runs (
  id uuid primary key default gen_random_uuid(),
  fitbox_gym_id text not null,
  feed text not null,
  status text not null default 'running',
  accepted integer not null default 0,
  rejected integer not null default 0,
  linked integer not null default 0,
  error_code text,
  started_by uuid references auth.users(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint fitbox_sync_runs_gym_check check (fitbox_gym_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  constraint fitbox_sync_runs_feed_check check (feed in ('users', 'statuses', 'subscriptions', 'bookings', 'cancellations', 'first_sessions', 'classes', 'lookup')),
  constraint fitbox_sync_runs_status_check check (status in ('running', 'completed', 'failed')),
  constraint fitbox_sync_runs_error_check check (error_code is null or error_code ~ '^[A-Z0-9_]{1,80}$')
);
create index if not exists fitbox_sync_runs_recent_idx on public.fitbox_sync_runs (started_at desc);

-- Verified member links: a signed-in XERT member may now be linked to a FitBox
-- user by a unique exact email match, alongside the existing lead links.
alter table public.fitbox_member_links
  drop constraint if exists fitbox_member_links_lead_type_check;
alter table public.fitbox_member_links
  add constraint fitbox_member_links_lead_type_check check (lead_type in ('member_interest', 'member_profile'));
alter table public.fitbox_member_links
  drop constraint if exists fitbox_member_links_method_check;
alter table public.fitbox_member_links
  add constraint fitbox_member_links_method_check check (link_method in ('zapier_register_prospect', 'zapier_mcp_register', 'verified_email'));

alter table public.fitbox_integration_jobs
  drop constraint if exists fitbox_integration_jobs_lead_type_check;
alter table public.fitbox_integration_jobs
  add constraint fitbox_integration_jobs_lead_type_check check (lead_type in ('member_interest', 'member_profile'));

alter table public.fitbox_users enable row level security;
alter table public.fitbox_subscriptions enable row level security;
alter table public.fitbox_attendance enable row level security;
alter table public.fitbox_classes enable row level security;
alter table public.fitbox_sync_runs enable row level security;

drop policy if exists "fitbox_users_admin_read" on public.fitbox_users;
create policy "fitbox_users_admin_read" on public.fitbox_users for select to authenticated using (public.is_admin());
drop policy if exists "fitbox_subscriptions_admin_read" on public.fitbox_subscriptions;
create policy "fitbox_subscriptions_admin_read" on public.fitbox_subscriptions for select to authenticated using (public.is_admin());
drop policy if exists "fitbox_attendance_admin_read" on public.fitbox_attendance;
create policy "fitbox_attendance_admin_read" on public.fitbox_attendance for select to authenticated using (public.is_admin());
drop policy if exists "fitbox_classes_admin_read" on public.fitbox_classes;
create policy "fitbox_classes_admin_read" on public.fitbox_classes for select to authenticated using (public.is_admin());
drop policy if exists "fitbox_sync_runs_admin_read" on public.fitbox_sync_runs;
create policy "fitbox_sync_runs_admin_read" on public.fitbox_sync_runs for select to authenticated using (public.is_admin());

revoke all on table public.fitbox_users from public, anon, authenticated;
revoke all on table public.fitbox_subscriptions from public, anon, authenticated;
revoke all on table public.fitbox_attendance from public, anon, authenticated;
revoke all on table public.fitbox_classes from public, anon, authenticated;
revoke all on table public.fitbox_sync_runs from public, anon, authenticated;
grant select on table public.fitbox_users to authenticated;
grant select on table public.fitbox_subscriptions to authenticated;
grant select on table public.fitbox_attendance to authenticated;
grant select on table public.fitbox_classes to authenticated;
grant select on table public.fitbox_sync_runs to authenticated;

insert into public.xert_schema_capabilities (capability)
values ('fitbox_live_mirror')
on conflict (capability) do nothing;
