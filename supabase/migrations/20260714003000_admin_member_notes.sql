-- Durable, admin-only servicing notes used by the member follow-up queue.

create table if not exists public.admin_member_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null constraint admin_member_notes_user_id_fkey references public.profiles(id) on delete cascade,
  author_id uuid constraint admin_member_notes_author_id_fkey references public.profiles(id) on delete set null,
  category text not null check (category in ('general', 'coaching', 'follow_up', 'billing')),
  body text not null check (char_length(btrim(body)) between 3 and 1000),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid constraint admin_member_notes_archived_by_fkey references public.profiles(id) on delete set null
);
create index if not exists admin_member_notes_user_created_idx
  on public.admin_member_notes (user_id, created_at desc);
alter table public.admin_member_notes enable row level security;
revoke all on table public.admin_member_notes from public, anon, authenticated;
drop policy if exists "admin_member_notes_admin_read" on public.admin_member_notes;
create policy "admin_member_notes_admin_read" on public.admin_member_notes
  for select to authenticated using (public.is_admin());

create or replace function public.admin_list_member_notes(
  p_user_id uuid,
  p_include_archived boolean default false
)
returns table (
  id uuid, user_id uuid, author_id uuid, author_name text, category text,
  body text, created_at timestamptz, archived_at timestamptz, archived_by uuid
) language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_user_id is null then raise exception 'MEMBER_REQUIRED'; end if;
  return query
  select note.id, note.user_id, note.author_id,
         coalesce(author.full_name, author.email, 'Former admin'),
         note.category, note.body, note.created_at, note.archived_at, note.archived_by
  from public.admin_member_notes as note
  left join public.profiles as author on author.id = note.author_id
  where note.user_id = p_user_id
    and (coalesce(p_include_archived, false) or note.archived_at is null)
  order by (note.archived_at is not null), note.created_at desc
  limit 100;
end;
$$;

create or replace function public.admin_add_member_note(
  p_user_id uuid,
  p_category text,
  p_body text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_category text := lower(btrim(coalesce(p_category, '')));
  v_body text := btrim(coalesce(p_body, ''));
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if v_category not in ('general', 'coaching', 'follow_up', 'billing') then
    raise exception 'INVALID_NOTE_CATEGORY';
  end if;
  if char_length(v_body) < 3 or char_length(v_body) > 1000 then
    raise exception 'INVALID_NOTE_BODY';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'MEMBER_NOT_FOUND';
  end if;
  insert into public.admin_member_notes (user_id, author_id, category, body)
  values (p_user_id, auth.uid(), v_category, v_body)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.admin_set_member_note_archived(
  p_note_id uuid,
  p_archived boolean
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_updated integer;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_note_id is null or p_archived is null then raise exception 'INVALID_NOTE_ARCHIVE'; end if;
  update public.admin_member_notes
  set archived_at = case when p_archived then coalesce(archived_at, now()) else null end,
      archived_by = case when p_archived then coalesce(archived_by, auth.uid()) else null end
  where id = p_note_id;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then raise exception 'MEMBER_NOTE_NOT_FOUND'; end if;
end;
$$;

revoke execute on function public.admin_list_member_notes(uuid, boolean) from public, anon;
revoke execute on function public.admin_add_member_note(uuid, text, text) from public, anon;
revoke execute on function public.admin_set_member_note_archived(uuid, boolean) from public, anon;
grant execute on function public.admin_list_member_notes(uuid, boolean) to authenticated;
grant execute on function public.admin_add_member_note(uuid, text, text) to authenticated;
grant execute on function public.admin_set_member_note_archived(uuid, boolean) to authenticated;

insert into public.xert_schema_capabilities (capability)
values ('admin_member_notes')
on conflict (capability) do nothing;
