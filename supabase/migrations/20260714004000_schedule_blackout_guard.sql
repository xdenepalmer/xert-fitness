-- Keep live group classes and operational blackouts mutually exclusive.
-- Both trigger paths share one transaction lock so concurrent admin changes
-- cannot each pass their overlap check before the other commits.

do $$
begin
  if exists (
    select 1
    from public.class_sessions as session
    join public.blackout_periods as blackout
      on blackout.affects in ('all', 'group_classes', 'facility_only')
     and blackout.start_time < coalesce(
       session.end_time,
       session.start_time + make_interval(mins => greatest(coalesce(session.duration_minutes, 60), 1))
     )
     and blackout.end_time > session.start_time
    where session.status in ('published', 'full')
      and coalesce(
        session.end_time,
        session.start_time + make_interval(mins => greatest(coalesce(session.duration_minutes, 60), 1))
      ) > now()
      and blackout.end_time > now()
  ) then
    raise exception 'EXISTING_SCHEDULE_BLACKOUT_CONFLICTS';
  end if;
end;
$$;

create or replace function public.enforce_class_blackout_conflict()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_end timestamptz;
begin
  if new.status not in ('published', 'full') then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('xert_group_schedule', 0));
  v_end := coalesce(
    new.end_time,
    new.start_time + make_interval(mins => greatest(coalesce(new.duration_minutes, 60), 1))
  );

  if exists (
    select 1
    from public.blackout_periods as blackout
    where blackout.affects in ('all', 'group_classes', 'facility_only')
      and blackout.start_time < v_end
      and blackout.end_time > new.start_time
  ) then
    raise exception 'SESSION_OVERLAPS_BLACKOUT';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_class_blackout_conflict() from public, anon, authenticated;
drop trigger if exists class_sessions_blackout_conflict_guard on public.class_sessions;
create trigger class_sessions_blackout_conflict_guard
  before insert or update of start_time, end_time, duration_minutes, status
  on public.class_sessions
  for each row execute function public.enforce_class_blackout_conflict();

create or replace function public.enforce_blackout_class_conflict()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.affects not in ('all', 'group_classes', 'facility_only') then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('xert_group_schedule', 0));

  if exists (
    select 1
    from public.class_sessions as session
    where session.status in ('published', 'full')
      and session.start_time < new.end_time
      and coalesce(
        session.end_time,
        session.start_time + make_interval(mins => greatest(coalesce(session.duration_minutes, 60), 1))
      ) > new.start_time
  ) then
    raise exception 'BLACKOUT_OVERLAPS_PUBLISHED_CLASS';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_blackout_class_conflict() from public, anon, authenticated;
drop trigger if exists blackout_periods_class_conflict_guard on public.blackout_periods;
create trigger blackout_periods_class_conflict_guard
  before insert or update of start_time, end_time, affects
  on public.blackout_periods
  for each row execute function public.enforce_blackout_class_conflict();

insert into public.xert_schema_capabilities (capability)
values ('schedule_blackout_guard')
on conflict (capability) do nothing;
