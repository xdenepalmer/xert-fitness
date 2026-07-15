alter table public.admin_settings
  add column if not exists payments_enabled boolean not null default false;

comment on column public.admin_settings.payments_enabled is
  'Owner-controlled server-side switch for creating Stripe session-pack Checkout sessions.';
