-- Adds the verified read-only FitBox Get User refresh to an existing bridge.
-- This mirror never updates XERT identity, membership, booking or billing state.

alter table public.fitbox_integration_jobs
  drop constraint if exists fitbox_integration_jobs_type_check;
alter table public.fitbox_integration_jobs
  add constraint fitbox_integration_jobs_type_check
  check (job_type in ('register_prospect', 'get_user'));

alter table public.fitbox_member_links
  add column if not exists profile_first_name text,
  add column if not exists profile_last_name text,
  add column if not exists profile_email text,
  add column if not exists profile_phone text,
  add column if not exists profile_synced_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fitbox_member_links_profile_first_name_check') then
    alter table public.fitbox_member_links add constraint fitbox_member_links_profile_first_name_check
      check (profile_first_name is null or char_length(profile_first_name) <= 80);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fitbox_member_links_profile_last_name_check') then
    alter table public.fitbox_member_links add constraint fitbox_member_links_profile_last_name_check
      check (profile_last_name is null or char_length(profile_last_name) <= 80);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fitbox_member_links_profile_email_check') then
    alter table public.fitbox_member_links add constraint fitbox_member_links_profile_email_check
      check (profile_email is null or char_length(profile_email) <= 320);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fitbox_member_links_profile_phone_check') then
    alter table public.fitbox_member_links add constraint fitbox_member_links_profile_phone_check
      check (profile_phone is null or char_length(profile_phone) <= 60);
  end if;
end;
$$;

create or replace function public.complete_fitbox_get_user_job(
  p_job_id uuid,
  p_callback_token_hash text,
  p_fitbox_gym_id text,
  p_fitbox_user_id text,
  p_fitbox_status text default null,
  p_profile_first_name text default null,
  p_profile_last_name text default null,
  p_profile_email text default null,
  p_profile_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.fitbox_integration_jobs%rowtype;
  v_link public.fitbox_member_links%rowtype;
begin
  select * into v_job
  from public.fitbox_integration_jobs
  where id = p_job_id
  for update;

  if not found or v_job.callback_token_hash <> lower(trim(coalesce(p_callback_token_hash, ''))) then
    raise exception 'FITBOX_CALLBACK_REJECTED';
  end if;
  if v_job.job_type <> 'get_user' then raise exception 'FITBOX_JOB_TYPE_MISMATCH'; end if;
  if v_job.fitbox_gym_id <> trim(coalesce(p_fitbox_gym_id, '')) then raise exception 'FITBOX_GYM_MISMATCH'; end if;
  if v_job.expires_at <= now() then raise exception 'FITBOX_CALLBACK_EXPIRED'; end if;
  if trim(coalesce(p_fitbox_user_id, '')) !~ '^[A-Za-z0-9_-]{1,128}$' then raise exception 'FITBOX_USER_ID_INVALID'; end if;
  if v_job.fitbox_user_id <> trim(p_fitbox_user_id) then raise exception 'FITBOX_LOOKUP_IDENTITY_MISMATCH'; end if;

  if v_job.status = 'completed' then
    return jsonb_build_object('job_id', v_job.id, 'status', v_job.status, 'fitbox_user_id', v_job.fitbox_user_id);
  end if;
  if v_job.status not in ('queued', 'dispatched', 'dispatch_unknown') then raise exception 'FITBOX_JOB_NOT_ACTIVE'; end if;

  select * into v_link
  from public.fitbox_member_links
  where lead_type = v_job.lead_type and lead_id = v_job.lead_id
  for update;
  if not found
    or v_link.fitbox_gym_id <> v_job.fitbox_gym_id
    or v_link.fitbox_user_id <> v_job.fitbox_user_id then
    raise exception 'FITBOX_LOOKUP_IDENTITY_MISMATCH';
  end if;

  update public.fitbox_member_links set
    fitbox_status = nullif(lower(trim(coalesce(p_fitbox_status, ''))), ''),
    profile_first_name = nullif(left(trim(coalesce(p_profile_first_name, '')), 80), ''),
    profile_last_name = nullif(left(trim(coalesce(p_profile_last_name, '')), 80), ''),
    profile_email = nullif(lower(left(trim(coalesce(p_profile_email, '')), 320)), ''),
    profile_phone = nullif(left(trim(coalesce(p_profile_phone, '')), 60), ''),
    profile_synced_at = now(),
    last_verified_at = now()
  where id = v_link.id
  returning * into v_link;

  update public.fitbox_integration_jobs set
    status = 'completed',
    fitbox_status = v_link.fitbox_status,
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
    'fitbox_status', v_job.fitbox_status,
    'profile_synced_at', v_link.profile_synced_at
  );
end;
$$;

revoke execute on function public.complete_fitbox_get_user_job(uuid, text, text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.complete_fitbox_get_user_job(uuid, text, text, text, text, text, text, text, text)
  to service_role;

insert into public.xert_schema_capabilities (capability)
values ('fitbox_get_user_refresh')
on conflict (capability) do nothing;
