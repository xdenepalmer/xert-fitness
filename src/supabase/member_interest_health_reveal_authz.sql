-- Member-interest injuries are sensitive health information (APP 3.3). The
-- deliberate reveal RPC existed, but authenticated admins could still SELECT
-- injuries_or_limitations_optional / health_info_consent directly via
-- PostgREST under admin_all_member_interest. Lock those columns to the
-- SECURITY DEFINER reveal path and audit every disclosure (same shape as
-- emergency-contact reveals). No staff roles — admin only.

create table if not exists public.member_interest_health_reveals (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null
    references public.member_interest(id) on delete cascade,
  revealed_by uuid
    references public.profiles(id) on delete set null,
  revealed_at timestamptz not null default now()
);

create index if not exists member_interest_health_reveals_lead_created_idx
  on public.member_interest_health_reveals (lead_id, revealed_at desc, id desc);

alter table public.member_interest_health_reveals enable row level security;

revoke all on table public.member_interest_health_reveals
  from public, anon, authenticated;

drop policy if exists "member_interest_health_reveals_admin_read"
  on public.member_interest_health_reveals;
create policy "member_interest_health_reveals_admin_read"
  on public.member_interest_health_reveals
  for select to authenticated
  using ((select public.is_admin()));

-- Append-only audit: no client updates/deletes.
create or replace function public.guard_member_interest_health_reveal_immutability()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'MEMBER_INTEREST_HEALTH_REVEAL_IMMUTABLE';
end;
$$;

drop trigger if exists member_interest_health_reveals_no_update
  on public.member_interest_health_reveals;
create trigger member_interest_health_reveals_no_update
  before update or delete on public.member_interest_health_reveals
  for each row execute function public.guard_member_interest_health_reveal_immutability();

-- Column lockdown: revoke table SELECT, re-grant every column except health.
do $$
declare
  v_select_cols text;
  v_insert_cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_select_cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'member_interest'
    and column_name not in (
      'injuries_or_limitations_optional',
      'health_info_consent'
    );

  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_insert_cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'member_interest';

  if v_select_cols is null or v_insert_cols is null then
    raise exception 'member_interest columns unavailable for health reveal authz';
  end if;

  -- Drop table-level client grants so health columns cannot ride along on
  -- SELECT *. Admin status/notes writes stay on SECURITY DEFINER RPCs.
  revoke all on table public.member_interest from public, anon, authenticated;
  execute format(
    'grant select (%s) on table public.member_interest to authenticated',
    v_select_cols
  );
  -- Public forms must still insert injuries + consent under RLS WITH CHECK.
  execute format(
    'grant insert (%s) on table public.member_interest to anon, authenticated',
    v_insert_cols
  );
end;
$$;

create or replace function public.admin_reveal_member_interest_health(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid := auth.uid();
  v_consent boolean;
  v_injuries text;
  v_reveal_id uuid;
  v_revealed_at timestamptz;
begin
  if v_admin_id is null or not public.is_admin() then
    raise exception 'ADMIN_ONLY';
  end if;
  if p_lead_id is null then
    raise exception 'LEAD_REQUIRED';
  end if;

  select health_info_consent,
         nullif(btrim(injuries_or_limitations_optional), '')
    into v_consent, v_injuries
  from public.member_interest
  where id = p_lead_id;

  if not found then
    raise exception 'LEAD_NOT_FOUND';
  end if;

  if v_consent is not true or v_injuries is null then
    return jsonb_build_object(
      'lead_id', p_lead_id,
      'available', false,
      'injuries_or_limitations_optional', null
    );
  end if;

  insert into public.member_interest_health_reveals (
    lead_id,
    revealed_by,
    revealed_at
  ) values (
    p_lead_id,
    v_admin_id,
    now()
  )
  returning id, revealed_at into v_reveal_id, v_revealed_at;

  return jsonb_build_object(
    'lead_id', p_lead_id,
    'available', true,
    'audit_event_id', v_reveal_id,
    'revealed_at', v_revealed_at,
    'injuries_or_limitations_optional', v_injuries
  );
end;
$$;

revoke all on function public.admin_reveal_member_interest_health(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_reveal_member_interest_health(uuid)
  to authenticated;

insert into public.xert_schema_capabilities (capability)
values ('member_interest_health_reveal_authz')
on conflict (capability) do nothing;
