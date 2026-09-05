-- Casual visit payments taken on the visitor's own phone.
-- The club's card reader is unreliable, and asking staff to type someone
-- else's card details is both awkward and something we should never build.
-- Instead a walk-in opens /casual, enters their name, email and phone, and
-- pays through Stripe Checkout on their own device with those details already
-- filled in. No account is involved: this is a door fee, not a session pack,
-- so it never touches member credits or the session-pack fulfilment ledger.

alter table public.admin_settings
  add column if not exists casual_visit_price_cents integer not null default 1560,
  add column if not exists casual_payments_enabled boolean not null default true;

alter table public.admin_settings drop constraint if exists admin_settings_casual_price_check;
alter table public.admin_settings
  add constraint admin_settings_casual_price_check
  check (casual_visit_price_cents between 100 and 100000);

-- One row per paid casual visit, written by the Stripe webhook. Kept apart
-- from orders on purpose: an order grants credits to a member account, and a
-- casual visit grants entry to somebody who may never have one.
create table if not exists public.casual_visit_payments (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text,
  amount_cents integer not null,
  currency text not null default 'aud',
  stripe_checkout_session_id text not null unique,
  stripe_payment_intent_id text,
  status text not null default 'paid',
  created_at timestamptz not null default now(),
  constraint casual_visit_name_check check (char_length(full_name) between 1 and 120),
  constraint casual_visit_email_check check (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  constraint casual_visit_phone_check check (phone is null or char_length(phone) <= 40),
  constraint casual_visit_amount_check check (amount_cents between 0 and 1000000),
  constraint casual_visit_status_check check (status in ('paid', 'refunded'))
);
create index if not exists casual_visit_payments_recent_idx on public.casual_visit_payments (created_at desc);

alter table public.casual_visit_payments enable row level security;
drop policy if exists "casual_visit_payments_admin_read" on public.casual_visit_payments;
create policy "casual_visit_payments_admin_read" on public.casual_visit_payments
  for select to authenticated using (public.is_admin());
revoke all on table public.casual_visit_payments from public, anon, authenticated;
grant select on table public.casual_visit_payments to authenticated;

-- Tell the owner the moment a casual visit is paid, the same way every other
-- alert reaches them. Wrapped so a paused email service can never fail a
-- payment that has already been taken.
create or replace function public.email_on_casual_visit_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.email_owner_alert(
      'owner_alerts',
      'Casual visit paid: ' || new.full_name,
      '<p>' || new.full_name || ' (' || new.email || coalesce(', ' || nullif(new.phone, ''), '')
        || ') paid ' || to_char(new.amount_cents / 100.0, 'FM$999990.00') || ' for a casual visit.</p>'
        || '<p>They completed the payment on their own phone. Check them in as usual.</p>',
      'casual_visit_payments', new.id::text
    );
  exception when others then
    raise notice 'casual visit owner alert skipped: %', sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists email_on_casual_visit_payment on public.casual_visit_payments;
create trigger email_on_casual_visit_payment
  after insert on public.casual_visit_payments
  for each row execute function public.email_on_casual_visit_payment();

insert into public.xert_schema_capabilities (capability)
values ('casual_visit_payments')
on conflict (capability) do nothing;
