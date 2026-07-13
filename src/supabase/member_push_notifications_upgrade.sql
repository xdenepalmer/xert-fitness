-- XERT iOS remote member-notice subscriptions and delivery audit.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_token text not null,
  environment text not null check (environment in ('sandbox', 'production')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint push_subscriptions_device_environment_key unique (device_token, environment)
);

create index if not exists push_subscriptions_user_enabled_idx
  on public.push_subscriptions (user_id, enabled, last_seen_at desc);
create index if not exists push_subscriptions_delivery_idx
  on public.push_subscriptions (enabled, environment, id);

create table if not exists public.push_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid references public.member_announcements(id) on delete set null,
  subscription_id uuid references public.push_subscriptions(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  environment text not null check (environment in ('sandbox', 'production')),
  status text not null check (status in ('delivered', 'failed', 'invalid_token')),
  reason text,
  attempted_at timestamptz not null default now()
);

create index if not exists push_notification_deliveries_announcement_idx
  on public.push_notification_deliveries (announcement_id, attempted_at desc);
create index if not exists push_notification_deliveries_status_idx
  on public.push_notification_deliveries (status, attempted_at desc);

alter table public.push_subscriptions enable row level security;
alter table public.push_notification_deliveries enable row level security;

revoke all on table public.push_subscriptions from anon, authenticated;
revoke all on table public.push_notification_deliveries from anon, authenticated;

create or replace function public.admin_announcement_push_metrics()
returns table (
  announcement_id uuid,
  delivered_count bigint,
  failed_count bigint,
  invalid_token_count bigint,
  last_attempted_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;

  return query
  select
    delivery.announcement_id,
    count(*) filter (where delivery.status = 'delivered')::bigint,
    count(*) filter (where delivery.status = 'failed')::bigint,
    count(*) filter (where delivery.status = 'invalid_token')::bigint,
    max(delivery.attempted_at)
  from public.push_notification_deliveries delivery
  where delivery.announcement_id is not null
  group by delivery.announcement_id;
end;
$$;

revoke execute on function public.admin_announcement_push_metrics() from public, anon;
grant execute on function public.admin_announcement_push_metrics() to authenticated;

insert into public.xert_schema_capabilities (capability)
values ('member_push_notifications')
on conflict (capability) do nothing;
