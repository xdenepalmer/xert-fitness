-- Prove the exact member questionnaire and agreement returned to /3months.
-- Only booleans leave PostgreSQL; answers, snapshots and signatures stay in
-- their immutable response records.

create or replace function public.xert_paperwork_normalized_name(p_value text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select lower(btrim(regexp_replace(btrim(coalesce(p_value, '')), '[[:space:]]+', ' ', 'g')));
$$;

create or replace function public.xert_paperwork_normalized_email(p_value text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select lower(btrim(coalesce(p_value, '')));
$$;

create or replace function public.xert_paperwork_normalized_phone(p_value text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  with cleaned as (
    select regexp_replace(btrim(coalesce(p_value, '')), '[^0-9+]', '', 'g') as phone
  )
  select case
    when phone ~ '^\+61[0-9]{9}$' then phone
    when phone ~ '^61[0-9]{9}$' then '+' || phone
    when phone ~ '^0[0-9]{9}$' then '+61' || substr(phone, 2)
    when phone ~ '^\+[0-9]{6,15}$' then phone
    when phone ~ '^[0-9]{6,15}$' then phone
    else ''
  end
  from cleaned;
$$;

create or replace function public.xert_paperwork_snapshot_has_question(
  p_snapshot jsonb, p_question_id text, p_question_type text
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from jsonb_array_elements(
      case when jsonb_typeof(p_snapshot -> 'questions') = 'array'
        then p_snapshot -> 'questions' else '[]'::jsonb end
    ) as question
    where question ->> 'id' = p_question_id
      and question ->> 'type' = p_question_type
  );
$$;

create or replace function public.xert_membership_checkout_paperwork_completed(
  p_questionnaire_response_id uuid,
  p_agreement_response_id uuid,
  p_name text,
  p_email text,
  p_phone text
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    p_questionnaire_response_id is not null
    and p_agreement_response_id is not null
    and p_questionnaire_response_id <> p_agreement_response_id
    and public.xert_paperwork_normalized_name(p_name) <> ''
    and public.xert_paperwork_normalized_email(p_email)
      ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    and public.xert_paperwork_normalized_phone(p_phone) <> ''
    and exists (
      select 1
      from public.xert_form_responses r
      where r.id = p_questionnaire_response_id
        and r.form_id = '000cc2da-1c51-59bf-a33e-c76bee4d7188'::uuid
        and r.archived_at is null
        and r.completed_at <= now()
        and public.xert_paperwork_normalized_name(coalesce(
          nullif(btrim(r.respondent_name), ''),
          concat_ws(' ',
            r.answers #>> '{84703ad7-a28d-4904-9868-6c832ce38055,first}',
            r.answers #>> '{84703ad7-a28d-4904-9868-6c832ce38055,last}'
          )
        )) = public.xert_paperwork_normalized_name(p_name)
        and public.xert_paperwork_normalized_email(coalesce(
          nullif(btrim(r.respondent_email), ''),
          r.answers ->> 'e4c4e161-43e3-5462-a865-f27c411ac809'
        )) = public.xert_paperwork_normalized_email(p_email)
        and public.xert_paperwork_normalized_email(coalesce(
          nullif(btrim(r.respondent_email), ''),
          r.answers ->> 'e4c4e161-43e3-5462-a865-f27c411ac809'
        )) <> ''
        and public.xert_paperwork_normalized_phone(coalesce(
          nullif(btrim(r.respondent_phone), ''),
          r.answers ->> '5d5d7d53-d5ea-4743-8f94-22ecd5fd6ded'
        )) = public.xert_paperwork_normalized_phone(p_phone)
        and public.xert_paperwork_snapshot_has_question(
          r.form_snapshot,
          '576cbb02-2819-488f-a7d8-1719d8d53840',
          'signature'
        )
        and public.xert_valid_form_signature(
          r.answers ->> '576cbb02-2819-488f-a7d8-1719d8d53840'
        )
    )
    and exists (
      select 1
      from public.xert_form_responses r
      where r.id = p_agreement_response_id
        and r.form_id = '0173f880-7bee-4a2e-bb0c-ac15af40ad9e'::uuid
        and r.archived_at is null
        and r.completed_at <= now()
        and public.xert_paperwork_normalized_name(r.respondent_name)
          = public.xert_paperwork_normalized_name(p_name)
        and public.xert_paperwork_normalized_email(r.respondent_email)
          = public.xert_paperwork_normalized_email(p_email)
        and public.xert_paperwork_normalized_email(r.respondent_email) <> ''
        and (
          nullif(btrim(coalesce(r.respondent_phone, '')), '') is null
          or (
            public.xert_paperwork_normalized_phone(r.respondent_phone) <> ''
            and public.xert_paperwork_normalized_phone(r.respondent_phone)
              = public.xert_paperwork_normalized_phone(p_phone)
          )
        )
        and public.xert_paperwork_normalized_name(r.answers ->> 'tc-member-name')
          = public.xert_paperwork_normalized_name(p_name)
        and r.answers ->> 'tc-accept' = 'I accept the Terms and Conditions'
        and public.xert_paperwork_snapshot_has_question(
          r.form_snapshot, 'tc-accept', 'single_choice'
        )
        and public.xert_paperwork_snapshot_has_question(
          r.form_snapshot, 'tc-signature', 'signature'
        )
        and public.xert_valid_form_signature(r.answers ->> 'tc-signature')
    ),
    false
  );
$$;

-- Preserve the existing email-only "already signed" lookup policy while
-- requiring the saved records to contain genuine signature and acceptance
-- evidence. An empty lookup email can never match an empty stored email.
create or replace function public.xert_membership_paperwork_signed(p_email text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'questionnaire',
    public.xert_paperwork_normalized_email(p_email)
      ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    and exists (
      select 1
      from public.xert_form_responses r
      where r.form_id = '000cc2da-1c51-59bf-a33e-c76bee4d7188'::uuid
        and r.archived_at is null
        and r.completed_at <= now()
        and public.xert_paperwork_normalized_email(coalesce(
          nullif(btrim(r.respondent_email), ''),
          r.answers ->> 'e4c4e161-43e3-5462-a865-f27c411ac809'
        )) = public.xert_paperwork_normalized_email(p_email)
        and public.xert_paperwork_normalized_email(coalesce(
          nullif(btrim(r.respondent_email), ''),
          r.answers ->> 'e4c4e161-43e3-5462-a865-f27c411ac809'
        )) <> ''
        and public.xert_paperwork_snapshot_has_question(
          r.form_snapshot,
          '576cbb02-2819-488f-a7d8-1719d8d53840',
          'signature'
        )
        and public.xert_valid_form_signature(
          r.answers ->> '576cbb02-2819-488f-a7d8-1719d8d53840'
        )
    ),
    'agreement',
    public.xert_paperwork_normalized_email(p_email)
      ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    and exists (
      select 1
      from public.xert_form_responses r
      where r.form_id = '0173f880-7bee-4a2e-bb0c-ac15af40ad9e'::uuid
        and r.archived_at is null
        and r.completed_at <= now()
        and public.xert_paperwork_normalized_email(r.respondent_email)
          = public.xert_paperwork_normalized_email(p_email)
        and public.xert_paperwork_normalized_email(r.respondent_email) <> ''
        and public.xert_paperwork_normalized_name(r.answers ->> 'tc-member-name') <> ''
        and r.answers ->> 'tc-accept' = 'I accept the Terms and Conditions'
        and public.xert_paperwork_snapshot_has_question(
          r.form_snapshot, 'tc-accept', 'single_choice'
        )
        and public.xert_paperwork_snapshot_has_question(
          r.form_snapshot, 'tc-signature', 'signature'
        )
        and public.xert_valid_form_signature(r.answers ->> 'tc-signature')
    )
  );
$$;

revoke all on function public.xert_paperwork_normalized_name(text) from public, anon, authenticated;
revoke all on function public.xert_paperwork_normalized_email(text) from public, anon, authenticated;
revoke all on function public.xert_paperwork_normalized_phone(text) from public, anon, authenticated;
revoke all on function public.xert_paperwork_snapshot_has_question(jsonb, text, text) from public, anon, authenticated;
revoke all on function public.xert_membership_checkout_paperwork_completed(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.xert_membership_paperwork_signed(text) from public, anon, authenticated;

grant execute on function public.xert_paperwork_normalized_name(text) to service_role;
grant execute on function public.xert_paperwork_normalized_email(text) to service_role;
grant execute on function public.xert_paperwork_normalized_phone(text) to service_role;
grant execute on function public.xert_paperwork_snapshot_has_question(jsonb, text, text) to service_role;
grant execute on function public.xert_membership_checkout_paperwork_completed(uuid, uuid, text, text, text) to service_role;
grant execute on function public.xert_membership_paperwork_signed(text) to service_role;

-- Fail this migration transaction itself if the safe false contract or RPC
-- boundary differs from the reviewed release contract. This performs no DML.
do $$
declare
  v_signature constant text :=
    'public.xert_membership_checkout_paperwork_completed(uuid,uuid,text,text,text)';
begin
  if public.xert_membership_checkout_paperwork_completed(null, null, '', '', '')
      is distinct from false then
    raise exception 'Membership paperwork proof must return false for empty input.';
  end if;

  if not pg_catalog.has_function_privilege('service_role', v_signature, 'execute')
    or pg_catalog.has_function_privilege('anon', v_signature, 'execute')
    or pg_catalog.has_function_privilege('authenticated', v_signature, 'execute') then
    raise exception 'Membership paperwork proof role grants do not match the service-only contract.';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) acl
    where p.oid = v_signature::regprocedure
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'Membership paperwork proof must not be executable by PUBLIC.';
  end if;
end;
$$;
