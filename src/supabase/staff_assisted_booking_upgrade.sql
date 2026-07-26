-- Atomic, audited front-desk booking for an existing member.
-- Staff can confirm an available place or append the member to the FIFO
-- waitlist without bypassing capacity, credit, class-state or notification
-- invariants.

create table if not exists public.admin_staff_booking_receipts (
  request_id uuid primary key,
  booking_id uuid not null references public.session_bookings(id) on delete cascade,
  session_id uuid not null references public.class_sessions(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  booking_status text not null check (booking_status in ('confirmed', 'waitlisted')),
  credit_batch_id uuid references public.credit_batches(id) on delete set null,
  announcement_id uuid references public.member_announcements(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists admin_staff_booking_receipts_booking_idx
  on public.admin_staff_booking_receipts(booking_id, created_at desc);

alter table public.admin_staff_booking_receipts enable row level security;
revoke all on table public.admin_staff_booking_receipts from public, anon, authenticated;
drop policy if exists "admin_staff_booking_receipts_admin_read"
  on public.admin_staff_booking_receipts;
create policy "admin_staff_booking_receipts_admin_read"
  on public.admin_staff_booking_receipts
  for select to authenticated
  using (public.is_admin());
grant select on table public.admin_staff_booking_receipts to authenticated;

create or replace function public.admin_book_member_into_class(
  p_session_id uuid,
  p_member_id uuid,
  p_request_id uuid
)
returns table (
  request_id uuid,
  booking_id uuid,
  session_id uuid,
  member_id uuid,
  booking_status text,
  credit_batch_id uuid,
  announcement_id uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt public.admin_staff_booking_receipts%rowtype;
  v_capacity integer;
  v_start timestamptz;
  v_end timestamptz;
  v_session_status text;
  v_booking_mode text;
  v_title text;
  v_location text;
  v_active_count integer;
  v_has_waitlist boolean;
  v_booking_status text;
  v_credit_batch_id uuid;
  v_booking_id uuid;
  v_announcement_id uuid := gen_random_uuid();
  v_when text;
  v_notice_body text;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_session_id is null or p_member_id is null or p_request_id is null then
    raise exception 'STAFF_BOOKING_REQUEST_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));

  select receipt.* into v_receipt
    from public.admin_staff_booking_receipts receipt
   where receipt.request_id = p_request_id;
  if found then
    if v_receipt.session_id is distinct from p_session_id
       or v_receipt.member_id is distinct from p_member_id then
      raise exception 'STAFF_BOOKING_REQUEST_CONFLICT';
    end if;
    return query
    select receipt.request_id, receipt.booking_id, receipt.session_id,
      receipt.member_id, receipt.booking_status, receipt.credit_batch_id,
      receipt.announcement_id, receipt.created_at
      from public.admin_staff_booking_receipts receipt
     where receipt.request_id = p_request_id;
    return;
  end if;

  select session.capacity, session.start_time, session.end_time, session.status,
         coalesce(session.booking_mode, 'instant_book'), session.title,
         session.location_zone
    into v_capacity, v_start, v_end, v_session_status, v_booking_mode, v_title,
         v_location
    from public.class_sessions session
   where session.id = p_session_id
   for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if v_session_status not in ('published', 'full') then
    raise exception 'SESSION_NOT_BOOKABLE';
  end if;
  if coalesce(v_end, v_start + interval '3 hours') <= now() then
    raise exception 'SESSION_FINISHED';
  end if;
  if v_booking_mode = 'interest_only' then
    raise exception 'SESSION_INTEREST_ONLY';
  end if;
  if v_capacity is null or v_capacity < 1 then
    raise exception 'CLASS_CAPACITY_INVALID';
  end if;

  perform 1 from public.profiles profile
   where profile.id = p_member_id
     and profile.role = 'member'
   for share;
  if not found then raise exception 'MEMBER_NOT_BOOKABLE'; end if;

  if exists (
    select 1 from public.session_bookings booking
     where booking.user_id = p_member_id
       and booking.class_session_id = p_session_id
       and booking.status in ('requested', 'confirmed', 'waitlisted', 'attended', 'no_show')
  ) then
    raise exception 'MEMBER_ALREADY_ON_ROSTER';
  end if;

  select count(*) into v_active_count
    from public.session_bookings booking
   where booking.class_session_id = p_session_id
     and booking.status in ('requested', 'confirmed');
  select exists (
    select 1 from public.session_bookings booking
     where booking.class_session_id = p_session_id
       and booking.status = 'waitlisted'
  ) into v_has_waitlist;

  if v_session_status = 'full'
     or v_active_count >= v_capacity
     or v_has_waitlist then
    v_booking_status := 'waitlisted';
  else
    v_booking_status := 'confirmed';
    select batch.id into v_credit_batch_id
      from public.credit_batches batch
     where batch.user_id = p_member_id
       and batch.remaining > 0
       and (batch.expires_at is null or batch.expires_at > now())
     order by batch.expires_at asc nulls last, batch.created_at asc
     limit 1
     for update;
    if v_credit_batch_id is null then raise exception 'MEMBER_HAS_NO_CREDITS'; end if;
    update public.credit_batches
       set remaining = remaining - 1
     where id = v_credit_batch_id;
  end if;

  insert into public.session_bookings (
    user_id, class_session_id, credit_batch_id, status
  ) values (
    p_member_id, p_session_id, v_credit_batch_id, v_booking_status
  )
  returning id into v_booking_id;

  v_when := to_char(
    v_start at time zone 'Australia/Brisbane',
    'Dy DD Mon, FMHH12:MI AM'
  );
  if v_booking_status = 'confirmed' then
    v_notice_body := format(
      'XERT has booked you into %s on %s%s. One class credit has been reserved for your place.',
      coalesce(nullif(btrim(v_title), ''), 'your class'),
      v_when,
      case when nullif(btrim(v_location), '') is null
        then '' else ' at ' || btrim(v_location) end
    );
  else
    v_notice_body := format(
      'XERT has added you to the FIFO waitlist for %s on %s%s. No class credit is reserved unless a place is confirmed.',
      coalesce(nullif(btrim(v_title), ''), 'your class'),
      v_when,
      case when nullif(btrim(v_location), '') is null
        then '' else ' at ' || btrim(v_location) end
    );
  end if;

  insert into public.member_announcements (
    id, title, body, tone, cta_label, cta_url, audience, source_kind, source_id,
    published_at, expires_at, created_by, last_changed_by
  ) values (
    v_announcement_id,
    case when v_booking_status = 'confirmed'
      then 'XERT booked your class'
      else 'XERT added you to a waitlist'
    end,
    v_notice_body,
    'info',
    'View bookings',
    '/account',
    'targeted',
    'staff_booking',
    v_booking_id,
    now(),
    least(
      greatest(now() + interval '30 days', v_start + interval '1 day'),
      now() + interval '1 year'
    ),
    auth.uid(),
    auth.uid()
  );

  insert into public.member_announcement_targets (announcement_id, user_id)
  values (v_announcement_id, p_member_id);

  insert into public.admin_staff_booking_receipts (
    request_id, booking_id, session_id, member_id, booking_status,
    credit_batch_id, announcement_id, created_by
  ) values (
    p_request_id, v_booking_id, p_session_id, p_member_id, v_booking_status,
    v_credit_batch_id, v_announcement_id, auth.uid()
  );

  return query
  select receipt.request_id, receipt.booking_id, receipt.session_id,
    receipt.member_id, receipt.booking_status, receipt.credit_batch_id,
    receipt.announcement_id, receipt.created_at
    from public.admin_staff_booking_receipts receipt
   where receipt.request_id = p_request_id;
end;
$$;

revoke execute on function public.admin_book_member_into_class(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.admin_book_member_into_class(uuid, uuid, uuid)
  to authenticated;

insert into public.xert_schema_capabilities (capability)
values ('staff_assisted_booking')
on conflict (capability) do nothing;
