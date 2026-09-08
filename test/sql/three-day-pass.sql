-- Run only against a new disposable local database, never a deployed database.
-- psql -X -v ON_ERROR_STOP=1 -v apply_migration=1 -f test/sql/three-day-pass.sql
begin;
create role anon;
create role authenticated;
create role service_role bypassrls;
create table public.admin_settings (id integer primary key);
create table public.xert_schema_capabilities (capability text primary key);
create function public.is_admin() returns boolean language sql as $$ select false $$;
create table public.test_owner_alerts (subject text, body text);
create function public.email_owner_alert(text, text, text, text, text)
returns void language sql as $$ insert into public.test_owner_alerts values ($2, $3) $$;
create function public.email_escape(value text) returns text language sql immutable as $$
  select replace(replace(replace(value, '&', '&amp;'), '<', '&lt;'), '>', '&gt;')
$$;
create table public.xert_form_responses (
  id uuid primary key, form_id uuid not null, respondent_name text, respondent_email text,
  respondent_phone text, answers jsonb not null, completed_at timestamptz default now(), archived_at timestamptz
);
alter table public.xert_form_responses enable row level security;
grant select on public.xert_form_responses to service_role;
-- Existing signature-validation dependency from the form submission contract.
create function public.xert_valid_form_signature(value text) returns boolean language sql immutable strict as $$
  select value ~* '^data:image/(png|jpeg);base64,[a-z0-9+/]+={0,2}$'
    and length(split_part(value, ',', 2)) % 4 = 0
$$;
\ir ../../supabase/migrations/20260905010000_casual_visit_payments.sql
insert into public.casual_visit_payments(full_name,email,amount_cents,stripe_checkout_session_id)
values ('Legacy Visitor','legacy@example.test',1560,'cs_test_legacy');
\if :apply_migration
\ir ../../supabase/migrations/20260908010000_three_day_visitor_pass.sql
-- The draft must be safe to rerun.
\ir ../../supabase/migrations/20260908010000_three_day_visitor_pass.sql
\endif
do $$ begin
  if not exists (select 1 from information_schema.columns where table_name='casual_visit_payments' and column_name='pass_kind') then
    raise exception 'pass_kind is missing: Three Day purchases cannot be recorded distinctly';
  end if;
end $$;
insert into public.xert_form_responses(id,form_id,answers) values (
  '11111111-1111-4111-8111-111111111111','e90f30f7-b0d2-56e7-8e1d-8b290721e234',
  '{"84703ad7-a28d-4904-9868-6c832ce38055":{"first":"Casey","last":"Example"},"e4c4e161-43e3-5462-a865-f27c411ac809":"casey@example.test","5d5d7d53-d5ea-4743-8f94-22ecd5fd6ded":"0400111222","576cbb02-2819-488f-a7d8-1719d8d53840":"data:image/png;base64,YWJj"}'
);
set local role service_role;
do $$ begin
  if not public.xert_visitor_questionnaire_completed('11111111-1111-4111-8111-111111111111','Casey Example','casey@example.test','+61400111222') then
    raise exception 'valid signed questionnaire was rejected';
  end if;
  if public.xert_visitor_questionnaire_completed('11111111-1111-4111-8111-111111111111','Casey Example','other@example.test','+61400111222') then
    raise exception 'wrong email accepted';
  end if;
  if public.xert_visitor_questionnaire_completed('11111111-1111-4111-8111-111111111111','Someone Else','casey@example.test','+61400111222') then
    raise exception 'wrong person accepted';
  end if;
end $$;
reset role;
update public.xert_form_responses set answers=answers - '576cbb02-2819-488f-a7d8-1719d8d53840';
do $$ begin
  if public.xert_visitor_questionnaire_completed('11111111-1111-4111-8111-111111111111','Casey Example','casey@example.test','+61400111222') then
    raise exception 'unsigned questionnaire accepted';
  end if;
  if has_function_privilege('anon','public.xert_visitor_questionnaire_completed(uuid,text,text,text)','execute')
    or has_function_privilege('authenticated','public.xert_visitor_questionnaire_completed(uuid,text,text,text)','execute') then
    raise exception 'questionnaire proof lookup is exposed publicly';
  end if;
  if (select pass_kind from public.casual_visit_payments where stripe_checkout_session_id='cs_test_legacy') <> 'casual' then
    raise exception 'existing casual purchase changed kind';
  end if;
  begin
    insert into public.casual_visit_payments(full_name,email,amount_cents,stripe_checkout_session_id,pass_kind)
    values ('Bad Kind','invalid@example.test',3500,'cs_test_unknown','unlimited');
    raise exception 'unknown kind was accepted';
  exception when check_violation then null; end;
end $$;
insert into public.casual_visit_payments(full_name,email,amount_cents,stripe_checkout_session_id,pass_kind)
values ('Casey <Example>','casey@example.test',3500,'cs_test_three_day','three_day_pass');
insert into public.casual_visit_payments(full_name,email,amount_cents,stripe_checkout_session_id,pass_kind)
values ('Casey <Example>','casey@example.test',3500,'cs_test_three_day','three_day_pass')
on conflict (stripe_checkout_session_id) do nothing;
do $$ begin
  if (select count(*) from public.casual_visit_payments where pass_kind='three_day_pass') <> 1 then raise exception 'duplicate pass receipt'; end if;
  if (select count(*) from public.test_owner_alerts where subject='Three Day Pass paid: Casey <Example>') <> 1 then raise exception 'owner pass label/replay incorrect'; end if;
  if not exists (select 1 from public.test_owner_alerts where body like '%Casey &lt;Example&gt;%' and body like '%Three Day Pass%') then raise exception 'owner pass body missing or unescaped'; end if;
end $$;
rollback;
\echo Three Day Pass SQL fixture checks passed.
