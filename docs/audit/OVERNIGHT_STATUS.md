# Overnight status — 26 July 2026

## Morning owner briefing

**Still shipping; apply through latest migration timestamp**
`20260726119000_booking_credit_release_clears_batch.sql` (**26119**). Tip
commit on `cursor/xert-audit-continuation-8c8e` (see git log). Staff roles
were **not** built.

**What was made safer overnight (plain English)**
- Soft-launch switch authz (**26118**): database + activate_payments API refuse
  pack checkout without bookings, and refuse enabling bookings without
  `member_booking_switch_guard` — UI-only gates are no longer bypassable via a
  crafted API body or direct PostgREST settings update.
- Credit release clears `credit_batch_id` (**26119**): cancel / status demote /
  class cancel null the batch FK when a reserved credit is released so
  waitlisted/cancelled places cannot look still charged.
- Web Member drawer: audited emergency-contact reveal (iOS / Privacy parity);
  completion flags only until deliberate Reveal; clears on member switch.
- Concurrent class capacity: `enforce_session_capacity` BEFORE ROW trigger
  re-locks `class_sessions` and raises `SESSION_FULL` if a new
  requested/confirmed place would overfill — defence for concurrent
  `book_session` / waitlist confirmation paths, including an active booking
  moved onto another session. Capability `session_capacity_concurrency_guard`
  (**26117**).
- APNs error surfacing + retry: private notices, class-cancel, booking desk /
  promote / skip, and iOS publish no longer describe a real `push.failed`
  outage as “no devices”; transient failed delivery rows no longer permanently
  block a later notify retry.
- SEO: `X-Robots-Tag: noindex, nofollow` on `/admin`, `/account`, `/open/*`,
  auth/checkout paths (static scrapers otherwise inherited indexable home tags
  from the SPA rewrite); `robots.txt` also Disallows `/open` and auth screens.
- iPhone soft-launch deep links: `xertfitness://booking`, class/packs URLs,
  reminders and Book quick actions fail closed to Explore while bookings are
  paused (Home/Account Register interest parity); purchase confirmation stays.
- Privacy deletion re-runs: historical `260160` atomic delete and `261050`
  audit-subject redaction now skip-if-newer so they cannot strip
  `delete_member_account` public-lead cleanup (`member_interest` / trainer /
  partner). Money tip `261120` / `fulfillment_erasure` + Ops Health
  `roll_call_releases` skip-if-newer on refund/fulfill/attendance/class-cancel.
- Historical money/privacy migration re-runs: `260800` cancel, `260000` class
  cancel, `261060` cancel/status, `261070` fulfill, and `160400` terms-snapshot
  fulfill now skip-if-newer so they cannot restore inline `remaining+1`, strip
  attended/no_show + Stripe-refunded pack skips, or re-attach deleted-buyer
  email / reject deleted-member settle. Drift + overnight tests pin the notices.
- Money operator re-runs: `credit_batch_refund_reactivation` now skip-if-newer on
  status + roll-call too; `roll_call_correction` skip-if-newer on refund/cancel/
  status. Historical `260030` / `260170` / `261060` migrations keep newer
  helper-backed / Stripe-refunded-pack-skipping bodies. Bootstrap
  `booking_modes` / `admin_cms` refund skip guards match Postgres identity args
  (`timestamp with time zone`). Overnight + drift tests lock the full money/
  privacy skip-if-newer marker set.
- Public-form / waitlist / onboarding Ops Health remediations no longer point at
  historical migrations that could strip `bookings_enabled`, notes health-consent
  WITH CHECK, waitlist Skip notice accuracy, or helper-backed refunds. Older
  public-form migrations now carry the full installer; `request_notes` migration
  keeps the audited reveal; booking-decision + waitlist FIFO migrations
  skip-if-newer. Drift tests pin the strong `src/supabase/` remediation paths.
- Bootstrap `booking_modes_upgrade` / `admin_cms_schema` / attendance roll-call
  scripts skip-if-newer on cancel/refund/class-cancel/status/roll-call RPCs, and
  roll-call recreate now keeps pending-request credit release + Stripe-refunded
  pack skip. Ops Health / release readiness / Stripe readiness CLI no longer
  remediate fulfill or account-deletion via historical migrations that recreate
  the dead `p_expires_at` overload, non-erasure fulfill, or weaker
  `delete_member_account` bodies.
- Operator re-runs of cancel/refund/fulfill/class-cancel scripts
  (`cancel_booking_expired_batch_refund`, `credit_batch_refund_reactivation`,
  `class_cancellation_credit_refund_fix`, `stripe_fulfillment_deleted_member_fix`,
  `stripe_payment_fulfillment_upgrade`) skip-if-newer so they cannot replace
  helper-backed refunds, Stripe-refunded pack skips, or deleted-buyer email
  erasure. Ops Health remediation for those money/privacy capabilities now
  points at the strong `src/supabase/` mirrors (not the weaker historical
  migrations). Drift tests pin the skip notices.
- Operator re-runs of `waitlist_fifo_promotion_upgrade.sql` no longer restore
  an inline credit refund that could top up a Stripe-refunded pack. Re-runs of
  `request_notes_health_consent.sql` cannot install the unaudited health-reveal
  RPC when the reveal audit table is present (keeps/restores the audited body).
  Privacy now discloses recorded/logged injury reveals and iOS push device
  tokens (collection + deletion).
- Operator re-runs of `booking_decision_notifications_upgrade.sql` no longer
  restore the false “credit returned” Skip notice. iPhone Lead detail matches
  Privacy/web: recorded Reveal consented health notes with clear on background.
- iPhone Home Book CTAs (hero action, dashboard Book a class / Book another,
  credit-expiry Book, quick-action Book, Browse classes, View session packs,
  launch-guide packs/classes) fail closed to Explore Register interest while
  bookings are paused — hero no longer labels Register interest but deep-links
  into Book. Web Account + `/booking` footers match marketing pages:
  `showBookCta={bookingsEnabled}`. Campaign Attribution and Admin Audit CSVs
  match LeadTable / Orders: no same-paint double download of subject/lead PII
  and export stays off while a refresh is in flight.
- Orders CSV matches LeadTable / Members / booking ops: no same-paint double
  download (buyer email PII) and export stays off while the desk is loading.
  Class Calendar roster + class-request status selects share a lock so a second
  paint cannot mint two `admin_set_booking_status_with_notice` receipts/notices.
  Member Account Book / Buy CTAs (web + iPhone) fail closed to Register interest
  while bookings are paused. Availability Remove confirms refuse same-paint
  double deletes (Coaches / Events deleteLockRef parity).
- Booking Operations CSV, class roster CSV and event training-group CSV match
  LeadTable / Members / PT: no same-paint double download and booking CSV stays
  off while the desk is loading. Class Calendar Dupe refuses same-paint double
  creates. Member Account Remove goal and iPhone Account Save details refuse
  same-paint double submits (Events / web profile parity).
- Public About / Contact / Coaches / Events / Training Guide / App landing Book
  CTAs, footers and sticky Book now fail closed to Register interest while
  bookings are paused (Home / timetable parity). iPhone Home hero matches
  Explore About: Register interest when `memberBookingsEnabled` is false.
  Member Account profile Save and public Events “Train for this” refuse
  same-paint double submits.
- Public `/booking` Buy pack / Book class refuse same-paint double submits and
  freeze every other pack/class CTA while one checkout or booking is in flight
  (iPhone `bookingSessionID` parity) so two Stripe sessions or two credit
  reserves cannot mint before re-render. Member Account cancel-booking confirm
  and admin Cancel class (custom dialogs, not AdminConfirmDialog) take the same
  lock. Members + PT request CSV export match LeadTable: no same-paint double
  download and no export while the desk is still loading.
- Soft Launch Settings holds `saveLock` through the pack-checkout confirm
  (ref, not just React state) and freezes toggles/inputs/Discard while the
  dialog is open (iPhone Member App Controls parity). Public Home hero, final
  CTA, footer and sticky Book CTAs switch to Register interest / hide sticky
  while bookings are paused (timetable parity). iPhone Explore interest forms
  lock submit before the Task; About CTA is Register interest when bookings
  are paused.
- Event training-group dialog (web) is generation + identity scoped like iOS /
  class roster: switching events cannot briefly show or CSV-export another
  group’s contacts under the new title. Class Repeat and manual Grant Credits
  refuse same-paint double submits; calendar Seed is locked the same way.
  README documents the deployed `20260726107000_*_overload_fix` path for
  deleted-member fulfillment. Lint/typecheck: announcement load `finally`
  no longer returns early; AdminLogin rate-limit Error keeps typed status/code.
- Waitlist desk Skip no longer reports failure after a successful remove when
  the desk refresh glitches; promote/skip keep a quiet generation-scoped desk
  refresh so a late mount response cannot restore the old FIFO head. Admin
  sign-in maps GoTrue rate limits to a one-minute cooldown. Checkout, Stripe
  webhook, refund, reconcile and account-delete declare a 60s Vercel
  `maxDuration` (same as announcement push).
- Bookings inbox status / notes refuse same-paint double submits (parity with
  PT desk) so Confirmed→Waitlisted cannot both land with a fresh `request_id`
  each click; Orders full-refund matches reconcile’s lock; Members private
  notice / staff note / follow-up log cannot mint duplicates before re-render.
- Admin “Check Stripe Outcome” cannot double-fire on the same paint; concurrent
  reconcile no longer claims a second credit grant; audit markers only stamp
  paid rows (refund races fail closed).
- After `CHECKOUT_ATTEMPT_STALE`, reusable checkout cannot hand back a session
  with stale return URLs; the poisoned pending order is closed as failed.
- Member-interest injury columns are no longer directly selectable by admins;
  reveal goes through the audited RPC only (`member_interest_health_reveal_authz`).
- iPhone push unregister on sign-out keeps the refresh token when unregister
  fails, and launch retry refreshes then unregisters before remote sign-out.
- Overview quick actions open Create Class / Coach / Event (same as ⌘K) and
  still go through the unsaved-changes guard; iPhone Overview class/notice
  sheets refuse swipe-dismiss of dirty drafts.
- Class Calendar and CMS Save refuse same-paint double publishes; Member
  Readiness locks submit before validation and always releases the store save
  flag; Owner Launch Gate “Open next gate” stays off while health/settings/
  class/pack saves run.
- Lead pipeline Save / bulk status / CSV refuse same-paint double submits;
  Campaign Attribution and Admin Audit CSV stay disabled while a refresh or
  range reload is in flight (stale/wrong-range export blocked).
- iPhone Member App Controls freezes toggles and Save while the pack-checkout
  confirm dialog is open, then clears confirm before persisting.
- Public acquisition forms (member / trainer / partner / PT / booking request)
  lock submit against double-insert, and honeypots use `autoComplete="new-password"`
  so browser autofill cannot silently drop a real lead.
- Session pack Create / Save / Stripe Price provision cannot double-fire on the
  same paint (same lock pattern as Events / Coaches).
- Soft Launch timetable footer + sticky Book CTAs stay off while bookings are
  paused; public `/booking` timetable shows Register interest instead of Book /
  waitlist when `bookings_enabled` is false (iPhone parity).
- Member Account delete confirmation cannot double-submit the delete API (web);
  iPhone deleteAccount ignores a second in-flight call.
- iPhone Sign Out ignores double-tap (Account + privacy lock) so unregister /
  remote sign-out cannot race twice.
- Notice dismiss on web + iPhone no longer races: one dismiss at a time, and an
  earlier finish cannot clear a newer in-flight spinner.
- Pack purchase return URLs that disagree with the local Stripe handoff fail
  closed (web + iPhone) instead of confirming the wrong session or leaving a
  zombie pending checkout.
- Soft Launch payment activation cannot double-fire while the confirm dialog is
  open; Lead health reveal ignores stale responses and stops offering Reveal
  after a consented-empty result.
- Admin “Check Stripe Outcome” no longer claims pack credits were granted when
  the buying account was deleted (web + iOS); payment still settles, credits stay 0.
- Checkout kill-switch fails closed when webhook delivery probes error
  (orders / ledger / signature timeouts) — only a missing signature table is
  ignored during rolling upgrades. Empty-ledger + reconciled recoveries still
  do not false-alarm.
- Soft Launch Settings on the website now matches iPhone: bookings cannot go
  live until the booking-switch guard is installed, and pack checkout cannot
  open while bookings stay paused.
- Event training-group counts no longer silently truncate after PostgREST’s
  row cap (web + iOS), and delete warnings say so when counts cannot be verified.
- Pack purchase confirmation fails closed when Stripe’s session identity is
  missing, instead of looping on “taking longer than usual.”
- iPhone Overview Waitlisted / Follow-ups use the RPC ceiling (50), including
  after booking-desk refreshes — same class of collapse as the Members metric.
- Earlier overnight batches (waitlist Skip notice, reminders, email lock,
  overview race, soft-launch booking gate, readiness gate) stay in place.
  Staff roles were **not** built.

**What you must apply in Supabase tomorrow**
1. Run any missing migrations in timestamp order through
   `20260726119000_booking_credit_release_clears_batch.sql` (**26119** — full
   list + command examples below).
2. Run `src/supabase/release_readiness_check.sql` — every row must show
   `installed = true` and `release_ready = true`, including
   `soft_launch_switch_authz` (26118*) and
   `booking_credit_release_clears_batch` (26119*).
3. Smoke: Soft Launch — try enabling payments with bookings off (blocked at
   API/DB, not only UI); enable bookings only when Ops Health shows the
   booking-switch guard (DB refuses without it). Member drawer Reveal
   emergency contact writes an audit row. Demote confirmed→waitlisted clears
   `credit_batch_id`. Concurrent book/confirm against a full class raises
   `SESSION_FULL`.

---

Branch: `cursor/xert-audit-continuation-8c8e`.

Audit queue remains **56 FIXED / 0 OPEN**. Completeness-critic items from
HANDOFF §2c stay closed. Staff roles (spec 07) were **not** implemented —
owner/legal gates and `INTEGRATION_REVIEW.md` §5 still block 01–07 feature build.

---

## Full overnight story (chronological)

### 1. Close the last open audit findings → handoff refresh
- Concurrent class edits: optimistic locking so silent overwrites stop.
- Highest-value remaining audit defects advanced and marked FIXED.
- Handoff rewritten once the 56-item queue hit **0 OPEN**.

### 2. Completeness-critic money holes (`b89a900`)
- Deleted-member fulfillment had landed on a **dead overload**; live
  `p_credit_validity_days` path now settles null buyers without granting credits.
- Checkout pauses when Ops Health already sees signature/delivery gaps.
- Expired packs reactivate on every refund path (including class cancel after
  early roll-call) via `credit_batch_refund_reactivation`.

### 3. Completeness-critic privacy + admin races (`4daeae1`)
- Older operator scripts skip replacing newer deletion / PII-redaction shapes.
- Account deletion erases email-matched public leads and anonymous PT rows.
- Health consent on PT/booking free-text; Privacy honest about injuries.
- Class/event rosters and member detail loads scoped so late responses cannot
  paint the wrong person; drafts wired into unsaved-changes guards.

### 4. Owner-requirements + design review (`137d202`, `c1dc708`)
- Specs 01–07 aligned to `INTEGRATION_REVIEW.md` (no feature build).
- Waitlist skip concurrency, product dirty guard, design-review notes.

### 5. Commerce kill-switch + waitlist skip hardening (`c09ea0e`, `52fa571`)
- Skip refuses to cancel a booking that is no longer the waitlisted head.
- Legacy account deletion matches email exactly (no `ilike` wildcards).
- Reconcile no longer pauses the store via a fake delivery gap; empty ledgers
  and already-parsed Stripe bodies become visible Ops incidents correctly.

### 6. Reconcile deleted buyers, admin 500 traces, InitPlan (`652eb83`)
- Admin reconcile recovers payments after buyer account deletion.
- Admin/push 500s carry a request id for Ops.
- Re-running older RLS operator scripts no longer undoes scalar `is_admin`
  InitPlan wraps.

### 7. Ops apply order, push toasts, live settings (`df10774`)
- README apply order documents waitlist skip.
- `availability_schema` stops undoing scalar `is_admin` InitPlans.
- Swallowed broadcast APNs failures surface; soft-launch edits require an
  explicit payment pause while checkout is live.

### 8. Revenue, privacy, roster race (`b21a2ce`)
- Pending-order write failure no longer expires the Stripe session (poisoned
  idempotency); clients clear `CHECKOUT_ATTEMPT_STALE`.
- iOS PT / class-interest notes + Rehab goal require health consent; SQL +
  Privacy aligned (`pt_rehab_goal_health_consent`).
- Class roster refresh skipped after the operator switches session.

### 9. Adversarial credit / erasure pass (`038f6c2`)
| Area | Defect | Fix |
|---|---|---|
| Privacy / fulfillment | After `delete_member_account` nulled `orders.email`, a late `fulfill_stripe_checkout` (webhook or reconcile) wrote Stripe’s `p_email` back onto the orphaned order | `email = null` when `orders.user_id is null` |
| Credits | Stripe full refund left attended/no_show rows holding `credit_batch_id`; later cancel / class-cancel / roll-call release restored credits onto an already-refunded pack | `refund_credits_to_batch` and bulk refund paths skip `orders.status = 'refunded'` |
| Erasure (rollout) | Legacy piecemeal delete path never called `redact_audit_subject_pii` | `api/delete-account.js` redacts before Auth delete; missing routine tolerated |
| Release gate | New capabilities missing from readiness contract | `stripe_fulfillment_deleted_email_erasure` + `refund_skips_stripe_refunded_batches` synced in `schemaCapabilities.js` + `release_readiness_check.sql` |

Migration / operator mirror:
`supabase/migrations/20260726112000_fulfillment_erasure_and_refunded_pack_guard.sql`
↔ `src/supabase/fulfillment_erasure_and_refunded_pack_guard.sql`.

### 10. Soft-launch booking gate + notice deep links (`09b576b`)
| Area | Defect | Fix |
|---|---|---|
| Soft launch / public booking | `bookings_enabled = false` hid Request spot and blocked signed-in `session_bookings`, but anon/authenticated could still insert into `class_bookings` (PostgREST / stale tab) | `install_public_form_insert_policies` requires `admin_settings.bookings_enabled is true` for `class_bookings`; capability `public_booking_switch_gate` |
| Soft launch UI | Sticky “Book Your First Session” CTA stayed on `/timetable` while bookings were paused | Render `StickyMobileCTA` only when `bookings_enabled === true` |
| iOS deep links (notices) | Notice CTAs like `/booking#packs` / `/account#notices` collapsed to the primary tab via path-only `nativeTab` | Resolve `XertMemberRoute` from the absolute URL; `HomeView` opens `memberRoute` via `onOpenRoute` |

Migration / operator mirror:
`supabase/migrations/20260726113000_public_booking_switch_gate.sql`
↔ `src/supabase/public_booking_switch_gate.sql`.

### 11. This batch — onboarding gate, archived notice pushes, refund UI, checkout burst
| Area | Defect | Fix |
|---|---|---|
| Member onboarding gates | Launch guide / Account ask for Member Readiness first, but `book_session` / `join_session_waitlist` only insert `session_bookings` — incomplete members with credits could still book via PostgREST | BEFORE INSERT trigger `enforce_member_onboarding_for_booking` raises `MEMBER_ONBOARDING_REQUIRED` unless `member_onboarding_state.is_complete`; admins/service_role exempt; capability `member_onboarding_booking_gate` |
| Announcement archive | `admin_archive_member_announcement` nulls `published_at`; `notifyTargetedAnnouncement` / `notifyClassCancellation` still pushed archived private/class notices | Both paths select `archived_at` and fail closed (`TARGETED_NOTICE_ARCHIVED` / `CLASS_NOTICE_ARCHIVED`) |
| OrdersManager refunds | Filter changes could clear the open order while Stripe refund/reconcile was in flight; page index could point past the filtered set after load | Capture `orderId`/reason/confirmation before await; ignore filter clears while `refunding`/`reconciling`; clamp with `safePage` |
| Rate limits (`api/checkout`) | Reusable-session recovery does not stop runaway minting after expired sessions / stale attempt ids | After reuse miss, refuse with HTTP 429 when the member created ≥ 8 orders in 10 minutes (`memberCheckoutBurstExceeded`) |
| PT desk | Single-row status/notes update always bounced the operator to page 1 | Reload the current page |
| CORS on `api/` | N/A for this architecture | Browser traffic is same-origin (`vercel.json` CSP `connect-src 'self'…`); iOS uses native HTTPS (no CORS). No cross-origin API surface to open. |

Migration / operator mirror:
`supabase/migrations/20260726114000_member_onboarding_booking_gate.sql`
↔ `src/supabase/member_onboarding_booking_gate.sql`.

### 12. This batch — waitlist skip notice, reminders, email UI, overview race
| Area | Defect | Fix |
|---|---|---|
| Waitlist skip notices | Skip routes through `admin_set_booking_status_with_notice`; cancelled copy always said a reserved credit was returned, including for waitlisted heads who never held one | Waitlisted→cancelled notice: “Waitlist place removed” / “No class credit was charged”; capability `waitlist_skip_notice_accuracy` |
| Class reminders (iOS) | Reminders used `UNTimeIntervalNotificationTrigger` from sync “now”, so fire time could drift across resync | `UNCalendarNotificationTrigger` at the absolute lead-time wall clock |
| Account email UI | Edit hid email; `updateMyProfile` spread arbitrary columns (email/role attempts) | Read-only email + copy on web/iOS; whitelist `full_name`/`phone` only |
| Admin overview metrics | Stale load after unmount+remount always cleared `requestInFlightRef`, allowing overlapping refreshes and stale paints | Only the current request generation releases the in-flight guard (Ops Health aligned) |
| Release gate (26114*) | `member_onboarding_booking_gate` already in readiness; new skip-notice capability synced | `waitlist_skip_notice_accuracy` in `schemaCapabilities.js` + `release_readiness_check.sql` |

Migration / operator mirror:
`supabase/migrations/20260726115000_waitlist_skip_notice_accuracy.sql`
↔ `src/supabase/waitlist_skip_notice_accuracy.sql`.

### 13. This batch — soft-launch toggles, event goals, purchase confirm, overview counts
| Area | Defect | Fix |
|---|---|---|
| Soft Launch Settings (web) | iOS required `member_booking_switch_guard` before enabling bookings; web did not. Payments could activate while bookings stayed paused (Ops Health “unsafe”) | Web checks capability via `xert_public_capabilities`; both surfaces block payments without bookings |
| Events manager / goals | `getEventGoalCounts` / iOS `adminEventGoalReferences` used a single PostgREST select → silent undercount past max_rows; delete warning omitted goals when counts failed | Page with `collectAdminBatches` / offset loop; delete warns when counts unverified |
| Pack purchase confirmation | `/account?purchase=success` without a valid Stripe session id looped on “delayed” forever | Fail closed to `failed` and clear return params when pending identity is missing |
| Stripe Price provisioning | Lookup / catalogue mismatch / Stripe invalid-request errors fell through to a generic 500 | Map `PRODUCT_PRICE_LOOKUP_FAILED`, config mismatch, and Stripe invalid-request to operator-safe 409/500 copy |
| iOS AdminOverview metrics | Waitlisted / Follow-ups used default RPC limit 20; booking-desk snapshot refreshed waitlist at 20 and collapsed the Overview total | Refresh + booking snapshot use `limit: 50` (RPC ceiling) |

No new migration for this batch.

### 14. This batch — deleted-buyer reconcile honesty + kill-switch probe fail-closed
| Area | Defect | Fix |
|---|---|---|
| Admin reconcile (deleted buyer) | After account deletion, `fulfill_stripe_checkout` correctly settled with `credit_created=false`, but reconcile always returned `credits_granted = pack size` → Ops toast/iOS claimed credits were granted | `credits_granted = 0` + `buyer_deleted: true` when `orders.user_id` is null; web/iOS copy says buying account is gone |
| Checkout kill-switch | `inspectWebhookDeliveryGaps` treated orders/ledger/signature *operational* errors as healthy (count 0), so uncertain delivery could leave checkout open | `probeFailed` on non-missing probe errors; checkout + Ops Health fail closed. Missing signature table still ignored for rolling upgrades; empty ledger + reconciled recoveries unchanged |
| Regression coverage | The three overnight store-killers lacked one integration-style node test | `test/overnight-worst-bugs-regression.test.js` — deleted-member settle/reconcile, empty-ledger kill-switch, waitlist skip FIFO race |

No new migration for this batch.

### 15. This batch — notice dismiss races, checkout identity mismatch, Soft Launch / Lead reveal
| Area | Defect | Fix |
|---|---|---|
| Notice center dismiss | Web/iOS used one `dismissingAnnouncementId`; finishing notice A cleared the spinner while B was in flight and re-enabled double-tap | Serialize dismissals; only clear when the finishing id is still current; disable all dismiss controls while any dismiss runs |
| Purchase confirmation | Web `pendingWebCheckoutForReturn` preferred a leftover stored handoff over a different return `checkout_session_id`; iOS resolve left a zombie pending after mismatch and cleared the pending UI flag | Fail closed on identity mismatch (clear local handoff); iOS surfaces `.failed` |
| Soft Launch Settings | Save preflight briefly cleared `saving`, so a second Save could open another payment-activation confirm / double-persist | `saveLockRef` + disable Save while confirm is open; activation lock keeps confirm mounted through persist |
| LeadTable health reveal | Stale reveal responses could paint the wrong lead; `available: false` kept offering Reveal | Request generation + `key={lead.id}`; terminal “No consented injury notes” state |
| Migration list (26115) | Confirm overnight apply checklist includes waitlist skip notice | Already row 14: `20260726115000_waitlist_skip_notice_accuracy.sql` |

No new migration for this batch.

### 16. This batch — pack create locks, paused booking CTAs, account delete / iOS sign-out
| Area | Defect | Fix |
|---|---|---|
| ProductsManager | Create / Save / Stripe Price provision used only React `saving` state — same-paint double-click could mint two packs or race two Stripe updates | `createLockRef` / `saveLockRef` / `provisionLockRef` (Events/Coaches pattern) |
| Soft Launch timetable | Footer still offered “Book Your First Session” while bookings were paused (sticky was already gated) | `PublicFooter showBookCta={bookings_enabled}` → Register interest when paused |
| Public `/booking` timetable | Class rows still showed Book / waitlist CTAs when `bookings_enabled` was false (iOS already Register interest) | Fail-closed `bookingsEnabled`; paused banner; Register interest CTAs; `handleBook` refuses |
| Member Account delete | Confirm Delete could fire twice before `deletingAccount` re-rendered | `deleteAccountLockRef` (web); iOS `deleteAccount` guards `!isDeletingAccount` |
| iOS sign-out | Double-tap raced two unregister / remote sign-out Tasks | `isSigningOut` guard + disable Account / privacy-lock Sign Out |

No new migration for this batch (app-only tip after `38b5a4d`).

### 17. This batch — lead/CSV races, iOS settings confirm freeze, public form submit/honeypot
| Area | Defect | Fix |
|---|---|---|
| LeadTable status / bulk | Save and bulk Apply used only React `saving` state — same-paint double-click could write two status updates | `saveLockRef` / `bulkLockRef` / `exportLockRef` |
| CampaignStats / AdminAuditLog CSV | Export stayed enabled during refresh / range reload, so operators could download stale or wrong-range rows | `disabled={loading \|\| …}`; CampaignStats load generation ignores stale responses |
| iOS Member App Controls | Payment-activation confirm left toggles + Save live, so the draft could change under the dialog before persist | Freeze mutations while `confirmingPaymentActivation`; clear confirm then save; Save guards in-flight store/exit saves |
| Public forms | Double-submit could insert duplicate leads/requests; honeypot `autoComplete="off"` is still autofilled by some browsers (filled honeypot silently drops the lead) | `submitLockRef` on all five forms; honeypot `autoComplete="new-password"` |

No new migration for this batch (app-only tip after `45e2b8e`).

### 18. This batch — overview create intents, class/CMS save locks, iOS dirty dismiss / onboarding submit
| Area | Defect | Fix |
|---|---|---|
| AdminOverview quick actions | “New Class” / “Add Coach” / “Add Event” only switched section — no `action=create`, so editors never opened (⌘K already correct); create intents still use `setSection` dirty guard | `params: { action: 'create' }` + `onNavigate(key, params)` |
| ClassCalendarAdmin / ContentManager | Save used only React `saving` — same-paint double-click could mint two classes or publish a CMS section twice | `saveLockRef` (Events/Coaches pattern) |
| iOS Overview quick tools | Class editor + notice composer swipe-dismiss / Cancel dropped dirty drafts; notice Publish confirm could re-fire | `interactiveDismissDisabled` + discard dialogs; publish clears confirm + guards `isPublishing` |
| Member Readiness (iOS) | Submit locked after validation; store save flag could stick if versions invalidated mid-flight | Set `isSubmitting` before validation; `defer { isSavingMemberOnboarding = false }` always |
| Owner Launch Gate | “Open next gate” stayed tappable while health/settings/class/pack mutations ran | Disable during those in-flight flags |

No new migration for this batch (app-only tip).

### 19. This batch — reconcile race, stale checkout reuse, health reveal authz, push unregister retry
| Area | Defect | Fix |
|---|---|---|
| Admin reconcile | Concurrent double reconcile / refund race could stamp audit on non-paid rows and claim pack credits again; UI same-paint double-click | Audit update requires `status='paid'`; `credits_granted` from `credit_created`; `reconcileLockRef` |
| Checkout reuse after STALE | `reusableCheckoutURL` ignored success/cancel URLs / origin_context, so a poisoned open session could be reused after `CHECKOUT_ATTEMPT_STALE` | Match return-URL contract on reuse; `closeStaleCheckoutAttemptOrder` marks pending failed |
| Member-interest health | Admins could `SELECT` injuries directly despite the reveal RPC | Column lockdown + audited `member_interest_health_reveals`; capability `member_interest_health_reveal_authz` |
| iOS push unregister | Failed unregister then `signOut` revoked the JWT, so launch retry always 401’d and private pushes kept targeting the device | Save pending without remote sign-out; flush refreshes on 401 then unregisters then signs out |

Migration / operator mirror:
`supabase/migrations/20260726116000_member_interest_health_reveal_authz.sql`
↔ `src/supabase/member_interest_health_reveal_authz.sql`.

### 20. This batch — booking inbox / refund / member notice same-paint locks
| Area | Defect | Fix |
|---|---|---|
| BookingRequestsTable status | Same-paint Confirmed / Waitlisted (etc.) each minted a new `request_id`, so two transitions + notices/credit moves could both land before `updatingKey` re-rendered (PT desk already had `updateLockRef`) | `updateLockRef` + bulk mutual exclusion; `notesLockRef` on legacy notes Save |
| OrdersManager refund | Reconcile used `reconcileLockRef`; Refund only React `refunding` — same-paint double-click raced two refund API calls | `refundLockRef` (and refuse while reconciling) |
| MembersManager notice / notes | `admin_send_member_notice` is not idempotent; double Send privately / Add note / Mark Contacted could mint two notices or two follow-up notes | `noticeLockRef` / `noteLockRef` / FollowUpModal `saveLockRef` |

No new migration for this batch (app-only tip after `4c4a424`). Apply through **26116** remains current.

### 21. This batch — waitlist desk refresh, AdminLogin rate-limit UX, API maxDuration
| Area | Defect | Fix |
|---|---|---|
| ClassCalendarAdmin waitlist Skip | Successful skip + failed roster/desk refresh reported “Could not remove”; stale overview race could repaint a pre-skip queue | Success toast first; quiet generation-scoped desk refresh; refresh failure → “Waitlist refresh needed” (promote parity; iOS skip same) |
| AdminLogin | GoTrue 429 / rate-limit codes were stripped to bare `Error(message)`; owner could hammer Sign in with opaque copy | Preserve `status`/`code`; map to cooldown copy + disable submit ~60s |
| Vercel Stripe / erasure APIs | Only announce declared `maxDuration: 60` while checkout / webhook / refund / reconcile / delete used Stripe 20s timeouts without declared headroom | `export const config = { maxDuration: 60 }` on those routes |

No new migration for this batch (app-only tip). Apply through **26116** remains current.

### 22. This batch — Soft Launch saveLock, Home paused CTAs, iOS Explore interest submit
| Area | Defect | Fix |
|---|---|---|
| SoftLaunchSettings | After Stripe health preflight, `finally` cleared `saveLockRef` before React painted `pendingPaymentActivation`, so a second Save could re-enter; toggles/Discard stayed live under the confirm dialog (iOS already froze) | `pendingPaymentActivationRef` + hold saveLock while confirm is open; `mutationsLocked` freezes toggles/inputs/Discard |
| Public Home | Hero, final CTA, footer and sticky still offered “Book Your First Session” while `bookings_enabled` was false (timetable/footer/sticky were already gated) | Fail-closed `bookingsEnabled`; Register interest / `#eoi`; sticky only when bookings on |
| iOS ExploreView | Interest form Submit only disabled on store flag after Task start — same-paint double tap could schedule two submits; About still said Book when bookings paused | Local `isSubmitting` lock before Task; About → Register interest when `!memberBookingsEnabled` |

No new migration for this batch (app-only tip). Apply through **26116** remains current.

### 23. This batch — booking/checkout cancel locks + member/PT CSV export
| Area | Defect | Fix |
|---|---|---|
| Public `/booking` Buy | Only `buyingSlug === pack.slug` disabled the clicked pack — same-paint double-click or a second pack CTA could mint two Checkout sessions before re-render | `buyLockRef` + disable every pack CTA while any buy/book is in flight |
| Public `/booking` Book | Only `bookingId === s.id` disabled the clicked class — second class (or double-tap) could reserve two credits | `bookLockRef` + disable every Book CTA while any book/buy is in flight (iOS `bookingSessionID` parity) |
| Account cancel booking | Custom confirm dialog (not AdminConfirmDialog) had no confirm lock — same-paint double Confirm raced `cancel_booking` | `cancelBookingLockRef` |
| Class Calendar Cancel | Custom cancel dialog had no lock — same-paint double Confirm raced `admin_cancel_class_session` + notify | `cancelClassLockRef` |
| Members / PT CSV | Export stayed enabled during desk load (members) and had no same-paint lock (both) — PII could download twice or against a mid-refresh filter | `exportLockRef` + `disabled` while `loading` (LeadTable parity) |

No new migration for this batch (app-only tip). Apply through **26116** remains current.

### 24. This batch — marketing Book CTAs, iOS Home hero, profile/goal locks
| Area | Defect | Fix |
|---|---|---|
| Public About / Contact / Coaches / Events / Training Guide / App | Home + timetable gated Book CTAs on `bookings_enabled`; these pages still offered Book / sticky Book + footer Book while bookings were paused | Fail-closed `bookingsEnabled`; Register interest / `#eoi`; sticky + footer Book only when bookings on |
| iOS Home hero | Explore About already said Register interest when paused; `NativeHomeHero` always said Book | `bookingsEnabled: store.memberBookingsEnabled` → Register interest label |
| Account profile Save | Only React `savingProfile` — same-paint double Save could fire two `updateMyProfile` writes | `profileSaveLockRef` (readiness / cancel parity) |
| Public Events goals | Train for this used only `savingGoalId` and left sibling goal buttons live — same-paint double add/remove | `goalLockRef` + disable every goal CTA while one save is in flight |

No new migration for this batch (app-only tip). Apply through **26116** remains current.

### 25. This batch — booking/roster CSV PII locks, class Dupe, Account goal remove / iOS profile
| Area | Defect | Fix |
|---|---|---|
| Booking Operations CSV | Export stayed enabled during desk load and had no same-paint lock — name/email/phone could download twice or against a mid-refresh filter | `exportLockRef` + `disabled` while `loading` (LeadTable / Members / PT parity) |
| Class Calendar roster CSV | Export had no lock — same-paint double click downloaded member PII twice | `rosterExportLockRef` + freeze while exporting |
| Event training-group CSV | Same PII double-download hole as class roster | `exportLockRef` in `TrainingRosterDialog` |
| Class Calendar Dupe | Only React `duplicatingSessionId` — same-paint double Dupe could mint two draft classes | `duplicateLockRef` |
| Account Remove goal | No lock — same-paint double remove (Events / iOS already locked) | `goalRemoveLockRef` + disable sibling Remove CTAs |
| iOS Account Save details | `updateProfile` set `isSavingProfile` without guarding an in-flight save | `guard !isSavingProfile` (web `profileSaveLockRef` parity) |

No new migration for this batch (app-only tip). Apply through **26116** remains current.

### 26. This batch — Orders CSV, roster status lock, Account paused Book CTAs, availability delete
| Area | Defect | Fix |
|---|---|---|
| Orders & Revenue CSV | Export stayed enabled during desk load and had no same-paint lock — buyer email / Stripe ids could download twice or against a mid-refresh filter | `exportLockRef` + `disabled` while `loading` (LeadTable / Members / booking ops parity) |
| Class Calendar roster / request status | Only React `updatingBookingId` — same-paint (or sibling-row) status change could mint two notice receipts with fresh `request_id`s before busy painted | `bookingStatusLockRef` + freeze every status select while one update is in flight (Booking Operations parity) |
| Member Account Book CTAs | Marketing / Home gated Book while bookings paused; Account still offered Book A Class / Buy A Pack / Book next class (web + iPhone) | Fail-closed `bookingsEnabled` / `memberBookingsEnabled` → Register interest (`/#eoi` / Explore) |
| Availability Remove | Confirm cleared the dialog before `removingId` painted and had no delete lock — second Remove could race two deletes | `deleteLockRef` (Coaches / Events parity) |

No new migration for this batch (app-only tip). Apply through **26116** remains current.

### 27. This batch — iPhone Home pause CTAs, Account/Booking footers, Campaign/Audit CSV locks
| Area | Defect | Fix |
|---|---|---|
| iPhone Home Book CTAs | Hero labelled Register interest when paused but `onBook` still opened Book; dashboard Book a class / Book another, credit-expiry Book, quick-action Book, Browse classes, View session packs and launch-guide packs/classes still deep-linked into Book | `openBookingOrInterest()` → Explore when paused; launch guide keeps `.sessionPacks` / `.booking` when live |
| Account + `/booking` footers | `PublicFooter` defaults `showBookCta={true}` — Account (just gated inline Book CTAs) and Booking still showed Book Your First Session while paused | `showBookCta={bookingsEnabled}` (marketing parity) |
| Campaign Attribution / Admin Audit CSV | Export disabled only while loading — no same-paint lock; audit CSV carries subject name/email | `exportLockRef` + `exporting` (LeadTable / Orders parity) |

No new migration for this batch (app-only tip). Apply through **26116** remains current.

### 28. This batch — SQL operator downgrades + iOS health-reveal privacy parity
| Area | Defect | Fix |
|---|---|---|
| Operator SQL drift (health) | Re-running `request_notes_health_consent.sql` replaced audited `admin_reveal_member_interest_health` (26116) with the unaudited bootstrap that never writes `member_interest_health_reveals` | Skip-if-audited install (`keeping audited…` when reveal table / `audit_event_id` shape exists) |
| Operator SQL drift (notices) | Re-running `booking_decision_notifications_upgrade.sql` replaced waitlist-accurate Skip notice copy with the generic “credit returned” cancelled notice | Skip-if-newer install (`keeping newer…` when `Waitlist place removed` is present); InitPlan-safe receipt policy qual |
| Privacy disclosure mismatch | Privacy + web Lead drawer offer deliberate injury reveal; iPhone Command Centre had no reveal path after column lockdown | iOS `admin_reveal_member_interest_health` + Lead detail Health notes section; clear on background / dismiss |

No new migration for this batch (operator + iOS tip). Apply through **26116** remains current.

### 29. This batch — waitlist FIFO refund drift, reveal-authz bootstrap, Privacy honesty
| Area | Defect | Fix |
|---|---|---|
| Operator SQL drift (money) | Re-running `waitlist_fifo_promotion_upgrade.sql` replaced helper-backed `admin_set_booking_status` with an inline `remaining + 1` refund that ignored Stripe-refunded packs | Skip-if-newer (`keeping newer…` when `refund_credits_to_batch` is present); bootstrap body uses the helper |
| Operator SQL / authz (privacy) | `request_notes_health_consent.sql` treated “reveal table exists” as keep-even-when-unaudited, and a missing RPC still installed the unaudited bootstrap over an authz’d DB | Keep only when the live body is audited; if the audit table exists otherwise, install the audited reveal body (never the ledger-skipping bootstrap) |
| Privacy disclosure | Injury reveal still said “deliberate” (emergency contact already “recorded”); iOS push device tokens were not listed as collected / deleted with the account | Privacy: recorded + logged health reveal; collect/retain device notification tokens |

No new migration for this batch (operator + Privacy tip). Apply through **26116** remains current.

### 30. This batch — money/privacy operator skip-if-newer + Ops Health remediation paths
| Area | Defect | Fix |
|---|---|---|
| Operator SQL drift (money) | Re-running older cancel/refund/class-cancel/fulfill operator scripts could replace helper-backed or erasure-aware RPC bodies; Ops Health also pointed at historical migrations that still inline refunds / re-attach deleted-buyer email | Skip-if-newer on `cancel_booking_expired_batch_refund`, `credit_batch_refund_reactivation`, `class_cancellation_credit_refund_fix`, `stripe_fulfillment_deleted_member_fix`, `stripe_payment_fulfillment_upgrade`; Ops Health actions retargeted to strong `src/supabase/` mirrors; drift tests pin `keeping newer…` |

No new migration for this batch (operator tip). Apply through **26116** remains current.

### 31. This batch — bootstrap cancel/roll-call downgrade + weak fulfill/delete remediations
| Area | Defect | Fix |
|---|---|---|
| Operator SQL drift (money) | Re-running `booking_modes_upgrade` / `admin_cms_schema` / `attendance_roll_call_upgrade` could replace helper-backed cancel/refund/class-cancel or wipe pending-request credit release on roll call | Skip-if-newer on those RPCs; roll-call bootstrap body restores request release + `o.status = 'refunded'` skip |
| Ops Health / release gate (money + privacy) | Remediation still pointed at historical fulfill migrations (`p_expires_at` overload / non-erasure live body) and weaker `delete_member_account` migrations; release_readiness lagged schemaCapabilities | Retarget fulfill + deletion/redaction/lead-cleanup (+ related money caps) to strong `src/supabase/` mirrors; Stripe readiness CLI matches; drift test pins path parity |

No new migration for this batch (operator tip). Apply through **26116** remains current.

### 32. This batch — public-form / waitlist / onboarding operator re-run downgrades
| Area | Defect | Fix |
|---|---|---|
| Operator SQL drift (public booking + notes) | Re-running older `install_public_form_insert_policies` migrations (`public_form_staff_column_guard`, `public_enquiry_time_guard`, `member_interest_health_consent`) stripped `bookings_enabled` and notes/rehab health-consent WITH CHECK | Those migrations now ship the full installer (parity with `src/supabase/` mirrors) |
| Operator SQL drift (privacy reveal) | Re-running `20260726109000_request_notes_health_consent.sql` still installed the unaudited reveal bootstrap | Migration synced to operator skip-if-audited / restore-audited reveal install |
| Operator SQL drift (waitlist Skip) | Re-running `booking_decision_notifications` / `waitlist_fifo_promotion` migrations could restore false credit-return Skip notices or inline `remaining+1` refunds used by Skip | Skip-if-newer on those migrations (`keeping newer…`) |
| Ops Health / release gate | Remediations for public-form, booking switch, request notes, waitlist skip/FIFO/notices, onboarding gate, and reveal authz still pointed at the historical migration filenames | Retargeted to strong `src/supabase/` mirrors; drift test pins path parity + installer WITH CHECK markers |

No new migration for this batch (operator tip). Apply through **26116** remains current.

### 33. This batch — roll-call / refund reactivation skip-if-newer + identity-arg fix
| Area | Defect | Fix |
|---|---|---|
| Operator SQL drift (money) | `credit_batch_refund_reactivation` still unconditionally replaced `admin_set_booking_status` / `admin_record_session_attendance`; `roll_call_correction` replaced refund/cancel/status without skip-if-newer | Skip-if-newer on those RPCs (`keeping newer…`) |
| Historical migration re-run (money) | `260030` restored inline `remaining+1`; `260170` restored roll-call release without Stripe-refunded skip; `261060` restored helper/cancel/attendance without `o.status = 'refunded'` | Skip-if-newer on those migrations |
| Operator SQL drift (skip guard bug) | `booking_modes` / `admin_cms` compared `pg_get_function_identity_arguments` to `p_anchor timestamptz`, which never matches Postgres’s `timestamp with time zone` — skip-if-newer never kept the helper | Identity args corrected; drift + overnight tests pin the canonical form and the full money/privacy skip marker set |

No new migration for this batch (operator tip). Apply through **26116** remains current.

### 34. This batch — historical cancel/fulfill/class-cancel re-run downgrades
| Area | Defect | Fix |
|---|---|---|
| Historical migration re-run (money) | `260800` still installed inline `remaining+1` cancel; `261060` still replaced helper-backed `cancel_booking` / `admin_set_booking_status` without skip-if-newer | Skip-if-newer (`keeping newer cancel_booking` / `admin_set_booking_status`); bootstrap bodies retained |
| Historical migration re-run (money) | `260000` class-cancel fix still replaced attended/no_show + Stripe-refunded pack-skipping cancel bodies | Skip-if-newer when attended/no_show/refunded markers present |
| Historical migration re-run (privacy/money) | `261070` / `160400` fulfill re-runs restored non-erasure email writes (and `160400` also stripped deleted-member settle) | Skip-if-newer (`keeping newer fulfill_stripe_checkout`) |

No new migration for this batch (historical tip). Apply through **26116** remains current.

### 35. This batch — deletion / fulfillment / roll-call re-run downgrades
| Area | Defect | Fix |
|---|---|---|
| Historical migration re-run (privacy) | `260160` / `261050` still replaced `delete_member_account` without public-lead cleanup | Skip-if-newer (`keeping newer delete_member_account` when redact / `member_interest` present) |
| Operator SQL drift (money) | Ops Health `roll_call_releases_pending_requests` unconditionally replaced refund helper + attendance | Skip-if-newer on both (`keeping newer refund_credits_to_batch` / `admin_record_session_attendance`) |
| Operator + tip migration (money/privacy) | `fulfillment_erasure_and_refunded_pack_guard` (261120 + mirror) unconditionally replaced refund / fulfill / attendance / class-cancel | Skip-if-newer on all four (`keeping newer…`) |

No new migration timestamp for this batch (operator + historical tip). Apply through **26116** remains current.

### 36. This batch — capacity session-move guard, APNs failed-retry, booking-desk push honesty
| Area | Defect | Fix |
|---|---|---|
| Capacity race | `enforce_session_capacity` early-returned on any UPDATE whose *old* status was requested/confirmed, so a `class_session_id` move onto a full destination skipped the lock/`SESSION_FULL` check | Skip only when the active place stays on the same session; session moves re-lock and count |
| Silent failure (APNs) | Targeted / class-cancel notify short-circuited when *any* prior delivery row existed, and resend treated transient `failed` like terminal — operators could not finish devices after timeouts; booking desk / promote / skip toasts also ignored `push.failed` | Retry when prior status is `failed`; only `delivered` / `invalid_token` skip; desk toasts use `describeTargetedMemberNoticePush` |
| Docs | Morning briefing named **26117** but the copy-paste list + numbered table still stopped at **26116** | Apply checklist now includes `session_capacity_concurrency_guard` end-to-end |

Migration / operator mirror (already on tip; body tightened this batch):
`supabase/migrations/20260726117000_session_capacity_concurrency_guard.sql`
↔ `src/supabase/session_capacity_concurrency_guard.sql`.

### 37. This batch — soft-launch switch authz, credit-release FK clear, web emergency reveal
| Area | Defect | Fix |
|---|---|---|
| Authz / fail-closed | Soft Launch UI refused payments without bookings and bookings without the switch guard, but `activate_payments` + `admin_activate_session_pack_payments` accepted `bookings_enabled:false`, and PostgREST could set `bookings_enabled=true` without `member_booking_switch_guard` | Trigger `enforce_soft_launch_switch_authz` + API/RPC refuse; capability `soft_launch_switch_authz` (**26118**) |
| Silent credit marker | `admin_set_booking_status` / `cancel_booking` / class cancel refunded remaining but left `credit_batch_id` set on waitlisted/cancelled rows | Null the FK when a reserved credit is released; capability `booking_credit_release_clears_batch` (**26119**) |
| Privacy / ops parity | Privacy + iOS offer audited emergency-contact reveal; web Members drawer had no path after column lockdown | Web `admin_reveal_member_emergency_contact` + readiness section; clear on member switch |

Migration / operator mirrors:
`supabase/migrations/20260726118000_soft_launch_switch_authz.sql`
↔ `src/supabase/soft_launch_switch_authz.sql`;
`supabase/migrations/20260726119000_booking_credit_release_clears_batch.sql`
↔ `src/supabase/booking_credit_release_clears_batch.sql`. Apply through **26119**.

---

## Operator re-run safety (skip-if-newer inventory)

Scripts that raise `keeping newer…` / `keeping audited…` so a later Ops Health
or SQL Editor re-run cannot restore a weaker money/privacy body. Prefer the
`src/supabase/` mirror named in Ops Health / `schemaCapabilities.js` over
historical migrations when repairing.

### Money / credits / Stripe fulfill
| Script | Skip notices (keep when live body already has the strong markers) |
|---|---|
| `src/supabase/cancel_booking_expired_batch_refund.sql` | `keeping newer cancel_booking` |
| `src/supabase/credit_batch_refund_reactivation.sql` | refund helper, `cancel_booking`, `admin_set_booking_status`, attendance, class-cancel |
| `src/supabase/class_cancellation_credit_refund_fix.sql` | refund helper, class-cancel |
| `src/supabase/stripe_fulfillment_deleted_member_fix.sql` | `keeping newer fulfill_stripe_checkout` |
| `src/supabase/stripe_payment_fulfillment_upgrade.sql` | `keeping newer fulfill_stripe_checkout` |
| `src/supabase/fulfillment_erasure_and_refunded_pack_guard.sql` | refund helper, fulfill, attendance, class-cancel |
| `src/supabase/booking_modes_upgrade.sql` | refund helper, cancel, status, class-cancel |
| `src/supabase/admin_cms_schema.sql` | refund helper, status, attendance, class-cancel |
| `src/supabase/attendance_roll_call_upgrade.sql` | `keeping newer admin_record_session_attendance` |
| `src/supabase/roll_call_releases_pending_requests.sql` | refund helper, attendance |
| `src/supabase/roll_call_correction_double_credit_fix.sql` | refund helper, cancel, status |
| `src/supabase/waitlist_fifo_promotion_upgrade.sql` | `keeping newer admin_set_booking_status` |
| Historical: `260000`, `260030`, `260170`, `260800`, `261060`, `261070`, `160400`, `261120` | matching money RPC notices (bootstrap weak bodies retained) |

### Privacy / deletion / health reveal / waitlist notices
| Script | Skip notices |
|---|---|
| `src/supabase/atomic_account_deletion.sql` | `keeping newer delete_member_account` |
| `src/supabase/audit_subject_pii_redaction_upgrade.sql` | `keeping newer delete_member_account` |
| Historical: `260160`, `261050` | `keeping newer delete_member_account` |
| `src/supabase/request_notes_health_consent.sql` (+ `261090`) | `keeping audited admin_reveal_member_interest_health` |
| `src/supabase/booking_decision_notifications_upgrade.sql` (+ `220000`) | `keeping newer admin_set_booking_status_with_notice` |

**Diminishing returns:** further skip-if-newer on tip mirrors that already *are*
the strong body adds little beyond what drift/overnight tests already pin.
Next high-value work is outside operator re-run (product features after owner
gates, or a fresh money/privacy bug found by Postgres repro — not more wrap
layers).

---

## Full ordered list — overnight migrations to apply in production

Apply in timestamp order (skip any already applied). Operator mirrors under
`src/supabase/` are for idempotent re-runs / Ops Health repair, not a second
source of truth.

### Copy-paste ordered filenames (overnight catch-up through 26119)

Paste into a checklist, SQL Editor queue, or shell loop — one file per line, in order:

```
supabase/migrations/20260726080000_cancel_booking_expired_batch_refund.sql
supabase/migrations/20260726103000_member_interest_health_consent.sql
supabase/migrations/20260726104000_class_session_optimistic_locking.sql
supabase/migrations/20260726105000_audit_subject_pii_redaction.sql
supabase/migrations/20260726106000_credit_batch_refund_reactivation.sql
supabase/migrations/20260726107000_stripe_fulfillment_deleted_member_overload_fix.sql
supabase/migrations/20260726108000_account_deletion_public_lead_cleanup.sql
supabase/migrations/20260726109000_request_notes_health_consent.sql
supabase/migrations/20260726110000_waitlist_skip_concurrency.sql
supabase/migrations/20260726111000_pt_rehab_goal_health_consent.sql
supabase/migrations/20260726112000_fulfillment_erasure_and_refunded_pack_guard.sql
supabase/migrations/20260726113000_public_booking_switch_gate.sql
supabase/migrations/20260726114000_member_onboarding_booking_gate.sql
supabase/migrations/20260726115000_waitlist_skip_notice_accuracy.sql
supabase/migrations/20260726116000_member_interest_health_reveal_authz.sql
supabase/migrations/20260726117000_session_capacity_concurrency_guard.sql
supabase/migrations/20260726118000_soft_launch_switch_authz.sql
supabase/migrations/20260726119000_booking_credit_release_clears_batch.sql
```

### Production apply checklist (examples — no secrets)

Prefer the Supabase SQL Editor for one-off apply, or CLI against a linked
project. Never paste service-role keys into shell history or commits.

```bash
# Optional: link once (uses project ref from the dashboard; interactive login)
supabase link --project-ref <YOUR_PROJECT_REF>

# Apply any missing overnight migrations in timestamp order
supabase db push

# Or apply each missing file from the copy-paste list above, e.g.:
# while IFS= read -r f; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done <<'EOF'
# …paste the 16 lines…
# EOF

# Or apply a single file when catch-up is needed
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260726119000_booking_credit_release_clears_batch.sql

# Release contract — every row must be installed + release_ready
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f src/supabase/release_readiness_check.sql
```

`DATABASE_URL` is the Postgres connection string from Supabase → Project
Settings → Database (use the pooled URI if your network requires it). Do not
commit it. If you only have the SQL Editor, paste each missing migration file
in timestamp order, then paste `release_readiness_check.sql` and confirm every
row shows `installed = true` and `release_ready = true`.

| # | Migration | Capability / effect |
|---|---|---|
| 1 | `20260726080000_cancel_booking_expired_batch_refund.sql` | `cancel_booking_expired_batch_refund` — cancel returns credits even when the pack expired |
| 2 | `20260726103000_member_interest_health_consent.sql` | `member_interest_health_consent` — APP 3.3 health consent on member interest |
| 3 | `20260726104000_class_session_optimistic_locking.sql` | `class_session_optimistic_locking` — concurrent class edits need `updated_at` |
| 4 | `20260726105000_audit_subject_pii_redaction.sql` | `audit_subject_pii_redaction` — erasure redacts audit subject PII |
| 5 | `20260726106000_credit_batch_refund_reactivation.sql` | `credit_batch_refund_reactivation` — shared refund helper reactivates expired packs |
| 6 | `20260726107000_stripe_fulfillment_deleted_member_overload_fix.sql` | `stripe_fulfillment_deleted_member` — live fulfillment overload tolerates deleted buyers |
| 7 | `20260726108000_account_deletion_public_lead_cleanup.sql` | `account_deletion_public_lead_cleanup` — delete wipes email-matched public leads + anon PT |
| 8 | `20260726109000_request_notes_health_consent.sql` | `request_notes_health_consent` — health consent on class/PT free-text notes |
| 9 | `20260726110000_waitlist_skip_concurrency.sql` | `waitlist_skip_concurrency` — skip only the current waitlist head |
| 10 | `20260726111000_pt_rehab_goal_health_consent.sql` | `pt_rehab_goal_health_consent` — Rehab goal requires health consent |
| 11 | `20260726112000_fulfillment_erasure_and_refunded_pack_guard.sql` | `stripe_fulfillment_deleted_email_erasure` + `refund_skips_stripe_refunded_batches` |
| 12 | `20260726113000_public_booking_switch_gate.sql` | `public_booking_switch_gate` — public `class_bookings` respect `bookings_enabled` |
| 13 | `20260726114000_member_onboarding_booking_gate.sql` | `member_onboarding_booking_gate` — book/waitlist require Member Readiness |
| 14 | `20260726115000_waitlist_skip_notice_accuracy.sql` | `waitlist_skip_notice_accuracy` — waitlist Skip notice does not claim a credit return |
| 15 | `20260726116000_member_interest_health_reveal_authz.sql` | `member_interest_health_reveal_authz` — injury columns locked; reveal audited |
| 16 | `20260726117000_session_capacity_concurrency_guard.sql` | `session_capacity_concurrency_guard` — session-locked `SESSION_FULL` on concurrent book/confirm (incl. session moves) |
| 17 | `20260726118000_soft_launch_switch_authz.sql` | `soft_launch_switch_authz` — payments require bookings; bookings require switch guard (DB + API) |
| 18 | `20260726119000_booking_credit_release_clears_batch.sql` | `booking_credit_release_clears_batch` — release paths null `credit_batch_id` |

Earlier same-day migrations (`20260726000000`–`20260726019000`, plus
`20260726070214_sql_drift_repair.sql`) may already be in production from prior
batches; confirm via `release_readiness_check.sql` before re-applying.

After applying, run `src/supabase/release_readiness_check.sql` — every row must
show `installed = true` and `release_ready = true`, including
`soft_launch_switch_authz` and `booking_credit_release_clears_batch`.

---

## Morning smoke checklist

1. **Migrations** — Apply any missing rows from the table above through
   `20260726119000_booking_credit_release_clears_batch.sql`. Confirm readiness SQL.
2. **Soft launch bookings** — Pause Bookings → direct PostgREST insert into
   `class_bookings` fails; re-enable → Request spot works; sticky Book CTA only
   when enabled.
3. **Member readiness gate** — Signed-in member with credits but incomplete
   readiness: `book_session` / waitlist join fail with
   `MEMBER_ONBOARDING_REQUIRED`. Complete readiness → book succeeds.
4. **iOS notice deep link** — `/booking#packs` opens Session Packs (not bare Book).
5. **Announcement archive pushes** — Archive a targeted/class notice (or set
   `archived_at`); `notify_targeted_announcement` /
   `notify_class_cancellation` return 409 and do not APNs.
6. **Orders refund** — Open a paid order, start typing REFUND, change a filter
   while refunding is idle (drawer closes); start refund and confirm Stripe +
   credits revoke; page clamp still shows rows after filter shrink.
7. **Checkout burst** — After ≥ 8 fresh checkout rows for one member in 10
   minutes (no reusable session), `/api/checkout` returns 429.
8. **PT desk** — Change status on page 2; stay on page 2 after reload.
9. **Erasure / refunded packs (batch 9)** — Delete account → delayed fulfillment
   keeps null order email; Stripe-refunded pack does not regain credits from
   later cancel / roll-call.
10. **Waitlist skip notice** — Skip a no-credit head → private notice says no
    credit was charged (not that one was returned); Promote next → confirmed
    notice/push still fires.
11. **Account email** — Edit Account Details: email visible and not editable;
    save only updates name/phone.
12. **Soft-launch toggles** — Enable payments with bookings off → blocked on
    web and iOS; enable bookings without booking-switch guard → blocked.
13. **Purchase confirm** — Open `/account?purchase=success` with no
    `checkout_session_id` (and empty local handoff) → “Checkout did not
    complete”, not an endless delayed spinner.
14. **iOS Waitlisted** — With >20 waitlisted sessions, Overview Waitlisted
    reflects up to the RPC ceiling (50), including after promote/skip.
15. **Deleted-buyer reconcile** — Check Stripe Outcome on a paid order whose
    member was deleted → toast/iOS says settled without credits (not “4 credits
    granted”).
16. **Kill-switch probe failure** — If orders/ledger health probes error, Ops
    Health delivery is not ready and `/api/checkout` returns 503 until probes
    succeed again.
17. **Notice dismiss** — Dismiss two notices quickly → only one in flight; both
    leave the list without spinner races.
18. **Checkout identity mismatch** — Local handoff `cs_A` + return `cs_B` →
    failed confirmation (not success against `cs_A`); pending storage cleared.
19. **Lead health reveal** — Reveal on a lead with consent but empty notes →
    “No consented injury notes”; drawer key resets per lead.
20. **Do not** implement staff roles yet — owner/legal gates in
    `docs/requirements/INTEGRATION_REVIEW.md` §5 still block 01–07 feature build.
21. **Paused booking CTAs** — With bookings off: `/` hero + final CTA + footer
    are Register interest (not Book); sticky Book hidden; `/timetable` footer
    is Register interest; sticky Book hidden; `/booking` class rows are
    Register interest with the paused banner.
22. **Pack create / Account delete / iOS Sign Out** — Double-click Create pack
    and Delete account confirm stay single-flight; iPhone Sign Out ignores a
    second tap.
23. **Booking inbox / Orders refund / private notice** — Double-click booking
    status stays single-flight; Refund button matches reconcile lock; Send
    privately / Mark Contacted ignore a second same-paint submit.
24. **Soft Launch confirm freeze** — Flip payments on → confirm dialog → toggles
    and Discard stay disabled; Cancel unlocks; Confirm persists once.
25. **iOS Explore interest** — Double-tap Submit on member/trainer/partner form
    stays single-flight; with bookings off, About shows Register interest.
26. **Booking Buy/Book + cancel locks** — Double-click Buy pack / Book class on
    `/booking` stays single-flight and freezes sibling CTAs; Account cancel
    booking and admin Cancel class ignore a second same-paint Confirm; Members
    / PT CSV stay off while loading and refuse double download.
27. **Marketing Book CTAs + profile/goal locks** — With bookings off: About /
    Contact / Coaches / Events / Training Guide / App show Register interest
    (not Book) and hide sticky Book; iPhone Home hero says Register interest;
    Account Save details and Events Train for this ignore a second same-paint
    submit.
28. **Booking/roster CSV + Dupe + goal remove** — Booking Operations / class
    roster / event training-group CSV refuse double download (booking CSV off
    while loading); class Dupe and Account Remove goal ignore a second
    same-paint submit; iPhone Account Save details ignores a second Task.
29. **Orders CSV + roster status + Account paused Book + availability delete** —
    Orders CSV refuses double download and stays off while loading; class
    roster / request status selects ignore a second same-paint change; with
    bookings off, Account Book/Buy CTAs (web + iPhone) say Register interest;
    Availability Remove ignore a second same-paint Confirm.
30. **iPhone Home pause + Account/Booking footers + Campaign/Audit CSV** — With
    bookings off: iPhone Home hero/dashboard/quick-action/launch-guide Book
    CTAs say Register interest and open Explore (not Book); Account and
    `/booking` footers say Register interest; Campaign Attribution / Admin
    Audit CSV refuse double download and stay off while loading.
31. **Operator SQL re-run + iOS health reveal** — Re-run
    `request_notes_health_consent.sql` keeps the audited health-reveal RPC;
    re-run `booking_decision_notifications_upgrade.sql` keeps waitlist Skip
    notice accuracy; iPhone member-interest Lead detail can Reveal consented
    health notes (web / Privacy parity) and clears the reveal off-screen.
32. **Waitlist FIFO refund drift + reveal bootstrap + Privacy** — Re-run
    `waitlist_fifo_promotion_upgrade.sql` keeps helper-backed
    `admin_set_booking_status` (no inline refund onto Stripe-refunded packs);
    re-run `request_notes_health_consent.sql` with the reveal audit table
    present restores/keeps the audited reveal RPC (never the unaudited
    bootstrap); Privacy lists iOS device notification tokens and says
    member-interest injury reveals are recorded/logged.
33. **Public-form / waitlist / onboarding remediations** — Ops Health actions for
    `public_booking_switch_gate`, `request_notes_health_consent`,
    `waitlist_skip_concurrency`, `member_onboarding_booking_gate` (and related
    public-form / waitlist caps) point at `src/supabase/` mirrors; re-running
    older public-form migrations keeps bookings_enabled + notes WITH CHECK;
    re-running booking-decision / waitlist FIFO migrations keeps Skip notice
    accuracy and helper refunds.
34. **Deletion / fulfillment / roll-call re-runs** — Re-run `260160` / `261050`
    keeps lead-cleanup `delete_member_account`; re-run
    `roll_call_releases_pending_requests` / `fulfillment_erasure` keeps
    Stripe-refunded pack skips and deleted-buyer email erasure.
35. **Capacity + APNs retry** — Concurrent book/confirm (and an active booking
    moved onto a full class) raises `SESSION_FULL`; after a transient APNs
    `failed` row, targeted / class-cancel notify retries remaining devices;
    booking desk / promote / skip toasts surface `push.failed` reasons.
36. **Soft-launch switch authz + credit-release clear + web emergency reveal** —
    Crafted `activate_payments` with bookings off returns 409; PostgREST cannot
    enable bookings without the switch-guard capability; demote/cancel/class
    cancel clear `credit_batch_id` when releasing a credit; web Member drawer
    can Reveal emergency contact (audited) and clears it on member switch.
