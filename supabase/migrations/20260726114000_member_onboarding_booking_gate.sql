-- Soft UX (iOS launch guide / Account Member Readiness) already asks members to
-- finish readiness before booking, but book_session / join_session_waitlist only
-- insert into session_bookings. Without a database boundary a member with credits
-- can still place or waitlist via PostgREST while emergency contact and required
-- acknowledgements are missing. Mirror the bookings_enabled switch: fail closed
-- on INSERT for non-admin members when member_onboarding_state.is_complete is false.

create or replace function public.enforce_member_onboarding_for_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_complete boolean := false;
begin
  if auth.role() = 'service_role'
     or public.is_admin() then
    return new;
  end if;

  if new.user_id is distinct from v_actor then
    raise exception 'BOOKING_ACCOUNT_MISMATCH';
  end if;

  select coalesce((public.member_onboarding_state(new.user_id)->>'is_complete')::boolean, false)
    into v_complete;

  if not v_complete then
    raise exception 'MEMBER_ONBOARDING_REQUIRED';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_member_onboarding_for_booking()
  from public, anon, authenticated;

drop trigger if exists session_bookings_member_onboarding_gate
  on public.session_bookings;
create trigger session_bookings_member_onboarding_gate
  before insert on public.session_bookings
  for each row execute function public.enforce_member_onboarding_for_booking();

comment on function public.enforce_member_onboarding_for_booking() is
  'Fails closed for new member bookings and waitlist joins when Member Readiness is incomplete.';

insert into public.xert_schema_capabilities (capability)
values ('member_onboarding_booking_gate')
on conflict (capability) do update set installed_at = excluded.installed_at;
