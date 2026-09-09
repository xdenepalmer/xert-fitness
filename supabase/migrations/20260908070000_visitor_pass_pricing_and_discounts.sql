-- The three visitor pages had one editable price between them: the casual
-- visit. The Three Day Pass and the three month membership were fixed in the
-- code, so changing either meant a deploy. All three are now priced by the
-- club, and each can run a discount that is switched on and off on its own.
--
-- A discount is stored as the price actually charged while it is running, not
-- as a percentage, so what the club types is exactly what a visitor pays.

alter table public.admin_settings
  add column if not exists casual_visit_discount_cents integer,
  add column if not exists casual_visit_discount_enabled boolean not null default false,
  add column if not exists three_day_pass_price_cents integer not null default 3500,
  add column if not exists three_day_pass_discount_cents integer,
  add column if not exists three_day_pass_discount_enabled boolean not null default false,
  add column if not exists three_month_price_cents integer not null default 43000,
  add column if not exists three_month_discount_cents integer,
  add column if not exists three_month_discount_enabled boolean not null default false;

-- Same bounds the casual price already had, so a typo is refused here rather
-- than charged to somebody.
alter table public.admin_settings drop constraint if exists visitor_pass_price_bounds;
alter table public.admin_settings add constraint visitor_pass_price_bounds check (
  three_day_pass_price_cents between 100 and 100000
  and three_month_price_cents between 100 and 100000
  and (casual_visit_discount_cents is null or casual_visit_discount_cents between 100 and 100000)
  and (three_day_pass_discount_cents is null or three_day_pass_discount_cents between 100 and 100000)
  and (three_month_discount_cents is null or three_month_discount_cents between 100 and 100000)
);

-- A discount that is switched on must actually be cheaper, and must exist.
alter table public.admin_settings drop constraint if exists visitor_pass_discount_is_a_discount;
alter table public.admin_settings add constraint visitor_pass_discount_is_a_discount check (
  (casual_visit_discount_enabled is not true
    or (casual_visit_discount_cents is not null and casual_visit_discount_cents < casual_visit_price_cents))
  and (three_day_pass_discount_enabled is not true
    or (three_day_pass_discount_cents is not null and three_day_pass_discount_cents < three_day_pass_price_cents))
  and (three_month_discount_enabled is not true
    or (three_month_discount_cents is not null and three_month_discount_cents < three_month_price_cents))
);

comment on column public.admin_settings.three_day_pass_price_cents is
  'Full price of the Three Day Pass, in cents. The server reads this; the browser never sets it.';
comment on column public.admin_settings.three_month_price_cents is
  'Full price of the three month membership, in cents. The server reads this; the browser never sets it.';
comment on column public.admin_settings.casual_visit_discount_cents is
  'What a casual visit costs while its discount is switched on. Null means no discount is set up.';

insert into public.xert_schema_capabilities (capability)
values ('visitor_pass_pricing') on conflict (capability) do nothing;
