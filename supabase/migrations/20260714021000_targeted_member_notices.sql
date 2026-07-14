-- Private, auditable notices sent by an administrator to one member account.

create or replace function public.admin_send_member_notice(
  p_user_id uuid,
  p_title text,
  p_body text,
  p_tone text default 'info',
  p_cta_label text default null,
  p_cta_url text default null,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_tone text := lower(btrim(coalesce(p_tone, 'info')));
  v_cta_label text := nullif(btrim(coalesce(p_cta_label, '')), '');
  v_cta_url text := nullif(btrim(coalesce(p_cta_url, '')), '');
  v_expires_at timestamptz := coalesce(p_expires_at, now() + interval '30 days');
  v_announcement_id uuid := gen_random_uuid();
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_user_id is null or not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'MEMBER_NOT_FOUND';
  end if;
  if char_length(v_title) < 3 or char_length(v_title) > 120 then raise exception 'NOTICE_TITLE_INVALID'; end if;
  if char_length(v_body) < 3 or char_length(v_body) > 2000 then raise exception 'NOTICE_BODY_INVALID'; end if;
  if v_tone not in ('info', 'action', 'urgent') then raise exception 'NOTICE_TONE_INVALID'; end if;
  if (v_cta_label is null) <> (v_cta_url is null) then raise exception 'NOTICE_ACTION_INCOMPLETE'; end if;
  if v_cta_label is not null and char_length(v_cta_label) > 40 then raise exception 'NOTICE_ACTION_INVALID'; end if;
  if v_cta_url is not null and not (v_cta_url ~ '^/[a-z0-9/_?=&.-]*$' or v_cta_url ~* '^https://') then
    raise exception 'NOTICE_ACTION_INVALID';
  end if;
  if v_expires_at <= now() or v_expires_at > now() + interval '1 year' then
    raise exception 'NOTICE_EXPIRY_INVALID';
  end if;

  insert into public.member_announcements (
    id, title, body, tone, cta_label, cta_url, audience, source_kind, source_id,
    published_at, expires_at, created_by, last_changed_by
  ) values (
    v_announcement_id, v_title, v_body, v_tone, v_cta_label, v_cta_url,
    'targeted', 'member_direct', v_announcement_id,
    now(), v_expires_at, auth.uid(), auth.uid()
  );

  insert into public.member_announcement_targets (announcement_id, user_id)
  values (v_announcement_id, p_user_id);

  return v_announcement_id;
end;
$$;

create or replace function public.admin_list_member_notices(p_user_id uuid)
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
set search_path = public, pg_temp
as $$
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
  limit 50;
end;
$$;

revoke execute on function public.admin_send_member_notice(uuid, text, text, text, text, text, timestamptz) from public, anon;
revoke execute on function public.admin_list_member_notices(uuid) from public, anon;
grant execute on function public.admin_send_member_notice(uuid, text, text, text, text, text, timestamptz) to authenticated;
grant execute on function public.admin_list_member_notices(uuid) to authenticated;

insert into public.xert_schema_capabilities (capability)
values ('targeted_member_notices')
on conflict (capability) do nothing;
