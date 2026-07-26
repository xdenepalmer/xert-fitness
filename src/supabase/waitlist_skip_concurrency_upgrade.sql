-- Waitlist "Skip — no credits" cancelled by booking id alone. If that member
-- had already been promoted (or the FIFO head moved), Skip could cancel a
-- confirmed booking and refund a credit. Mirror Promote: lock the session,
-- require the expected id to still be the waitlisted head, then cancel.

create or replace function public.admin_skip_waitlisted_head_with_notice(
  p_session_id uuid,
  p_expected_booking_id uuid,
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
  v_booking_id uuid;
  v_status text;
  v_session uuid;
  v_session_lock uuid;
  v_receipt public.booking_decision_receipts%rowtype;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_session_id is null or p_expected_booking_id is null or p_request_id is null then
    raise exception 'WAITLIST_SKIP_REQUEST_INVALID';
  end if;

  -- Idempotent replay through the booking-decision receipt table.
  select receipt.*
    into v_receipt
    from public.booking_decision_receipts receipt
   where receipt.request_id = p_request_id;
  if found then
    if v_receipt.booking_id is distinct from p_expected_booking_id
       or v_receipt.session_id is distinct from p_session_id
       or v_receipt.new_status is distinct from 'cancelled' then
      raise exception 'BOOKING_DECISION_REQUEST_CONFLICT';
    end if;
    return query select v_receipt.request_id, v_receipt.booking_id, v_receipt.session_id,
      v_receipt.user_id, v_receipt.previous_status, v_receipt.new_status,
      v_receipt.announcement_id, v_receipt.announcement_id is not null, v_receipt.decided_at;
    return;
  end if;

  select session.id
    into v_session_lock
    from public.class_sessions session
   where session.id = p_session_id
   for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;

  select booking.status, booking.class_session_id
    into v_status, v_session
    from public.session_bookings booking
   where booking.id = p_expected_booking_id
   for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_session is distinct from p_session_id then
    raise exception 'WAITLIST_CHANGED';
  end if;
  if v_status is distinct from 'waitlisted' then
    raise exception 'BOOKING_NOT_WAITLISTED';
  end if;

  select booking.id
    into v_booking_id
    from public.session_bookings booking
   where booking.class_session_id = p_session_id
     and booking.status = 'waitlisted'
   order by booking.created_at, booking.id
   limit 1
   for update;
  if v_booking_id is null then raise exception 'WAITLIST_EMPTY'; end if;
  if v_booking_id is distinct from p_expected_booking_id then
    raise exception 'WAITLIST_CHANGED';
  end if;

  return query
  select *
    from public.admin_set_booking_status_with_notice(
      p_expected_booking_id,
      'cancelled',
      p_request_id
    );
end;
$$;

revoke execute on function public.admin_skip_waitlisted_head_with_notice(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.admin_skip_waitlisted_head_with_notice(uuid, uuid, uuid)
  to authenticated;

insert into public.xert_schema_capabilities (capability)
values ('waitlist_skip_concurrency')
on conflict (capability) do nothing;
