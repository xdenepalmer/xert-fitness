-- A three month membership bought up front, on the buyer's own phone, the same
-- way /casual and /3daypass work: a payment record and an owner alert, with the
-- membership itself handled by the club. No account, no credits, no entitlement.

alter table public.casual_visit_payments drop constraint if exists casual_visit_pass_kind_check;
alter table public.casual_visit_payments add constraint casual_visit_pass_kind_check
  check (pass_kind in ('casual', 'three_day_pass', 'three_month_membership'));

-- Whether the buyer says they have already signed is a claim, not proof. This
-- looks for the signed records themselves so the owner alert can say which of
-- the two is genuinely on file. Only booleans leave the database; the answers
-- and signatures stay here.
alter table public.casual_visit_payments
  add column if not exists paperwork_verified boolean;

comment on column public.casual_visit_payments.paperwork_verified is
  'For a membership purchase where the buyer declared they had already signed: true when a matching signed questionnaire and agreement were both found, false when they were not. Null when they signed as part of the purchase.';

create or replace function public.xert_membership_paperwork_signed(p_email text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'questionnaire', exists (
      select 1 from public.xert_form_responses r
      where r.form_id = '000cc2da-1c51-59bf-a33e-c76bee4d7188'::uuid
        and r.archived_at is null
        and r.completed_at <= now()
        and lower(btrim(coalesce(
          nullif(btrim(r.respondent_email), ''),
          r.answers ->> 'e4c4e161-43e3-5462-a865-f27c411ac809'
        ))) = lower(btrim(p_email))
    ),
    'agreement', exists (
      select 1 from public.xert_form_responses r
      where r.form_id = '0173f880-7bee-4a2e-bb0c-ac15af40ad9e'::uuid
        and r.archived_at is null
        and r.completed_at <= now()
        and lower(btrim(coalesce(r.respondent_email, ''))) = lower(btrim(p_email))
    )
  );
$$;

revoke all on function public.xert_membership_paperwork_signed(text) from public, anon, authenticated;
grant execute on function public.xert_membership_paperwork_signed(text) to service_role;

-- The owner alert now names the purchase and, for a declared "already signed",
-- says plainly whether the paperwork was actually found.
create or replace function public.email_on_casual_visit_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text := case new.pass_kind
    when 'three_day_pass' then 'Three Day Pass'
    when 'three_month_membership' then 'Three month membership'
    else 'Casual visit' end;
  v_purchase text := case new.pass_kind
    when 'three_day_pass' then 'a Three Day Pass'
    when 'three_month_membership' then 'a three month membership'
    else 'a casual visit' end;
  v_note text := case
    when new.pass_kind = 'three_day_pass'
      then '<p>Three Day Pass. Confirm the receipt and arrange their visits; this payment does not create member credits.</p>'
    when new.pass_kind = 'three_month_membership' and new.paperwork_verified is false
      then '<p><strong>They said they had already signed, but no matching questionnaire and agreement were found under this email.</strong> Check with them before their first session.</p>'
    when new.pass_kind = 'three_month_membership' and new.paperwork_verified is true
      then '<p>Their signed questionnaire and agreement are both on file. Set the membership up in FitBox.</p>'
    when new.pass_kind = 'three_month_membership'
      then '<p>They signed the questionnaire and agreement as part of this purchase. Set the membership up in FitBox.</p>'
    else '<p>They completed the payment on their own phone. Check them in as usual.</p>' end;
begin
  begin
    perform public.email_owner_alert(
      'owner_alerts', v_label || ' paid: ' || new.full_name,
      '<p>' || public.email_escape(new.full_name) || ' (' || public.email_escape(new.email)
        || coalesce(', ' || public.email_escape(nullif(new.phone, '')), '')
        || ') paid ' || to_char(new.amount_cents / 100.0, 'FM$999990.00') || ' for ' || v_purchase || '.</p>'
        || v_note,
      'casual_visit_payments', new.id::text
    );
  exception when others then
    raise notice 'visitor payment owner alert skipped: %', sqlerrm;
  end;
  return new;
end;
$$;

insert into public.xert_schema_capabilities (capability)
values ('three_month_membership') on conflict (capability) do nothing;
