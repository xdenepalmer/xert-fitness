-- Transactional class roll call with staff audit metadata.
-- Idempotent and safe to re-run after booking_schema.sql and admin_cms_schema.sql.
--
-- Re-run safe: do not replace a newer admin_record_session_attendance that
-- releases unactioned requested bookings (and skips Stripe-refunded packs).
-- Ops Health used to point here; a bare recreate left those credits stranded
-- (or, after roll_call_releases, wiped the release path entirely).

alter table public.session_bookings
  add column if not exists attendance_marked_at timestamptz,
  add column if not exists attendance_marked_by uuid references auth.users(id) on delete set null;

do $install_admin_record_session_attendance$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'admin_record_session_attendance'
    and pg_get_function_identity_arguments(p.oid) = 'p_session_id uuid, p_attended_ids uuid[], p_no_show_ids uuid[]';
  if v_def is not null
     and v_def ilike '%status = ''requested''%'
     and v_def ilike '%status = ''refunded''%' then
    raise notice 'keeping newer admin_record_session_attendance';
  else
    execute $fn$
create or replace function public.admin_record_session_attendance(
  p_session_id uuid,
  p_attended_ids uuid[],
  p_no_show_ids uuid[]
)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_session_status text;
  v_start_time timestamptz;
  v_eligible_count integer;
  v_input_count integer;
  v_updated_count integer;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_session_id is null then raise exception 'SESSION_REQUIRED'; end if;

  p_attended_ids := coalesce(p_attended_ids, array[]::uuid[]);
  p_no_show_ids := coalesce(p_no_show_ids, array[]::uuid[]);
  v_input_count := cardinality(p_attended_ids) + cardinality(p_no_show_ids);
  if v_input_count = 0 then raise exception 'ATTENDANCE_REQUIRED'; end if;
  if cardinality(p_attended_ids) <> (select count(distinct id) from unnest(p_attended_ids) as ids(id))
     or cardinality(p_no_show_ids) <> (select count(distinct id) from unnest(p_no_show_ids) as ids(id))
     or p_attended_ids && p_no_show_ids then
    raise exception 'DUPLICATE_BOOKING';
  end if;

  select status, start_time into v_session_status, v_start_time
    from public.class_sessions where id = p_session_id for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if v_session_status not in ('published', 'full', 'completed') then raise exception 'SESSION_NOT_OPEN_FOR_ATTENDANCE'; end if;
  if v_start_time > now() then raise exception 'SESSION_NOT_STARTED'; end if;

  perform 1 from public.session_bookings
    where class_session_id = p_session_id and status in ('requested', 'confirmed', 'attended', 'no_show')
    for update;
  select count(*) into v_eligible_count
    from public.session_bookings
    where class_session_id = p_session_id and status in ('confirmed', 'attended', 'no_show');

  if v_input_count <> v_eligible_count
     or exists (
       select 1 from unnest(p_attended_ids || p_no_show_ids) as ids(id)
       where not exists (
         select 1 from public.session_bookings b
         where b.id = ids.id and b.class_session_id = p_session_id
           and b.status in ('confirmed', 'attended', 'no_show')
       )
     ) then
    raise exception 'INCOMPLETE_ROLL_CALL';
  end if;

  update public.session_bookings
     set status = case when id = any(p_attended_ids) then 'attended' else 'no_show' end,
         attendance_marked_at = now(),
         attendance_marked_by = auth.uid()
   where class_session_id = p_session_id
     and id = any(p_attended_ids || p_no_show_ids);
  get diagnostics v_updated_count = row_count;

  -- Return credits held by requests nobody actioned before roll call.
  -- Skip packs Stripe has already fully refunded.
  update public.credit_batches batch
     set remaining = batch.remaining + released.credits,
         expires_at = public.credit_batch_expires_at_after_refund(batch.expires_at, v_start_time)
    from (
      select credit_batch_id, count(*) as credits
      from public.session_bookings
      where class_session_id = p_session_id
        and status = 'requested'
        and credit_batch_id is not null
      group by credit_batch_id
    ) as released
   where batch.id = released.credit_batch_id
     and not exists (
       select 1
         from public.orders o
        where o.id = batch.order_id
          and o.status = 'refunded'
     );

  update public.session_bookings
     set status = 'cancelled', cancelled_at = now()
   where class_session_id = p_session_id
     and status = 'requested';

  update public.class_sessions
     set status = 'completed', public_visible = false, updated_at = now()
   where id = p_session_id;

  return v_updated_count;
end; $$;
$fn$;
  end if;
end;
$install_admin_record_session_attendance$;

revoke execute on function public.admin_record_session_attendance(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.admin_record_session_attendance(uuid, uuid[], uuid[]) to authenticated;

create table if not exists public.xert_schema_capabilities (
  capability text primary key,
  installed_at timestamptz not null default now()
);
insert into public.xert_schema_capabilities (capability)
values ('attendance_roll_call') on conflict (capability) do nothing;
