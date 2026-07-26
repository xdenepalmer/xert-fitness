-- Lets a finished class still be edited after a blackout is recorded over it.
--
-- 20260714004000 installs two guards whose reach does not match the preflight
-- that certified them. The preflight only looked at conflicts that are still in
-- the future:
--
--   and coalesce(session.end_time, ...) > now()
--   and blackout.end_time > now()
--
-- but enforce_class_blackout_conflict checks all of time, and the trigger fires
-- `before insert or update of start_time, end_time, duration_minutes, status`.
-- admin_update_class_session always writes every column, so a title-only edit
-- puts start_time in the SET list and fires the trigger even though the value
-- is unchanged. Any published class that has already finished and overlaps a
-- retrospectively recorded blackout therefore becomes permanently uneditable,
-- with SESSION_OVERLAPS_BLACKOUT and no admin-facing way out short of deleting
-- the blackout. The sibling guard enforce_session_reschedule_conflicts in
-- 20260714002000 already has the no-op short-circuit this one lacks.
--
-- Reproduced against PostgreSQL 16. With the unbounded trigger installed, a
-- title-only update of a past published class that overlaps a past blackout
-- raised SESSION_OVERLAPS_BLACKOUT. A separate check confirmed the firing rule:
-- `set start_time = start_time` fires the trigger, and omitting the column from
-- the SET list does not, so this is about SET-list membership rather than a
-- changed value.
--
-- Both guards now ignore conflicts that are wholly in the past, matching the
-- preflight, and the class guard short-circuits when the times and status are
-- unchanged. A blackout cannot be recorded over a class that is still to run,
-- and a class still cannot be moved onto a live blackout.

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

  -- An edit that leaves the schedule alone cannot create a new conflict, and
  -- must not be blocked by one that already exists.
  if tg_op = 'UPDATE'
    and new.start_time is not distinct from old.start_time
    and new.end_time is not distinct from old.end_time
    and new.duration_minutes is not distinct from old.duration_minutes
    and new.status is not distinct from old.status
  then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('xert_group_schedule', 0));
  v_end := coalesce(
    new.end_time,
    new.start_time + make_interval(mins => greatest(coalesce(new.duration_minutes, 60), 1))
  );

  -- A class that has already finished cannot be moved out of a blackout that
  -- has also already finished, so refusing the edit protects nothing.
  if v_end <= now() then
    return new;
  end if;

  if exists (
    select 1
    from public.blackout_periods as blackout
    where blackout.affects in ('all', 'group_classes', 'facility_only')
      and blackout.start_time < v_end
      and blackout.end_time > new.start_time
      and blackout.end_time > now()
  ) then
    raise exception 'SESSION_OVERLAPS_BLACKOUT';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_class_blackout_conflict() from public, anon, authenticated;

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

  if new.end_time <= now() then
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
      and coalesce(
        session.end_time,
        session.start_time + make_interval(mins => greatest(coalesce(session.duration_minutes, 60), 1))
      ) > now()
  ) then
    raise exception 'BLACKOUT_OVERLAPS_PUBLISHED_CLASS';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_blackout_class_conflict() from public, anon, authenticated;

insert into public.xert_schema_capabilities (capability)
values ('schedule_blackout_historic_edit_fix')
on conflict (capability) do nothing;
