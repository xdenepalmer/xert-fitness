-- LOCAL DRAFT: apply through the existing reviewed/manual SQL release process.
-- Visitor purchases remain independent of accounts, member orders and credits.
-- Existing rows and legacy webhook payloads remain casual visits.
alter table public.casual_visit_payments
  add column if not exists pass_kind text not null default 'casual';
alter table public.casual_visit_payments drop constraint if exists casual_visit_pass_kind_check;
alter table public.casual_visit_payments add constraint casual_visit_pass_kind_check
  check (pass_kind in ('casual', 'three_day_pass'));

-- The server checks the exact submission UUID returned by the questionnaire.
-- Only a boolean leaves the database; screening answers/signatures stay here.
-- This proves a matching signed response exists, not medical clearance.
create or replace function public.xert_visitor_questionnaire_completed(
  p_response_id uuid, p_name text, p_email text, p_phone text
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  with response as (
    select
      coalesce(nullif(btrim(r.respondent_name), ''), concat_ws(' ',
        r.answers #>> '{84703ad7-a28d-4904-9868-6c832ce38055,first}',
        r.answers #>> '{84703ad7-a28d-4904-9868-6c832ce38055,last}')) as full_name,
      coalesce(nullif(btrim(r.respondent_email), ''), r.answers ->> 'e4c4e161-43e3-5462-a865-f27c411ac809') as email,
      regexp_replace(coalesce(nullif(btrim(r.respondent_phone), ''), r.answers ->> '5d5d7d53-d5ea-4743-8f94-22ecd5fd6ded'), '[^0-9+]', '', 'g') as phone,
      r.answers ->> '576cbb02-2819-488f-a7d8-1719d8d53840' as signature
    from public.xert_form_responses r
    where r.id = p_response_id
      and r.form_id = 'e90f30f7-b0d2-56e7-8e1d-8b290721e234'::uuid
      and r.archived_at is null
      and r.completed_at <= now()
  )
  select exists (
    select 1 from response r
    where lower(regexp_replace(btrim(r.full_name), '[[:space:]]+', ' ', 'g')) = lower(btrim(p_name))
      and lower(btrim(r.email)) = lower(btrim(p_email))
      and case
        when r.phone ~ '^\+?61[0-9]{9}$' then '+' || regexp_replace(r.phone, '^\+', '')
        when r.phone ~ '^0[0-9]{9}$' then '+61' || substr(r.phone, 2)
        else r.phone
      end = p_phone
      and public.xert_valid_form_signature(r.signature)
  );
$$;
revoke all on function public.xert_visitor_questionnaire_completed(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.xert_visitor_questionnaire_completed(uuid, text, text, text) to service_role;
grant execute on function public.xert_valid_form_signature(text) to service_role;

create or replace function public.email_on_casual_visit_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text := case when new.pass_kind = 'three_day_pass' then 'Three Day Pass' else 'Casual visit' end;
  v_purchase text := case when new.pass_kind = 'three_day_pass' then 'a Three Day Pass' else 'a casual visit' end;
begin
  begin
    perform public.email_owner_alert(
      'owner_alerts', v_label || ' paid: ' || new.full_name,
      '<p>' || public.email_escape(new.full_name) || ' (' || public.email_escape(new.email)
        || coalesce(', ' || public.email_escape(nullif(new.phone, '')), '')
        || ') paid ' || to_char(new.amount_cents / 100.0, 'FM$999990.00') || ' for ' || v_purchase || '.</p>'
        || case when new.pass_kind = 'three_day_pass'
          then '<p>Three Day Pass. Confirm the receipt and arrange their visits; this payment does not create member credits.</p>'
          else '<p>They completed the payment on their own phone. Check them in as usual.</p>' end,
      'casual_visit_payments', new.id::text
    );
  exception when others then
    raise notice 'visitor payment owner alert skipped: %', sqlerrm;
  end;
  return new;
end;
$$;

-- Publish readiness only after the column, proof check and receipt are present.
insert into public.xert_schema_capabilities (capability)
values ('three_day_visitor_pass') on conflict (capability) do nothing;
