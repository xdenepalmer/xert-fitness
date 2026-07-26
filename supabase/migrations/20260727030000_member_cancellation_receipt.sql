-- Return an authoritative cancellation receipt so clients never infer a
-- credit refund that the database did not perform.

drop function if exists public.cancel_booking(uuid);

create function public.cancel_booking(p_booking_id uuid)
returns table (
  cancelled_booking_id uuid,
  previous_status text,
  credit_refund_eligible boolean,
  credit_refunded boolean,
  credit_outcome text,
  cancelled_at timestamptz
)
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_batch uuid;
  v_start timestamptz;
  v_status text;
  v_cancelled_at timestamptz := now();
  v_refund_eligible boolean := false;
  v_refunded boolean := false;
  v_outcome text;
  v_updated integer := 0;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  select booking.credit_batch_id, session.start_time, booking.status
    into v_batch, v_start, v_status
    from public.session_bookings booking
    join public.class_sessions session on session.id = booking.class_session_id
   where booking.id = p_booking_id
     and booking.user_id = v_user
   for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_status not in ('requested', 'confirmed', 'waitlisted') then
    raise exception 'NOT_CANCELLABLE';
  end if;

  v_refund_eligible := v_status = 'requested'
    or (v_status = 'confirmed' and v_start - v_cancelled_at > interval '12 hours');

  update public.session_bookings
     set status = 'cancelled',
         cancelled_at = v_cancelled_at
   where id = p_booking_id;

  if v_status = 'waitlisted' then
    v_outcome := 'not_reserved';
  elsif not v_refund_eligible then
    v_outcome := 'late_cancellation';
  elsif v_batch is null then
    v_outcome := 'reservation_unavailable';
  else
    update public.credit_batches
       set remaining = least(total, remaining + 1)
     where id = v_batch
       and remaining < total
       and (expires_at is null or expires_at > v_cancelled_at);
    get diagnostics v_updated = row_count;
    v_refunded := v_updated = 1;

    if v_refunded then
      v_outcome := 'returned';
    elsif exists (
      select 1 from public.credit_batches
       where id = v_batch
         and expires_at is not null
         and expires_at <= v_cancelled_at
    ) then
      v_outcome := 'expired';
    else
      v_outcome := 'reservation_unavailable';
    end if;
  end if;

  return query
  select p_booking_id, v_status, v_refund_eligible, v_refunded,
    v_outcome, v_cancelled_at;
end;
$$;

revoke execute on function public.cancel_booking(uuid) from public, anon;
grant execute on function public.cancel_booking(uuid) to authenticated;

create table if not exists public.xert_schema_capabilities (
  capability text primary key,
  installed_at timestamptz not null default now()
);
insert into public.xert_schema_capabilities (capability)
values ('member_cancellation_receipt')
on conflict (capability) do nothing;
