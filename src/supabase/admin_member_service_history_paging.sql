-- Member-drawer staff notes hard-capped at 100 and private notices at 50.
-- After ops growth those ceilings silently hid later coaching/billing notes and
-- class-cancel / booking-decision private history (including note PII and push
-- receipt summary). Page with limit/offset so web + iPhone can load the full
-- service timeline past those cuts (and past PostgREST max_rows).

create table if not exists public.xert_schema_capabilities (
  capability text primary key,
  installed_at timestamptz not null default now()
);
alter table public.xert_schema_capabilities enable row level security;

drop function if exists public.admin_list_member_notes(uuid, boolean);
create function public.admin_list_member_notes(
  p_user_id uuid,
  p_include_archived boolean default false,
  p_limit integer default 500,
  p_offset integer default 0
)
returns table (
  id uuid, user_id uuid, author_id uuid, author_name text, category text,
  body text, created_at timestamptz, archived_at timestamptz, archived_by uuid
) language plpgsql security definer stable set search_path = public as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 500), 500));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_user_id is null then raise exception 'MEMBER_REQUIRED'; end if;
  return query
  select n.id, n.user_id, n.author_id, coalesce(a.full_name, a.email, 'Former admin'),
         n.category, n.body, n.created_at, n.archived_at, n.archived_by
  from public.admin_member_notes n
  left join public.profiles a on a.id = n.author_id
  where n.user_id = p_user_id
    and (coalesce(p_include_archived, false) or n.archived_at is null)
  order by (n.archived_at is not null), n.created_at desc, n.id desc
  limit v_limit offset v_offset;
end; $$;

drop function if exists public.admin_list_member_notices(uuid);
create function public.admin_list_member_notices(
  p_user_id uuid,
  p_limit integer default 500,
  p_offset integer default 0
)
returns table (
  id uuid,
  title text,
  body text,
  tone text,
  cta_label text,
  cta_url text,
  source_kind text,
  published_at timestamptz,
  expires_at timestamptz,
  read_at timestamptz,
  dismissed_at timestamptz,
  push_attempted bigint,
  push_delivered bigint,
  push_failed bigint
)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 500), 500));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_user_id is null then raise exception 'MEMBER_REQUIRED'; end if;

  return query
  select
    announcement.id,
    announcement.title,
    announcement.body,
    announcement.tone,
    announcement.cta_label,
    announcement.cta_url,
    announcement.source_kind,
    announcement.published_at,
    announcement.expires_at,
    receipt.read_at,
    receipt.dismissed_at,
    count(delivery.id),
    count(delivery.id) filter (where delivery.status = 'delivered'),
    count(delivery.id) filter (where delivery.status in ('failed', 'invalid_token'))
  from public.member_announcement_targets target
  join public.member_announcements announcement on announcement.id = target.announcement_id
  left join public.member_announcement_receipts receipt
    on receipt.announcement_id = announcement.id and receipt.user_id = target.user_id
  left join public.push_notification_deliveries delivery
    on delivery.announcement_id = announcement.id and delivery.user_id = target.user_id
  where target.user_id = p_user_id
  group by announcement.id, receipt.read_at, receipt.dismissed_at
  order by announcement.published_at desc, announcement.id desc
  limit v_limit offset v_offset;
end;
$$;

revoke execute on function public.admin_list_member_notes(uuid, boolean, integer, integer) from public, anon;
revoke execute on function public.admin_list_member_notices(uuid, integer, integer) from public, anon;
grant execute on function public.admin_list_member_notes(uuid, boolean, integer, integer) to authenticated;
grant execute on function public.admin_list_member_notices(uuid, integer, integer) to authenticated;

insert into public.xert_schema_capabilities (capability)
values ('admin_member_service_history_paging')
on conflict (capability) do nothing;
