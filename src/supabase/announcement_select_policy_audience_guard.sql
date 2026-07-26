-- booking_schema.sql and announcement_archival_upgrade.sql historically
-- recreated member_announcements_select_live_or_admin without the audience /
-- member_announcement_targets predicate added in 20260714015000. Re-running
-- either file (both documented as safe to re-run) dropped the targeted-notice
-- guard so every member could read every private notice.
--
-- Those operator files are byte-linked to older migrations, so this follow-up
-- migration is the durable fix for deployed databases. booking_schema.sql has
-- been corrected separately for fresh installs / re-runs of that composite.

alter table public.member_announcements
  add column if not exists audience text not null default 'all';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'member_announcements_audience_check'
      and conrelid = 'public.member_announcements'::regclass
  ) then
    alter table public.member_announcements
      add constraint member_announcements_audience_check
      check (audience in ('all', 'targeted'));
  end if;
end;
$$;

create table if not exists public.member_announcement_targets (
  announcement_id uuid not null references public.member_announcements(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

create index if not exists member_announcement_targets_user_idx
  on public.member_announcement_targets (user_id, announcement_id);

alter table public.member_announcement_targets enable row level security;

drop policy if exists "announcement_targets_select_own_or_admin" on public.member_announcement_targets;
create policy "announcement_targets_select_own_or_admin"
  on public.member_announcement_targets for select
  to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

revoke all on table public.member_announcement_targets from public, anon, authenticated;
grant select on table public.member_announcement_targets to authenticated;

drop policy if exists "member_announcements_select_live_or_admin" on public.member_announcements;
create policy "member_announcements_select_live_or_admin"
  on public.member_announcements for select
  to authenticated
  using (
    (select public.is_admin())
    or (
      archived_at is null
      and published_at is not null
      and published_at <= now()
      and (expires_at is null or expires_at > now())
      and (
        audience = 'all'
        or (
          audience = 'targeted'
          and exists (
            select 1
            from public.member_announcement_targets target
            where target.announcement_id = member_announcements.id
              and target.user_id = (select auth.uid())
          )
        )
      )
    )
  );

insert into public.xert_schema_capabilities (capability)
values ('announcement_select_policy_audience_guard') on conflict (capability) do nothing;
