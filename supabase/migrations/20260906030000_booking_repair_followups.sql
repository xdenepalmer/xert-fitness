-- Follow-ups found by auditing the repair against the live database.
--
-- The repair fixed the two things that had production stopped, but an
-- adversarial pass over it found four more that reach a real person: a day desk
-- that never stops nagging, a stranger's typed name landing unescaped in the
-- owner's inbox, an apostrophe turning into &#39; in every plain-text email,
-- and a class marked "full" disappearing from the timetable for good.
--
-- Idempotent and safe to re-run.

-- ── 1. The day desk stops nagging about classes that are done ──────────────
-- The overhaul widened attendance_due to notice public sign-ups, and in doing so
-- made it permanent: attended and no_show were added to the same sum, so the
-- moment a roll call turned every confirmed row into one of those, the count it
-- tests stayed above zero and the class kept showing "Roll call due" forever.
--
-- The flag means what it says again: there is still somebody in this class
-- waiting to be marked. A completed class is never due.
create or replace function public.admin_daily_operations()
returns table (
  session_id uuid,
  title text,
  class_type text,
  start_time timestamptz,
  end_time timestamptz,
  status text,
  capacity integer,
  coach_name text,
  location_zone text,
  booking_mode text,
  requested_count bigint,
  confirmed_count bigint,
  waitlist_count bigint,
  attended_count bigint,
  no_show_count bigint,
  public_request_count bigint,
  public_confirmed_count bigint,
  public_waitlist_count bigint,
  places_held bigint,
  attendance_due boolean
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_local_day date := (now() at time zone 'Australia/Brisbane')::date;
  v_day_start timestamptz;
  v_day_end timestamptz;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;

  v_day_start := v_local_day::timestamp at time zone 'Australia/Brisbane';
  v_day_end := (v_local_day + 1)::timestamp at time zone 'Australia/Brisbane';

  return query
  select
    s.id,
    s.title,
    s.class_type,
    s.start_time,
    s.end_time,
    s.status,
    s.capacity,
    s.coach_name,
    s.location_zone,
    s.booking_mode,
    coalesce(member_counts.requested_count, 0),
    coalesce(member_counts.confirmed_count, 0),
    coalesce(member_counts.waitlist_count, 0),
    coalesce(member_counts.attended_count, 0),
    coalesce(member_counts.no_show_count, 0),
    coalesce(public_counts.request_count, 0),
    coalesce(public_counts.confirmed_count, 0),
    coalesce(public_counts.waitlist_count, 0),
    coalesce(member_counts.requested_count, 0)
      + coalesce(member_counts.confirmed_count, 0)
      + coalesce(public_counts.confirmed_count, 0),
    -- Still somebody left to mark, and the class is not already closed.
    s.start_time <= now()
      and s.status in ('published', 'full')
      and (
        coalesce(member_counts.confirmed_count, 0)
          + coalesce(public_counts.confirmed_count, 0)
      ) > 0
  from public.class_sessions s
  left join lateral (
    select
      count(*) filter (where b.status = 'requested') as requested_count,
      count(*) filter (where b.status = 'confirmed') as confirmed_count,
      count(*) filter (where b.status = 'waitlisted') as waitlist_count,
      count(*) filter (where b.status = 'attended') as attended_count,
      count(*) filter (where b.status = 'no_show') as no_show_count
    from public.session_bookings b
    where b.class_session_id = s.id
  ) member_counts on true
  left join lateral (
    select
      count(*) filter (where r.status = 'requested') as request_count,
      count(*) filter (where r.status = 'confirmed') as confirmed_count,
      count(*) filter (where r.status = 'waitlisted') as waitlist_count
    from public.class_bookings r
    where r.class_session_id = s.id
  ) public_counts on true
  where s.start_time >= v_day_start
    and s.start_time < v_day_end
    and s.status <> 'draft'
  order by s.start_time, s.id
  limit 50;
end;
$$;

revoke execute on function public.admin_daily_operations() from public, anon;
grant execute on function public.admin_daily_operations() to authenticated;

-- ── 2. A subject line is text, not markup ──────────────────────────────────
-- The repair escaped the email body but not the subject, and email_layout
-- splices its title into both <title> and <h1> unescaped. Every owner alert
-- about a public sign-up uses the visitor's own typed name as that subject, so
-- the one thing a stranger controls was still reaching the owner's inbox as
-- markup. Escaping it here covers every caller at once.
--
-- The title and the button label are prose and are escaped. The href is not:
-- every URL passed here is built from our own constants plus a uuid, never from
-- anything a visitor typed, and escaping it would mangle a future query string.
create or replace function public.email_layout(p_title text, p_body_html text, p_cta_label text default null, p_cta_url text default null)
returns text
language sql
immutable
as $$
  select '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>' || public.email_escape(p_title) || '</title></head>'
    || '<body style="margin:0;padding:0;background:#f4f5f7;">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0;">'
    || '<tr><td align="center">'
    || '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:14px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Helvetica,Arial,sans-serif;">'
    || '<tr><td style="padding:26px 32px 0;">'
    || '<p style="margin:0;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#8a94a6;">XERT Fitness</p>'
    || '<h1 style="margin:10px 0 0;font-size:28px;line-height:1.15;color:#101820;font-weight:800;">' || public.email_escape(p_title) || '</h1></td></tr>'
    || '<tr><td style="padding:18px 32px 0;font-size:16px;line-height:1.6;color:#3d4756;">' || coalesce(p_body_html, '') || '</td></tr>'
    || case when p_cta_label is null or p_cta_url is null then ''
       else '<tr><td style="padding:24px 32px 0;"><a href="' || p_cta_url || '" style="display:inline-block;background:#101820;color:#ffffff;text-decoration:none;padding:14px 26px;border-radius:10px;font-weight:700;font-size:15px;">' || public.email_escape(p_cta_label) || '</a></td></tr>' end
    || '<tr><td style="padding:28px 32px 30px;font-size:12px;line-height:1.6;color:#8a94a6;">XERT Fitness · Kingaroy QLD<br>You are receiving this because you contacted XERT or hold a XERT account.</td></tr>'
    || '</table></td></tr></table></body></html>';
$$;

-- ── 3. O'Brien is not O&#39;Brien ──────────────────────────────────────────
-- queue_email derives the plain-text alternative by stripping tags from the
-- HTML, with no entity decoding — so escaping the apostrophe, which the
-- project's own escaper deliberately never did, put "Hi O&#39;Brien," in the
-- text part of every public sign-up email. An apostrophe cannot open a tag or
-- an attribute in any of these positions, so escaping it bought nothing.
create or replace function public.email_escape(p_text text)
returns text
language sql
immutable
as $$
  select replace(replace(replace(replace(
    coalesce(p_text, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
$$;

-- ── 4. A class marked "full" is still on the timetable ─────────────────────
-- The overhaul taught every read path that 'full' is a live, listed class. The
-- one thing it could not reach is the row-level policy: anon may still only see
-- status = 'published', so a full class never reaches the public site however
-- the client asks for it — and the new timetable's whole waitlist path for full
-- classes would have shipped dead.
drop policy if exists "public_read_published_class_sessions" on public.class_sessions;
create policy "public_read_published_class_sessions" on public.class_sessions
  for select to anon, authenticated
  using (public_visible = true and status in ('published', 'full'));

-- The deployed editor writes public_visible = false whenever a class leaves
-- 'published', so any class already marked full is hidden by its own data and
-- would stay hidden after the policy opens. Put those rows back; nothing else
-- is touched.
update public.class_sessions
   set public_visible = true, updated_at = now()
 where status = 'full'
   and public_visible = false;

insert into public.xert_schema_capabilities (capability)
values ('booking_repair_followups')
on conflict (capability) do update set installed_at = excluded.installed_at;
