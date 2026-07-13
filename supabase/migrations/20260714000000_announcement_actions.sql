-- Optional, validated calls to action for member announcements on web and iOS.

alter table public.member_announcements
  add column if not exists cta_label text,
  add column if not exists cta_url text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'member_announcements_cta_check'
      and conrelid = 'public.member_announcements'::regclass
  ) then
    alter table public.member_announcements
      add constraint member_announcements_cta_check check (
        (cta_label is null and cta_url is null)
        or (
          cta_label is not null
          and cta_url is not null
          and cta_label = btrim(cta_label)
          and char_length(cta_label) between 1 and 40
          and cta_label !~ '[[:cntrl:]]'
          and cta_url = btrim(cta_url)
          and char_length(cta_url) between 1 and 500
          and cta_url !~ '[[:cntrl:]]'
          and (
            (left(cta_url, 1) = '/' and left(cta_url, 2) <> '//')
            or (
              cta_url ~ '^https://'
              and split_part(split_part(cta_url, '://', 2), '/', 1) not like '%@%'
            )
          )
        )
      );
  end if;
end;
$$;

drop function if exists public.my_member_announcements();
create function public.my_member_announcements()
returns table (
  id uuid,
  title text,
  body text,
  tone text,
  cta_label text,
  cta_url text,
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
         announcement.cta_label, announcement.cta_url, announcement.published_at,
         announcement.expires_at, announcement.updated_at
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

revoke execute on function public.my_member_announcements() from public, anon;
grant execute on function public.my_member_announcements() to authenticated;

insert into public.xert_schema_capabilities (capability)
values ('announcement_actions')
on conflict (capability) do nothing;
