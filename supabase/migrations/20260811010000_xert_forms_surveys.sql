-- XERT Forms & Surveys
-- Owner-built public forms with bounded anonymous submission and admin-only analytics.
-- Standalone public collection with no external entity-assignment features.

create table if not exists public.xert_forms (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  form_type text not null default 'survey',
  slug text not null,
  questions jsonb not null default '[]'::jsonb,
  is_active boolean not null default false,
  show_progress_bar boolean not null default true,
  thank_you_message text not null default 'Thanks for completing this form.',
  redirect_url text,
  header_media_type text,
  header_media_url text,
  header_media_caption text,
  collect_name boolean not null default true,
  collect_name_required boolean not null default false,
  collect_email boolean not null default true,
  collect_email_required boolean not null default false,
  collect_phone boolean not null default false,
  collect_phone_required boolean not null default false,
  one_response_per_email boolean not null default false,
  notify_admin boolean not null default true,
  tags jsonb not null default '[]'::jsonb,
  response_count integer not null default 0,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint xert_forms_title_length check (char_length(btrim(title)) between 1 and 160),
  constraint xert_forms_description_length check (char_length(description) <= 4000),
  constraint xert_forms_type_check check (form_type in (
    'contact', 'registration', 'application', 'feedback', 'booking',
    'survey', 'quiz', 'waiver', 'order', 'custom'
  )),
  constraint xert_forms_slug_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) between 3 and 96),
  constraint xert_forms_questions_check check (
    jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) <= 100
  ),
  constraint xert_forms_tags_check check (jsonb_typeof(tags) = 'array' and jsonb_array_length(tags) <= 20),
  constraint xert_forms_header_media_type_check check (
    header_media_type is null or header_media_type in ('image', 'video', 'link')
  ),
  constraint xert_forms_response_count_check check (response_count >= 0),
  constraint xert_forms_collection_settings_check check (
    (not collect_name_required or collect_name)
    and (not collect_email_required or collect_email)
    and (not collect_phone_required or collect_phone)
    and (not one_response_per_email or collect_email)
  ),
  constraint xert_forms_redirect_url_check check (
    redirect_url is null or redirect_url = '' or redirect_url ~ '^https?://'
  )
);

create unique index if not exists xert_forms_slug_active_unique
  on public.xert_forms (lower(slug)) where archived_at is null;
create index if not exists xert_forms_owner_updated_idx
  on public.xert_forms (archived_at, updated_at desc);

create table if not exists public.xert_form_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.xert_forms(id) on delete restrict,
  answers jsonb not null default '{}'::jsonb,
  respondent_name text,
  respondent_email text,
  respondent_phone text,
  status text not null default 'new',
  completed_at timestamptz not null default now(),
  time_taken_seconds integer not null default 0,
  source_url text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid,
  constraint xert_form_responses_answers_check check (
    jsonb_typeof(answers) = 'object' and jsonb_object_length(answers) <= 100
  ),
  constraint xert_form_responses_status_check check (status in ('new', 'reviewed', 'followed_up', 'closed')),
  constraint xert_form_responses_time_check check (time_taken_seconds between 0 and 43200),
  constraint xert_form_responses_identity_lengths check (
    coalesce(char_length(respondent_name), 0) <= 160
    and coalesce(char_length(respondent_email), 0) <= 320
    and coalesce(char_length(respondent_phone), 0) <= 60
    and coalesce(char_length(source_url), 0) <= 2048
  )
);

create index if not exists xert_form_responses_form_created_idx
  on public.xert_form_responses (form_id, archived_at, created_at desc);
create index if not exists xert_form_responses_new_idx
  on public.xert_form_responses (status, created_at desc)
  where archived_at is null and status = 'new';
create index if not exists xert_form_responses_email_idx
  on public.xert_form_responses (form_id, lower(respondent_email))
  where archived_at is null and respondent_email is not null;

alter table public.xert_forms enable row level security;
alter table public.xert_form_responses enable row level security;

drop policy if exists "xert_forms_admin_all" on public.xert_forms;
create policy "xert_forms_admin_all" on public.xert_forms
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "xert_form_responses_admin_all" on public.xert_form_responses;
create policy "xert_form_responses_admin_all" on public.xert_form_responses
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke all on public.xert_forms from anon, authenticated;
revoke all on public.xert_form_responses from anon, authenticated;
grant select, insert, update on public.xert_forms to authenticated;
grant select, update on public.xert_form_responses to authenticated;

create or replace function public.xert_touch_form_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists xert_forms_touch_updated_at on public.xert_forms;
create trigger xert_forms_touch_updated_at
before update of title, description, form_type, slug, questions, is_active,
  show_progress_bar, thank_you_message, redirect_url, header_media_type,
  header_media_url, header_media_caption, collect_name, collect_name_required,
  collect_email, collect_email_required, collect_phone, collect_phone_required,
  one_response_per_email, notify_admin, tags, archived_at
on public.xert_forms
for each row execute function public.xert_touch_form_updated_at();

create or replace function public.xert_public_form(p_slug text)
returns table (
  id uuid,
  title text,
  description text,
  form_type text,
  slug text,
  questions jsonb,
  show_progress_bar boolean,
  thank_you_message text,
  redirect_url text,
  header_media_type text,
  header_media_url text,
  header_media_caption text,
  collect_name boolean,
  collect_name_required boolean,
  collect_email boolean,
  collect_email_required boolean,
  collect_phone boolean,
  collect_phone_required boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.id, f.title, f.description, f.form_type, f.slug, f.questions,
    f.show_progress_bar, f.thank_you_message, f.redirect_url,
    f.header_media_type, f.header_media_url, f.header_media_caption,
    f.collect_name, f.collect_name_required, f.collect_email,
    f.collect_email_required, f.collect_phone, f.collect_phone_required
  from public.xert_forms f
  where f.slug = lower(btrim(p_slug))
    and f.is_active = true
    and f.archived_at is null
  limit 1;
$$;

create or replace function public.submit_xert_form_response(
  p_slug text,
  p_answers jsonb,
  p_respondent_name text default null,
  p_respondent_email text default null,
  p_respondent_phone text default null,
  p_time_taken_seconds integer default 0,
  p_source_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form public.xert_forms%rowtype;
  v_id uuid;
  v_email text := nullif(lower(btrim(coalesce(p_respondent_email, ''))), '');
  v_question jsonb;
  v_answer jsonb;
begin
  select * into v_form
  from public.xert_forms
  where slug = lower(btrim(p_slug)) and is_active = true and archived_at is null
  for share;

  if not found then raise exception 'This form is not available.' using errcode = 'P0002'; end if;
  if jsonb_typeof(p_answers) is distinct from 'object'
    or jsonb_object_length(p_answers) > 100
    or octet_length(p_answers::text) > 524288 then
    raise exception 'The submitted answers are invalid.' using errcode = '22023';
  end if;
  if v_form.collect_name_required and nullif(btrim(coalesce(p_respondent_name, '')), '') is null then
    raise exception 'Name is required.' using errcode = '22023';
  end if;
  if v_form.collect_email_required and v_email is null then
    raise exception 'Email is required.' using errcode = '22023';
  end if;
  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;
  if v_form.collect_phone_required and nullif(btrim(coalesce(p_respondent_phone, '')), '') is null then
    raise exception 'Phone is required.' using errcode = '22023';
  end if;

  for v_question in select value from jsonb_array_elements(v_form.questions)
  loop
    if coalesce((v_question ->> 'hidden')::boolean, false) then continue; end if;
    if v_question ->> 'type' in ('section_break', 'statement') then continue; end if;
    if coalesce((v_question ->> 'required')::boolean, false) then
      v_answer := p_answers -> (v_question ->> 'id');
      if v_answer is null or v_answer = 'null'::jsonb or v_answer = '""'::jsonb
        or v_answer = '[]'::jsonb or v_answer = '{}'::jsonb then
        raise exception 'Please complete every required question.' using errcode = '22023';
      end if;
    end if;
  end loop;

  if v_form.one_response_per_email and v_email is not null and exists (
    select 1 from public.xert_form_responses r
    where r.form_id = v_form.id and lower(r.respondent_email) = v_email and r.archived_at is null
  ) then
    raise exception 'A response has already been submitted for this email.' using errcode = '23505';
  end if;

  insert into public.xert_form_responses (
    form_id, answers, respondent_name, respondent_email, respondent_phone,
    time_taken_seconds, source_url, created_by
  ) values (
    v_form.id,
    p_answers,
    nullif(left(btrim(coalesce(p_respondent_name, '')), 160), ''),
    v_email,
    nullif(left(btrim(coalesce(p_respondent_phone, '')), 60), ''),
    least(greatest(coalesce(p_time_taken_seconds, 0), 0), 43200),
    nullif(left(coalesce(p_source_url, ''), 2048), ''),
    auth.uid()
  ) returning id into v_id;

  update public.xert_forms set response_count = response_count + 1 where id = v_form.id;
  return v_id;
end;
$$;

create or replace function public.xert_archive_form_response(p_response_id uuid, p_archived boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form_id uuid;
begin
  if not public.is_admin() then raise exception 'Administrator access required.' using errcode = '42501'; end if;
  update public.xert_form_responses
  set archived_at = case when p_archived then now() else null end,
      archived_by = case when p_archived then auth.uid() else null end
  where id = p_response_id
    and ((p_archived and archived_at is null) or (not p_archived and archived_at is not null))
  returning form_id into v_form_id;
  if v_form_id is not null then
    update public.xert_forms f set response_count = (
      select count(*)::integer from public.xert_form_responses r
      where r.form_id = f.id and r.archived_at is null
    ) where f.id = v_form_id;
  end if;
end;
$$;

revoke all on function public.xert_public_form(text) from public;
grant execute on function public.xert_public_form(text) to anon, authenticated;
revoke all on function public.submit_xert_form_response(text, jsonb, text, text, text, integer, text) from public;
grant execute on function public.submit_xert_form_response(text, jsonb, text, text, text, integer, text) to anon, authenticated;
revoke all on function public.xert_archive_form_response(uuid, boolean) from public;
grant execute on function public.xert_archive_form_response(uuid, boolean) to authenticated;

comment on table public.xert_forms is 'Owner-built XERT forms and surveys with bounded public submission.';
comment on table public.xert_form_responses is 'Privacy-bounded form submissions visible only to XERT administrators.';

insert into public.xert_schema_capabilities (capability)
values ('forms_surveys_builder')
on conflict (capability) do update set installed_at = excluded.installed_at;
