-- Class-cancel private notices (and the shared cancellation body) used to tell
-- every affected member that a reserved session credit was returned
-- automatically. Waitlisted members never held a credit; attended / no_show
-- places already consumed theirs; Stripe-refunded packs do not regain credits.
-- Align the notice with admin cancel toast honesty.

create or replace function public.create_class_cancellation_notice(p_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_title text;
  v_start_time timestamptz;
  v_announcement_id uuid;
  v_member_booking_count integer := 0;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;

  select title, start_time
    into v_title, v_start_time
    from public.class_sessions
    where id = p_session_id;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;

  select count(*)::integer
    into v_member_booking_count
    from public.session_bookings
    where class_session_id = p_session_id
      and status in ('requested', 'confirmed', 'waitlisted', 'attended', 'no_show');

  if v_member_booking_count = 0 then return null; end if;

  insert into public.member_announcements (
      title, body, tone, cta_label, cta_url, audience, source_kind, source_id,
      published_at, expires_at, created_by, last_changed_by
    ) values (
      'Class cancelled: ' || coalesce(nullif(btrim(v_title), ''), 'XERT class'),
      format(
        'Unfortunately, XERT has cancelled %s on %s. Reserved credits on open credit places are returned when the pack is still live; waitlist places never held a credit. Open XERT to choose another class, or contact us if you need help.',
        coalesce(nullif(btrim(v_title), ''), 'your class'),
        to_char(v_start_time at time zone 'Australia/Brisbane', 'FMDay FMDD FMMonth at FMHH12:MI am')
      ),
      'urgent',
      'Choose another class',
      '/booking',
      'targeted',
      'class_cancellation',
      p_session_id,
      now(),
      now() + interval '30 days',
      auth.uid(),
      auth.uid()
    )
    on conflict (source_kind, source_id)
      where source_kind is not null and source_id is not null
    do update set
      title = excluded.title,
      body = excluded.body,
      expires_at = greatest(public.member_announcements.expires_at, excluded.expires_at),
      updated_at = now(),
      last_changed_by = auth.uid()
  returning id into v_announcement_id;

  insert into public.member_announcement_targets (announcement_id, user_id)
    select v_announcement_id, booking.user_id
    from public.session_bookings booking
    where booking.class_session_id = p_session_id
      and booking.status in ('requested', 'confirmed', 'waitlisted', 'attended', 'no_show')
    group by booking.user_id
  on conflict (announcement_id, user_id) do nothing;

  return v_announcement_id;
end;
$$;

revoke all on function public.create_class_cancellation_notice(uuid) from public, anon, authenticated;

insert into public.xert_schema_capabilities (capability)
values ('class_cancel_notice_credit_honesty')
on conflict (capability) do nothing;
