-- Production-safe FitBox prospect handoff through Zapier.
-- XERT remains authoritative for lead CRM; FitBox owns membership/billing.
-- No Zapier credential or member contact data is stored in these tables.

alter table public.admin_settings
  add column if not exists fitbox_enabled boolean not null default false,
  add column if not exists fitbox_booking_url text;

create table if not exists public.fitbox_integration_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null default 'register_prospect',
  lead_type text not null default 'member_interest',
  lead_id text not null,
  status text not null default 'queued',
  callback_token_hash text not null,
  fitbox_gym_id text not null,
  fitbox_user_id text,
  fitbox_status text,
  attempt_count integer not null default 0,
  last_error_code text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  dispatched_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  updated_at timestamptz not null default now(),
  constraint fitbox_integration_jobs_type_check check (job_type in ('register_prospect')),
  constraint fitbox_integration_jobs_lead_type_check check (lead_type in ('member_interest')),
  constraint fitbox_integration_jobs_status_check check (status in ('queued', 'dispatched', 'dispatch_unknown', 'completed', 'failed', 'expired')),
  constraint fitbox_integration_jobs_lead_id_check check (lead_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  constraint fitbox_integration_jobs_callback_hash_check check (callback_token_hash ~ '^[a-f0-9]{64}$'),
  constraint fitbox_integration_jobs_gym_check check (fitbox_gym_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  constraint fitbox_integration_jobs_user_check check (fitbox_user_id is null or fitbox_user_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  constraint fitbox_integration_jobs_attempt_check check (attempt_count between 0 and 20),
  constraint fitbox_integration_jobs_error_check check (last_error_code is null or last_error_code ~ '^[A-Z0-9_]{1,80}$')
);

create unique index if not exists fitbox_integration_jobs_active_lead_unique
  on public.fitbox_integration_jobs (lead_type, lead_id)
  where status in ('queued', 'dispatched', 'dispatch_unknown');
create index if not exists fitbox_integration_jobs_recent_idx
  on public.fitbox_integration_jobs (created_at desc, id desc);
create index if not exists fitbox_integration_jobs_status_idx
  on public.fitbox_integration_jobs (status, updated_at desc);

create table if not exists public.fitbox_member_links (
  id uuid primary key default gen_random_uuid(),
  fitbox_gym_id text not null,
  fitbox_user_id text not null,
  lead_type text not null default 'member_interest',
  lead_id text not null,
  fitbox_status text,
  link_method text not null default 'zapier_register_prospect',
  linked_by uuid not null references auth.users(id) on delete restrict,
  linked_at timestamptz not null default now(),
  last_verified_at timestamptz not null default now(),
  constraint fitbox_member_links_gym_check check (fitbox_gym_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  constraint fitbox_member_links_user_check check (fitbox_user_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  constraint fitbox_member_links_lead_type_check check (lead_type in ('member_interest')),
  constraint fitbox_member_links_lead_id_check check (lead_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  constraint fitbox_member_links_method_check check (link_method in ('zapier_register_prospect'))
);

create unique index if not exists fitbox_member_links_provider_unique
  on public.fitbox_member_links (fitbox_gym_id, fitbox_user_id);
create unique index if not exists fitbox_member_links_lead_unique
  on public.fitbox_member_links (lead_type, lead_id);
create index if not exists fitbox_member_links_verified_idx
  on public.fitbox_member_links (last_verified_at desc);

-- Every verified FitBox trigger lands here as evidence only. The Zapier app did
-- not expose a trustworthy event ID/timestamp contract during discovery, so no
-- row in this ledger is allowed to mutate booking, membership or billing state.
create table if not exists public.fitbox_integration_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  fitbox_gym_id text not null,
  fitbox_user_id text,
  fitbox_booking_id text,
  fitbox_session_id text,
  fitbox_subscription_id text,
  provider_event_id text,
  delivery_id text,
  provider_status text,
  provider_occurred_at timestamptz,
  provider_updated_at timestamptz,
  processing_state text not null default 'needs_review',
  review_reason text not null default 'MISSING_STABLE_EVENT_IDENTITY',
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  received_at timestamptz not null default now(),
  constraint fitbox_integration_events_type_check check (event_type in (
    'class_session_booked', 'class_session_cancelled', 'user_first_session_booked',
    'user_profile_changed', 'user_status_changed', 'user_subscription_changed'
  )),
  constraint fitbox_integration_events_gym_check check (fitbox_gym_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  constraint fitbox_integration_events_user_check check (fitbox_user_id is null or fitbox_user_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  constraint fitbox_integration_events_booking_check check (fitbox_booking_id is null or fitbox_booking_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  constraint fitbox_integration_events_session_check check (fitbox_session_id is null or fitbox_session_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  constraint fitbox_integration_events_subscription_check check (fitbox_subscription_id is null or fitbox_subscription_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  constraint fitbox_integration_events_provider_event_check check (provider_event_id is null or provider_event_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  constraint fitbox_integration_events_delivery_check check (delivery_id is null or delivery_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  constraint fitbox_integration_events_entity_check check (num_nonnulls(fitbox_user_id, fitbox_booking_id, fitbox_session_id, fitbox_subscription_id) > 0),
  constraint fitbox_integration_events_state_check check (processing_state in ('needs_review', 'reviewed', 'ignored')),
  constraint fitbox_integration_events_reason_check check (review_reason ~ '^[A-Z0-9_]{1,80}$')
);

create unique index if not exists fitbox_integration_events_delivery_unique
  on public.fitbox_integration_events (fitbox_gym_id, delivery_id)
  where delivery_id is not null;
create index if not exists fitbox_integration_events_review_idx
  on public.fitbox_integration_events (processing_state, received_at desc);
create index if not exists fitbox_integration_events_user_idx
  on public.fitbox_integration_events (fitbox_gym_id, fitbox_user_id, received_at desc)
  where fitbox_user_id is not null;

alter table public.fitbox_integration_jobs enable row level security;
alter table public.fitbox_member_links enable row level security;
alter table public.fitbox_integration_events enable row level security;

drop policy if exists "fitbox_integration_jobs_admin_read" on public.fitbox_integration_jobs;
create policy "fitbox_integration_jobs_admin_read"
  on public.fitbox_integration_jobs for select
  to authenticated
  using (public.is_admin());

drop policy if exists "fitbox_member_links_admin_read" on public.fitbox_member_links;
create policy "fitbox_member_links_admin_read"
  on public.fitbox_member_links for select
  to authenticated
  using (public.is_admin());

drop policy if exists "fitbox_integration_events_admin_read" on public.fitbox_integration_events;
create policy "fitbox_integration_events_admin_read"
  on public.fitbox_integration_events for select
  to authenticated
  using (public.is_admin());

create or replace function public.complete_fitbox_prospect_job(
  p_job_id uuid,
  p_callback_token_hash text,
  p_fitbox_gym_id text,
  p_fitbox_user_id text,
  p_fitbox_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.fitbox_integration_jobs%rowtype;
  v_provider_link public.fitbox_member_links%rowtype;
  v_lead_link public.fitbox_member_links%rowtype;
  v_link public.fitbox_member_links%rowtype;
begin
  select * into v_job
  from public.fitbox_integration_jobs
  where id = p_job_id
  for update;

  if not found or v_job.callback_token_hash <> lower(trim(coalesce(p_callback_token_hash, ''))) then
    raise exception 'FITBOX_CALLBACK_REJECTED';
  end if;
  if v_job.fitbox_gym_id <> trim(coalesce(p_fitbox_gym_id, '')) then
    raise exception 'FITBOX_GYM_MISMATCH';
  end if;
  if v_job.expires_at <= now() then
    raise exception 'FITBOX_CALLBACK_EXPIRED';
  end if;
  if trim(coalesce(p_fitbox_user_id, '')) !~ '^[A-Za-z0-9_-]{1,128}$' then
    raise exception 'FITBOX_USER_ID_INVALID';
  end if;

  if v_job.status = 'completed' then
    if v_job.fitbox_user_id <> trim(p_fitbox_user_id) then
      raise exception 'FITBOX_CALLBACK_CONFLICT';
    end if;
    return jsonb_build_object(
      'job_id', v_job.id,
      'status', v_job.status,
      'fitbox_user_id', v_job.fitbox_user_id,
      'fitbox_status', v_job.fitbox_status
    );
  end if;
  if v_job.status not in ('queued', 'dispatched', 'dispatch_unknown') then
    raise exception 'FITBOX_JOB_NOT_ACTIVE';
  end if;

  select * into v_provider_link
  from public.fitbox_member_links
  where fitbox_gym_id = v_job.fitbox_gym_id
    and fitbox_user_id = trim(p_fitbox_user_id)
  for update;
  if found and (v_provider_link.lead_type <> v_job.lead_type or v_provider_link.lead_id <> v_job.lead_id) then
    raise exception 'FITBOX_IDENTITY_CONFLICT';
  end if;

  select * into v_lead_link
  from public.fitbox_member_links
  where lead_type = v_job.lead_type
    and lead_id = v_job.lead_id
  for update;
  if found and (v_lead_link.fitbox_gym_id <> v_job.fitbox_gym_id or v_lead_link.fitbox_user_id <> trim(p_fitbox_user_id)) then
    raise exception 'FITBOX_IDENTITY_CONFLICT';
  end if;

  begin
    insert into public.fitbox_member_links (
      fitbox_gym_id, fitbox_user_id, lead_type, lead_id, fitbox_status,
      link_method, linked_by, last_verified_at
    ) values (
      v_job.fitbox_gym_id, trim(p_fitbox_user_id), v_job.lead_type, v_job.lead_id,
      nullif(lower(trim(coalesce(p_fitbox_status, ''))), ''),
      'zapier_register_prospect', v_job.created_by, now()
    )
    on conflict (lead_type, lead_id) do update set
      fitbox_status = excluded.fitbox_status,
      last_verified_at = now()
    returning * into v_link;
  exception when unique_violation then
    raise exception 'FITBOX_IDENTITY_CONFLICT';
  end;

  update public.fitbox_integration_jobs set
    status = 'completed',
    fitbox_user_id = trim(p_fitbox_user_id),
    fitbox_status = nullif(lower(trim(coalesce(p_fitbox_status, ''))), ''),
    completed_at = coalesce(completed_at, now()),
    updated_at = now(),
    last_error_code = null
  where id = v_job.id
  returning * into v_job;

  return jsonb_build_object(
    'job_id', v_job.id,
    'link_id', v_link.id,
    'status', v_job.status,
    'fitbox_user_id', v_job.fitbox_user_id,
    'fitbox_status', v_job.fitbox_status
  );
end;
$$;

create or replace function public.fail_fitbox_prospect_job(
  p_job_id uuid,
  p_callback_token_hash text,
  p_error_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.fitbox_integration_jobs%rowtype;
  v_error text := upper(trim(coalesce(p_error_code, 'FITBOX_PROVIDER_REJECTED')));
begin
  if v_error !~ '^[A-Z0-9_]{1,80}$' then v_error := 'FITBOX_PROVIDER_REJECTED'; end if;
  select * into v_job
  from public.fitbox_integration_jobs
  where id = p_job_id
  for update;
  if not found or v_job.callback_token_hash <> lower(trim(coalesce(p_callback_token_hash, ''))) then
    raise exception 'FITBOX_CALLBACK_REJECTED';
  end if;
  if v_job.status = 'completed' then raise exception 'FITBOX_CALLBACK_CONFLICT'; end if;
  if v_job.status not in ('queued', 'dispatched', 'dispatch_unknown', 'failed') then raise exception 'FITBOX_JOB_NOT_ACTIVE'; end if;
  update public.fitbox_integration_jobs set
    status = 'failed', last_error_code = v_error, updated_at = now()
  where id = v_job.id
  returning * into v_job;
  return jsonb_build_object('job_id', v_job.id, 'status', v_job.status, 'last_error_code', v_job.last_error_code);
end;
$$;

revoke all on table public.fitbox_integration_jobs from public, anon, authenticated;
revoke all on table public.fitbox_member_links from public, anon, authenticated;
revoke all on table public.fitbox_integration_events from public, anon, authenticated;
grant select on table public.fitbox_integration_jobs to authenticated;
grant select on table public.fitbox_member_links to authenticated;
grant select on table public.fitbox_integration_events to authenticated;

revoke execute on function public.complete_fitbox_prospect_job(uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.fail_fitbox_prospect_job(uuid, text, text) from public, anon, authenticated;
grant execute on function public.complete_fitbox_prospect_job(uuid, text, text, text, text) to service_role;
grant execute on function public.fail_fitbox_prospect_job(uuid, text, text) to service_role;

insert into public.xert_schema_capabilities (capability)
values ('fitbox_zapier_bridge')
on conflict (capability) do nothing;
