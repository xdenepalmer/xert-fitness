-- Booking-decision private notices (waitlist / decline / cancel) claimed a
-- reserved credit was always returned. That is false when the pack was already
-- Stripe-refunded (refund_credits_to_batch no-ops) and overstates waitlist /
-- consumed-place outcomes. Align copy with class-cancel notice honesty.

create or replace function public.admin_set_booking_status_with_notice(
  p_booking_id uuid,
  p_status text,
  p_request_id uuid
)
returns table (
  request_id uuid,
  booking_id uuid,
  session_id uuid,
  user_id uuid,
  previous_status text,
  new_status text,
  announcement_id uuid,
  notice_created boolean,
  decided_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking public.session_bookings%rowtype;
  v_title text;
  v_start timestamptz;
  v_location text;
  v_announcement_id uuid;
  v_notice_title text;
  v_notice_body text;
  v_notice_tone text := 'info';
  v_receipt public.booking_decision_receipts%rowtype;
  v_when text;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_booking_id is null or p_request_id is null then raise exception 'BOOKING_DECISION_REQUEST_INVALID'; end if;
  if p_status not in ('requested', 'confirmed', 'waitlisted', 'cancelled', 'declined', 'attended', 'no_show') then
    raise exception 'INVALID_STATUS';
  end if;

  select receipt.* into v_receipt
    from public.booking_decision_receipts receipt
   where receipt.request_id = p_request_id;
  if found then
    if v_receipt.booking_id is distinct from p_booking_id
       or v_receipt.new_status is distinct from p_status then
      raise exception 'BOOKING_DECISION_REQUEST_CONFLICT';
    end if;
    return query select v_receipt.request_id, v_receipt.booking_id, v_receipt.session_id,
      v_receipt.user_id, v_receipt.previous_status, v_receipt.new_status,
      v_receipt.announcement_id, v_receipt.announcement_id is not null, v_receipt.decided_at;
    return;
  end if;

  select booking.* into v_booking
    from public.session_bookings booking
   where booking.id = p_booking_id
   for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;

  select session.title, session.start_time, session.location_zone
    into v_title, v_start, v_location
    from public.class_sessions session
   where session.id = v_booking.class_session_id;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;

  perform public.admin_set_booking_status(p_booking_id, p_status);

  if v_booking.status is distinct from p_status
     and p_status in ('confirmed', 'waitlisted', 'declined', 'cancelled') then
    v_announcement_id := gen_random_uuid();
    v_when := to_char(v_start at time zone 'Australia/Brisbane', 'FMDay, FMDD FMMonth at FMHH12:MIam');

    case p_status
      when 'confirmed' then
        v_notice_title := 'Your class booking is confirmed';
        v_notice_body := format(
          'Your place in %s on %s%s is confirmed. One class credit is reserved for you.',
          v_title, v_when,
          case when nullif(btrim(coalesce(v_location, '')), '') is null then ''
            else format(' at %s', btrim(v_location)) end
        );
        v_notice_tone := 'action';
      when 'waitlisted' then
        v_notice_title := 'Your booking request is waitlisted';
        v_notice_body := format(
          'Your request for %s on %s has moved to the waitlist. Reserved credit is returned when the pack is still live, and XERT will let you know if a place opens.',
          v_title, v_when
        );
        v_notice_tone := 'action';
      when 'declined' then
        v_notice_title := 'Booking request update';
        v_notice_body := format(
          'Your request for %s on %s was not confirmed. Reserved credit is returned when the pack is still live.',
          v_title, v_when
        );
      when 'cancelled' then
        if v_booking.status = 'waitlisted' then
          v_notice_title := 'Waitlist place removed';
          v_notice_body := format(
            'XERT removed you from the waitlist for %s on %s. No class credit was charged.',
            v_title, v_when
          );
        else
          v_notice_title := 'Your class booking was cancelled';
          v_notice_body := format(
            'XERT cancelled your place in %s on %s. Reserved credit is returned when the pack is still live.',
            v_title, v_when
          );
        end if;
    end case;

    insert into public.member_announcements (
      id, title, body, tone, cta_label, cta_url, audience, source_kind, source_id,
      published_at, expires_at, created_by, last_changed_by
    ) values (
      v_announcement_id, v_notice_title, v_notice_body, v_notice_tone,
      'View bookings', '/account', 'targeted', 'booking_decision', p_booking_id,
      now(), least(greatest(now() + interval '30 days', v_start + interval '1 day'), now() + interval '1 year'),
      auth.uid(), auth.uid()
    );

    insert into public.member_announcement_targets (announcement_id, user_id)
    values (v_announcement_id, v_booking.user_id);
  end if;

  insert into public.booking_decision_receipts (
    request_id, booking_id, session_id, user_id, previous_status, new_status,
    announcement_id, decided_by
  ) values (
    p_request_id, p_booking_id, v_booking.class_session_id, v_booking.user_id,
    v_booking.status, p_status, v_announcement_id, auth.uid()
  );

  return query
  select receipt.request_id, receipt.booking_id, receipt.session_id, receipt.user_id,
    receipt.previous_status, receipt.new_status, receipt.announcement_id,
    receipt.announcement_id is not null, receipt.decided_at
    from public.booking_decision_receipts receipt
   where receipt.request_id = p_request_id;
end;
$$;

revoke execute on function public.admin_set_booking_status_with_notice(uuid, text, uuid)
  from public, anon;
grant execute on function public.admin_set_booking_status_with_notice(uuid, text, uuid)
  to authenticated;

insert into public.xert_schema_capabilities (capability)
values ('waitlist_skip_notice_accuracy')
on conflict (capability) do nothing;

insert into public.xert_schema_capabilities (capability)
values ('booking_decision_notice_credit_honesty')
on conflict (capability) do nothing;
