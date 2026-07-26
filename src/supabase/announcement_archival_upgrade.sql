-- Durable member-announcement lifecycle, archive controls and admin audit.

alter table public.member_announcements
  add column if not exists first_published_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null,
  add column if not exists last_changed_by uuid references public.profiles(id) on delete set null;

update public.member_announcements
set first_published_at = published_at
where first_published_at is null and published_at is not null;

create index if not exists member_announcements_archive_idx
  on public.member_announcements (archived_at, created_at desc, id desc);

create table if not exists public.member_announcement_admin_events (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null,
  announcement_title text not null,
  action text not null check (action in ('created', 'updated', 'published', 'unpublished', 'archived', 'restored', 'deleted')),
  actor_id uuid references public.profiles(id) on delete set null,
  previous_published_at timestamptz,
  new_published_at timestamptz,
  previous_archived_at timestamptz,
  new_archived_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists member_announcement_admin_events_created_idx
  on public.member_announcement_admin_events (created_at desc, id desc);
create index if not exists member_announcement_admin_events_announcement_idx
  on public.member_announcement_admin_events (announcement_id, created_at desc);

create or replace function public.prepare_member_announcement_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.last_changed_by := coalesce(auth.uid(), new.last_changed_by, new.created_by);
    if new.published_at is not null then
      new.first_published_at := coalesce(new.first_published_at, new.published_at);
    end if;
  else
    new.first_published_at := old.first_published_at;
    if old.archived_at is not null and new.archived_at is null and new.published_at is not null then
      raise exception 'RESTORE_ANNOUNCEMENT_BEFORE_PUBLISHING';
    end if;
    if old.first_published_at is null and new.published_at is not null then
      new.first_published_at := new.published_at;
    end if;
    new.last_changed_by := coalesce(auth.uid(), new.last_changed_by, old.last_changed_by);
  end if;

  if new.archived_at is not null and new.published_at is not null then
    raise exception 'ARCHIVED_ANNOUNCEMENT_CANNOT_PUBLISH';
  end if;
  return new;
end;
$$;

drop trigger if exists member_announcements_prepare_lifecycle on public.member_announcements;
create trigger member_announcements_prepare_lifecycle
  before insert or update on public.member_announcements
  for each row execute function public.prepare_member_announcement_lifecycle();

create or replace function public.guard_member_announcement_delete()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.first_published_at is not null then
    raise exception 'ANNOUNCEMENT_ARCHIVE_REQUIRED';
  end if;
  return old;
end;
$$;

drop trigger if exists member_announcements_guard_delete on public.member_announcements;
create trigger member_announcements_guard_delete
  before delete on public.member_announcements
  for each row execute function public.guard_member_announcement_delete();

create or replace function public.audit_member_announcement_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action text;
  v_announcement_id uuid;
  v_announcement_title text;
  v_actor_id uuid;
  v_previous_published_at timestamptz;
  v_new_published_at timestamptz;
  v_previous_archived_at timestamptz;
  v_new_archived_at timestamptz;
begin
  if tg_op = 'INSERT' then
    v_action := case when new.published_at is null then 'created' else 'published' end;
  elsif tg_op = 'DELETE' then
    v_action := 'deleted';
  elsif old.archived_at is null and new.archived_at is not null then
    v_action := 'archived';
  elsif old.archived_at is not null and new.archived_at is null then
    v_action := 'restored';
  elsif old.published_at is null and new.published_at is not null then
    v_action := 'published';
  elsif old.published_at is not null and new.published_at is null then
    v_action := 'unpublished';
  else
    v_action := 'updated';
  end if;

  if tg_op = 'DELETE' then
    v_announcement_id := old.id;
    v_announcement_title := old.title;
    v_actor_id := coalesce(auth.uid(), old.last_changed_by);
    v_previous_published_at := old.published_at;
    v_previous_archived_at := old.archived_at;
  elsif tg_op = 'INSERT' then
    v_announcement_id := new.id;
    v_announcement_title := new.title;
    v_actor_id := coalesce(auth.uid(), new.last_changed_by);
    v_new_published_at := new.published_at;
    v_new_archived_at := new.archived_at;
  else
    v_announcement_id := new.id;
    v_announcement_title := new.title;
    v_actor_id := coalesce(auth.uid(), new.last_changed_by);
    v_previous_published_at := old.published_at;
    v_new_published_at := new.published_at;
    v_previous_archived_at := old.archived_at;
    v_new_archived_at := new.archived_at;
  end if;

  insert into public.member_announcement_admin_events (
    announcement_id,
    announcement_title,
    action,
    actor_id,
    previous_published_at,
    new_published_at,
    previous_archived_at,
    new_archived_at
  ) values (
    v_announcement_id,
    v_announcement_title,
    v_action,
    v_actor_id,
    v_previous_published_at,
    v_new_published_at,
    v_previous_archived_at,
    v_new_archived_at
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists member_announcements_audit_lifecycle on public.member_announcements;
create trigger member_announcements_audit_lifecycle
  after insert or update or delete on public.member_announcements
  for each row execute function public.audit_member_announcement_lifecycle();

insert into public.member_announcement_admin_events (
  announcement_id,
  announcement_title,
  action,
  actor_id,
  new_published_at,
  new_archived_at,
  created_at
)
select
  announcement.id,
  announcement.title,
  case when announcement.first_published_at is null then 'created' else 'published' end,
  announcement.created_by,
  announcement.published_at,
  announcement.archived_at,
  announcement.created_at
from public.member_announcements announcement
where not exists (
  select 1
  from public.member_announcement_admin_events event
  where event.announcement_id = announcement.id
);

create or replace function public.admin_archive_member_announcement(p_announcement_id uuid, p_archived boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;

  perform 1
  from public.member_announcements
  where id = p_announcement_id
  for update;
  if not found then raise exception 'ANNOUNCEMENT_NOT_FOUND'; end if;

  if p_archived then
    update public.member_announcements
    set archived_at = now(), archived_by = v_actor, published_at = null, last_changed_by = v_actor
    where id = p_announcement_id and archived_at is null;
  else
    update public.member_announcements
    set archived_at = null, archived_by = null, last_changed_by = v_actor
    where id = p_announcement_id and archived_at is not null;
  end if;
end;
$$;

drop policy if exists "member_announcements_select_live_or_admin" on public.member_announcements;
do $announcement_policy$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'member_announcements' and column_name = 'audience'
  ) and to_regclass('public.member_announcement_targets') is not null then
    execute $policy$
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
    $policy$;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'member_announcements' and column_name = 'audience'
  ) then
    execute $policy$
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
            and audience = 'all'
          )
        );
    $policy$;
  else
    execute $policy$
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
          )
        );
    $policy$;
  end if;
end;
$announcement_policy$;

alter table public.member_announcement_admin_events enable row level security;
drop policy if exists "member_announcement_admin_events_admin_read" on public.member_announcement_admin_events;
create policy "member_announcement_admin_events_admin_read"
  on public.member_announcement_admin_events for select
  to authenticated
  using ((select public.is_admin()));

revoke all on table public.member_announcement_admin_events from public, anon, authenticated;
grant select on table public.member_announcement_admin_events to authenticated;
revoke execute on function public.touch_member_announcement_updated_at() from public, anon, authenticated;
revoke execute on function public.prepare_member_announcement_lifecycle() from public, anon, authenticated;
revoke execute on function public.guard_member_announcement_delete() from public, anon, authenticated;
revoke execute on function public.audit_member_announcement_lifecycle() from public, anon, authenticated;
revoke execute on function public.admin_archive_member_announcement(uuid, boolean) from public, anon;
revoke execute on function public.my_member_announcements() from public, anon;
revoke execute on function public.dismiss_member_announcement(uuid) from public, anon;
grant execute on function public.admin_archive_member_announcement(uuid, boolean) to authenticated;
grant execute on function public.my_member_announcements() to authenticated;
grant execute on function public.dismiss_member_announcement(uuid) to authenticated;

insert into public.xert_schema_capabilities (capability)
values ('announcement_archival')
on conflict (capability) do nothing;
