-- Publish where a form leads, not just what must come before it.
-- The prerequisite already records that the terms follow the questionnaire.
-- Read the other way round it answers a second question: when someone opens
-- the questionnaire directly instead of scanning the poster, where should they
-- go once they submit it? Without this they stopped at the thank-you screen and
-- never reached the agreement. A questionnaire nothing points at — the casual
-- visit one — simply has no follow-on, which is what keeps a casual visitor out
-- of the membership agreement.

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
  follow_on_slug text,
  follow_on_title text,
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
    follow_on.slug, follow_on.title,
    f.updated_at
  from public.xert_forms f
  left join public.xert_forms p
    on p.id = f.prerequisite_form_id and p.is_active = true and p.archived_at is null
  left join lateral (
    select n.slug, n.title
    from public.xert_forms n
    where n.prerequisite_form_id = f.id
      and n.is_active = true
      and n.archived_at is null
    order by n.created_at asc
    limit 1
  ) as follow_on on true
  where f.slug = lower(btrim(p_slug))
    and f.is_active = true
    and f.archived_at is null
  limit 1;
$$;

revoke all on function public.xert_public_form(text) from public;
grant execute on function public.xert_public_form(text) to anon, authenticated;
