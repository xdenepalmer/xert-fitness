alter table public.site_content
  add column if not exists updated_at timestamptz not null default now();

alter table public.admin_settings
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.touch_shared_admin_record_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

revoke execute on function public.touch_shared_admin_record_updated_at() from public, anon, authenticated;

drop trigger if exists site_content_touch_updated_at on public.site_content;
create trigger site_content_touch_updated_at
  before update on public.site_content
  for each row execute function public.touch_shared_admin_record_updated_at();

drop trigger if exists admin_settings_touch_updated_at on public.admin_settings;
create trigger admin_settings_touch_updated_at
  before update on public.admin_settings
  for each row execute function public.touch_shared_admin_record_updated_at();

create or replace function public.admin_archive_member_announcement(
  p_announcement_id uuid,
  p_archived boolean,
  p_expected_updated_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_updated_at timestamptz;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_expected_updated_at is null then raise exception 'ANNOUNCEMENT_VERSION_REQUIRED'; end if;

  select announcement.updated_at
    into v_updated_at
  from public.member_announcements as announcement
  where announcement.id = p_announcement_id
  for update;

  if not found then raise exception 'ANNOUNCEMENT_NOT_FOUND'; end if;
  if v_updated_at is distinct from p_expected_updated_at then raise exception 'ANNOUNCEMENT_STALE'; end if;

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

revoke execute on function public.admin_archive_member_announcement(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.admin_archive_member_announcement(uuid, boolean, timestamptz) from public, anon;
grant execute on function public.admin_archive_member_announcement(uuid, boolean, timestamptz) to authenticated;

insert into public.xert_schema_capabilities (capability)
values ('shared_admin_optimistic_locking')
on conflict (capability) do nothing;

