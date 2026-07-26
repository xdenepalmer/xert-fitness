-- Repairs credit refunds when an admin cancels a class session.
--
-- 20260714015000_class_cancellation_notifications.sql built the refund inside a
-- data-modifying CTE that read `status` straight off the UPDATE's RETURNING
-- list. In Postgres, RETURNING exposes the POST-update row, so every returned
-- row already read 'cancelled' and the refund filter
-- `where status in ('requested', 'confirmed')` never matched a single row.
-- Cancelling a class therefore cancelled the bookings but silently refunded
-- nothing: members permanently lost the credit they had spent on that class.
--
-- The fix captures the pre-update status in a `targets` CTE (locked FOR UPDATE)
-- and refunds against that snapshot instead. Waitlisted places still receive no
-- refund because they never consumed a credit.
--
-- This is corrective only. The function's signature, admin gate, notice
-- creation, legacy class_bookings handling and return value are unchanged.
--
-- Re-run safe: later migrations widen refunds to attended/no_show, reactivate
-- expired packs, and refuse Stripe-refunded batches. Keep those newer bodies;
-- this bootstrap still owns the RETURNING-status fix for databases that have
-- never received them. Operator mirror:
-- src/supabase/class_cancellation_credit_refund_fix.sql.

do $install_admin_cancel_class_session$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'admin_cancel_class_session'
    and pg_get_function_identity_arguments(p.oid) = 'p_session_id uuid';
  if v_def is not null
     and v_def ilike '%attended%'
     and v_def ilike '%no_show%'
     and v_def ilike '%status = ''refunded''%' then
    raise notice 'keeping newer admin_cancel_class_session';
  else
    execute $fn$
create or replace function public.admin_cancel_class_session(p_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $body$
declare
  v_status text;
  v_cancelled_count integer := 0;
  v_enquiry_cancelled_count integer := 0;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;

  select status into v_status
    from public.class_sessions
    where id = p_session_id
    for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if v_status = 'completed' then raise exception 'SESSION_ALREADY_COMPLETED'; end if;

  perform public.create_class_cancellation_notice(p_session_id);

  with targets as (
    select id, credit_batch_id, status as previous_status
      from public.session_bookings
     where class_session_id = p_session_id
       and status in ('requested', 'confirmed', 'waitlisted')
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
       set remaining = credits.remaining + refunds.credit_count
      from (
        select credit_batch_id, count(*)::integer as credit_count
          from cancelled_bookings
         where previous_status in ('requested', 'confirmed')
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
$body$;
$fn$;
  end if;
end;
$install_admin_cancel_class_session$;

revoke all on function public.admin_cancel_class_session(uuid) from public, anon;
grant execute on function public.admin_cancel_class_session(uuid) to authenticated;
