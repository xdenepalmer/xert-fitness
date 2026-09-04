-- One form can require another to be completed first.
-- The club's poster QR code opens the terms agreement, but nobody may train
-- before the Pre-Exercise Questionnaire is answered. Naming the PEQ as the
-- terms form's prerequisite makes that order automatic: the public form page
-- sends a first-time visitor to the PEQ and reopens the terms afterwards.

alter table public.xert_forms
  add column if not exists prerequisite_form_id uuid references public.xert_forms(id) on delete set null;

alter table public.xert_forms drop constraint if exists xert_forms_prerequisite_not_self;
alter table public.xert_forms
  add constraint xert_forms_prerequisite_not_self
  check (prerequisite_form_id is null or prerequisite_form_id <> id);

create index if not exists xert_forms_prerequisite_idx
  on public.xert_forms (prerequisite_form_id) where prerequisite_form_id is not null;

-- Publish the prerequisite with the form so the public page can act on it
-- without a second round trip. Only an active, unarchived prerequisite counts;
-- a paused one must never lock people out of the form they scanned.
drop function if exists public.xert_public_form(text);
create function public.xert_public_form(p_slug text)
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
  collect_phone_required boolean,
  prerequisite_slug text,
  prerequisite_title text,
  updated_at timestamptz
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
    f.collect_email_required, f.collect_phone, f.collect_phone_required,
    p.slug, p.title,
    f.updated_at
  from public.xert_forms f
  left join public.xert_forms p
    on p.id = f.prerequisite_form_id and p.is_active = true and p.archived_at is null
  where f.slug = lower(btrim(p_slug))
    and f.is_active = true
    and f.archived_at is null
  limit 1;
$$;

revoke all on function public.xert_public_form(text) from public;
grant execute on function public.xert_public_form(text) to anon, authenticated;

insert into public.xert_schema_capabilities (capability)
values ('form_prerequisites')
on conflict (capability) do nothing;
