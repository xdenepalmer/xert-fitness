-- Atomic lead-pipeline mutations with immutable administrator history.

create table if not exists public.admin_lead_changes (
  id uuid primary key default gen_random_uuid(),
  lead_type text not null check (lead_type in ('member', 'trainer', 'partner')),
  lead_id text not null,
  changed_by uuid references auth.users(id) on delete set null,
  previous_status text not null,
  new_status text not null,
  previous_admin_notes text,
  new_admin_notes text,
  subject_label text,
  subject_email text,
  created_at timestamptz not null default now()
);

create index if not exists admin_lead_changes_created_idx
  on public.admin_lead_changes (created_at desc, id desc);
create index if not exists admin_lead_changes_lead_idx
  on public.admin_lead_changes (lead_type, lead_id, created_at desc, id desc);

alter table public.admin_lead_changes enable row level security;
drop policy if exists "admin_lead_changes_admin_read" on public.admin_lead_changes;
create policy "admin_lead_changes_admin_read"
  on public.admin_lead_changes for select
  to authenticated
  using ((select public.is_admin()));

-- Re-run safe: do not replace a newer guard shape with this older body.
do $install_guard_admin_lead_change$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'guard_admin_lead_change'
    and pg_get_function_identity_arguments(p.oid) = '';
  if v_def is not null and (v_def ilike '%changed_by%' or v_def ilike '%subject_label%') then
    raise notice 'keeping newer guard_admin_lead_change';
  else
    execute $fn$
      create or replace function public.guard_admin_lead_change()
      returns trigger
      language plpgsql
      set search_path = public, pg_temp
      as $$
      begin
        raise exception 'LEAD_AUDIT_IMMUTABLE';
      end;
      $$;
$fn$;
  end if;
end;
$install_guard_admin_lead_change$;
drop trigger if exists admin_lead_changes_immutable on public.admin_lead_changes;
create trigger admin_lead_changes_immutable
  before update or delete on public.admin_lead_changes
  for each row execute function public.guard_admin_lead_change();

create or replace function public.audit_admin_lead_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_previous_status text := coalesce(nullif(trim(old.status), ''), 'new');
  v_new_status text := coalesce(nullif(trim(new.status), ''), 'new');
  v_previous_notes text := nullif(trim(coalesce(old.admin_notes, '')), '');
  v_new_notes text := nullif(trim(coalesce(new.admin_notes, '')), '');
  v_lead_type text;
begin
  if v_previous_status is not distinct from v_new_status
     and v_previous_notes is not distinct from v_new_notes then
    return new;
  end if;

  v_lead_type := case tg_table_name
    when 'member_interest' then 'member'
    when 'trainer_interest' then 'trainer'
    when 'partner_interest' then 'partner'
    else null
  end;
  if v_lead_type is null then raise exception 'LEAD_TYPE_INVALID'; end if;

  insert into public.admin_lead_changes (
    lead_type,
    lead_id,
    changed_by,
    previous_status,
    new_status,
    previous_admin_notes,
    new_admin_notes,
    subject_label,
    subject_email
  ) values (
    v_lead_type,
    new.id::text,
    auth.uid(),
    v_previous_status,
    v_new_status,
    v_previous_notes,
    v_new_notes,
    coalesce(
      nullif(trim(new.full_name), ''),
      nullif(lower(trim(new.email)), ''),
      initcap(v_lead_type) || ' lead'
    ),
    nullif(lower(trim(coalesce(new.email, ''))), '')
  );
  return new;
end;
$$;

drop trigger if exists member_interest_audit_admin_change on public.member_interest;
create trigger member_interest_audit_admin_change
  after update of status, admin_notes on public.member_interest
  for each row execute function public.audit_admin_lead_change();

drop trigger if exists trainer_interest_audit_admin_change on public.trainer_interest;
create trigger trainer_interest_audit_admin_change
  after update of status, admin_notes on public.trainer_interest
  for each row execute function public.audit_admin_lead_change();

drop trigger if exists partner_interest_audit_admin_change on public.partner_interest;
create trigger partner_interest_audit_admin_change
  after update of status, admin_notes on public.partner_interest
  for each row execute function public.audit_admin_lead_change();

create or replace function public.xert_lead_status_allowed(p_lead_type text, p_status text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select case lower(trim(coalesce(p_lead_type, '')))
    when 'member_interest' then lower(trim(coalesce(p_status, ''))) in (
      'new', 'contacted', 'warm', 'hot', 'foundation_offer_sent',
      'booked_trial', 'joined', 'not_suitable', 'archived'
    )
    when 'trainer_interest' then lower(trim(coalesce(p_status, ''))) in (
      'new', 'reviewing', 'contacted', 'interview', 'shortlisted',
      'not_suitable', 'hired', 'archived'
    )
    when 'partner_interest' then lower(trim(coalesce(p_status, ''))) in (
      'new', 'reviewing', 'contacted', 'meeting', 'approved',
      'not_suitable', 'archived'
    )
    else false
  end;
$$;

create or replace function public.admin_update_lead(
  p_lead_type text,
  p_lead_id text,
  p_status text,
  p_admin_notes text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lead_type text := lower(trim(coalesce(p_lead_type, '')));
  v_lead_id text := trim(coalesce(p_lead_id, ''));
  v_status text := lower(trim(coalesce(p_status, '')));
  v_admin_notes text := nullif(trim(coalesce(p_admin_notes, '')), '');
  v_updated integer;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if v_lead_id = '' or length(v_lead_id) > 128 then raise exception 'LEAD_ID_INVALID'; end if;
  if not public.xert_lead_status_allowed(v_lead_type, v_status) then
    raise exception 'LEAD_STATUS_INVALID';
  end if;
  if length(coalesce(p_admin_notes, '')) > 5000 then raise exception 'ADMIN_NOTES_TOO_LONG'; end if;

  if v_lead_type = 'member_interest' then
    update public.member_interest
       set status = v_status, admin_notes = v_admin_notes
     where id::text = v_lead_id;
  elsif v_lead_type = 'trainer_interest' then
    update public.trainer_interest
       set status = v_status, admin_notes = v_admin_notes
     where id::text = v_lead_id;
  elsif v_lead_type = 'partner_interest' then
    update public.partner_interest
       set status = v_status, admin_notes = v_admin_notes
     where id::text = v_lead_id;
  else
    raise exception 'LEAD_TYPE_INVALID';
  end if;

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then raise exception 'LEAD_NOT_FOUND'; end if;
  return v_updated;
end;
$$;

create or replace function public.admin_update_lead_statuses(
  p_lead_type text,
  p_lead_ids text[],
  p_status text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lead_type text := lower(trim(coalesce(p_lead_type, '')));
  v_status text := lower(trim(coalesce(p_status, '')));
  v_lead_ids text[];
  v_expected integer;
  v_updated integer;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if not public.xert_lead_status_allowed(v_lead_type, v_status) then
    raise exception 'LEAD_STATUS_INVALID';
  end if;

  if cardinality(coalesce(p_lead_ids, array[]::text[])) > 100 then
    raise exception 'LEAD_SELECTION_TOO_LARGE';
  end if;
  if exists (
    select 1
      from unnest(coalesce(p_lead_ids, array[]::text[])) as candidate
     where trim(candidate) = '' or length(trim(candidate)) > 128
  ) then
    raise exception 'LEAD_ID_INVALID';
  end if;

  select coalesce(array_agg(distinct trim(candidate)), array[]::text[])
    into v_lead_ids
    from unnest(coalesce(p_lead_ids, array[]::text[])) as candidate;
  v_expected := cardinality(v_lead_ids);
  if v_expected < 1 then raise exception 'LEAD_SELECTION_REQUIRED'; end if;

  if v_lead_type = 'member_interest' then
    update public.member_interest set status = v_status where id::text = any(v_lead_ids);
  elsif v_lead_type = 'trainer_interest' then
    update public.trainer_interest set status = v_status where id::text = any(v_lead_ids);
  elsif v_lead_type = 'partner_interest' then
    update public.partner_interest set status = v_status where id::text = any(v_lead_ids);
  else
    raise exception 'LEAD_TYPE_INVALID';
  end if;

  get diagnostics v_updated = row_count;
  if v_updated <> v_expected then raise exception 'LEAD_SELECTION_STALE'; end if;
  return v_updated;
end;
$$;

revoke all on table public.admin_lead_changes from public, anon, authenticated;
grant select on table public.admin_lead_changes to authenticated;
revoke execute on function public.guard_admin_lead_change() from public, anon, authenticated;
revoke execute on function public.audit_admin_lead_change() from public, anon, authenticated;
revoke execute on function public.xert_lead_status_allowed(text, text) from public, anon, authenticated;
revoke execute on function public.admin_update_lead(text, text, text, text) from public, anon;
revoke execute on function public.admin_update_lead_statuses(text, text[], text) from public, anon;
grant execute on function public.admin_update_lead(text, text, text, text) to authenticated;
grant execute on function public.admin_update_lead_statuses(text, text[], text) to authenticated;

insert into public.xert_schema_capabilities (capability)
values ('lead_pipeline_audit')
on conflict (capability) do nothing;
