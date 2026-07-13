create table if not exists public.member_announcement_receipts (
  announcement_id uuid not null references public.member_announcements(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  dismissed_at timestamptz,
  primary key (announcement_id, user_id)
);

create index if not exists member_announcement_receipts_user_idx
  on public.member_announcement_receipts(user_id, dismissed_at, announcement_id);

alter table public.member_announcement_receipts enable row level security;

drop policy if exists "announcement_receipts_select_own_or_admin" on public.member_announcement_receipts;
create policy "announcement_receipts_select_own_or_admin"
  on public.member_announcement_receipts for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

create or replace function public.my_member_announcements()
returns table (
  id uuid,
  title text,
  body text,
  tone text,
  published_at timestamptz,
  expires_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;

  insert into public.member_announcement_receipts (announcement_id, user_id, read_at)
  select announcement.id, v_user_id, now()
  from public.member_announcements as announcement
  where announcement.published_at is not null
    and announcement.published_at <= now()
    and (announcement.expires_at is null or announcement.expires_at > now())
  on conflict (announcement_id, user_id) do update
    set read_at = least(member_announcement_receipts.read_at, excluded.read_at);

  return query
  select announcement.id, announcement.title, announcement.body, announcement.tone,
         announcement.published_at, announcement.expires_at, announcement.updated_at
  from public.member_announcements as announcement
  join public.member_announcement_receipts as receipt
    on receipt.announcement_id = announcement.id and receipt.user_id = v_user_id
  where announcement.published_at is not null
    and announcement.published_at <= now()
    and (announcement.expires_at is null or announcement.expires_at > now())
    and receipt.dismissed_at is null
  order by announcement.published_at desc, announcement.id desc;
end;
$$;

create or replace function public.dismiss_member_announcement(p_announcement_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (
    select 1 from public.member_announcements as announcement
    where announcement.id = p_announcement_id
      and announcement.published_at is not null
      and announcement.published_at <= now()
      and (announcement.expires_at is null or announcement.expires_at > now())
  ) then
    raise exception 'ANNOUNCEMENT_NOT_FOUND';
  end if;

  insert into public.member_announcement_receipts (announcement_id, user_id, read_at, dismissed_at)
  values (p_announcement_id, v_user_id, now(), now())
  on conflict (announcement_id, user_id) do update
    set dismissed_at = coalesce(member_announcement_receipts.dismissed_at, excluded.dismissed_at);
end;
$$;

create or replace function public.admin_announcement_metrics()
returns table (announcement_id uuid, read_count bigint, dismissed_count bigint)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  return query
  select announcement.id,
         count(receipt.user_id)::bigint,
         count(receipt.user_id) filter (where receipt.dismissed_at is not null)::bigint
  from public.member_announcements as announcement
  left join public.member_announcement_receipts as receipt on receipt.announcement_id = announcement.id
  group by announcement.id;
end;
$$;

revoke all on table public.member_announcement_receipts from public, anon;
grant select on table public.member_announcement_receipts to authenticated;
revoke execute on function public.my_member_announcements() from public, anon;
revoke execute on function public.dismiss_member_announcement(uuid) from public, anon;
revoke execute on function public.admin_announcement_metrics() from public, anon;
grant execute on function public.my_member_announcements() to authenticated;
grant execute on function public.dismiss_member_announcement(uuid) to authenticated;
grant execute on function public.admin_announcement_metrics() to authenticated;

insert into public.xert_schema_capabilities (capability)
values ('announcement_receipts')
on conflict (capability) do nothing;
