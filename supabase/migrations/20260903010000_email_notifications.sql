-- Transactional email from the database through Resend.
-- The database sends email itself (pg_net + Vault), so no browser, app or
-- Vercel function ever holds the Resend key. Every send is logged in
-- public.email_log, every type can be switched off in the Command Centre, and
-- nothing is sent until the owner turns the master switch on.

create extension if not exists pg_net with schema extensions;

create table if not exists public.email_settings (
  id smallint primary key default 1,
  enabled boolean not null default false,
  from_name text not null default 'XERT Fitness',
  from_address text not null default 'hello@contact.xertfitness.com.au',
  reply_to text,
  owner_alert_email text,
  types jsonb not null default '{
    "booking_decisions": true,
    "booking_cancellations": true,
    "class_cancellations": true,
    "pt_decisions": true,
    "enquiry_acknowledgements": true,
    "welcome": true,
    "owner_alerts": true,
    "campaign": true
  }'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint email_settings_singleton check (id = 1),
  constraint email_settings_from_name_check check (char_length(from_name) between 1 and 80),
  constraint email_settings_from_address_check check (from_address ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  constraint email_settings_reply_to_check check (reply_to is null or reply_to ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  constraint email_settings_owner_alert_check check (owner_alert_email is null or owner_alert_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$')
);
insert into public.email_settings (id) values (1) on conflict (id) do nothing;
update public.email_settings set types = types || '{"campaign": true}'::jsonb where id = 1 and not (types ? 'campaign');

-- One row per owner-written email sent to a group (the email twin of an SMS campaign).
create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  body text not null,
  audience text,
  recipient_count integer not null default 0,
  queued_count integer not null default 0,
  skipped_count integer not null default 0,
  sent_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint email_campaigns_subject_check check (char_length(subject) between 1 and 150),
  constraint email_campaigns_body_check check (char_length(body) between 1 and 5000)
);
create index if not exists email_campaigns_recent_idx on public.email_campaigns (created_at desc);

create table if not exists public.email_log (
  id uuid primary key default gen_random_uuid(),
  email_type text not null,
  recipient text not null,
  subject text not null,
  status text not null default 'queued',
  provider_message_id text,
  error text,
  related_table text,
  related_id text,
  request_id bigint,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint email_log_type_check check (email_type ~ '^[a-z_]{1,60}$'),
  constraint email_log_status_check check (status in ('queued', 'sent', 'failed', 'skipped', 'unknown')),
  constraint email_log_recipient_check check (char_length(recipient) <= 320),
  constraint email_log_subject_check check (char_length(subject) <= 200),
  constraint email_log_error_check check (error is null or char_length(error) <= 500)
);
create index if not exists email_log_recent_idx on public.email_log (created_at desc);
create index if not exists email_log_queued_idx on public.email_log (status) where status = 'queued';

alter table public.email_settings enable row level security;
alter table public.email_log enable row level security;
alter table public.email_campaigns enable row level security;
drop policy if exists "email_campaigns_admin_read" on public.email_campaigns;
create policy "email_campaigns_admin_read" on public.email_campaigns for select to authenticated using (public.is_admin());
revoke all on table public.email_campaigns from public, anon, authenticated;
grant select on table public.email_campaigns to authenticated;
drop policy if exists "email_settings_admin_read" on public.email_settings;
create policy "email_settings_admin_read" on public.email_settings for select to authenticated using (public.is_admin());
drop policy if exists "email_log_admin_read" on public.email_log;
create policy "email_log_admin_read" on public.email_log for select to authenticated using (public.is_admin());
revoke all on table public.email_settings from public, anon, authenticated;
revoke all on table public.email_log from public, anon, authenticated;
grant select on table public.email_settings to authenticated;
grant select on table public.email_log to authenticated;

-- ─── Sending ────────────────────────────────────────────────────────────────

create or replace function public.email_provider_key()
returns text
language sql
security definer
set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'resend_api_key' limit 1;
$$;
revoke execute on function public.email_provider_key() from public, anon, authenticated;

create or replace function public.email_layout(p_title text, p_body_html text, p_cta_label text default null, p_cta_url text default null)
returns text
language sql
immutable
as $$
  select '<!doctype html><html><body style="margin:0;padding:0;background:#0d1720;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#F1F3F4;">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0d1720;padding:32px 16px;"><tr><td align="center">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#101820;border:1px solid rgba(123,167,188,0.2);border-radius:16px;overflow:hidden;">'
    || '<tr><td style="padding:28px 28px 8px;"><img src="https://xertfitness.com.au/assets/xert-logo-horizontal-light.png" alt="XERT Fitness" width="150" style="display:block;width:150px;max-width:60%;height:auto;border:0;"><div style="margin-top:14px;font-size:12px;letter-spacing:0.2em;text-transform:uppercase;color:#7BA7BC;">Beat Your Best</div>'
    || '<h1 style="margin:10px 0 0;font-size:26px;line-height:1.15;color:#F1F3F4;">' || p_title || '</h1></td></tr>'
    || '<tr><td style="padding:8px 28px 8px;font-size:16px;line-height:1.55;color:#D1DDE6;">' || p_body_html || '</td></tr>'
    || case when p_cta_label is not null and p_cta_url is not null
         then '<tr><td style="padding:8px 28px 28px;"><a href="' || p_cta_url || '" style="display:inline-block;background:#7BA7BC;color:#101820;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:12px;">' || p_cta_label || '</a></td></tr>'
         else '<tr><td style="padding:0 28px 20px;"></td></tr>' end
    || '<tr><td style="padding:16px 28px 24px;border-top:1px solid rgba(123,167,188,0.15);font-size:12px;line-height:1.5;color:rgba(209,221,230,0.55);">XERT Fitness · Semi-private functional fitness coaching in Kingaroy, Queensland.<br>Reply to this email if you have a question. <a href="https://xertfitness.com.au" style="color:#7BA7BC;text-decoration:none;">xertfitness.com.au</a></td></tr>'
    || '</table></td></tr></table></body></html>';
$$;

-- Queues one email. Returns the log row id. Never raises into the caller's
-- transaction: a failure to hand off is recorded as failed/skipped instead.
create or replace function public.queue_email(
  p_type text,
  p_to text,
  p_subject text,
  p_html text,
  p_text text default null,
  p_related_table text default null,
  p_related_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_settings public.email_settings%rowtype;
  v_key text;
  v_log_id uuid;
  v_request_id bigint;
  v_to text := lower(trim(coalesce(p_to, '')));
  v_subject text := left(trim(coalesce(p_subject, '')), 200);
  v_from text;
  v_body jsonb;
begin
  if v_to !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or v_subject = '' then
    return null;
  end if;
  select * into v_settings from public.email_settings where id = 1;
  insert into public.email_log (email_type, recipient, subject, related_table, related_id)
  values (p_type, v_to, v_subject, p_related_table, p_related_id)
  returning id into v_log_id;

  if v_settings.id is null or not v_settings.enabled then
    update public.email_log set status = 'skipped', error = 'EMAIL_DISABLED', updated_at = now() where id = v_log_id;
    return v_log_id;
  end if;
  if p_type <> 'test' and coalesce((v_settings.types ->> p_type)::boolean, true) = false then
    update public.email_log set status = 'skipped', error = 'EMAIL_TYPE_DISABLED', updated_at = now() where id = v_log_id;
    return v_log_id;
  end if;
  v_key := public.email_provider_key();
  if v_key is null or v_key = '' then
    update public.email_log set status = 'skipped', error = 'RESEND_API_KEY_MISSING', updated_at = now() where id = v_log_id;
    return v_log_id;
  end if;

  v_from := v_settings.from_name || ' <' || v_settings.from_address || '>';
  v_body := jsonb_build_object(
    'from', v_from,
    'to', jsonb_build_array(v_to),
    'subject', v_subject,
    'html', p_html,
    'text', coalesce(p_text, regexp_replace(p_html, '<[^>]+>', ' ', 'g'))
  );
  if v_settings.reply_to is not null then
    v_body := v_body || jsonb_build_object('reply_to', v_settings.reply_to);
  end if;

  begin
    v_request_id := net.http_post(
      url := 'https://api.resend.com/emails',
      body := v_body,
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
      timeout_milliseconds := 8000
    );
    update public.email_log set request_id = v_request_id, updated_at = now() where id = v_log_id;
  exception when others then
    update public.email_log set status = 'failed', error = left('HANDOFF_FAILED: ' || sqlerrm, 500), updated_at = now() where id = v_log_id;
  end;
  return v_log_id;
end;
$$;
revoke execute on function public.queue_email(text, text, text, text, text, text, text) from public, anon, authenticated;

-- Pulls provider responses (pg_net keeps them for a few hours) into the log.
create or replace function public.admin_reconcile_email_log()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_count integer := 0;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;
  with responses as (
    select l.id as log_id, r.status_code, r.content, r.error_msg, r.timed_out, r.created
    from public.email_log l
    join net._http_response r on r.id = l.request_id
    where l.status = 'queued' and l.request_id is not null
  )
  update public.email_log l set
    status = case when responses.status_code between 200 and 299 and not coalesce(responses.timed_out, false) then 'sent' else 'failed' end,
    provider_message_id = case when responses.status_code between 200 and 299 then left(responses.content::jsonb ->> 'id', 120) else null end,
    error = case when responses.status_code between 200 and 299 and not coalesce(responses.timed_out, false) then null
                 else left(coalesce(responses.error_msg, 'HTTP ' || coalesce(responses.status_code::text, 'timeout') || ' ' || coalesce(responses.content, '')), 500) end,
    sent_at = case when responses.status_code between 200 and 299 then responses.created else null end,
    updated_at = now()
  from responses
  where l.id = responses.log_id;
  get diagnostics v_count = row_count;
  -- Responses older than the retention window can no longer be checked.
  update public.email_log set status = 'unknown', error = 'PROVIDER_RESPONSE_EXPIRED', updated_at = now()
  where status = 'queued' and request_id is not null and created_at < now() - interval '6 hours';
  return v_count;
end;
$$;
revoke execute on function public.admin_reconcile_email_log() from public, anon;
grant execute on function public.admin_reconcile_email_log() to authenticated;

create or replace function public.admin_get_email_settings()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.email_settings%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;
  select * into v_settings from public.email_settings where id = 1;
  return to_jsonb(v_settings) || jsonb_build_object('provider_ready', coalesce(public.email_provider_key(), '') <> '');
end;
$$;
revoke execute on function public.admin_get_email_settings() from public, anon;
grant execute on function public.admin_get_email_settings() to authenticated;

create or replace function public.admin_update_email_settings(p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_types jsonb;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;
  v_types := coalesce(p_patch -> 'types', '{}'::jsonb);
  if jsonb_typeof(v_types) <> 'object' then
    raise exception 'EMAIL_TYPES_INVALID';
  end if;
  update public.email_settings set
    enabled = coalesce((p_patch ->> 'enabled')::boolean, enabled),
    from_name = coalesce(nullif(left(trim(p_patch ->> 'from_name'), 80), ''), from_name),
    from_address = coalesce(nullif(lower(trim(p_patch ->> 'from_address')), ''), from_address),
    reply_to = case when p_patch ? 'reply_to' then nullif(lower(trim(p_patch ->> 'reply_to')), '') else reply_to end,
    owner_alert_email = case when p_patch ? 'owner_alert_email' then nullif(lower(trim(p_patch ->> 'owner_alert_email')), '') else owner_alert_email end,
    types = types || v_types,
    updated_by = auth.uid(),
    updated_at = now()
  where id = 1;
  return public.admin_get_email_settings();
end;
$$;
revoke execute on function public.admin_update_email_settings(jsonb) from public, anon;
grant execute on function public.admin_update_email_settings(jsonb) to authenticated;

create or replace function public.admin_send_test_email(p_to text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_row public.email_log%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;
  v_id := public.queue_email(
    'test', p_to, 'XERT email is working',
    public.email_layout('Email is working', '<p>This is a test from the XERT Command Centre. Automatic emails will look like this.</p>', 'Open the Command Centre', 'https://xertfitness.com.au/admin'),
    null, 'email_settings', '1'
  );
  if v_id is null then
    raise exception 'EMAIL_ADDRESS_INVALID';
  end if;
  select * into v_row from public.email_log where id = v_id;
  return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'error', v_row.error);
end;
$$;
revoke execute on function public.admin_send_test_email(text) from public, anon;
grant execute on function public.admin_send_test_email(text) to authenticated;

-- Owner-written text → safe HTML paragraphs. Blank lines separate paragraphs,
-- single line breaks stay as line breaks, and nothing the owner types can
-- inject markup into the branded layout.
create or replace function public.email_body_html(p_text text)
returns text
language sql
immutable
as $$
  select coalesce(string_agg('<p>' || replace(paragraph, E'\n', '<br>') || '</p>', '' order by position), '')
  from (
    select trim(both E'\n' from parts.part) as paragraph, parts.position
    from regexp_split_to_table(
      replace(replace(replace(replace(replace(coalesce(p_text, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), E'\r', ''),
      E'\n{2,}'
    ) with ordinality as parts(part, position)
  ) as paragraphs
  where paragraph <> '';
$$;

-- Send one owner-written email to a list of people. Each recipient gets their
-- own message (no shared To/CC), the same switches apply as to every other
-- email, and every send lands in the log under the campaign id.
create or replace function public.admin_send_bulk_email(
  p_subject text,
  p_body text,
  p_recipients jsonb,
  p_audience text default null,
  p_greeting boolean default true,
  p_cta_label text default null,
  p_cta_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject text := left(trim(coalesce(p_subject, '')), 150);
  v_body text := left(trim(coalesce(p_body, '')), 5000);
  v_cta_label text := nullif(left(trim(coalesce(p_cta_label, '')), 60), '');
  v_cta_url text := nullif(trim(coalesce(p_cta_url, '')), '');
  v_campaign_id uuid;
  v_body_html text;
  v_html text;
  v_log_id uuid;
  v_status text;
  v_queued integer := 0;
  v_skipped integer := 0;
  v_failed integer := 0;
  v_invalid integer := 0;
  v_count integer := 0;
  v_seen text[] := '{}';
  v_email text;
  v_name text;
  r jsonb;
  v_results jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if v_subject = '' then raise exception 'EMAIL_SUBJECT_REQUIRED'; end if;
  if v_body = '' then raise exception 'EMAIL_BODY_REQUIRED'; end if;
  if p_recipients is null or jsonb_typeof(p_recipients) <> 'array' or jsonb_array_length(p_recipients) = 0 then
    raise exception 'EMAIL_RECIPIENTS_REQUIRED';
  end if;
  if jsonb_array_length(p_recipients) > 500 then
    raise exception 'EMAIL_RECIPIENTS_TOO_MANY';
  end if;
  if v_cta_url is not null and v_cta_url !~ '^https://' then
    raise exception 'EMAIL_CTA_URL_INVALID';
  end if;
  if v_cta_label is null or v_cta_url is null then
    v_cta_label := null;
    v_cta_url := null;
  end if;

  v_body_html := public.email_body_html(v_body);
  insert into public.email_campaigns (subject, body, audience, sent_by)
  values (v_subject, v_body, nullif(left(trim(coalesce(p_audience, '')), 60), ''), auth.uid())
  returning id into v_campaign_id;

  for r in select value from jsonb_array_elements(p_recipients) loop
    v_email := lower(trim(coalesce(r ->> 'email', '')));
    v_name := nullif(trim(coalesce(r ->> 'name', '')), '');
    if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
      v_invalid := v_invalid + 1;
      continue;
    end if;
    if v_email = any(v_seen) then continue; end if;
    v_seen := array_append(v_seen, v_email);
    v_count := v_count + 1;
    v_html := public.email_layout(
      v_subject,
      case when coalesce(p_greeting, true) then '<p>Hi ' || public.email_first_name(v_name) || ',</p>' else '' end || v_body_html,
      v_cta_label, v_cta_url
    );
    v_log_id := public.queue_email('campaign', v_email, v_subject, v_html, v_body, 'email_campaigns', v_campaign_id::text);
    select status into v_status from public.email_log where id = v_log_id;
    if v_status = 'queued' then v_queued := v_queued + 1;
    elsif v_status = 'failed' then v_failed := v_failed + 1;
    else v_skipped := v_skipped + 1;
    end if;
    v_results := v_results || jsonb_build_object('email', v_email, 'name', v_name, 'status', v_status);
  end loop;

  update public.email_campaigns
     set recipient_count = v_count, queued_count = v_queued, skipped_count = v_skipped + v_failed
   where id = v_campaign_id;

  return jsonb_build_object(
    'campaign_id', v_campaign_id,
    'recipients', v_count,
    'queued', v_queued,
    'skipped', v_skipped,
    'failed', v_failed,
    'invalid', v_invalid,
    'results', v_results
  );
end;
$$;
revoke execute on function public.admin_send_bulk_email(text, text, jsonb, text, boolean, text, text) from public, anon;
grant execute on function public.admin_send_bulk_email(text, text, jsonb, text, boolean, text, text) to authenticated;

-- ─── Content helpers ─────────────────────────────────────────────────────────

create or replace function public.email_class_line(p_session public.class_sessions)
returns text
language sql
stable
as $$
  select coalesce(p_session.title, 'XERT class') || ' · '
    || to_char(p_session.start_time at time zone 'Australia/Brisbane', 'Dy DD Mon, HH12:MI AM')
    || coalesce(' · ' || nullif(p_session.coach_name, ''), '')
    || coalesce(' · ' || nullif(p_session.location_zone, ''), '');
$$;

create or replace function public.email_first_name(p_full_name text)
returns text
language sql
immutable
as $$
  select coalesce(nullif(split_part(trim(coalesce(p_full_name, '')), ' ', 1), ''), 'there');
$$;

create or replace function public.email_owner_alert(p_type text, p_subject text, p_body_html text, p_related_table text, p_related_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_to text;
begin
  select owner_alert_email into v_to from public.email_settings where id = 1;
  if v_to is null then return; end if;
  perform public.queue_email('owner_alerts', v_to, p_subject,
    public.email_layout(p_subject, p_body_html, 'Open the Command Centre', 'https://xertfitness.com.au/admin'),
    null, p_related_table, p_related_id);
end;
$$;
revoke execute on function public.email_owner_alert(text, text, text, text, text) from public, anon, authenticated;

-- Catch-up: confirmations decided before email existed. Emails every
-- confirmed place in an upcoming published class that has not yet had a
-- "You are booked in" email, so nobody gets it twice.
create or replace function public.admin_email_confirmed_bookings(p_session_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_session public.class_sessions%rowtype;
  v_line text;
  v_log_id uuid;
  v_status text;
  v_queued integer := 0;
  v_skipped integer := 0;
  v_already integer := 0;
  v_sessions uuid[] := '{}';
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;
  for r in
    select p.email, p.full_name, b.class_session_id, 'session_bookings' as source, b.id::text as record_id, 'https://xertfitness.com.au/account' as cta_url, 'View my bookings' as cta_label
    from public.session_bookings b
    join public.profiles p on p.id = b.user_id
    join public.class_sessions s on s.id = b.class_session_id
    where b.status = 'confirmed' and s.status = 'published' and s.start_time > now()
      and (p_session_id is null or s.id = p_session_id)
    union all
    select c.email, c.full_name, c.class_session_id, 'class_bookings', c.id::text, 'https://xertfitness.com.au/timetable', 'See the timetable'
    from public.class_bookings c
    join public.class_sessions s on s.id = c.class_session_id
    where c.status = 'confirmed' and s.status = 'published' and s.start_time > now()
      and (p_session_id is null or s.id = p_session_id)
  loop
    if r.email is null then continue; end if;
    if exists (
      select 1 from public.email_log l
      where l.related_table = r.source and l.related_id = r.record_id
        and l.email_type = 'booking_decisions' and l.status in ('queued', 'sent')
        and l.subject like 'You are booked in%'
    ) then
      v_already := v_already + 1;
      continue;
    end if;
    select * into v_session from public.class_sessions where id = r.class_session_id;
    v_line := public.email_class_line(v_session);
    v_log_id := public.queue_email('booking_decisions', r.email, 'You are booked in: ' || coalesce(v_session.title, 'XERT class'),
      public.email_layout('You are booked in', '<p>Hi ' || public.email_first_name(r.full_name) || ',</p><p>Your place is confirmed for:</p><p><strong>' || v_line || '</strong></p><p>See you there.</p>', r.cta_label, r.cta_url),
      null, r.source, r.record_id);
    select status into v_status from public.email_log where id = v_log_id;
    if v_status = 'queued' then v_queued := v_queued + 1; else v_skipped := v_skipped + 1; end if;
    if not (r.class_session_id = any(v_sessions)) then v_sessions := array_append(v_sessions, r.class_session_id); end if;
  end loop;
  return jsonb_build_object('queued', v_queued, 'skipped', v_skipped, 'already_emailed', v_already, 'classes', coalesce(array_length(v_sessions, 1), 0));
end;
$$;
revoke execute on function public.admin_email_confirmed_bookings(uuid) from public, anon;
grant execute on function public.admin_email_confirmed_bookings(uuid) to authenticated;

-- ─── Triggers ────────────────────────────────────────────────────────────────

-- Member bookings: confirmed / waitlisted / declined / cancelled.
create or replace function public.email_on_session_booking_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_session public.class_sessions%rowtype;
  v_line text;
  v_name text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return new; end if;
  select * into v_profile from public.profiles where id = new.user_id;
  select * into v_session from public.class_sessions where id = new.class_session_id;
  if v_profile.email is null or v_session.id is null then return new; end if;
  v_line := public.email_class_line(v_session);
  v_name := public.email_first_name(v_profile.full_name);

  if tg_op = 'INSERT' then
    if new.status = 'requested' then
      perform public.email_owner_alert('owner_alerts', 'New class request: ' || coalesce(v_profile.full_name, v_profile.email),
        '<p>' || coalesce(v_profile.full_name, v_profile.email) || ' has asked for a place in:</p><p><strong>' || v_line || '</strong></p><p>Confirm or decline it under Classes → Class requests.</p>',
        'session_bookings', new.id::text);
    elsif new.status = 'confirmed' then
      perform public.queue_email('booking_decisions', v_profile.email, 'You are booked in: ' || coalesce(v_session.title, 'XERT class'),
        public.email_layout('You are booked in', '<p>Hi ' || v_name || ',</p><p>Your place is confirmed for:</p><p><strong>' || v_line || '</strong></p><p>See you there.</p>', 'View my bookings', 'https://xertfitness.com.au/account'),
        null, 'session_bookings', new.id::text);
    end if;
    return new;
  end if;

  if new.status = 'confirmed' then
    perform public.queue_email('booking_decisions', v_profile.email, 'You are booked in: ' || coalesce(v_session.title, 'XERT class'),
      public.email_layout('You are booked in', '<p>Hi ' || v_name || ',</p><p>Your place is confirmed for:</p><p><strong>' || v_line || '</strong></p><p>See you there.</p>', 'View my bookings', 'https://xertfitness.com.au/account'),
      null, 'session_bookings', new.id::text);
  elsif new.status = 'waitlisted' then
    perform public.queue_email('booking_decisions', v_profile.email, 'You are on the waitlist: ' || coalesce(v_session.title, 'XERT class'),
      public.email_layout('You are on the waitlist', '<p>Hi ' || v_name || ',</p><p>That class is full for now, so we have added you to the waitlist for:</p><p><strong>' || v_line || '</strong></p><p>We will email you the moment a place opens up.</p>', 'View my bookings', 'https://xertfitness.com.au/account'),
      null, 'session_bookings', new.id::text);
  elsif new.status = 'declined' then
    perform public.queue_email('booking_decisions', v_profile.email, 'About your request: ' || coalesce(v_session.title, 'XERT class'),
      public.email_layout('We could not fit you in this time', '<p>Hi ' || v_name || ',</p><p>We were not able to confirm your request for:</p><p><strong>' || v_line || '</strong></p><p>Any credit you reserved has been returned. Have a look at the timetable for another session.</p>', 'See the timetable', 'https://xertfitness.com.au/timetable'),
      null, 'session_bookings', new.id::text);
  elsif new.status = 'cancelled' then
    perform public.queue_email('booking_cancellations', v_profile.email, 'Booking cancelled: ' || coalesce(v_session.title, 'XERT class'),
      public.email_layout('Your booking was cancelled', '<p>Hi ' || v_name || ',</p><p>Your booking has been cancelled for:</p><p><strong>' || v_line || '</strong></p><p>If that was not you, reply to this email and we will sort it out.</p>', 'Book another class', 'https://xertfitness.com.au/booking'),
      null, 'session_bookings', new.id::text);
  end if;
  return new;
end;
$$;
drop trigger if exists email_on_session_booking_change on public.session_bookings;
create trigger email_on_session_booking_change
  after insert or update of status on public.session_bookings
  for each row execute function public.email_on_session_booking_change();

-- Public class requests (people without an account yet).
create or replace function public.email_on_class_booking_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.class_sessions%rowtype;
  v_line text;
  v_name text := public.email_first_name(new.full_name);
begin
  select * into v_session from public.class_sessions where id = new.class_session_id;
  if new.email is null or v_session.id is null then return new; end if;
  v_line := public.email_class_line(v_session);
  if tg_op = 'INSERT' then
    perform public.queue_email('enquiry_acknowledgements', new.email, 'We got your request: ' || coalesce(v_session.title, 'XERT class'),
      public.email_layout('Thanks, we have your request', '<p>Hi ' || v_name || ',</p><p>You asked for a place in:</p><p><strong>' || v_line || '</strong></p><p>We will confirm it shortly. Keep an eye on your inbox.</p>', null, null),
      null, 'class_bookings', new.id::text);
    perform public.email_owner_alert('owner_alerts', 'New class request: ' || coalesce(new.full_name, new.email),
      '<p>' || coalesce(new.full_name, new.email) || ' (' || new.email || coalesce(', ' || nullif(new.phone, ''), '') || ') asked for a place in:</p><p><strong>' || v_line || '</strong></p>',
      'class_bookings', new.id::text);
    return new;
  end if;
  if new.status is not distinct from old.status then return new; end if;
  if new.status = 'confirmed' then
    perform public.queue_email('booking_decisions', new.email, 'You are booked in: ' || coalesce(v_session.title, 'XERT class'),
      public.email_layout('You are booked in', '<p>Hi ' || v_name || ',</p><p>Your place is confirmed for:</p><p><strong>' || v_line || '</strong></p><p>See you there.</p>', 'See the timetable', 'https://xertfitness.com.au/timetable'),
      null, 'class_bookings', new.id::text);
  elsif new.status = 'waitlisted' then
    perform public.queue_email('booking_decisions', new.email, 'You are on the waitlist: ' || coalesce(v_session.title, 'XERT class'),
      public.email_layout('You are on the waitlist', '<p>Hi ' || v_name || ',</p><p>That class is full for now, so you are on the waitlist for:</p><p><strong>' || v_line || '</strong></p><p>We will email you if a place opens up.</p>', null, null),
      null, 'class_bookings', new.id::text);
  elsif new.status = 'declined' then
    perform public.queue_email('booking_decisions', new.email, 'About your request: ' || coalesce(v_session.title, 'XERT class'),
      public.email_layout('We could not fit you in this time', '<p>Hi ' || v_name || ',</p><p>We were not able to confirm your request for:</p><p><strong>' || v_line || '</strong></p><p>Have a look at the timetable for another session.</p>', 'See the timetable', 'https://xertfitness.com.au/timetable'),
      null, 'class_bookings', new.id::text);
  elsif new.status = 'cancelled' then
    perform public.queue_email('booking_cancellations', new.email, 'Request cancelled: ' || coalesce(v_session.title, 'XERT class'),
      public.email_layout('Your request was cancelled', '<p>Hi ' || v_name || ',</p><p>Your request has been cancelled for:</p><p><strong>' || v_line || '</strong></p><p>Reply to this email if that is not right.</p>', 'See the timetable', 'https://xertfitness.com.au/timetable'),
      null, 'class_bookings', new.id::text);
  end if;
  return new;
end;
$$;
drop trigger if exists email_on_class_booking_change on public.class_bookings;
create trigger email_on_class_booking_change
  after insert or update of status on public.class_bookings
  for each row execute function public.email_on_class_booking_change();

-- A class cancelled by XERT: tell everyone holding a place or a request.
create or replace function public.email_on_class_cancelled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line text;
  r record;
begin
  if new.status is not distinct from old.status or new.status <> 'cancelled' then return new; end if;
  v_line := public.email_class_line(new);
  for r in
    select p.email, p.full_name, 'session_bookings' as source, b.id::text as record_id
    from public.session_bookings b join public.profiles p on p.id = b.user_id
    where b.class_session_id = new.id and b.status in ('requested', 'confirmed', 'waitlisted')
    union all
    select c.email, c.full_name, 'class_bookings', c.id::text
    from public.class_bookings c
    where c.class_session_id = new.id and c.status in ('requested', 'confirmed', 'waitlisted')
  loop
    if r.email is not null then
      perform public.queue_email('class_cancellations', r.email, 'Class cancelled: ' || coalesce(new.title, 'XERT class'),
        public.email_layout('Sorry, this class is cancelled', '<p>Hi ' || public.email_first_name(r.full_name) || ',</p><p>We have had to cancel:</p><p><strong>' || v_line || '</strong></p><p>Any credit you used has been returned. Pick another session whenever you are ready.</p>', 'See the timetable', 'https://xertfitness.com.au/timetable'),
        null, r.source, r.record_id);
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists email_on_class_cancelled on public.class_sessions;
create trigger email_on_class_cancelled
  after update of status on public.class_sessions
  for each row execute function public.email_on_class_cancelled();

-- Personal training requests.
create or replace function public.email_on_pt_request_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := public.email_first_name(new.full_name);
begin
  if new.email is null then return new; end if;
  if tg_op = 'INSERT' then
    perform public.queue_email('enquiry_acknowledgements', new.email, 'We got your personal training request',
      public.email_layout('Thanks, we have your request', '<p>Hi ' || v_name || ',</p><p>Thanks for asking about personal training at XERT. We will be in touch to confirm a time.</p>', null, null),
      null, 'private_session_requests', new.id::text);
    perform public.email_owner_alert('owner_alerts', 'New PT request: ' || coalesce(new.full_name, new.email),
      '<p>' || coalesce(new.full_name, new.email) || ' (' || new.email || ') asked about personal training. Review it under Classes → Personal training.</p>',
      'private_session_requests', new.id::text);
    return new;
  end if;
  if new.status is not distinct from old.status then return new; end if;
  if new.status = 'approved' then
    perform public.queue_email('pt_decisions', new.email, 'Your personal training request is approved',
      public.email_layout('Approved', '<p>Hi ' || v_name || ',</p><p>Your personal training request is approved. We will confirm the exact time with you directly.</p>', null, null),
      null, 'private_session_requests', new.id::text);
  elsif new.status = 'declined' then
    perform public.queue_email('pt_decisions', new.email, 'About your personal training request',
      public.email_layout('About your request', '<p>Hi ' || v_name || ',</p><p>We were not able to take on your personal training request right now. Reply to this email if you would like to talk about other options.</p>', null, null),
      null, 'private_session_requests', new.id::text);
  elsif new.status = 'reschedule_requested' then
    perform public.queue_email('pt_decisions', new.email, 'Can we find another time?',
      public.email_layout('Can we find another time?', '<p>Hi ' || v_name || ',</p><p>The time you asked for does not work, so we would like to reschedule your personal training session. Reply with a few times that suit you.</p>', null, null),
      null, 'private_session_requests', new.id::text);
  end if;
  return new;
end;
$$;
drop trigger if exists email_on_pt_request_change on public.private_session_requests;
create trigger email_on_pt_request_change
  after insert or update of status on public.private_session_requests
  for each row execute function public.email_on_pt_request_change();

-- New enquiries from the website.
create or replace function public.email_on_member_interest()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := public.email_first_name(new.full_name);
begin
  if new.email is null then return new; end if;
  perform public.queue_email('enquiry_acknowledgements', new.email, 'Thanks for your interest in XERT',
    public.email_layout('Thanks, ' || v_name, '<p>We have your details and will be in touch soon about training at XERT.</p><p>In the meantime, have a look at what is on.</p>', 'See the timetable', 'https://xertfitness.com.au/timetable'),
    null, 'member_interest', new.id::text);
  perform public.email_owner_alert('owner_alerts', 'New enquiry: ' || coalesce(new.full_name, new.email),
    '<p>' || coalesce(new.full_name, new.email) || ' (' || new.email || coalesce(', ' || nullif(new.phone, ''), '') || ') registered interest. Review them under People → New enquiries.</p>',
    'member_interest', new.id::text);
  return new;
end;
$$;
drop trigger if exists email_on_member_interest on public.member_interest;
create trigger email_on_member_interest
  after insert on public.member_interest
  for each row execute function public.email_on_member_interest();

-- Welcome new member accounts.
create or replace function public.email_on_profile_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null then return new; end if;
  perform public.queue_email('welcome', new.email, 'Welcome to XERT',
    public.email_layout('Welcome to XERT, ' || public.email_first_name(new.full_name), '<p>Your member account is ready. From your account you can book classes, buy session packs and keep track of your training.</p>', 'Open my account', 'https://xertfitness.com.au/account'),
    null, 'profiles', new.id::text);
  return new;
end;
$$;
drop trigger if exists email_on_profile_created on public.profiles;
create trigger email_on_profile_created
  after insert on public.profiles
  for each row execute function public.email_on_profile_created();

insert into public.xert_schema_capabilities (capability)
values ('email_notifications')
on conflict (capability) do nothing;
