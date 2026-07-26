-- Returns the credit on a timely cancel even when the pack has since expired.
--
-- cancel_booking only refunded when
--   id = v_batch and (expires_at is null or expires_at > now())
-- so a member who booked while the pack was live, then cancelled more than
-- 12 hours before class after the pack lapsed, lost the credit silently.
-- The RPC returns void, and both web and iOS still promise
-- "Your class credit has been returned." Terms.jsx makes the same promise.
--
-- Policy: a valid cancellation window always restores the credit. If the batch
-- has already expired, reactivate it so the returned credit is bookable —
-- expires_at becomes the later of the cancelled class start and now + 12 hours
-- (the same lead time that earned the refund). Unexpired and never-expiring
-- batches are unchanged aside from remaining + 1. Waitlisted places still do
-- not refund (they never held a credit). Late confirmed cancels still forfeit.
--
-- Re-run safe: an older copy inlined remaining+1 and skipped the shared helper,
-- so Ops Health re-runs could restore credits onto packs Stripe had already
-- fully refunded. Keep a newer helper-backed body.

do $install_cancel_booking$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'cancel_booking'
    and pg_get_function_identity_arguments(p.oid) = 'p_booking_id uuid';
  if v_def is not null and v_def ilike '%refund_credits_to_batch%' then
    raise notice 'keeping newer cancel_booking';
  else
    execute $fn$
create or replace function public.cancel_booking(p_booking_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user   uuid := auth.uid();
  v_batch  uuid;
  v_start  timestamptz;
  v_status text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  select b.credit_batch_id, s.start_time, b.status
    into v_batch, v_start, v_status
    from public.session_bookings b
    join public.class_sessions s on s.id = b.class_session_id
    where b.id = p_booking_id and b.user_id = v_user
    for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_status not in ('requested', 'confirmed', 'waitlisted') then raise exception 'NOT_CANCELLABLE'; end if;

  update public.session_bookings
  set status = 'cancelled', cancelled_at = now()
  where id = p_booking_id;

  if (v_status = 'requested' or (v_status = 'confirmed' and v_start - now() > interval '12 hours'))
     and v_batch is not null then
    -- Shared helper owns expiry reactivation and refuses Stripe-refunded packs.
    perform public.refund_credits_to_batch(v_batch, 1, v_start);
  end if;
end; $$;
$fn$;
  end if;
end;
$install_cancel_booking$;

revoke execute on function public.cancel_booking(uuid) from public, anon;
grant execute on function public.cancel_booking(uuid) to authenticated;

insert into public.xert_schema_capabilities (capability)
values ('cancel_booking_expired_batch_refund') on conflict (capability) do nothing;
