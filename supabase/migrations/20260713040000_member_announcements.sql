create table if not exists public.member_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  tone text not null default 'info' check (tone in ('info', 'action', 'urgent')),
  published_at timestamptz,
  expires_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or published_at is null or expires_at > published_at)
);

create index if not exists member_announcements_live_idx
  on public.member_announcements(published_at desc, id desc)
  where published_at is not null;

create or replace function public.touch_member_announcement_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists member_announcements_touch_updated_at on public.member_announcements;
create trigger member_announcements_touch_updated_at
  before update on public.member_announcements
  for each row execute function public.touch_member_announcement_updated_at();

alter table public.member_announcements enable row level security;

drop policy if exists "member_announcements_select_live_or_admin" on public.member_announcements;
create policy "member_announcements_select_live_or_admin"
  on public.member_announcements for select
  to authenticated
  using (
    public.is_admin()
    or (
      published_at is not null
      and published_at <= now()
      and (expires_at is null or expires_at > now())
    )
  );

drop policy if exists "member_announcements_admin_insert" on public.member_announcements;
create policy "member_announcements_admin_insert"
  on public.member_announcements for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "member_announcements_admin_update" on public.member_announcements;
create policy "member_announcements_admin_update"
  on public.member_announcements for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "member_announcements_admin_delete" on public.member_announcements;
create policy "member_announcements_admin_delete"
  on public.member_announcements for delete
  to authenticated
  using (public.is_admin());

revoke all on table public.member_announcements from public, anon;
grant select, insert, update, delete on table public.member_announcements to authenticated;

insert into public.xert_schema_capabilities (capability)
values ('member_announcements')
on conflict (capability) do nothing;
