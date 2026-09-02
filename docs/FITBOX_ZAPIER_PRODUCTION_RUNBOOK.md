# XERT / FitBox Zapier production runbook

This document is the production authority for the Zapier connector boundary.
FitBox owns memberships, subscriptions, recurring billing and FitBox booking
outcomes. XERT owns CRM, forms, readiness, notes, communications, goals and its
own provider-specific data. A Zap being on does not make an unverified FitBox
field authoritative in XERT.

## Production capability contract

The connector exposes exactly ten surfaces. The states below are the maximum
allowed production modes after the launch checklist passes; this file alone is
not evidence that a Zap is published. Before that signed-off activation, every
Zap remains off. Runtime truth comes from the exact named Zap and XERT Operations
Health. `LIVE` is the only permitted
FitBox mutation. `READ-ONLY` means XERT stores a minimal event for owner review
and does not alter a member, booking, subscription, credit, payment or
attendance record. `DISABLED` means no production Zap or XERT control may call
the surface.

| # | Zapier FitBox surface | Direction | Production state | Authority and operator behaviour |
| --- | --- | --- | --- | --- |
| 1 | `Register User` | XERT to FitBox | **LIVE** | An admin may explicitly send one approved XERT lead. The result is a FitBox `prospect` link only, never proof of membership, subscription or payment. |
| 2 | `Update User` | XERT to FitBox | **DISABLED** | The connector emitted `subrub` and an unsolicited `gender: Unspecified` during discovery. Edit the member in FitBox. |
| 3 | `Get User` | XERT query / FitBox result | **READ-ONLY** | A linked lead may be refreshed explicitly. XERT stores only name, email, phone, status and freshness in the provider mirror; it ignores DOB and never changes XERT identity, access, booking or billing state. |
| 4 | `Get Users Next Session` | XERT query / FitBox result | **DISABLED** | Only the no-result path was observed. Keep off until a booked synthetic user proves booking/session identity, timezone and cancellation semantics. |
| 5 | `Class Session Booked` | FitBox to XERT | **READ-ONLY** | Store the minimal event as `needs_review`; never create an XERT booking or consume a credit. |
| 6 | `Class Session Cancelled` | FitBox to XERT | **READ-ONLY** | Store the minimal event as `needs_review`; never cancel an XERT booking or return a credit. |
| 7 | `User First Session Booked` | FitBox to XERT | **READ-ONLY** | Store as an onboarding signal for review; do not infer attendance or deduplicate it against a booking without stable provider identity. |
| 8 | `User Profile Changed` | FitBox to XERT | **READ-ONLY** | Store identifiers/status only. Never overwrite the XERT profile, especially DOB, gender, weight, height or health-adjacent fields. |
| 9 | `User Status Changed` | FitBox to XERT | **READ-ONLY** | Preserve the raw status for review. Never activate, suspend or archive an XERT account automatically. |
| 10 | `User Subscription Changed` | FitBox to XERT | **READ-ONLY** | Preserve identifiers/status for review. Never alter Stripe, access, credits, products or billing. |

The connector provides no create/cancel booking action, timetable/session-list
action, attendance surface, subscription mutation, charge, refund or supported
session-specific deep link. Those capabilities stay unavailable or open the
official FitBox surface. XERT must not simulate them.

## Exact Zap names

Use these names so Zap History and Operations Health can be reconciled without
guesswork:

| Zap name | Connector surface | XERT `event_type` | Required mode |
| --- | --- | --- | --- |
| `XERT → FitBox — Register Approved Prospect` | `Register User` | `xert_fitbox_register_prospect` | On after launch verification |
| `XERT → FitBox — Get User — Read Only` | `Get User` | `xert_fitbox_get_user` | On after linked-user callback verification |
| `FitBox → XERT — Class Session Booked (Review Only)` | `Class Session Booked` | `class_session_booked` | On, capture only |
| `FitBox → XERT — Class Session Cancelled (Review Only)` | `Class Session Cancelled` | `class_session_cancelled` | On, capture only |
| `FitBox → XERT — User First Session Booked (Review Only)` | `User First Session Booked` | `user_first_session_booked` | On, capture only |
| `FitBox → XERT — User Profile Changed (Review Only)` | `User Profile Changed` | `user_profile_changed` | On, capture only |
| `FitBox → XERT — User Status Changed (Review Only)` | `User Status Changed` | `user_status_changed` | On, capture only |
| `FitBox → XERT — User Subscription Changed (Review Only)` | `User Subscription Changed` | `user_subscription_changed` | On, capture only |

Do not create production Zaps for `Update User` or `Get Users Next Session`.
Keep the discovery asset named
`XERT FitBox Discovery — DO NOT PUBLISH` off. If read-only searches are later
implemented and contract-tested, reserve `XERT → FitBox — Get Next Session — Read Only`;
its name does not authorize activation.

## Recorded production activation state

**Updated 2 September 2026 (AEST).** This is an operational record, not a
replacement for checking the named Zap and Operations Health at the time of an
incident.

The following Zaps are published, on, and have passed a safe XERT receipt test:

- `FitBox → XERT — Class Session Booked (Review Only)`
- `FitBox → XERT — Class Session Cancelled (Review Only)`
- `FitBox → XERT — User First Session Booked (Review Only)`
- `FitBox → XERT — User Profile Changed (Review Only)`
- `FitBox → XERT — User Status Changed (Review Only)`
- `FitBox → XERT — User Subscription Changed (Review Only)`

Each of those tests returned an accepted `needs_review` receipt and was limited
to the allowlisted event envelope. No XERT booking, member profile, membership,
credit, payment, Stripe or attendance record was changed.

`XERT → FitBox — Register Approved Prospect` and `XERT → FitBox — Get User —
Read Only` remain deliberately unpublished until the owner gives an
action-time privacy confirmation for the exact contact fields moving between
XERT, Zapier and FitBox. They have already been structurally verified against
the callback contract. This record must be updated only after each outbound
flow has an approved synthetic end-to-end test and is published.

## Server configuration

Set these server-only values in the Vercel Production environment and redeploy.
This list intentionally contains no values:

```text
APP_BASE_URL
FITBOX_GYM_ID
FITBOX_ZAPIER_INGRESS_SECRET
ZAPIER_FITBOX_REGISTER_HOOK_URL
ZAPIER_FITBOX_GET_USER_HOOK_URL
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

`VITE_SUPABASE_URL` is an accepted server fallback already used by the app, but
the service-role key, Zapier hook and ingress secret must never use a `VITE_`
prefix or enter browser/iOS code, Git, screenshots, support tickets or logs.
`APP_BASE_URL` must be the credential-free canonical HTTPS origin. The register
hook must be a Zapier HTTPS catch-hook. `FITBOX_GYM_ID` must match the production
XERT Fitness gym selected in every Zap.

Routes:

- Admin state, dispatch and health: `/api/admin-fitbox-integration`
- Prospect result callback: `/api/fitbox-prospect-result`
- Read-only FitBox event ingress: `/api/fitbox-events`

Every inbound event Zap sends the ingress secret in the
`x-xert-fitbox-secret` header. Zapier receives no Supabase credential. Every
job callback echoes only its job ID, callback token, gym ID, FitBox user ID,
status, error flag, bounded message and the explicitly allowed Get User fields.

## Zap construction

### Register approved prospect

1. Trigger with **Webhooks by Zapier / Catch Hook**.
2. Map `fitbox_gym_id`, `firstname`, `lastname`, `email`, `contact_phone` and
   optional `city` into **FitBox / Register User**.
3. POST the FitBox result to the dynamic `callback_url` supplied by XERT.
4. Echo `job_id`, `callback_token`, `fitbox_gym_id`, returned FitBox user ID,
   returned FitBox status, error and message.
5. Do not add email, SMS, membership, subscription or payment actions.

The Command Centre confirmation is the privacy boundary. It must preview the
lead's name, email and phone and state that those fields pass through Zapier to
FitBox. It creates a prospect only.

### Refresh linked user — read only

1. Trigger with **Webhooks by Zapier / Catch Hook** using the dedicated Get User hook.
2. Map `fitbox_gym_id` and `fitbox_user_id` into **FitBox / Get User**.
3. POST the result to the dynamic `callback_url` supplied by XERT.
4. Echo `job_id`, `callback_token`, `fitbox_gym_id`, `fitbox_user_id`,
   `fitbox_status`, `fitbox_first_name`, `fitbox_last_name`, `fitbox_email` and
   `fitbox_phone`.
5. Do not map DOB, gender, address, weight, height, custom fields or payment data.
6. Do not add an Update User or any other mutating action.

The callback rejects a different user ID and updates only XERT's FitBox mirror
and freshness time. It never overwrites the lead, authenticated member profile,
membership access, booking, subscription, credit, Stripe or billing data.

### Six read-only trigger Zaps

Each Zap has one FitBox instant trigger followed by one Webhooks POST to
`/api/fitbox-events`. Set `event_type` to that Zap's exact constant in the table
above; do not map a variable label. Map only:

```text
event_type
fitbox_gym_id
fitbox_user_id
fitbox_booking_id
fitbox_session_id
fitbox_subscription_id
provider_event_id
delivery_id
status
provider_occurred_at
provider_updated_at
```

Omit any field the connector does not provide. Never invent a provider event
ID or timestamp. A Zap run identifier may be used as `delivery_id` only when it
is stable across Zapier retry delivery; it is not a FitBox event identity.

Do not map names, email, phone, DOB, address, gender, weight, height, emergency
contacts, custom fields, notes, form answers, prices, card/bank data or a raw
provider payload. XERT validates the allowlisted envelope, discards extra keys,
limits request size and stores every accepted trigger as `needs_review`.

## Reconciliation rules

All six trigger types are evidence, not domain commands. Even an event with a
provider event ID and timestamp remains `PROVIDER_CONTRACT_UNVERIFIED` until
FitBox documents identity, retries and ordering. An event without that evidence
is `MISSING_STABLE_EVENT_IDENTITY`.

Use this order when reviewing identity:

1. Existing unique FitBox gym/user link.
2. Explicit previously established XERT/FitBox link.
3. Unique verified exact email, if a future approved lookup supplies it.
4. Unique normalized phone, only where policy permits.
5. Otherwise leave the item unresolved for Byron.

Never link by name or choose between multiple matches. Preserve unknown FitBox
statuses exactly as received. Do not deduplicate logical provider events by
payload hash. The current `delivery_id` uniqueness guard prevents only a proven
duplicate delivery; it does not solve distinct Zap deliveries of the same
logical FitBox change or out-of-order transitions.

For every item awaiting review, compare the member/entity in FitBox, record the
decision through the controlled XERT review workflow when available, and leave
the underlying XERT booking, subscription, payment and attendance state
unchanged. Until that workflow exists, the queue is an attention signal and
must not be cleared with manual database edits.

## Monitoring and incident response

Open **Command Centre → Operations Health** after deployment and at opening,
midday and close during launch week. The FitBox check must show:

- Configuration ready with no missing environment names.
- No failed prospect handoffs in the last 24 hours.
- No queued, dispatched or uncertain handoff older than 15 minutes.
- Expected completed handoff and received-event counts.
- The latest event type and receipt time when trigger traffic exists.
- Zero unresolved reconciliation items for a green state.

An unresolved review item is an attention state, not permission to apply the
event. For a prospect failure, open the original Member Lead, correct its data
or provider issue, and use the explicit retry. Never repeatedly click retry
while a job is queued, dispatched or `dispatch_unknown`; first inspect Zap
History and FitBox for the returned user.

If event counts unexpectedly stop, check the named Zap's status and Zap History,
then confirm the deployed ingress environment and route. `401` means a wrong
secret or gym; `400` means an invalid/minimally incomplete mapping; `503` means
configuration or storage is unavailable; `202` means a new review row was
accepted; a duplicate response means the delivery was already stored. Never
weaken authentication or add raw payload logging to diagnose an incident.

## Launch-day verification

Do not turn on real-data flows until the action-time privacy confirmation has
identified the member/contact fields and the Zapier, FitBox and XERT
destinations.

1. Apply `supabase/migrations/20260902010000_fitbox_zapier_bridge.sql` and
   `supabase/migrations/20260902020000_fitbox_get_user_refresh.sql` to the exact
   production Supabase project. Confirm both `fitbox_zapier_bridge` and
   `fitbox_get_user_refresh` appear in schema readiness.
2. Set every required Vercel Production variable, redeploy the intended commit,
   and verify the production alias resolves to it.
3. Keep native booking, Stripe and attendance data intact. A FitBox handoff is
   not authority to delete or convert those records.
4. In Operations Health, require the FitBox environment to be ready before
   publishing any Zap.
5. Test `XERT → FitBox — Register Approved Prospect` using only the approved
   synthetic prospect. Confirm exactly one FitBox user ID returns with status
   `prospect`, XERT links it to the selected lead, and no membership,
   subscription, charge, email or SMS is created.
6. Replay the same callback and confirm the same identity is idempotent. Confirm
   a wrong token, wrong gym and expired callback fail closed.
7. From the linked synthetic lead, start **Refresh read-only profile**. Confirm
   the same FitBox user ID, status, name, email and phone return with a new
   snapshot time. Confirm DOB is absent and no XERT identity, access, booking,
   credit, Stripe or billing record changes.
8. Test each read-only trigger Zap with a controlled synthetic event. Confirm XERT
   returns `202`, creates exactly one `needs_review` row, stores only the minimal
   fields, and changes no member, booking, credit, Stripe or attendance row.
9. Retry one delivery with the same stable `delivery_id` and confirm it is
   reported as a duplicate rather than inserted again.
10. For booking, cancellation, status or subscription triggers that cannot be
   generated safely in production, leave that individual Zap off until FitBox
   supplies a controlled test payload. Do not use a real member as a test.
11. Publish only the Zaps whose individual checks passed, refresh Operations
    Health, and record their Zap History run IDs in the launch log without
    copying payloads or secrets.
12. On website and iOS, verify FitBox provider mode hides native booking,
    cancellation and pack checkout and uses the credential-free HTTPS portal.
13. Recheck health after 15 minutes and at the end of the launch window.

## Rollback

Rollback is fail-closed and preserves evidence:

1. Turn off `XERT → FitBox — Register Approved Prospect` to stop new outbound
   lead data.
2. Turn off all six named read-only trigger Zaps to stop inbound capture.
3. Rotate `FITBOX_ZAPIER_INGRESS_SECRET` and remove or rotate the register hook
   in Vercel, then redeploy. Do not reveal the old values.
4. If the deployed handler is faulty, restore the last known-good Vercel
   deployment. Do not roll back by deleting database rows.
5. Preserve integration jobs, member links, event evidence and Zap History for
   reconciliation.
6. Review every queued, `dispatch_unknown`, failed and `needs_review` item in
   both FitBox and XERT before retrying anything.
7. Change the member booking provider back to native only after native booking,
   credits and Stripe readiness independently pass. Otherwise keep member
   mutations paused; never silently fall back.

Disabling the Zapier bridge does not cancel a FitBox prospect, membership,
booking or subscription. Those remain FitBox-owned and must be handled in its
supported admin surface.
