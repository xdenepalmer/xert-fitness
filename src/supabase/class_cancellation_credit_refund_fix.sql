-- Repairs credit refunds when an admin cancels a class session.
--
-- 20260714015000_class_cancellation_notifications.sql built the refund inside a
-- data-modifying CTE that read `status` straight off the UPDATE's RETURNING
-- list. In Postgres, RETURNING exposes the POST-update row, so every returned
-- row already read 'cancelled' and the refund filter never matched.
--
-- The pre-update snapshot fix lives in
-- supabase/migrations/20260726000000_class_cancellation_credit_refund_fix.sql.
-- This operator copy is kept re-runnable without reinstalling that incomplete
-- state: it also includes attended/no_show refund targets and expired-pack
-- reactivation via the shared helper (same body as
-- credit_batch_refund_reactivation.sql for the cancel path).

create or replace function public.credit_batch_expires_at_after_refund(
  p_expires_at timestamptz,
  p_anchor timestamptz
) returns timestamptz
language sql
stable
parallel safe
set search_path = public, pg_temp
as $$
  select case
    when p_expires_at is not null and p_expires_at <= now()
      then greatest(coalesce(p_anchor, now()), now() + interval '12 hours')
    else p_expires_at
  end;
$$;

create or replace function public.refund_credits_to_batch(
  p_batch_id uuid,
  p_count integer,
  p_anchor timestamptz default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_batch_id is null or p_count is null or p_count <= 0 then
    return;
  end if;
  update public.credit_batches
     set remaining = remaining + p_count,
         expires_at = public.credit_batch_expires_at_after_refund(expires_at, p_anchor)
   where id = p_batch_id;
end;
$$;

revoke all on function public.credit_batch_expires_at_after_refund(timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function public.refund_credits_to_batch(uuid, integer, timestamptz)
  from public, anon, authenticated;

create or replace function public.admin_cancel_class_session(p_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_start timestamptz;
  v_cancelled_count integer := 0;
  v_enquiry_cancelled_count integer := 0;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;

  select status, start_time into v_status, v_start
    from public.class_sessions
    where id = p_session_id
    for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if v_status = 'completed' then raise exception 'SESSION_ALREADY_COMPLETED'; end if;

  if to_regprocedure('public.create_class_cancellation_notice(uuid)') is not null then
    perform public.create_class_cancellation_notice(p_session_id);
  end if;

  with targets as (
    select id, credit_batch_id, status as previous_status
      from public.session_bookings
     where class_session_id = p_session_id
       and status in ('requested', 'confirmed', 'waitlisted', 'attended', 'no_show')
     for update
  ), cancelled_bookings as (
    update public.session_bookings booking
       set status = 'cancelled', cancelled_at = now()
      from targets
     where booking.id = targets.id
     returning targets.credit_batch_id as credit_batch_id,
               targets.previous_status as previous_status
  ), restored_credits as (
    update public.credit_batches credits
       set remaining = credits.remaining + refunds.credit_count,
           expires_at = public.credit_batch_expires_at_after_refund(credits.expires_at, v_start)
      from (
        select credit_batch_id, count(*)::integer as credit_count
          from cancelled_bookings
         where previous_status in ('requested', 'confirmed', 'attended', 'no_show')
           and credit_batch_id is not null
         group by credit_batch_id
      ) refunds
     where credits.id = refunds.credit_batch_id
     returning credits.id
  )
  select count(*) into v_cancelled_count from cancelled_bookings;

  if to_regclass('public.class_bookings') is not null then
    execute $query$
      update public.class_bookings
         set status = 'cancelled'
       where class_session_id = $1
         and status in ('requested', 'confirmed', 'waitlisted')
    $query$ using p_session_id;
    get diagnostics v_enquiry_cancelled_count = row_count;
  end if;

  update public.class_sessions
     set status = 'cancelled', updated_at = now()
   where id = p_session_id;

  return v_cancelled_count + v_enquiry_cancelled_count;
end;
$$;

revoke all on function public.admin_cancel_class_session(uuid) from public, anon;
grant execute on function public.admin_cancel_class_session(uuid) to authenticated;
