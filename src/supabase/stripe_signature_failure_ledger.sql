-- Makes a broken Stripe signing secret visible to Operations Health.
--
-- Signature verification fails before processStripeEvent runs, so no
-- stripe_webhook_events row was ever written for a rejected delivery. Every
-- health signal is derived from that table alone, and
--
--   const ready = failed === 0 && staleProcessing === 0 && !truncated;
--
-- is trivially true on an empty ledger. inspectStripeWebhookEndpoints checks
-- the endpoint URL, its status and its enabled event list, none of which can
-- detect a secret mismatch. The one failure mode that silently stops all
-- fulfilment was therefore the one failure mode nothing could see: the owner
-- rotates the secret, forgets to deploy it, every delivery returns 400, members
-- keep paying, and every order sits pending with no credit batch and no alarm.
--
-- The reason string is bounded and drawn from the Stripe error's code, type or
-- name. Nothing member-identifying is stored, matching the constraint the event
-- ledger already applies to last_error_code.
--
-- Deliberately not wired into the customer-facing checkout kill switch. That
-- endpoint is unauthenticated, so anything that counts forged-signature
-- rejections there would let anyone pause the whole store. The signal belongs
-- in the admin health view, alongside the delivery-gap check that reports paid
-- orders newer than the newest ledger row.

create table if not exists public.stripe_webhook_signature_failures (
  id          uuid primary key default gen_random_uuid(),
  reason      text not null,
  received_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  constraint stripe_webhook_signature_failures_reason_bounded
    check (char_length(reason) between 1 and 200)
);

create index if not exists stripe_webhook_signature_failures_received_idx
  on public.stripe_webhook_signature_failures (received_at desc);

-- Written and read only by the service-role endpoints. RLS is enabled with no
-- policy, so every other role is denied even if a grant is added by mistake.
alter table public.stripe_webhook_signature_failures enable row level security;
revoke all on table public.stripe_webhook_signature_failures from public, anon, authenticated;

insert into public.xert_schema_capabilities (capability)
values ('stripe_signature_failure_ledger') on conflict (capability) do nothing;
