# Remaining audit findings — full evidence

**56 original findings. One is now verified and fixed; 55 remain unverified.** They are raw output from the audit swarm; the verification pass that would have culled false positives never ran.

Read `../HANDOFF.md` first — it explains how to verify these and lists the false-positive patterns already observed in this codebase.

Each entry preserves the auditor's own `evidence` quote and proposed `fix`. **Do not trust either.** Two of the five defects already fixed had the right symptom but the wrong mechanism, and one "critical" was refuted outright.

---


## CRITICAL

### 1. Open class editor keeps the edited class's form after `editingSession` is cleared, so Save silently inserts a duplicate published class

- **id:** `session-editor-prop-desync-creates-duplicate-class`
- **severity (claimed):** critical
- **location:** `src/components/admin/ClassCalendarAdmin.jsx:524`
- **status:** VERIFIED — FIXED

**Verification result**

The quoted path was accurate. A same-section Command Palette action bypassed the
global unsaved-change guard, changed `session` from the edited record to `null`,
and React retained the editor's one-time form state. The save branch then changed
from update to insert while `normalizeClassSession` discarded the stale `id`.
The fix makes editor identity follow the session, reports dirty state to the
shared navigation guard, confirms local discard attempts, and applies the
unsaved-change check before same-section navigation. Regression coverage is in
`test/class-session-editor-draft-safety.test.js`.

**What the auditor claims**

`SessionEditor` derives its whole form from the `session` prop with a lazy `useState` initializer that runs exactly once (line 220), and `handleSave` chooses update-vs-create from `session?.id` (line 244). Nothing keys or remounts the editor. The intent effect at line 524 sets `editingSession` to `null` while leaving `showEditor` at `true` — because `showEditor` is already `true`, `setShowEditor(true)` is a no-op and React reconciles the SAME `SessionEditor` element instead of remounting it. The component therefore keeps `form` (the record being edited, including the operator's unsaved changes) while `session` becomes `null`, flipping `handleSave` from the update branch to the create branch. `normalizeClassSession` whitelists columns, so the stale `id` in `form` is stripped rather than causing a primary-key conflict — the insert succeeds silently instead of erroring. The trigger is reachable with no race: AdminLayout registers its ⌘K/Ctrl+K handler on `window` (AdminLayout.jsx:151-160) and it stays active while the editor overlay is open; CommandPalette's quick action `{ key: 'calendar', label: 'Create a new class' }` calls `run('calendar', { action: 'create' })`, and `AdminCommandCentre.setSection` takes its `nextSection === section` branch and just navigates to `/admin/calendar?action=create`.

**Claimed failure scenario**

Admin clicks Edit on the published class "XERT Engine — Fri 6 Feb 06:00" and changes capacity from 8 to 10. Before saving they press Ctrl+K and choose "Create a new class". The URL becomes /admin/calendar?action=create, the effect at line 524 sets `editingSession = null`, and the dialog heading changes from "Edit Class" to "New Class" — but every field still holds the XERT Engine values with capacity 10. They click "Save class": `session?.id` is now undefined, so `createClassSession(form)` runs and INSERTS a second published "XERT Engine — Fri 6 Feb 06:00" class at the same time slot with capacity 10 into the public timetable, while the original class is still capacity 8 and their edit is lost. Members now see and can book two identical classes.

**Quoted evidence (verify this exists verbatim)**

```
// line 220 — form is snapshotted from the prop once and never re-synced
  const [form, setForm] = useState(() => session ? {
    ...session,
    start_time: toDateTimeLocalInput(session.start_time),

// line 243 — the create/update decision reads the (now stale) prop, not the form
    try {
      if (session?.id) {
        await updateClassSession(session.id, form);
      } else {
        await createClassSession(form);
      }

// line 524 — clears the prop under the already-open editor
  useEffect(() => {
    if (initialAction !== 'create') return;
    setEditingSession(null);
    setShowEditor(true);
    onIntentHandled?.();
  }, [initialAction, onIntentHandled]);

// line 980 — no key, so React reuses the same SessionEditor instance
      {showEditor && (
        <SessionEditor
          session={editingSession}
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Make the editor's identity follow its subject so React remounts it when the subject changes: render `<SessionEditor key={editingSession?.id ?? 'new'} ... />`. Additionally, have the intent effect refuse to clobber an open editor — e.g. `if (initialAction !== 'create' || showEditor) return;`, or close and reopen it (`setShowEditor(false)` then set the new subject) — and prompt before discarding in-progress edits, as the events and content editors already do.

---


## HIGH

### 2. A failed fulfilment event blocks checkout forever but ages out of the 24-hour incident window, leaving an unfixable store-wide outage with an empty incident list

- **id:** `aged-out-failed-event-permanently-blocks-checkout`
- **severity (claimed):** high
- **location:** `api/admin-commerce-health.js:256`
- **status:** UNVERIFIED

**What the auditor claims**

The checkout kill-switch `paymentFulfillmentDeliveryIsHealthy` (api/checkout.js:137-150) queries `stripe_webhook_events` for status='failed' with **no time bound**, and nothing ever deletes or ages out those rows (no cleanup exists anywhere in api/, src/ or supabase/migrations/). The admin surface that is supposed to resolve them, `inspectWebhookDeliveryHealth`, filters `.gte('last_received_at', since)` where `since` is now-24h; the second query only rescues rows whose `last_error_code` is one of the three `STRIPE_OPERATOR_REVIEW_CODES`, which a generic fulfilment failure never is (`stripeWebhookErrorCode` yields e.g. 'Error' or 'WEBHOOK_PROCESSING_FAILED'). The admin UI renders retry buttons only from `check.incidents` (src/components/admin/OperationsHealth.jsx:271-273, fed by adminData.js:1396), and `resolveStripeOperatorReview` refuses any event whose error code is not an operator-review code (api/admin-commerce-health.js:483). So once the row is older than 24 hours there is no way, from inside the product, to see it or clear it.

**Claimed failure scenario**

A checkout.session.completed event fails to fulfil once (bad data, a transient Supabase outage during a deploy, or the currency defect above). Stripe retries for up to ~3 days, refreshing `last_received_at`, then gives up. Twenty-four hours after the last retry the row leaves the health window. From that moment: Operations Health shows webhook_delivery `ready: true, failed: 0, incidents: []` — everything looks green — while every single /api/checkout call, for every member and every pack, returns 503 'Checkout is temporarily paused while a payment delivery issue is being resolved.' The owner has no incident to click, no event id to paste into the retry action, and no supported way to clear the row. Revenue is zero until someone runs SQL against production.

**Quoted evidence (verify this exists verbatim)**

```
export async function inspectWebhookDeliveryHealth(admin, now = new Date()) {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const staleBefore = now.getTime() - 10 * 60 * 1000;
  const fields = 'event_id,event_type,status,attempts,order_id,last_received_at,last_error_code';
  const [recentResult, reviewResult] = await Promise.all([
    admin
      .from('stripe_webhook_events')
      .select(fields)
      .gte('last_received_at', since)
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Make the two queries agree. Either bound the checkout gate to the same window the operator can see, or (better) always surface unresolved rows regardless of age: add a third query for `status='failed'` and stale `status='processing'` with no `since` filter and merge it into `incidentRows`, and allow `resolveStripeOperatorReview` to acknowledge any failed event (with a distinct confirmation string) so an aged incident can be cleared through the UI instead of by hand.

---

### 3. Checkout accepts any 3-letter product currency but fulfilment hard-requires AUD, so a non-AUD pack charges the member and can never grant credits

- **id:** `non-aud-product-currency-strands-payment`
- **severity (claimed):** high
- **location:** `api/checkout.js:266`
- **status:** UNVERIFIED

**What the auditor claims**

`products.currency` is only constrained to `^[a-zA-Z]{3}$` (src/supabase/booking_schema.sql:89), `admin_update_product` re-validates with the same 3-letter regex (supabase/migrations/20260713010000_product_update_guard.sql:40), `normalizeProductAdminInput` accepts any 3-letter code (src/lib/products.js:69-72), and `assertCheckoutProduct` accepts any 3-letter code. checkout.js then sends that currency straight to Stripe (`currency: product.currency.toLowerCase()`, line 680) and writes it into the pending order (`pendingOrderForCheckout`, line 488). But `checkoutFulfillmentForSession` throws unless the Checkout currency is exactly `aud` (api/stripe-webhook.js:155), and `fulfill_stripe_checkout` raises `Invalid Stripe fulfillment payload` unless `lower(p_currency) = 'aud'` (supabase/migrations/20260716040000_stripe_order_terms_snapshot.sql:73). `inspectCommerceProducts` in api/admin-commerce-health.js:156 uses the same permissive `assertCheckoutProduct`, so the launch-readiness gate reports the catalog ready. I verified the whole chain by executing it: assertCheckoutProduct('nzd') passes, pendingOrderForCheckout returns currency 'nzd', and checkoutFulfillmentForSession throws 'Checkout metadata is incomplete or invalid.'

**Claimed failure scenario**

An admin sets the 'starter-4' pack currency to 'nzd' (accepted by the form, the RPC and the CHECK constraint). A member buys it: Stripe charges NZ$48 and the order row is written with currency 'nzd'. Stripe delivers checkout.session.completed; `checkoutFulfillmentForSession` throws, the webhook returns 500, the ledger row for that event becomes status='failed' with event_type='checkout.session.completed'. The member is charged and receives zero credits, and `/api/admin-reconcile-order` cannot repair it either (the same function throws, producing an unmapped 500). Worse, `paymentFulfillmentDeliveryIsHealthy` (api/checkout.js:133-154) now counts one failed fulfilment event, so every subsequent /api/checkout for every pack and every member returns 503 'Checkout is temporarily paused while a payment delivery issue is being resolved.' — the whole store stops selling until someone edits the database by hand.

**Quoted evidence (verify this exists verbatim)**

```
export function assertCheckoutProduct(product) {
  const currency = String(product?.currency || 'aud');
  if (
    !product ||
    !isPositiveInteger(product.price_cents) ||
    !isPositiveInteger(product.sessions_count) ||
    !isPositiveInteger(product.validity_days) ||
    !/^[a-z]{3}$/i.test(currency)
  ) {
    throw new Error('Product configuration is invalid.');
  }
}
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Make the AUD-only assumption explicit at the point money is committed: change `assertCheckoutProduct` to require `currency === 'aud'` (or read the allowed set from one shared constant used by checkout, fulfilment and the SQL functions), and add a `check (lower(currency) = 'aud')` constraint to `public.products` plus the same check in `admin_update_product`/`admin_update_product_v2`. Also mirror the check in `inspectCommerceProducts` so Operations Health flags a mispriced pack before launch instead of after a member is charged.

---

### 4. Webhook signature rejections never reach the ledger, so a broken signing secret is invisible to Operations Health and does not pause checkout

- **id:** `webhook-signature-failure-invisible-to-health`
- **severity (claimed):** high
- **location:** `api/stripe-webhook.js:512`
- **status:** UNVERIFIED

**What the auditor claims**

Signature verification failures return 400 before `processStripeEvent` is called, so no `stripe_webhook_events` row is ever written for them. Every downstream health signal is derived from that table only: `inspectWebhookDeliveryHealth` computes `const ready = failed === 0 && staleProcessing === 0 && !truncated;` (api/admin-commerce-health.js:309), which is trivially true on an empty ledger, and `paymentFulfillmentDeliveryIsHealthy` (api/checkout.js:137-150) counts only rows with status 'failed' or stale 'processing', so it also returns true. `inspectStripeWebhookEndpoints` only verifies the endpoint URL, status and enabled event list — it cannot detect a signing-secret mismatch. The result is that the single failure mode that silently stops all fulfilment is the one failure mode the whole monitoring stack cannot see, and the checkout kill-switch it feeds never trips.

**Claimed failure scenario**

The owner rotates the Stripe signing secret in the Stripe Dashboard but the new `whsec_...` value is not deployed to Vercel (or is pasted into `STRIPE_WEBHOOK_SECRET_PREVIOUS` instead of `STRIPE_WEBHOOK_SECRET`). `constructVerifiedStripeEvent` throws for both secrets, every delivery returns 400 'Invalid webhook signature.', and zero ledger rows are created. Operations Health reports webhook_delivery `{ ready: true, received: 0, failed: 0, incidents: [] }` with no issue string, and /api/checkout keeps returning Checkout URLs. Members continue paying; every order stays 'pending' with no credit batch, indefinitely, with no alarm anywhere in the product.

**Quoted evidence (verify this exists verbatim)**

```
  } catch (e) {
    console.warn('Stripe webhook signature rejected.', {
      requestId: trace.requestId,
      name: String(e?.name || 'Error'),
      type: String(e?.type || ''),
      code: String(e?.code || ''),
    });
    return text('Invalid webhook signature.', 400);
  }
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Record rejected deliveries durably (a `stripe_webhook_rejections` counter table, or a ledger row keyed by request id with status 'failed'/error_code 'SIGNATURE_REJECTED'), and treat them in `inspectWebhookDeliveryHealth` and `paymentFulfillmentDeliveryIsHealthy` exactly like failed fulfilments. Additionally, make an empty ledger a non-ready state when there are paid orders newer than the newest ledger row, so 'no webhooks at all' is distinguishable from 'no traffic'.

---

### 5. refresh() piggybacks on an in-flight refresh, so book/waitlist/cancel silently show stale data

- **id:** `refresh-coalescing-serves-stale-data`
- **severity (claimed):** high
- **location:** `ios/XertFitnessApp/XertFitnessApp/Store/XertStore.swift:109`
- **status:** UNVERIFIED

**What the auditor claims**

`refresh()` coalesces: if `dataRefreshTask` is non-nil it awaits the already-running task and returns without issuing any new requests. Every mutation path (`book`, `joinWaitlist`, `cancel`) relies on `await refresh()` to reflect the change it just committed. When a refresh is already in flight (scene-phase auto-refresh, dock re-selection, or pull-to-refresh), the mutation's `refresh()` awaits a fan-out whose `my_bookings` / `credit_batches` requests were issued *before* the mutation committed, and then returns as if it had reloaded. There is a request-generation guard (`dataRefreshVersion`) but it only discards *late* responses; it never forces a *new* fetch for a caller that arrived after the in-flight one started.

**Claimed failure scenario**

App is foregrounded, so `RootView.handleScenePhase` fires `Task { await store.refresh() }`. ~300 ms later, while the 13-request fan-out is still running, the member taps "Book class" on a visible session. `api.book` POSTs `book_session` and succeeds at t+700 ms. `book()` then calls `await refresh()`, which sees `dataRefreshTask != nil`, awaits the t+0 fan-out (whose `my_bookings` RPC was sent at ~t+350 ms, before the booking row existed) and returns. `store.bookings` never contains the new booking, `creditTotal` still shows the pre-booking count, and the card still reads "Book class". Tapping Book again returns `ALREADY_BOOKED`. The same path makes `cancel()` leave a cancelled booking on screen and makes pull-to-refresh a silent no-op during any concurrent refresh.

**Quoted evidence (verify this exists verbatim)**

```
    func refresh() async {
        if let dataRefreshTask {
            await dataRefreshTask.value
            return
        }

        dataRefreshVersion.invalidate()
        let refreshVersion = dataRefreshVersion.snapshot
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Do not coalesce a caller that arrives after the in-flight refresh started. Either await the current task and then run a fresh `performRefresh` for the new caller, or track a `pendingRefreshRequested` flag that causes `refresh()` to loop once more after the in-flight task completes. As a minimum, have `book`/`joinWaitlist`/`cancel` bypass the coalescing (e.g. a `force: Bool` parameter that cancels the in-flight task and starts a new generation).

---

### 6. Site-content editor deletes rows by index while ForEach and TextField bindings are index-keyed (Index out of range)

- **id:** `site-content-editor-index-binding-oob`
- **severity (claimed):** high
- **location:** `ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift:2918`
- **status:** UNVERIFIED

**What the auditor claims**

The FAQ, hero-photo and About-paragraph editors all iterate `array.indices` with `id: \.self` and then build per-row `TextField` bindings that subscript the same array by that captured index, while the row's trash button mutates the array with `remove(at: index)`. `AdminFAQItem` already carries a stable `id` (it is `Identifiable`), but the ForEach ignores it. `draft.items?[index]` is optional-chaining on the *array*, not on the subscript, so an out-of-range index traps rather than returning nil. Same shape at line 2876 (`(draft.photos ?? []).indices` + `draft.photos?.remove(at: index)` + `let value = (draft.photos ?? [])[index]` on line 2938) and line 2898 (`(draft.paragraphs ?? []).indices` + `draft.paragraphs?[index]` on lines 2967-2969).

**Claimed failure scenario**

Admin opens Owner Command Centre -> Content -> FAQ with the 8 seeded questions. They tap into the Answer field of the last question (index 7), type a character so the field is first responder and dirty, then tap the trash button on that same row without dismissing the keyboard. The button action runs `draft.items?.remove(at: 7)`, shrinking the array to 7 elements; the text field is then torn down and commits its pending text through the retained binding `set: { draft.items?[7].a = $0 }`, which subscripts a 7-element array at index 7 -> `Fatal error: Index out of range`, app crash with the admin's unsaved content draft in memory.

**Quoted evidence (verify this exists verbatim)**

```
                ForEach((draft.items ?? []).indices, id: \.self) { index in
                    faqRow(index: index)
                }
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Key the ForEach by element identity and mutate by identity, not index: `ForEach(draft.items ?? []) { item in ... }` with `draft.items?.removeAll { $0.id == item.id }`, or use `ForEach($draft.items ?? [])`-style element bindings. Apply the same change to the hero-photo (line 2876) and paragraph (line 2898) lists; give photos/paragraphs an identified wrapper type since raw `String` has no stable identity.

---

### 7. Any app or web page can forge XERT checkout state via the xertfitness:// URL scheme

- **id:** `external-checkout-deeplink-forges-purchase-state`
- **severity (claimed):** high
- **location:** `ios/XertFitnessApp/XertFitnessApp/Views/RootView.swift:726`
- **status:** UNVERIFIED

**What the auditor claims**

RootView wires `handleOpenURL` to BOTH `.onOpenURL` (line 92 — the externally-reachable custom-scheme channel, `xertfitness` is registered in Info.plist CFBundleURLTypes lines 19-31) and the trusted ASWebAuthenticationSession callback channel (`.xertCheckoutCallback`, line 136). The handler cannot tell the two apart, so it acts on attacker-supplied checkout results with full trust. `CheckoutDeepLink.callback` only validates the *shape* of `checkout_session_id` (regex `^cs_(?:test|live)_[A-Za-z0-9]+$`, CheckoutDeepLink.swift:33) — it does not check that the session ID was ever issued to this device. Worse, `PendingCheckoutStore.resolve` (PendingCheckoutStore.swift:62-72) *manufactures and persists* a brand-new PendingCheckout from the callback-supplied ID when none is stored, so the forged value survives in UserDefaults for `maximumAge` = 24 hours.

**Claimed failure scenario**

Victim is signed in (the normal state). A malicious app calls `UIApplication.open(URL(string: "xertfitness://checkout?status=success&checkout_session_id=cs_live_AAAAAAAAAAAAAAAAAAAA")!)`, or a web page links to the same URL. XERT foregrounds and: (1) shows the alert "Payment received — Your payment is being confirmed. Credits and purchase history are refreshing now." (CheckoutDeepLink.swift:19-21); (2) `store.reconcileCheckout(callbackSessionID: "cs_live_AAAA...")` calls `PendingCheckoutStore.resolve`, which finds nothing stored, so it builds and `save()`s a PendingCheckout carrying the attacker's session ID and sets `isCheckoutConfirmationPending = true`; (3) `CheckoutReconciliation.settlement` never finds an order with that `stripe_checkout_session_id`, so it returns `.pending` forever and the record is never cleared. For the next 24 hours BookingView permanently shows "Purchase confirmation is taking longer than usual." (BookingView.swift:163-166) plus a dock attention badge, and every foreground runs `reconcilePendingCheckout` -> the 4-step retry loop (0s/2s/3s/5s, CheckoutDeepLink.swift:72), burning 8 authenticated network round-trips per app launch. The mirror-image link `xertfitness://checkout?status=cancelled` hits the `else` branch and calls `store.cancelPendingCheckout()` -> `PendingCheckoutStore.clear()`, silently discarding a *genuine* in-flight Stripe checkout the member is waiting on. If the victim is signed out, `openMemberRoute(.purchaseConfirmation)` returns false and drops them on the sign-in screen while the spoofed "Payment received" alert is on screen — a ready-made credential-phishing setup.

**Quoted evidence (verify this exists verbatim)**

```
    private func handleOpenURL(_ url: URL) {
        if let callback = CheckoutDeepLink.callback(from: url) {
            checkoutReturnStatus = callback.status
            let canReconcile = openMemberRoute(.purchaseConfirmation, source: .checkout)
            Task {
                if callback.status == .success {
                    if canReconcile {
                        await store.reconcileCheckout(
                            callbackSessionID: callback.checkoutSessionID
                        )
                    }
                } else {
                    store.cancelPendingCheckout()
                    await store.refresh()
                }
            }
            return
        }
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Stop treating the external URL channel as a checkout callback. Split `handleOpenURL` into two entry points: the `.xertCheckoutCallback` notification (posted only from `CheckoutBrowser`'s ASWebAuthenticationSession completion) may drive checkout reconciliation; `.onOpenURL` should route only member/owner navigation and ignore `host == "checkout"`. Additionally, bind the callback to a locally-issued value: have `XertStore.checkoutURL(for:attemptID:)` record the `checkout_session_id` it received from `/api/checkout` and make `PendingCheckoutStore.resolve` accept a callback session ID only if it equals a stored one — never create a pending checkout out of an inbound ID (delete the `recovered`/`save` branch at PendingCheckoutStore.swift:65-71). Finally, do not show the "Payment received" alert until the server-side settlement is actually `.confirmed`.

---

### 8. Open event editor flips to the create branch when `editing` is cleared underneath it, and the same-section navigation path bypasses the unsaved-changes guard

- **id:** `event-editor-prop-desync-creates-duplicate-event`
- **severity (claimed):** high
- **location:** `src/components/admin/EventsManager.jsx:333`
- **status:** UNVERIFIED

**What the auditor claims**

Same shape as the class editor, plus an extra hole. `EventEditor` seeds `form` from `baseline` with `useState(baseline)` (line 37) — the initializer runs once — while `baseline` itself is recomputed via `useMemo` when `event` changes (line 36), and `handleSave` branches on `event?.id` (line 70). The effect at line 333 sets `editing` to `null` while `showEditor` is already `true`, so the same `EventEditor` instance is reconciled rather than remounted (line 478-488, no `key`): `baseline` collapses to `EMPTY_EVENT`, `form` still holds the edited event, `dirty` becomes true for every field, and the save path switches from `updateEvent(event.id, payload, event.updated_at)` (which carries the optimistic-locking `updated_at`) to `createEvent(payload)`. `normalizeEventInput` whitelists columns, so the insert succeeds instead of conflicting. The unsaved-changes protection does not help: `EventsManager` does pass `onDirtyChange={setHasUnsavedChanges}`, but `AdminCommandCentre.setSection` short-circuits on `nextSection === section` and navigates immediately, never consulting `hasUnsavedChanges`.

**Claimed failure scenario**

Admin clicks Edit on "Gold Coast Marathon", corrects the event date, then presses Ctrl+K and selects the quick action "Add an event". `setSection('events', { action: 'create' })` sees the section is already `events`, so it skips the `hasUnsavedChanges` check entirely and navigates to /admin/events?action=create. The effect at line 333 sets `editing = null`; the heading changes to "New Event" and "Unsaved changes" appears, but every field still shows the marathon's data with the corrected date. Clicking Save runs `createEvent(payload)` — a second "Gold Coast Marathon" row is inserted into the public event calendar with the corrected date, while the original row keeps the wrong date and the optimistic-locking check on `updated_at` is never performed.

**Quoted evidence (verify this exists verbatim)**

```
// line 36 — baseline recomputes from the prop, but form was seeded once
  const baseline = useMemo(() => eventEditorForm(event), [event]);
  const [form, setForm] = useState(baseline);

// line 70 — create/update chosen from the prop
      if (event?.id) await updateEvent(event.id, payload, event.updated_at);
      else await createEvent(payload);

// line 333 — clears the prop under the open editor
  useEffect(() => {
    if (initialAction !== 'create') return;
    setEditing(null);
    setShowEditor(true);
    onIntentHandled?.();
  }, [initialAction, onIntentHandled]);
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Render `<EventEditor key={editing?.id ?? 'new'} ... />` so a subject change remounts the editor with a matching `form` and `baseline`, and guard the intent effect with `if (initialAction !== 'create' || showEditor) return;`. Separately, in `AdminCommandCentre.setSection`, run the `hasUnsavedChanges` check before the `nextSection === section` fast path so a same-section deep link cannot navigate past an open dirty editor.

---

### 9. MemberDrawer's detail fetch has no in-flight guard and the drawer is reused across members, so one member's private record can render under another member's header

- **id:** `member-drawer-unguarded-detail-fetch`
- **severity (claimed):** high
- **location:** `src/components/admin/MembersManager.jsx:47`
- **status:** UNVERIFIED

**What the auditor claims**

`loadDetail` fires `adminMemberDetail(member.id)` and writes the result straight into state with `.then(setDetail)` — there is no request-id, no `active` flag, and the `useEffect` that calls it returns no cleanup. Every other async path in this file is guarded this way (the members-list effect at line 691, the follow-up effect at 716, and the `initialMemberId` effect at 749 all use `let active = true` plus a cleanup), so this one is the outlier. The drawer is also rendered without a `key` (line 913-919), so when `viewing` changes from member A to member B the SAME `MemberDrawer` instance is reused and only `member.id` changes — `loadDetail` re-runs but A's earlier in-flight promise is still live and will call `setDetail` whenever it lands. `viewing` can change while the drawer is open: the drawer's backdrop blocks the list underneath, but AdminLayout's ⌘K handler is on `window` and stays live, and CommandPalette's member results call `run('gym-members', { member: m.id })`, which drives `initialMemberId` and the effect at line 749 → `setViewing(result.rows[0])`.

**Claimed failure scenario**

Admin opens member A (Jane) in the drawer; `adminMemberDetail(A)` is slow. Before it returns they press Ctrl+K, type a name, and pick member B (Tom). `setViewing(B)` re-renders the same drawer: header now reads Tom / tom@…, `member.id` is B, and a fetch for B starts. B's fetch returns first and paints Tom's record; A's fetch then resolves and overwrites it with `setDetail(Jane's detail)`. The drawer now shows Tom's name and email above JANE's private member notices, staff notes, credit batches, class bookings and purchase history. Worse, the action handlers still use the props: clicking the archive button on a note rendered from Jane's `detail.notes` calls `adminSetMemberNoteArchived(janeNote.id, true)` while the admin believes they are editing Tom's record, and `loadDetail()` then refetches Tom's notes so the archived note simply disappears and the mistake looks like success.

**Quoted evidence (verify this exists verbatim)**

```
  const loadDetail = () => {
    setDetail(null);
    setDetailError('');
    adminMemberDetail(member.id)
      .then(setDetail)
      .catch(e => setDetailError(e.message || 'Check member detail permissions.'));
  };

  useEffect(() => { loadDetail(); }, [member.id]);
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Give the drawer a subject-scoped identity and guard the fetch. Render `<MemberDrawer key={viewing.id} member={viewing} ... />` so a member switch remounts with clean state, and rewrite `loadDetail` with the same monotonic guard used elsewhere in the file — capture `const requestId = ++requestIdRef.current` (or a `let active` closed over by a cleanup-returning `useEffect`) and drop the response unless `requestId === requestIdRef.current && member.id === requestedId`.

---

### 10. Free-text health information is collected from the public with only a 'consent to contact' tick, and neither the DB guard nor the Privacy Policy treats it as sensitive information

- **id:** `sensitive-health-info-no-app33-consent`
- **severity (claimed):** high
- **location:** `src/components/public/MemberInterestForm.jsx:207`
- **status:** UNVERIFIED

**What the auditor claims**

The member-interest form collects a free-text 'Any injuries or physical limitations' field, and the PT request form collects 'Training goal' including 'Rehab / return to fitness' plus free-text notes. Under Privacy Act 1988 s6(1), health information is *sensitive information*, and APP 3.3 requires the individual's consent to collect it (consent that is voluntary, informed, current, specific and given by someone with capacity). The only consent captured is `consent_to_contact` - "I consent to XERT Fitness contacting me about my interest and the soft launch" (line 234) - which is consent to be *contacted*, not consent to *collect health information*. The database-level guard (supabase/migrations/20260714004300_public_form_integrity.sql:8, `with check (status = 'new' and consent_to_contact is true)`) enforces exactly that one flag, so the schema has no column recording sensitive-information consent. src/pages/Privacy.jsx never uses the words 'sensitive' or 'health' - it buries this as "information you voluntarily provide about injuries or limitations" in a list alongside suburb and booking history. Meanwhile ios/XertFitnessApp/XertFitnessApp/PrivacyInfo.xcprivacy:96 already declares `NSPrivacyCollectedDataTypeHealth` to Apple, so the app formally admits collecting health data that the privacy policy does not identify as such. The form is also anonymous - there is no age gate beyond a self-selected '16-20' band, so a 16-year-old can disclose a medical condition with no parental consent path.

**Claimed failure scenario**

A prospect completes the form and types "Recovering from L4/L5 disc herniation, on anticoagulants after a 2025 PE, cardiologist cleared me for light load only" into the optional injuries box, then ticks only the required 'consent to contact' box. XERT has now collected sensitive health information without the APP 3.3 consent, stored in `member_interest` indefinitely with no retention trigger, readable by every admin, exported wholesale to unencrypted CSV (see finding csv-formula-injection-lead-export), and never disclosed to the individual as sensitive information. When the planned waiver / pre-exercise screening / personal-best features land on this same pattern, every record collected inherits the same defect at scale.

**Quoted evidence (verify this exists verbatim)**

```
            <FieldLabel htmlFor="member-limitations">Any injuries or physical limitations</FieldLabel>
            <textarea id="member-limitations" name="injuries_or_limitations_optional" value={form.injuries_or_limitations_optional}
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Add a separate, unticked `health_info_consent` checkbox rendered immediately adjacent to the injuries field with specific wording ('I consent to XERT collecting health information about injuries or medical limitations so coaches can train me safely. I understand I can leave this blank.'), persist it as a NOT NULL column, and extend the RLS WITH CHECK to `(injuries_or_limitations_optional is null or health_info_consent is true)` so a health disclosure without consent is rejected at the database. Add a 'Sensitive And Health Information' section to src/pages/Privacy.jsx before the waiver/screening rollout.

---

### 11. Lead table paging and CSV export use a non-unique sort key, so rows are silently skipped or duplicated across pages

- **id:** `lead-pagination-nondeterministic-order`
- **severity (claimed):** high
- **location:** `src/lib/adminData.js:28`
- **status:** UNVERIFIED

**What the auditor claims**

getLeadPage() paginates member_interest / trainer_interest / partner_interest with .range() but orders on created_at alone — no unique tiebreak column. PostgreSQL does not guarantee a stable relative order for rows that tie on the ORDER BY key, and each page is a separate LIMIT/OFFSET query whose plan (top-N heapsort vs full sort) may differ, so tied rows can land in a different position on the page-2 query than they held on the page-1 query. Every other paginated collector in this same file adds the tiebreak explicitly — getCampaignAttributionRows (l.56-57), getClassBookings (l.219-220), getMemberBookingRequests (l.250-251), getAllOrders (l.1091-1092), getBusinessStats (l.1189-1190), adminListMembers (l.717-719), getAdminAuditRecords (l.952-953) — and test/campaign-analytics.test.js:45 and test/admin-orders-query.test.js:5 assert that contract with `assert.match(query, /\.order\('created_at',[\s\S]*\.order\('id'/)`. getLeadPage is the outlier. The damage is not confined to the on-screen table: src/components/admin/LeadTable.jsx:174 drives the CSV export by calling collectLeadPages(targetPage => fetchFn({... pageSize: 100})), so the export walks the same unstable ordering page by page.

**Claimed failure scenario**

member_interest holds 250 leads, 4 of which were inserted in one transaction (a bulk import or a seed) and therefore share an identical created_at value at positions 98-101 of the created_at DESC ordering. The admin clicks CSV. Page 1 (range 0-99) returns those tied rows in one order; page 2 (range 100-199) re-plans and returns them in a different order, so lead X (which was at index 99 on page 1) now sits at index 101 and is fetched again while lead Y (previously index 100) is never returned. collectAdminPages stops as soon as rows.length reaches total=250, so the downloaded CSV contains 250 rows with lead X twice and lead Y missing entirely — no error, no warning. The same reshuffle makes lead Y invisible when the admin pages through the table by hand.

**Quoted evidence (verify this exists verbatim)**

```
async function getLeadPage(table, filters = {}) {
  const pagination = normalizeLeadPage(filters.page, filters.pageSize);
  let query = supabase.from(table).select('*', { count: 'exact' }).order('created_at', { ascending: false });
  if (filters.status) query = query.eq('status', filters.status);
  const search = normalizeLeadSearch(filters.search);
  if (search) query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
  const { data, count, error } = await query.range(pagination.from, pagination.to);
  if (error) throw new Error(error.message);
  return { rows: data || [], total: count || 0, page: pagination.page, pageSize: pagination.pageSize };
}
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Add the unique tiebreak the rest of the file already uses: `.order('created_at', { ascending: false }).order('id', { ascending: false })` on line 28, and extend the existing determinism test (test/campaign-analytics.test.js style) to cover getLeadPage so the contract cannot regress.

---

### 12. PT request paging and CSV export order only on created_at, dropping rows at page boundaries

- **id:** `pt-requests-pagination-nondeterministic-order`
- **severity (claimed):** high
- **location:** `src/lib/adminData.js:299`
- **status:** UNVERIFIED

**What the auditor claims**

getPTRequests() builds its page query with `.order('created_at', { ascending: false })` and then `.range(normalized.from, normalized.to)` (normalizePTRequestFilters computes from/to from page and pageSize in src/lib/ptRequestAnalytics.js:19-20). Like getLeadPage it has no unique secondary sort key, so tied created_at values are free to reorder between the independent per-page queries. This function is the sole source for both the paginated PT operations table and its export: src/components/admin/PTRequestsTable.jsx:118 calls `collectAdminPages(targetPage => getPTRequests({ ..., page: targetPage, pageSize: 100, includeSummary: false }))`, and the resulting rows go straight into downloadCsv. The `total` returned to collectAdminPages is `pageResult.count` (an exact server count), so the loop terminates on row-count parity and never notices that a row was replaced by a duplicate.

**Claimed failure scenario**

An admin filters PT requests to 'requested' with the 90-day range and exports. Two intro-assessment requests submitted by the same automated import share a created_at and sit at indexes 99 and 100 of the 140-row result. Page 1 (range 0-99) returns request A at index 99; page 2 (range 100-199) returns request A again at index 100 and never returns request B. The CSV the coach works from lists request A twice and omits request B, so a paying member's private-training request is never actioned — with no error surfaced anywhere.

**Quoted evidence (verify this exists verbatim)**

```
  const pageQuery = applyFilters(
    supabase.from('private_session_requests').select('*', { count: 'exact' }).order('created_at', { ascending: false })
  ).range(normalized.from, normalized.to);
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Chain `.order('id', { ascending: false })` after the created_at order on line 299 so the sort key is unique. (The three statusCount head-queries on lines 301-304 need no change — they return counts only.)

---

### 13. Public /timetable fetches every class session ever published (no time filter, no limit) and renders long-past classes first with live "Request spot" buttons

- **id:** `public-timetable-unbounded-and-past-sessions`
- **severity (claimed):** high
- **location:** `src/lib/adminData.js:116`
- **status:** UNVERIFIED

**What the auditor claims**

getClassSessions(true) is the sole data source for the public /timetable route. It issues select('*') on class_sessions ordered by start_time ASC with no start_time predicate, no .range(), and no .limit(). SoftLaunchTimetable renders every returned row unfiltered. The member-facing booking path does NOT have this problem — the sessions_with_availability() RPC (src/supabase/booking_schema.sql:843) explicitly filters `s.start_time > now()`, and the waitlist migration repeats that guard (supabase/migrations/20260714004100_waitlist_fifo_promotion.sql:114). So the same catalogue is correctly bounded on /booking and completely unbounded on /timetable. There is no database guard: grep of supabase/migrations and src/supabase finds no start_time predicate on class_bookings, and the RLS policy public_read_published_class_sessions (src/supabase/rls_policies.sql:119-121) only checks `public_visible = true and status = 'published'`. The public insert policy public_insert_class_bookings (rls_policies.sql:85-87) only checks `status = 'requested' and consent_to_contact is true`, so a request against a finished class is accepted.

**Claimed failure scenario**

Admin uses the Repeat Class tool (src/components/admin/ClassCalendarAdmin.jsx:386-434, up to 26 copies per press) to publish a term of classes. Six months later class_sessions holds ~800 published rows. An anonymous visitor opens /timetable: the browser downloads all ~800 full rows (every column, including description), and because the sort is ascending the page opens on classes from six months ago. Each of those expired cards still renders the enabled `Request spot` button (SoftLaunchTimetable.jsx:79-83) whenever settings.bookings_enabled is true, so the visitor submits a booking request for a class that already happened; nothing in the client, the RLS policy, or any trigger rejects it and it lands in the admin booking queue as a live 'requested' row.

**Quoted evidence (verify this exists verbatim)**

```
export async function getClassSessions(publicOnly = false) {
  let query = supabase.from('class_sessions').select('*').order('start_time', { ascending: true });
  if (publicOnly) query = query.eq('public_visible', true).eq('status', 'published');
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Give getClassSessions a bounded window when publicOnly is true — e.g. `.gte('start_time', new Date().toISOString())` plus an explicit `.limit(...)` — mirroring the `s.start_time > now()` guard already in sessions_with_availability(). Additionally add a server-side guard (CHECK/trigger or a SECURITY DEFINER insert function) so a class_bookings row cannot be created against a class_session whose start_time is in the past.

---

### 14. Account profile form is reset from `profile` on every auth event, silently discarding the member's in-progress contact edits

- **id:** `account-profile-form-reset-on-token-refresh`
- **severity (claimed):** high
- **location:** `src/pages/Account.jsx:138`
- **status:** UNVERIFIED

**What the auditor claims**

The effect at line 138 unconditionally overwrites `profileForm` whenever the `profile` object identity changes, with no check for `editingProfile`. `profile` gets a brand-new object identity on every auth event, not just on sign-in: `SupabaseAuthProvider.applySession` is invoked from `onAuthStateChange` for EVERY event (SupabaseAuthContext.jsx:84-87) and always calls `loadProfile`, which ends in `setProfile(data || null)` with a freshly deserialized row (SupabaseAuthContext.jsx:60). `supabase.js` calls `createClient` with no options, so `autoRefreshToken` is on: @supabase/auth-js runs a 30s auto-refresh ticker and also re-checks on `visibilitychange`, emitting `TOKEN_REFRESHED` whenever the access token is inside the 90s expiry margin — i.e. at least once per JWT lifetime (1 hour by default) and again whenever the tab is refocused near expiry. Because `profileForm.phone` is also what the read-only view renders (line 555), the reset is invisible: nothing tells the member their typed value was replaced.

**Claimed failure scenario**

A member on /account clicks "Edit", types a new mobile number `0412 000 111` over the stored `0400 111 222`, then gets distracted (or the hour-long access token simply rolls over, or they switch tabs and come back). auth-js refreshes the token and emits TOKEN_REFRESHED → `applySession` → `loadProfile` → `setProfile(newObject)` → the effect at line 138 runs and rewrites `profileForm` to `{ full_name: stored, phone: '0400 111 222' }` while the form is still open. The member sees the old number reappear (or does not look) and clicks "Save details": `handleProfileSave` posts `profileForm`, i.e. the OLD phone number, and the app shows the success toast "Account details saved — Your contact details are up to date." The edit is lost and reported as saved.

**Quoted evidence (verify this exists verbatim)**

```
  useEffect(() => {
    setProfileForm({
      full_name: profile?.full_name || '',
      phone: profile?.phone || ''
    });
  }, [profile]);
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Only seed the form from `profile` when the member is not editing, and key the sync on identity rather than object reference: `useEffect(() => { if (editingProfile) return; setProfileForm({ full_name: profile?.full_name || '', phone: profile?.phone || '' }); }, [editingProfile, profile?.full_name, profile?.phone]);`. The Cancel button already re-seeds from `profile` explicitly (line 520-526), so nothing else depends on the unconditional sync.

---

### 15. Migration 20260714007000 wrapped auth.uid()/is_admin() for only 7 policies; the lead, legacy-booking and class_sessions admin policies still call public.is_admin() once per scanned row

- **id:** `rls-is-admin-not-wrapped-in-scalar-subquery`
- **severity (claimed):** high
- **location:** `src/supabase/rls_policies.sql:58`
- **status:** UNVERIFIED

**What the auditor claims**

20260714007000_rls_policy_performance.sql states its goal as "Evaluate request identity/admin checks once per statement instead of once per scanned row across the core member and admin data paths" and correctly rewrites 11 policies on profiles, orders, member_announcement_receipts, credit_batches, session_bookings, member_event_goals and private_session_requests to use `(select public.is_admin())` / `(select auth.uid())`. It never touches the `admin_all_*` policies, which live only in src/supabase/rls_policies.sql (and its rls_hardening.sql twin) and still use a bare `public.is_admin()`. public.is_admin() is declared `language sql security definer stable` (src/supabase/booking_schema.sql:43-46) and takes no arguments, so Postgres will not constant-fold it — it is re-executed as a per-row filter (each execution being `select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')`) instead of once as an InitPlan. Affected: admin_all_member_interest (line 58), admin_all_trainer_interest (67), admin_all_partner_interest (77), admin_all_class_bookings (88), admin_all_private_session_requests (107), admin_all_class_sessions (122), admin_update/insert_admin_settings (137-140). The regression also reappears in a migration written AFTER 007000: member_announcements_select_live_or_admin (supabase/migrations/20260714015000_class_cancellation_notifications.sql:66-70) correctly writes `(select auth.uid())` inside its EXISTS but leaves the leading disjunct as bare `public.is_admin()`.

**Claimed failure scenario**

An admin opens the Members section. AdminLayout's badge effect calls getAdminBadgeCounts (src/lib/adminData.js:1229-1236), which runs `member_interest.select('id', { count: 'exact', head: true }).eq('status','new')`. With 5,000 unactioned leads, PostgREST's exact count scans all 5,000 matching rows and the admin_all_member_interest USING clause fires public.is_admin() 5,000 times — 5,000 index lookups on public.profiles for one badge number. The same badge call repeats the pattern against class_bookings and private_session_requests, and it runs every 60 s (ADMIN_BADGE_REFRESH_INTERVAL_MS) plus on every section change, so the counter query cost scales linearly with lead volume instead of being O(1) in identity checks.

**Quoted evidence (verify this exists verbatim)**

```
create policy "admin_all_member_interest" on public.member_interest
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Extend the 20260714007000 treatment with a follow-up migration that drops and recreates every remaining policy using `(select public.is_admin())` instead of `public.is_admin()` — admin_all_member_interest, admin_all_trainer_interest, admin_all_partner_interest, admin_all_class_bookings, admin_all_private_session_requests, admin_all_class_sessions, admin_update_admin_settings, admin_insert_admin_settings and member_announcements_select_live_or_admin — and update src/supabase/rls_policies.sql / rls_hardening.sql so a fresh install does not reintroduce the unwrapped form.

---

### 16. Audit tables store member/lead name, email and staff notes behind an unconditional immutability trigger, so that PII can never be corrected or destroyed by any role

- **id:** `immutable-audit-pii-no-erasure-path`
- **severity (claimed):** high
- **location:** `supabase/migrations/20260714011000_lead_pipeline_audit.sql:41`
- **status:** UNVERIFIED

**What the auditor claims**

`admin_lead_changes` denormalises `subject_label` (full name) and `subject_email` into every audit row (lines 12-13, populated by the trigger at lines 88-93), and `admin_request_status_changes` does the same plus `previous_admin_notes` / `new_admin_notes` (supabase/migrations/20260714008000_admin_request_status_audit.sql:12-13, 150-155). Both tables carry a `BEFORE UPDATE OR DELETE ... FOR EACH ROW` trigger whose function body is nothing but `raise exception`. Row triggers fire for every role, including `service_role`; suppressing them needs `session_replication_role = replica`, which requires superuser and is not available to the Supabase service role, and `ALTER TABLE ... DISABLE TRIGGER` requires table ownership. `api/delete-account.js` therefore cannot reach these rows, and neither can any admin RPC - there is no delete path in the entire codebase. APP 11.2 requires destruction or de-identification of personal information once it is no longer needed for any permitted purpose, and APP 13 requires correction; both are structurally impossible here. The scope is unbounded: there is no expiry column, no archival job, and no retention window anywhere in supabase/migrations/.

**Claimed failure scenario**

Jane Smith submits a PT request, an admin declines it and records `admin_notes = 'Declined - disclosed ongoing shoulder rehab and BP medication'`. The trigger writes `subject_label='Jane Smith'`, `subject_email='jane@example.com'` and that note into `admin_request_status_changes`. Jane later deletes her account: `deleteMemberAccount` removes her profile, bookings, credits and `private_session_requests` row, so the source record is gone - but the audit row with her name, email and a staff note about her medication survives forever. She then writes in under APP 12/13 asking XERT to delete or correct it. Any `DELETE FROM public.admin_request_status_changes WHERE ...` - run by the service role, by an admin, or by the owner in the Supabase SQL editor - aborts with `REQUEST_AUDIT_IMMUTABLE`. src/pages/Privacy.jsx:36 promises "You may also request access to, correction of or deletion of personal information by contacting XERT", a promise the schema makes unkeepable.

**Quoted evidence (verify this exists verbatim)**

```
drop trigger if exists admin_lead_changes_immutable on public.admin_lead_changes;
create trigger admin_lead_changes_immutable
  before update or delete on public.admin_lead_changes
  for each row execute function public.guard_admin_lead_change();
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Keep the immutability trigger for tamper-evidence but add a narrow, audited redaction path: a SECURITY DEFINER function that sets `session_replication_role` is not available, so instead make the guard function conditional - allow an UPDATE that only nulls `subject_label`, `subject_email` and the `*_admin_notes` columns (raise on any other column change and on all DELETEs), and expose it as `admin_redact_audit_subject(p_type, p_subject_email)` gated on `public.is_admin()`. Call it from `deleteMemberAccount` so account deletion de-identifies audit rows instead of orphaning them. Add a retention cutoff (e.g. auto-redact `subject_email`/`subject_label` older than 7 years).

---


## MEDIUM

### 17. Broadcast announcement push gets exactly one attempt; any failure or 60s timeout silently loses the notification forever

- **id:** `announcement-push-single-shot-no-retry`
- **severity (claimed):** medium
- **location:** `api/admin-publish-announcement.js:180`
- **status:** UNVERIFIED

**What the auditor claims**

Push fan-out only happens when the announcement has never been published (!existing?.published_at), and any error is swallowed into a cosmetic counter. Once the row is written with published_at set, republishing takes the false branch and no further push is possible: the only other push actions are notify_class_cancellation (requires source_kind 'class_cancellation', line 71) and notify_targeted_announcement (requires source_kind 'member_direct', line 103), and a broadcast announcement has source_kind NULL, so neither applies. The fan-out itself is a serial loop of 25-wide batches over every enabled subscription (api/apns.js:150-165) with delivery rows written only after the entire loop finishes (saveDeliveryResults, api/apns.js:167), inside a function capped by 'export const config = { maxDuration: 60 }' (line 5). So a timeout mid-fan-out, an http2.connect failure to APNs, or a single failing insert in saveDeliveryResults discards all results and leaves no audit trail, while the announcement is already durably published.

**Claimed failure scenario**

Owner publishes 'Gym closed Monday - flood damage' to 800 subscribed devices. APNs delivers ~400 pushes, then the 60s maxDuration kills the function; saveDeliveryResults never runs so push_notification_deliveries stays empty and the HTTP response never returns. The owner sees a network error and clicks Publish again; existing.published_at is now set, so the handler returns {push:{attempted:0,delivered:0,failed:0}} and sends nothing. 400 members never receive the closure notice, the admin console shows push_delivered_count 0, and there is no API action that can resend it.

**Quoted evidence (verify this exists verbatim)**

```
    let push = { configured: true, attempted: 0, delivered: 0, failed: 0 };
    if (!existing?.published_at) {
      try {
        push = await sendMemberAnnouncementPushes({ admin, announcement: result.data });
      } catch {
        push = { configured: true, attempted: 0, delivered: 0, failed: 1 };
      }
    }
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Persist delivery rows per batch inside sendMemberAnnouncementPushes rather than once at the end, and drive the send from those rows so it is resumable. Add an explicit resend action for audience 'all' announcements that is gated on 'no delivery row exists for this subscription' (the same dedup shape already used by notifyClassCancellation via summarizePreviousClassAlertPushes) instead of gating on published_at, and surface the swallowed error to the caller instead of reporting failed:1 with no reason.

---

### 18. Announcement push fan-out has no audience check, so a targeted private notice can be delivered to every enrolled device

- **id:** `apns-fanout-ignores-targeted-audience`
- **severity (claimed):** medium
- **location:** `api/apns.js:92`
- **status:** UNVERIFIED

**What the auditor claims**

sendMemberAnnouncementPushes() decides its recipient set solely from the caller-supplied `targetUserIds` argument; when it is null, loadSubscriptions() pages over public.push_subscriptions with no user filter at all and the notice's title and body are pushed to every enabled device. The announcement row it is handed always carries the authoritative `audience` column ('all' or 'targeted', constrained by member_announcements_audience_check in supabase/migrations/20260714015000_class_cancellation_notifications.sql:16), and the caller in api/admin-publish-announcement.js:182 selects `*`, so the value is present and simply ignored.

The two callers that handle private notices do pass targets (notifyClassCancellation and notifyTargetedAnnouncement both read member_announcement_targets first, and the latter additionally rejects recipient counts != 1), but the generic publish branch at api/admin-publish-announcement.js:182 passes none. That branch accepts any UUID in `body.id` and fires whenever `!existing?.published_at`. Targeted rows normally have published_at set at creation, but public.admin_archive_member_announcement (src/supabase/shared_admin_optimistic_locking_upgrade.sql:60-70) sets `published_at = null` on archive and the restore branch does not restore it, so a restored targeted notice sits with archived_at null and published_at null -- exactly the state that makes the unfiltered fan-out fire. The RLS policy still hides the row in-app, but the APNs alert payload built by buildAnnouncementPush() contains the full title and body.

**Claimed failure scenario**

An admin archives then restores a private notice created by admin_send_member_notice (audience='targeted', body e.g. "Your direct debit failed - your membership is suspended until Friday"), leaving archived_at null and published_at null. They then POST /api/admin-publish-announcement with {"id":"<that uuid>","expected_updated_at":"...","announcement":{...}}. existing.published_at is null, so line 182 calls sendMemberAnnouncementPushes with targetUserIds omitted; loadSubscriptions(admin, null) returns every enabled push_subscriptions row and the one member's private message is pushed as a banner to every XERT member's phone.

**Quoted evidence (verify this exists verbatim)**

```
export async function loadSubscriptions(admin, targetUserIds = null) {
  const rows = [];
  const pageSize = 500;
  const userIds = Array.isArray(targetUserIds)
    ? [...new Set(targetUserIds.filter(Boolean))]
    : null;
  if (userIds && userIds.length === 0) return rows;
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Make sendMemberAnnouncementPushes fail closed on the announcement's own audience: at the top of the function, `if (announcement?.audience === 'targeted' && !Array.isArray(targetUserIds)) throw new Error('TARGETED_ANNOUNCEMENT_REQUIRES_RECIPIENTS');`. Additionally have api/admin-publish-announcement.js's generic publish branch reject a body.id whose stored row has audience !== 'all', mirroring the audience filter the admin UI already applies in src/lib/adminData.js:601.

---

### 19. The Stripe idempotency key is stable but the request body embeds a wall-clock expires_at, so every genuine checkout retry hard-fails with idempotency_error

- **id:** `checkout-idempotency-key-parameter-drift`
- **severity (claimed):** medium
- **location:** `api/checkout.js:403`
- **status:** UNVERIFIED

**What the auditor claims**

`checkoutIdempotencyKey` is deliberately stable across retries (member id, product id, return target and a client-persisted attempt id), and the comment above it at lines 239-244 states that replaying the same request returns Stripe's original Checkout Session 'including after a function stops between Stripe creation and the pending-order write.' But `buildCheckoutSessionParameters` is called at line 691 with no `now` argument, so `expires_at` defaults to `Date.now()` and changes on every retry. Stripe returns the saved response for a reused idempotency key only when the request parameters are identical; a mismatch produces a 400 `idempotency_error` instead. So the retry path the key exists to protect is exactly the path that can never work — any retry more than one second after the original send fails. Both clients keep the attempt id across failures: the web client only calls `clearCheckoutAttemptID` on success (src/lib/bookingData.js:56) with a 20-minute TTL, and iOS holds it in `@State` and clears it only on success (ios/.../Views/BookingView.swift:219-223). test/checkout-product.test.js:550 asserts the time-derived value without exercising a replay.

**Claimed failure scenario**

A member buys a pack; `stripe.checkout.sessions.create` succeeds but the pending-order upsert fails on a transient Supabase error, so the handler expires the session and returns 503 'Checkout could not be recorded. No payment was taken; please try again.' The member clicks Try again ten seconds later. `getOrCreateCheckoutAttemptID` returns the same attempt id, so the idempotency key is identical, but `expires_at` is now ten seconds larger. Stripe rejects the request with idempotency_error, the generic catch returns 500 'Checkout could not be started. Please try again.', and every further attempt fails identically for the next 20 minutes on web — and until the view is torn down on iOS. `findReusableCheckout` cannot rescue it because no pending order was ever written.

**Quoted evidence (verify this exists verbatim)**

```
    // Stripe accepts 30 minutes to 24 hours. Five minutes of margin protects
    // against transit time and clock skew at the lower boundary.
    expires_at: Math.floor(nowMilliseconds / 1000) + 35 * 60,
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Derive `expires_at` deterministically from the same value that scopes the idempotency key rather than from wall-clock time — e.g. quantise it (`Math.floor(now / 1000 / 1800) * 1800 + 35 * 60`) or, more simply, drop `expires_at` from the create call and rely on Stripe's default 24-hour expiry plus the existing `REUSABLE_CHECKOUT_WINDOW_MS` reuse logic. Alternatively, catch Stripe's `idempotency_error` and mint a fresh attempt id for that one retry so the member is never locked out.

---

### 20. Account deletion never touches class_bookings, so a member's name, email, phone and free-text notes survive a deletion the UI says removes their bookings

- **id:** `class-bookings-survive-account-deletion`
- **severity (claimed):** medium
- **location:** `api/delete-account.js:17`
- **status:** UNVERIFIED

**What the auditor claims**

`deleteMemberAccount` touches exactly three things: it nulls `orders.email`, deletes `private_session_requests` by `user_id`, and deletes the auth user (which cascades to profiles, credit_batches, session_bookings, member_event_goals, push_subscriptions, admin_member_notes and announcement receipts - those are correctly covered). It never touches `public.class_bookings`, the legacy request-to-book table. That table has no `user_id` column at all (confirmed: src/supabase/rls_policies.sql:81-90 and supabase/migrations/20260714004300_public_form_integrity.sql:22-26 define only public-insert and admin-all policies, with no ownership column anywhere in supabase/migrations/ or src/supabase/), so there is no key by which deletion could find those rows even if it tried. src/components/public/BookingRequestForm.jsx:69-91 writes `full_name`, `email`, `phone`, `training_level` and free-text `notes` into it, and that form is reachable from src/pages/SoftLaunchTimetable.jsx:230 by signed-in members and anonymous visitors alike. There is no retention or purge job for the table anywhere in the repo.

**Claimed failure scenario**

A member requests a spot for XERT Foundation on the soft-launch timetable, typing "knee gives out on box jumps, please scale" into Notes with their name, email and mobile. They later register an account and then delete it. The confirmation dialog told them "Your profile, credits, bookings and training goals will be removed" and src/pages/Privacy.jsx:29 repeats "Account deletion removes your member profile, credits, bookings and training goals". `deleteMemberAccount` runs, the toast says "Your XERT member account has been permanently removed" - and their name, email, mobile and injury note remain in `class_bookings` indefinitely, visible in the admin Booking Requests table and exportable to CSV. The statement shown at the moment of consent is false.

**Quoted evidence (verify this exists verbatim)**

```
export async function deleteMemberAccount(admin, userId) {
  const { error: orderError } = await admin
    .from('orders')
    .update({ email: null })
    .eq('user_id', userId);
  if (orderError) throw orderError;
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Either (a) add `user_id uuid references auth.users(id) on delete set null default auth.uid()` to `class_bookings` mirroring what migration 20260714004200 already did for `private_session_requests` (including the same conservative email backfill), then delete or anonymise those rows in `deleteMemberAccount`; or (b) match by normalised email inside `deleteMemberAccount` before calling `deleteUser`. Whichever is chosen, correct the dialog copy at src/pages/Account.jsx:932 and Privacy.jsx:29 so it accurately lists what survives.

---

### 21. Account deletion destroys data across three unrelated statements with no transaction or rollback, and returns the raw upstream error to the caller

- **id:** `non-atomic-account-deletion`
- **severity (claimed):** medium
- **location:** `api/delete-account.js:36`
- **status:** UNVERIFIED

**What the auditor claims**

`deleteMemberAccount` performs three independent round trips against different subsystems - a PostgREST UPDATE on `orders`, a PostgREST DELETE on `private_session_requests`, and a GoTrue admin `deleteUser` - with no transaction, no compensating action and no idempotency marker. Each is irreversible on its own. If the last call fails (GoTrue 5xx, rate limit, network timeout - all routine), the first two have already committed and there is no path back. The failure surfaces as a bare 500 to the client, which src/pages/Account.jsx:282 renders as "Could not delete account" with `error.message` - so the member is told the deletion did not happen when in fact part of it did. Line 67 also forwards `error.message` verbatim, unlike every other endpoint in api/ which maps errors to fixed strings and logs internals behind a request id (compare api/admin-refund-order.js:166-181 and api/checkout.js:738-746); a PostgREST/Postgres failure here leaks table, column and constraint names to the browser. The unit test at test/delete-account.test.js only asserts the happy-path call ordering; nothing covers a `deleteUser` failure after the earlier mutations succeeded.

**Claimed failure scenario**

A member taps Delete account. `orders.email` is nulled for their three past purchases and their two `private_session_requests` rows (contact details plus coaching notes) are deleted. `admin.auth.admin.deleteUser` then returns a 503 because GoTrue is briefly unavailable. The handler throws, returns 500, and the toast says "Could not delete account". The member still has a working, signed-in account - but their PT request history is permanently gone with no way to restore it, their order receipts have lost the email address, and re-pressing the button re-runs the same partial work. Under APP 10 the remaining order records are now less accurate than before, and the member has no way to know a partial deletion occurred.

**Quoted evidence (verify this exists verbatim)**

```
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) throw deleteError;
}
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Reorder so the irreversible auth delete happens first and let the FK cascades do the work, or move the whole sequence into a single SECURITY DEFINER SQL function invoked over one connection so it commits or rolls back atomically. At minimum, delete `private_session_requests` and null `orders.email` only after `deleteUser` returns success. Replace line 67 with a fixed message plus `createRequestTrace` logging (as api/checkout.js already does) so upstream error text never reaches the browser, and add a test that asserts no member data is destroyed when `deleteUser` errors.

---

### 22. Push registration rebinds any device token to the caller with no ownership check

- **id:** `push-subscription-token-rebind`
- **severity (claimed):** medium
- **location:** `api/push-subscription.js:42`
- **status:** UNVERIFIED

**What the auditor claims**

The register path upserts on the constraint 'push_subscriptions_device_environment_key unique (device_token, environment)' (supabase/migrations/20260714009000_member_push_notifications.sql:11) and rewrites user_id to the caller. Nothing verifies the caller controls that device: normalizePushSubscription only checks the token is 64-200 hex characters, and there is no APNs round-trip challenge, no previous-owner check, and no per-account device cap. The table is RLS-locked and revoked from anon/authenticated, so this endpoint is the sole writer and therefore the sole place the check can live. Note the asymmetry: the unregister branch on lines 31-40 correctly scopes with .eq('user_id', user.id), so the omission on the register branch is inconsistent rather than deliberate. Consequences of a rebind are one-way silencing plus misdirected private content: sendMemberAnnouncementPushes selects rows by user_id (api/apns.js:112), and admin_send_member_notice bodies are private per-member messages (supabase/migrations/20260714021000_targeted_member_notices.sql).

**Claimed failure scenario**

Attacker holds a valid member session and knows victim device token T (leaked from a device log, an analytics SDK, a shared/refurbished handset, or a prior install). Attacker POSTs /api/push-subscription {action:'register', device_token:T, environment:'production'}. The unique (device_token, environment) row's user_id flips to the attacker. The victim's class is then cancelled: create_class_cancellation_notice targets the victim, notifyClassCancellation loads subscriptions for the victim's user_id, finds none, and the victim never gets the alert and shows up to a cancelled class. Meanwhile the attacker's own private admin notice (e.g. an account or payment message) is pushed to the victim's lock screen. The victim's iOS app cannot repair it: its unregister call is filtered by its own user_id and matches nothing.

**Quoted evidence (verify this exists verbatim)**

```
    const { error } = await admin.from('push_subscriptions').upsert({
      user_id: user.id,
      device_token: subscription.deviceToken,
      environment: subscription.environment,
      enabled: true,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: 'device_token,environment' });
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Before upserting, select the existing row for (device_token, environment); if it exists with a different user_id, either reject with 409 or require proof of device control (e.g. a nonce this server pushed to that token and the app echoed back). At minimum scope the write with .eq('user_id', user.id) on update and insert only when no row exists, and add a per-account device cap (e.g. 10 enabled subscriptions) so registration cannot be used to inflate the broadcast fan-out.

---

### 23. Automatic refund reconciliation depends on charge.refunds, an optional sub-list that webhook payloads cannot expand, so credits are not revoked when the list is absent

- **id:** `charge-refunds-sublist-not-guaranteed`
- **severity (claimed):** medium
- **location:** `api/stripe-webhook.js:203`
- **status:** UNVERIFIED

**What the auditor claims**

`stripeRefundForEvent` obtains the refund id exclusively from `charge.refunds.data` on the `charge.refunded` event object. In the pinned Stripe SDK (22.3.0, API version 2026-06-24.dahlia) `Charge.refunds` is declared `refunds?: ApiList<Refund> | null` — it is one of only four optional top-level properties on the Charge interface, while siblings such as `refunded: boolean` and `receipt_url` are required — i.e. it is an expansion-dependent sub-list. Webhook event objects are delivered as-is and cannot be expanded. When the list is omitted, `refunds` becomes `[]`, `refund` is `undefined`, the full-refund assertion at line 207 still passes (`charge.refunded === true` and `amount_refunded === amount`), and execution reaches the `!refund?.id` branch and throws. Note the code never falls back to `stripe.refunds.list({ payment_intent })`, even though `performAdminRefund` already demonstrates that exact recovery technique at api/admin-refund-order.js:116.

**Claimed failure scenario**

The owner issues a full refund from the Stripe Dashboard instead of from the XERT admin. Stripe delivers charge.refunded with the charge object's `refunds` list omitted. `stripeRefundForEvent` throws 'Full refund data is incomplete or invalid.', `processStripeEvent` marks the ledger row failed and the handler returns 500, so Stripe retries and fails every time. `reconcile_stripe_order_refund` is never called: the order stays status='paid', `stripe_refunds` gets no row, and the member keeps every credit in their batch and can keep booking classes with money that has already been returned to them. The admin retry action re-runs the same code and fails identically; recovery requires the owner to notice the incident and drive a refund through /api/admin-refund-order instead.

**Quoted evidence (verify this exists verbatim)**

```
  const refunds = charge?.refunds?.data || [];
  const refund = refunds
    .filter(item => item?.status === 'succeeded')
    .sort((left, right) => Number(right?.created || 0) - Number(left?.created || 0))[0];
  if (charge?.refunded !== true || charge?.amount_refunded !== charge?.amount) {
    throw new Error('Full refund status is incomplete or invalid.');
  }
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

When `charge.refunds?.data` is missing or yields no succeeded refund, fall back to `await stripe.refunds.list({ payment_intent: paymentIntentId, limit: 100 })` and reuse the existing `matchingFullRefundForOrder` selection logic from api/admin-refund-order.js, which already handles this correctly. Subscribing to `refund.created`/`refund.updated` (which carry the Refund object directly) would remove the dependency entirely; `REQUIRED_WEBHOOK_EVENTS` in api/admin-commerce-health.js should then require them too.

---

### 24. `npm run lint` applies zero rules to all of api/, src/lib/ and scripts/, and does not lint src/App.jsx or src/main.jsx at all

- **id:** `eslint-zero-rules-for-api-and-lib`
- **severity (claimed):** medium
- **location:** `eslint.config.js:9`
- **status:** UNVERIFIED

**What the auditor claims**

eslint.config.js exports exactly one config object, and that object carries a `files` list limited to `src/components/**`, `src/pages/**` and `src/Layout.jsx`. In ESLint 9 flat config a file that matches no config object's `files` gets an empty rule set, so `eslint .` walks it, finds nothing to apply, and exits 0. Verified directly: `npx eslint --print-config api/checkout.js` returns `"rules": {}`, as does `--print-config src/lib/adminData.js` and `--print-config scripts/link-stripe-catalog.mjs`. Verified behaviourally via the ESLint Node API using the project's own config: linting the text `const total = 1;\ntotal = 2;\nconst dupe = { a: 1, a: 2 };\nexport function go(){ return undefinedHelper(dupe, total); }` reports errorCount=0 for filePath api/checkout.js, src/lib/adminData.js and scripts/probe.mjs, and reports NOT-LINTED (no result at all) for src/App.jsx and src/main.jsx. That is the entire serverless surface (12 files holding STRIPE_SECRET_KEY and SUPABASE_SERVICE_ROLE_KEY), the 1615-LOC src/lib/adminData.js, the Stripe operator scripts, and the router. A third clue that this list has drifted: `src/Layout.jsx` on line 12 does not exist (`ls src/Layout.jsx` -> No such file or directory).

**Claimed failure scenario**

A contributor introduces `const stripe = createXertStripeClient(...); stripe = null;` or calls a mistyped helper such as `webhookSigningSecret(process.env)` (singular) in api/stripe-webhook.js. `npm run lint` prints nothing and exits 0, the CI 'Lint' step at .github/workflows/quality.yml:34 goes green, and the defect only surfaces as a TypeError in the deployed webhook — which returns a generic 500 (api/stripe-webhook.js: 'Webhook processing failed.'), so Stripe retries and paid orders silently stop being fulfilled.

**Quoted evidence (verify this exists verbatim)**

```
    files: [
      "src/components/**/*.{js,mjs,cjs,jsx}",
      "src/pages/**/*.{js,mjs,cjs,jsx}",
      "src/Layout.jsx",
    ],
    ignores: ["src/lib/**/*", "src/components/ui/**/*"],
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Add a second config object with no `files` key (or `files: ['**/*.{js,mjs,cjs,jsx}']`) that applies `pluginJs.configs.recommended` repo-wide, with `languageOptions.globals` set to `globals.node` for `api/**` + `scripts/**` and `globals.browser` for `src/**`. Drop the dead `src/Layout.jsx` entry.

---

### 25. The spread-in eslint:recommended and react/recommended rule sets are dead — the trailing `rules` key overwrites both

- **id:** `eslint-recommended-rules-overwritten-by-spread`
- **severity (claimed):** medium
- **location:** `eslint.config.js:15`
- **status:** UNVERIFIED

**What the auditor claims**

Lines 15-16 spread `pluginJs.configs.recommended` and `pluginReact.configs.flat.recommended` into the config object. Both of those objects carry a `rules` property, and so does the object literal itself at line 37 — in JavaScript the last `rules` key wins, so the explicit 9-rule block silently discards every recommended rule. `npx eslint --print-config src/pages/Home.jsx` confirms it: exactly 9 rules resolve, none of them from eslint:recommended or react/recommended. Confirmed behaviourally too — ESLint.lintText on `const total = 1;\ntotal = 2;\nconst dupe = { a: 1, a: 2 };` at filePath src/pages/Broken.jsx and src/components/admin/Broken.jsx both report errorCount=0. So even inside the linted subtree, `no-const-assign`, `no-undef`, `no-dupe-keys`, `no-unreachable`, `no-cond-assign`, `no-fallthrough`, `react/jsx-key` and `react/no-unescaped-entities` never run. The `--quiet` flag in package.json:20 removes the last remaining safety margin: `unused-imports/no-unused-vars` is configured as "warn" (line 43), and `--quiet` suppresses warnings entirely, so of the 9 configured rules only 5 can ever fail a build. Re-running the intended rule sets over the repo via the ESLint API surfaces 17 real `react/no-unescaped-entities` / `react/no-unknown-property` errors that the configured gate reports as clean.

**Claimed failure scenario**

A developer editing src/components/admin/OrdersManager.jsx writes `<tbody>{orders.map(o => <OrderRow order={o} />)}</tbody>` (missing `key`) and, in the same change, a duplicate property in a Supabase filter object such as `{ status: 'paid', status: 'refunded' }`. `npm run lint --quiet` exits 0 and CI is green; the duplicate key silently drops the first filter and the admin sees the wrong order set, while React re-orders rows incorrectly on refresh. `react/jsx-key` and `no-dupe-keys` are both in the rule sets the config appears to enable on lines 15-16.

**Quoted evidence (verify this exists verbatim)**

```
    ...pluginJs.configs.recommended,
    ...pluginReact.configs.flat.recommended,
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Stop spreading whole configs into an object that later redefines `rules`. Compose the array instead — `export default [pluginJs.configs.recommended, pluginReact.configs.flat.recommended, { files: [...], rules: { /* overrides only */ } }]` — and drop `--quiet` from the lint script (or promote `unused-imports/no-unused-vars` to "error") so the one warning-level rule can actually fail.

---

### 26. AdminStore.loadClassRoster never clears or scopes classRoster, so the roll-call screen shows the previous class's members

- **id:** `class-roster-not-scoped-to-session`
- **severity (claimed):** medium
- **location:** `ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift:616`
- **status:** UNVERIFIED

**What the auditor claims**

`loadClassRoster` writes into the shared `classRoster` array only on success, and unlike its siblings `loadEventRoster` (line 848: `eventRoster = []`) and `loadMemberDetail` (line 270: `memberNotes = []`) it does not reset the array first, nor does it record which session the roster belongs to. It also early-returns when `loadingRosterSessionID != nil`, silently skipping the load. `AdminClassRosterView` renders `ForEach(admin.classRoster)` as a *sibling* of the loading branch (not an `else`), and its `.task` seeds the attendance dictionary straight from `admin.classRoster`, so both the roster list and the roll-call state can come from a different class than the one on screen.

**Claimed failure scenario**

Admin opens Class Desk, taps class A (10:00 Strength) and its roster of 8 members loads. They tap back and immediately tap class B (11:00 Engine). `AdminClassRosterView` for B appears; while B's `admin_session_roster` request is in flight the section renders a spinner *and* class A's 8 rows (names, statuses, attendance toggles). If B's request then fails on a flaky connection, `classRoster` is left untouched, so class B's roll-call screen permanently lists class A's members with their names/emails/phones, and `attendance` is keyed by class A's booking IDs. Pressing "Record attendance and complete class" sends class A's booking IDs with class B's session id; the server rejects it with INCOMPLETE_ROLL_CALL, so the admin sees a generic failure with no indication the roster on screen is the wrong class.

**Quoted evidence (verify this exists verbatim)**

```
    func loadClassRoster(session: AuthSession, classSessionID: UUID) async {
        guard loadingRosterSessionID == nil else { return }
        loadingRosterSessionID = classSessionID
        defer { loadingRosterSessionID = nil }
        do {
            classRoster = try await api.adminSessionRoster(session: session, classSessionID: classSessionID)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Clear and scope the roster: set `classRoster = []` and store `loadedRosterSessionID = classSessionID` before awaiting, clear it again in the `catch`, and have `AdminClassRosterView` render rows only when `admin.loadedRosterSessionID == operation.id`. Replace the `loadingRosterSessionID == nil` bail-out with a generation check so a second class's roster request is not silently dropped.

---

### 27. Owner "Members" metric collapses to 1 after opening a member record from search

- **id:** `member-count-reads-filtered-total`
- **severity (claimed):** medium
- **location:** `ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift:85`
- **status:** UNVERIFIED

**What the auditor claims**

`memberCount` reads `total_count` off the first row of `members`. `admin_list_members_page` computes `total_count` as `count(*) over()` across the *filtered* result set (admin_member_directory_upgrade.sql line 49), so it equals the number of rows matching the current filter, not the member base. `resolveOwnerTask(.member:)` calls `api.adminMember(session:id:)`, which invokes the same RPC with `p_user_id: id` and `p_limit: 1` (XertAPI.swift line 577-594) — that row therefore carries `total_count = 1` — and then inserts it at index 0 of `members`. `searchMembers` (line 192) has the same effect with the match count.

**Claimed failure scenario**

Owner has 240 member accounts. They open the Command Centre (refresh loads the 50 most recent joiners), press Cmd-K, type "hawley", and tap a member who joined two years ago and is therefore not in the loaded 50. `resolveOwnerTask` passes the `!members.contains` guard, fetches that one row (`total_count = 1`) and inserts it at `members[0]`. The Overview screen's "Members" metric tile (AdminCommandCentreView.swift line 635) now reads 1, and the Members workspace subtitle (line 735) reads "Search 1 accounts", until a full `refresh()` runs.

**Quoted evidence (verify this exists verbatim)**

```
    var memberCount: Int { members.first?.total_count ?? members.count }
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Store the directory total separately from the row array — e.g. keep `private(set) var memberTotalCount: Int` that is only written by the unfiltered `refresh()` load — and have `resolveOwnerTask`/`searchMembers` leave it untouched. Alternatively have `adminMember(id:)` write into a dedicated `focusedMember` property instead of splicing into `members`.

---

### 28. Sign-out leaves the device subscribed to the previous member's private push notices

- **id:** `signout-leaves-push-subscription-active`
- **severity (claimed):** medium
- **location:** `ios/XertFitnessApp/XertFitnessApp/Store/XertStore.swift:418`
- **status:** UNVERIFIED

**What the auditor claims**

`signOut()` clears the Keychain and in-memory session, but the server-side push unregistration is fire-and-forget: it runs inside an unstructured `Task` and its result is swallowed by `try?`. There is no retry, and the local state that would allow a retry is never cleared — `PushDeviceTokenStore.clear()` is never called anywhere in app code (grep across the target returns only the test file), and `MemberPushPreference.setEnabled(false)` is called only from the in-app toggle paths (lines 542/559/576/584), never from `signOut()` or `deleteAccount()`. `api/push-subscription.js` flips `enabled` to false only when that one POST succeeds, so a failed call leaves `push_subscriptions.enabled = true` bound to the departed member's `user_id`. Targeted notices are genuinely private: `notifyTargetedAnnouncement` (api/admin-publish-announcement.js:95-120) rejects anything other than exactly one recipient and pushes the announcement `title` and `body` to that member's devices.

**Claimed failure scenario**

Member A has member notices enabled and hands the phone to a family member / sells it / puts it in airplane mode. A opens XERT while offline and taps Sign Out. `api.updatePushSubscription(..., enabled: false)` throws a URLError, `try?` discards it, and nothing is retried on the next launch because `MemberPushPreference` is still true and `PushDeviceTokenStore` still holds the APNs token. The row in `push_subscriptions` stays `enabled = true, user_id = A`. An admin then sends A a member-direct notice ("Your refund for the 10-pack was processed", "We need to talk about your missed sessions") via the Owner Command Centre — APNs delivers A's private title+body to that device's lock screen, now in someone else's hands. Secondary effect: because `MemberPushPreference` survives sign-out, when Member B signs in on that same device `restoreMemberPushRegistration()` (line 581) silently re-registers B for push without B ever having consented in-app.

**Quoted evidence (verify this exists verbatim)**

```
    func signOut() {
        let currentSession = authSession
        let pushToken = PushDeviceTokenStore.load()
        replaceAuthSession(with: nil)
        KeychainStore.clearSession()
        Task {
            await ClassReminderScheduler.shared.clearAll()
            if let currentSession {
                if let pushToken { try? await api.updatePushSubscription(session: currentSession, token: pushToken, enabled: false) }
                try? await api.signOut(session: currentSession)
            }
        }
    }
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Make sign-out fail closed locally even when the network call fails: call `PushDeviceTokenStore.clear()` and `MemberPushPreference.setEnabled(false)` plus `UIApplication.shared.unregisterForRemoteNotifications()` unconditionally in `signOut()` (and `deleteAccount()`), so the device stops being re-registered and the OS stops minting a token for it. Make the unregister awaited before the session is discarded, and if it fails, persist a small "pending unregister" record (device token + refresh token) that is retried on next launch. Server side, consider having `/api/push-subscription` treat any `register` for a device_token whose stored `user_id` differs as an implicit revoke of the old binding (the `push_subscriptions_device_environment_key unique (device_token, environment)` index already makes this a single-row operation).

---

### 29. canApplyMemberState compares access tokens, so a mid-flight token refresh aborts the post-mutation UI update

- **id:** `token-rotation-treated-as-account-change`
- **severity (claimed):** medium
- **location:** `ios/XertFitnessApp/XertFitnessApp/Store/XertStore.swift:897`
- **status:** UNVERIFIED

**What the auditor claims**

`canApplyMemberState` is the guard every mutation uses to decide whether its result may still be applied. It is meant to detect "the signed-in account changed", but it identifies the account by `access_token`. Supabase rotates the access token roughly hourly, and `validAuthSession()` writes the rotated session into `self.authSession`. Any operation that captured the pre-rotation session before its network call therefore fails this guard and returns early even though the same user is still signed in and the server-side mutation already succeeded. `memberStateVersion` already exists and is bumped only in `replaceAuthSession`, i.e. it is the correct signal; the extra token comparison is what over-triggers.

**Claimed failure scenario**

Member taps "Book class" at 12:57:58; `validAuthSession()` sees the token expires at 13:00:00 (outside the 2-minute leeway by 2 s) and returns session T1. The `book_session` POST takes 4 s on cellular. At 12:58:00 the APNs device token arrives and `RootView`'s `.xertPushTokenUpdated` handler runs `store.syncMemberPushToken(token)`, which calls `validAuthSession()`; the token is now inside the leeway, so it refreshes and sets `authSession` to T2. At 12:58:02 the booking POST returns 200, and `guard canApplyMemberState(memberVersion, session: authSession)` compares T1 against T2, fails, and returns — skipping `await refresh()`. The booking exists on the server but the timetable card still reads "Book class" and the credit balance is unchanged, with no error shown.

**Quoted evidence (verify this exists verbatim)**

```
    private func canApplyMemberState(_ version: Int, session: AuthSession?) -> Bool {
        guard memberStateVersion.isCurrent(version), !Task.isCancelled, let session else { return false }
        return authSession?.access_token == session.access_token
    }
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Identify the account rather than the credential: compare `authSession?.user?.id == session.user?.id` (falling back to `memberStateVersion` alone when `user` is absent). `memberStateVersion.invalidate()` in `replaceAuthSession` already covers sign-in/sign-out/account-delete, which is the case this guard exists for.

---

### 30. `npm run typecheck` covers none of the 12 serverless functions and skips 53 of 188 first-party source files

- **id:** `typecheck-excludes-all-serverless-functions`
- **severity (claimed):** medium
- **location:** `jsconfig.json:19`
- **status:** UNVERIFIED

**What the auditor claims**

`tsc -p ./jsconfig.json` builds its program from the `include` globs on line 19, which name only `src/components/**/*.js` (note: `.js`, not `.jsx`), `src/pages/**/*.jsx`, a `src/Layout.jsx` that does not exist, and `src/vite-env.d.ts`; everything else is pulled in only if a page happens to import it. `tsc --listFiles` on this exact config emits 135 first-party files out of the 188 `.js`/`.jsx` files under src/, and `grep -c '/api/'` on that list returns 0. Never checked: the whole api/ directory (checkout, stripe-webhook, refund, reconcile, delete-account, push, announcements — the code holding STRIPE_SECRET_KEY and SUPABASE_SERVICE_ROLE_KEY), src/App.jsx (every route definition), src/main.jsx, src/lib/serverStripeClient.js, src/lib/commerceRuntime.js, src/lib/paymentActivation.js, src/lib/query-client.js, and all 45 src/components/ui/*.jsx. Running the same compiler options over api/ manually (`tsc --noEmit --allowJs --checkJs --skipLibCheck api/*.js`) does produce diagnostics today, including `api/checkout.js(700,59): Argument of type ... is not assignable to parameter of type 'SessionCreateParams'` on the live Stripe Checkout session payload — a real Stripe SDK contract mismatch that the configured gate cannot see. Combined with the previous two findings this means api/ has no static analysis of any kind: zero eslint rules and zero type checking.

**Claimed failure scenario**

Someone renames a field in the Stripe Checkout payload in api/checkout.js — e.g. `billing_address_collection: 'require'` instead of `'required'`, or `customer_creation: 'if_required'` on a `mode:'payment'` session where Stripe rejects it. `npm run lint` (rules {}), `npm run typecheck` (file not in program) and `npm run build` (Vite never touches api/) all pass, CI is green, and the break only appears when a real member clicks Buy and `stripe.checkout.sessions.create` throws — the handler catches it at api/checkout.js:738 and returns a generic public failure, so members simply cannot pay.

**Quoted evidence (verify this exists verbatim)**

```
  "include": ["src/components/**/*.js", "src/pages/**/*.jsx", "src/Layout.jsx", "src/vite-env.d.ts"],
  "exclude": ["node_modules", "dist", "src/vite-plugins", "src/components/ui", "src/api", "src/lib"]
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Widen `include` to `["src/**/*.{js,jsx}", "src/vite-env.d.ts"]` and add a second project (e.g. `tsconfig.api.json` with `"types": ["node"]`, `include: ["api/**/*.js", "src/lib/**/*.js"]`) wired into the `typecheck` script, so the Stripe/service-role code is compiled at least once per CI run. Delete the stale `src/Layout.jsx` entry.

---

### 31. AdminLayout's badge-count effect is keyed on activeSection it never reads, so every sidebar click fires four fresh count queries and bypasses the 15 s freshness guard

- **id:** `admin-badge-effect-refires-on-every-navigation`
- **severity (claimed):** medium
- **location:** `src/components/admin/AdminLayout.jsx:200`
- **status:** UNVERIFIED

**What the auditor claims**

The effect at AdminLayout.jsx:163-200 sets up the badge poller. Its body references only getAdminBadgeCounts, setBadges, setBadgesUnavailable, shouldRefreshAdminData, document and ADMIN_BADGE_REFRESH_INTERVAL_MS — activeSection appears nowhere inside it. But activeSection is the sole dependency, so every navigation tears the effect down and re-mounts it. On re-mount `lastRefreshAt` is reset to Number.NaN and `void refreshBadges()` is called unconditionally, so the deliberate throttle in shouldRefreshAdminData (src/lib/adminFreshness.js:5-9 — `if (!Number.isFinite(lastRefreshAt)) return true;` with ADMIN_VISIBILITY_REFRESH_MIN_AGE_MS = 15_000) can never suppress it. The `requestInFlight` guard is also per-effect-instance, so it does not dedupe across re-mounts either. The interval is also destroyed and recreated on every navigation, resetting the 60 s polling phase.

**Claimed failure scenario**

An admin clicks through the sidebar — Overview, Members, Class Desk, Booking Requests, Timetable, Availability, PT Requests, Orders — eight clicks in ten seconds. Each click re-runs the effect and issues getAdminBadgeCounts, which is a Promise.all of four `count: 'exact', head: true` queries (src/lib/adminData.js:1230-1235). That is 32 exact-count round trips in ten seconds for badge numbers that are meant to refresh at most once every 15 s, and each of those counts pays the per-row public.is_admin() cost described in the RLS finding.

**Quoted evidence (verify this exists verbatim)**

```
    void refreshBadges();
    const intervalId = window.setInterval(refreshWhenVisible, ADMIN_BADGE_REFRESH_INTERVAL_MS);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [activeSection]);
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Change the dependency array to `[]` so the poller mounts once for the lifetime of the admin shell, and hoist `lastRefreshAt` into a ref if a section change should still be allowed to opportunistically refresh — routed through shouldRefreshAdminData rather than an unconditional refreshBadges().

---

### 32. Class roll-call roster and booking-request status dropdowns render one unnamed <select> per member — no id, label, or aria-label

- **id:** `roll-call-roster-selects-unlabelled`
- **severity (claimed):** medium
- **location:** `src/components/admin/ClassCalendarAdmin.jsx:942`
- **status:** UNVERIFIED

**What the auditor claims**

Inside the session detail panel, each roster row renders a status <select> whose only identifying context is the member name in an adjacent sibling <div>. The select has no id, no wrapping <label>, no aria-label and no aria-labelledby, so its accessible name is empty. The same defect repeats at line 964 for the legacy booking-request rows. The name is entirely positional-visual, which is exactly what WCAG 2.2 AA 4.1.2 Name, Role, Value and 1.3.1 Info and Relationships prohibit. This is not a codebase-wide habit — the RepeatModal a few hundred lines earlier in the same file does it correctly (`<label htmlFor="repeat-interval">` / `<select id="repeat-interval">` at ClassCalendarAdmin.jsx:421-423), and the admin dialog layer already invests in focus management (src/lib/adminDialogLayer.js), so the gap is an oversight rather than a deliberate scope decision. Nothing in test/ asserts a label for these controls.

**Claimed failure scenario**

A coach using a screen reader opens a 12-person class to run roll-call. Tabbing through the roster produces twelve consecutive announcements of "combo box, confirmed" with no member name attached to any of them, because each name lives in an unassociated sibling element. Marking the fourth member as attended requires counting Tab stops; landing one stop off silently changes the wrong member's booking status — and per the panel's own note, waitlisting/declining/cancelling returns that member's reserved credit, so a mis-set control moves real credit balances.

**Quoted evidence (verify this exists verbatim)**

```
                          <select value={r.status} onChange={e => handleRosterStatus(r.booking_id, e.target.value)} disabled={updatingBookingId === r.booking_id || s.status !== 'published'}
                            className="bg-xert-charcoal border border-xert-steel/40 px-2 py-1 font-body text-xs text-xert-offwhite focus:outline-none focus:border-xert-red">
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Give each row's name element an id (e.g. `id={`roster-name-${r.booking_id}`}`) and point the select at it with aria-labelledby, or add `aria-label={`Booking status for ${r.full_name || r.email || 'member'}`}`. Apply the same treatment to the booking-request select at line 964.

---

### 33. Class session edits have no version check, so concurrent admins silently overwrite each other's schedule changes

- **id:** `class-session-update-no-optimistic-lock`
- **severity (claimed):** medium
- **location:** `src/lib/adminData.js:139`
- **status:** UNVERIFIED

**What the auditor claims**

updateClassSession() takes only (id, updates) — no expectedUpdatedAt — and the RPC it calls, public.admin_update_class_session(p_session_id uuid, p_session jsonb) (supabase/migrations/20260713000000_class_session_update_guard.sql:5), has no version parameter either. That RPC does `select status ... for update` and blocks terminal-status and capacity-below-active-bookings transitions, but it never compares the caller's baseline against the stored row; it unconditionally overwrites all 15 columns and sets `updated_at = now()`. The legacy fallback path (l.169-174) is equally unversioned. This breaks the contract every other admin mutation in this file honours — updateCoach (l.522), deleteCoach (l.533), updateEvent (l.575), deleteEvent (l.586), updateProduct (l.1151), updateAvailabilityBlock (l.357), updateBlackoutPeriod (l.382), updateMemberAnnouncement (l.648), saveSiteContent (l.1593) and updateSoftLaunchSettings (l.427) all take expectedUpdatedAt and run it through assertAdminMutationVersion or a *_STALE RPC guard. The write is a whole-row overwrite because normalizeClassSession (src/lib/scheduling.js:92) always returns the complete field set, and src/components/admin/ClassCalendarAdmin.jsx:245 feeds it the editor form seeded from a snapshot taken when the dialog opened (`useState(() => session ? { ...session, ... } : ...)` at ClassCalendarAdmin.jsx:222).

**Claimed failure scenario**

Two admins open 'XERT Engine 6am' at 09:00. Admin A changes coach_name from 'Sam' to 'Jo' and saves at 09:02 — the row now reads coach Jo, start 06:00. Admin B, whose form still holds the 09:00 snapshot (coach Sam), changes start_time to 06:30 and saves at 09:03. The RPC passes every guard (status unchanged, capacity unchanged) and writes the full payload, so coach_name reverts to 'Sam'. Admin A gets no conflict error and no indication their change was undone; the published class shows the wrong coach to booked members.

**Quoted evidence (verify this exists verbatim)**

```
export async function updateClassSession(id, updates) {
  const payload = normalizeClassSession(updates);
  const guarded = await supabase.rpc('admin_update_class_session', {
    p_session_id: id,
    p_session: payload,
  });
  if (!guarded.error) return guarded.data;
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Add a p_expected_updated_at timestamptz parameter to admin_update_class_session that raises SESSION_STALE when class_sessions.updated_at (already maintained by the RPC) differs from the caller's baseline; thread expectedUpdatedAt through updateClassSession and add `.eq('updated_at', expectedUpdatedAt)` plus assertAdminMutationVersion on the legacy fallback at line 169; pass `session.updated_at` from ClassCalendarAdmin.jsx:245 and map SESSION_STALE in classSessionUpdateRpcError.

---

### 34. The admin bookings queue serially downloads the entire booking history plus an N+1 profile loop on every load

- **id:** `bookings-queue-loads-full-history-serially`
- **severity (claimed):** medium
- **location:** `src/lib/adminData.js:243`
- **status:** UNVERIFIED

**What the auditor claims**

getMemberBookingRequests() accepts a status filter but src/components/admin/BookingRequestsTable.jsx:49-50 calls both getClassBookings() and getMemberBookingRequests() with no arguments, so no server-side filter is applied at all. collectAdminPages is strictly sequential (`do { result = await fetchPage(page); ... } while (rows.length < result.total)` in src/lib/adminPagination.js), so the whole session_bookings table is pulled 500 rows at a time, one round trip after another, and then a second sequential loop fetches profiles 100 ids at a time. The component then throws almost all of it away client-side: filterAdminBookings defaults to `days: '30'` (BookingRequestsTable.jsx:36 `useState('30')`, src/lib/bookingAnalytics.js:8-9). Every other high-volume admin surface in this file paginates on the server and passes filters down — getLeadPage, getPTRequests and adminListMembersPage all take page/pageSize/status and only fetch what is displayed.

**Claimed failure scenario**

A gym running 3 classes/day at 10 members/class accumulates ~11,000 session_bookings and ~9,000 class_bookings after a year with ~1,200 distinct members. Opening the Bookings tab issues 22 sequential session_bookings page requests, 12 sequential profiles requests, and 18 sequential class_bookings page requests before a single row renders — roughly 8-10 seconds of serial latency on a normal connection — to display the 30-day window, which is a few hundred rows. Any one of those ~52 requests failing throws from collectAdminPages and blanks the entire queue with a load error (BookingRequestsTable.jsx:70), so the admin cannot action a single pending booking.

**Quoted evidence (verify this exists verbatim)**

```
  const memberIds = [...new Set(rows.map(row => row.user_id).filter(Boolean))];
  if (memberIds.length === 0) return [];

  const profiles = [];
  for (let index = 0; index < memberIds.length; index += 100) {
    const ids = memberIds.slice(index, index + 100);
    const { data, error } = await supabase.from('profiles').select('id, full_name, email, phone').in('id', ids);
    if (error) throw new Error(error.message);
    profiles.push(...(data || []));
  }
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Push the UI's status/date filters into the queries: have BookingRequestsTable pass `{ status, createdAfter }` to getClassBookings/getMemberBookingRequests and add a `.gte('created_at', cutoff)` clause, mirroring the `normalized.cutoff` handling already in getPTRequests (line 287). Replace the sequential profile loop with `await Promise.all(chunks.map(...))`, or fold the profile join into a server RPC the way admin_session_roster already does.

---

### 35. The admin dialog layer's Tab trap fights Radix's focus scope, making the destructive button in every stacked AdminConfirmDialog unreachable by keyboard

- **id:** `dialog-layer-traps-tab-away-from-radix-confirm`
- **severity (claimed):** medium
- **location:** `src/lib/adminDialogLayer.js:73`
- **status:** UNVERIFIED

**What the auditor claims**

`useAdminDialogLayer` only discovers dialogs via `workspace.querySelectorAll('[role="dialog"][aria-modal="true"]')`. Radix's `AlertDialogContent` renders through `AlertDialogPortal` into `document.body` — outside `workspaceRef` — and its content carries `role="alertdialog"` with no `aria-modal` attribute (verified in node_modules/@radix-ui/react-dialog/dist/index.mjs, which never emits `aria-modal`). So when an `AdminConfirmDialog` opens on top of a hand-built admin dialog, `activeDialog` stays pointed at the hand-built dialog underneath, and the document-level `trapFocus` keeps running. On Tab, `document.activeElement` is inside the Radix portal so `!activeDialog.contains(document.activeElement)` is true → `event.preventDefault()` plus `first.focus()` yanks focus into the dialog behind. Radix's `FocusScope` in `trapped` mode installs a document `focusin` handler that calls `focus(lastFocusedElementRef.current)` the moment focus lands outside its container, so focus snaps straight back — and because the default was already prevented, the browser never advances the tab order. This stack occurs in at least three places: `MembersManager.jsx:432` and `:446` (both inside the `role="dialog" aria-modal="true"` MemberDrawer at line 123), `EventsManager.jsx:155` (inside the EventEditor overlay), and `AdminCommandCentre.jsx:145` whenever a dirty editor is still mounted.

**Claimed failure scenario**

A keyboard-only admin opens a member, clicks Archive on a staff note, and the "Archive staff note?" AlertDialog opens with focus on "Keep unchanged" (Radix autofocuses the first tabbable). They press Tab to reach "Archive note": `trapFocus` calls `preventDefault()` and focuses the MemberDrawer's close button behind the modal, Radix's `focusin` handler immediately restores focus to "Keep unchanged", and the browser never moves. Shift+Tab behaves identically. Focus never leaves "Keep unchanged", so the confirm action cannot be reached or activated without a mouse — the same applies to "Discard draft" in the private-notice dialog, "Discard changes" in the event editor, and the command-centre unsaved-changes dialog.

**Quoted evidence (verify this exists verbatim)**

```
const DIALOG_SELECTOR = '[role="dialog"][aria-modal="true"]';
...
    const trapFocus = event => {
      if (event.key !== 'Tab' || !activeDialog) return;
      const focusable = visibleFocusableElements(activeDialog);
      if (!focusable.length) {
        event.preventDefault();
        activeDialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !activeDialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !activeDialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Make the layer yield whenever a Radix dialog is on top. Either (a) widen detection to the whole document and both roles — query `document.querySelectorAll('[role="dialog"],[role="alertdialog"]')` so the portalled Radix content becomes `activeDialog` and Radix's own scope is left to manage it, or (b) bail out of `trapFocus` early when focus is outside the workspace, e.g. `if (!workspace.contains(document.activeElement)) return;`, so Radix's `FocusScope` owns Tab while its dialog is open.

---

### 36. cancel_booking silently withholds the refund when the credit batch has expired, while web and iOS both tell the member the credit was returned

- **id:** `expired-batch-cancellation-silent-loss`
- **severity (claimed):** medium
- **location:** `src/lib/bookingCancellation.js:6`
- **status:** UNVERIFIED

**What the auditor claims**

cancel_booking guards the refund with `where id = v_batch and (expires_at is null or expires_at > now())`, so if the batch that paid for the booking expired between booking and cancellation, remaining is never incremented — and the RPC returns void, so the client cannot tell. Nothing stops this window from opening: book_session only requires the batch to be unexpired at booking time (`and (expires_at is null or expires_at > now())`, booking_modes_upgrade.sql:143), and imposes no relationship between expires_at and class_sessions.start_time, so a member can legitimately book a class weeks after their pack lapses. Both clients then assert a refund happened: src/pages/Account.jsx:211-212 shows 'Your class credit has been returned.' and src/lib/bookingCancellation.js:16 renders 'This will remove you from ... and return your class credit.'; ios/.../BookingCancellationPolicy.swift:7 uses the identical rule and AccountView.swift:982 shows the identical promise. Neither client models the expiry condition at all.

**Claimed failure scenario**

Member buys a 30-day pack on 1 July (batch expires 31 July, remaining 4). On 25 July they book the 10 August Strength class — book_session accepts it because the batch is still live, decrements remaining to 3, and stores credit_batch_id = that batch. On 5 August (well over 12 hours before the class) they cancel. cancellationReturnsCredit returns true because status='confirmed' and start_time - now > 12h, so the confirmation dialog and the success toast both say the credit has been returned. Server-side, `where id = v_batch and (... expires_at > now())` matches nothing because the batch expired on 31 July, so remaining stays at 3. The member sees 'Your class credit has been returned' and their credit balance is unchanged.

**Quoted evidence (verify this exists verbatim)**

```
export function cancellationReturnsCredit(booking, now = Date.now()) {
  if (booking.status === 'requested') return true;
  if (booking.status !== 'confirmed') return false;
  return new Date(booking.start_time).getTime() - now > CREDIT_REFUND_LEAD_TIME_MS;
}
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Make cancel_booking report what it actually did — return the number of credits restored (get diagnostics after the credit_batches update) instead of void — and have src/lib/bookingData.js cancelBooking and the iOS XertAPI cancel path surface that value so Account.jsx:211 and AccountView.swift:982 state the truth. Separately, decide the policy: either refuse to spend a credit batch on a class that starts after the batch expires (add `and (expires_at is null or expires_at > v_start)` to the batch selection in book_session), or extend the batch expiry on refund. Mirror whichever rule is chosen in BookingCancellationPolicy.swift so the two clients stay aligned.

---

### 37. Client overlap check hard-codes a 60-minute booking length because my_bookings() omits duration_minutes, disabling the Book button for classes the server would accept

- **id:** `booking-overlap-60-minute-fallback`
- **severity (claimed):** medium
- **location:** `src/lib/bookingUi.js:16`
- **status:** UNVERIFIED

**What the auditor claims**

bookingUi.endTime falls back to `duration_minutes` and then to DEFAULT_CLASS_DURATION_MS (60 min). For a session row from sessions_with_availability that is fine — duration_minutes is in the result set. For a *booking* row it is not: my_bookings() (supabase/migrations/20260714004100_waitlist_fifo_promotion.sql:33-39) returns booking_id, status, booked_at, cancelled_at, session_id, title, class_type, coach_name, start_time, end_time, location_zone, intensity_level, waitlist_position — no duration_minutes. So every existing booking whose class has end_time IS NULL is measured as exactly 60 minutes. The database trigger enforce_booking_time_conflict uses the real value: `coalesce(session.end_time, session.start_time + make_interval(mins => greatest(coalesce(session.duration_minutes, 60), 1)))` (20260714002000_booking_time_conflicts.sql:67-70). end_time is genuinely optional — normalizeClassSession (src/lib/scheduling.js:107) stores null when the field is blank, and the SessionEditor form initialises end_time to '' with duration_minutes to 60 (ClassCalendarAdmin.jsx:226) while letting the admin change the duration. iOS has the same defect: BookingItem.effectiveEndTime (Models.swift:398-401) hard-codes `start_time.addingTimeInterval(60 * 60)`, and BookingView.swift:349 uses it for the same gate.

**Claimed failure scenario**

Admin creates a 45-minute XERT Foundation class at 18:00 with the End time field left blank (duration_minutes = 45, end_time = NULL). Member M books it; the real occupancy is 18:00-18:45. M then opens the timetable and looks at an 18:50 Engine class. bookingUi.endTime(booking) sees no end_time and no duration_minutes on the my_bookings row, so it returns 18:00 + 60 min = 19:00, which overlaps 18:50. classActionLabel returns 'Time conflict', the row renders 'Overlaps XERT Foundation', and Booking.jsx:443 sets disabled={... || Boolean(timeConflict)}. M is blocked from booking a class the server would have accepted, since enforce_booking_time_conflict computes the booking's end as 18:45. The mirror case (a 90-minute class with null end_time) fails the other way: the client shows no conflict, M clicks Book, and the RPC rejects with BOOKING_TIME_CONFLICT.

**Quoted evidence (verify this exists verbatim)**

```
function endTime(item) {
  const start = startTime(item);
  if (start === null) return null;
  const explicit = Date.parse(item?.end_time);
  if (Number.isFinite(explicit) && explicit > start) return explicit;
  const duration = Number(item?.duration_minutes);
  return start + (Number.isFinite(duration) && duration > 0 ? duration * 60 * 1000 : DEFAULT_CLASS_DURATION_MS);
}
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Add `s.duration_minutes` to the my_bookings() result table and select list so BookingItem/booking rows carry the same duration the trigger uses, then let bookingUi.endTime and BookingItem.effectiveEndTime derive the fallback from it instead of a 60-minute constant. Alternatively make end_time non-null by deriving it from duration_minutes in normalizeClassSession/admin_update_class_session so client and trigger can never disagree.

---

### 38. @tanstack/react-query adds 27.5 kB of minified dead code to the entry chunk — a QueryClient and provider are wired up but no component ever calls a query hook

- **id:** `react-query-dead-weight-in-entry-chunk`
- **severity (claimed):** medium
- **location:** `src/lib/query-client.js:4`
- **status:** UNVERIFIED

**What the auditor claims**

App.jsx imports QueryClientProvider and wraps the whole router in it, and query-client.js constructs a QueryClient with refetchOnWindowFocus/retry defaults. Those defaults are never exercised: a grep across src/, api/ and ios/ for useQuery, useMutation, useQueryClient, useInfiniteQuery and useSuspenseQuery returns only the two import lines above — every data path in the app goes through hand-rolled useEffect + supabase calls instead (e.g. src/pages/SoftLaunchTimetable.jsx:111, src/components/admin/AdminLayout.jsx:163). I attributed the entry chunk's minified bytes back through its sourcemap: @tanstack/query-core contributes 27,487 of the 487,067 bytes in dist/assets/index-C1Dw89-3.js, spread over 16 modules (queryClient, queryCache, mutationCache, retryer, focusManager, onlineManager, notifyManager, timeoutManager, …). It is in the entry chunk, not a route chunk, so it ships on the anonymous marketing home page. Because the QueryClient is constructed at module scope, focusManager/onlineManager also install window focus, visibilitychange and online/offline listeners at boot that nothing consumes.

**Claimed failure scenario**

A first-time visitor loads the public home page on a 4G phone. The entry bundle they must download and parse before anything renders includes 27.5 kB (~8 kB gzipped, about 6% of the 487 kB entry chunk) of query-core — cache, retryer, mutation and network-status machinery for a caching layer that has zero consumers — plus a set of global event listeners registered by managers whose state is never read.

**Quoted evidence (verify this exists verbatim)**

```
export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: 1,
		},
	},
});
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Either delete src/lib/query-client.js, the QueryClientProvider wrapper in src/App.jsx:3-4/80 and the @tanstack/react-query dependency, or start actually using the hooks for the repeated useEffect fetch/refresh logic. If the provider is being kept deliberately for planned work, move the QueryClient construction behind a lazily-imported boundary so it does not land in the entry chunk that anonymous marketing traffic downloads.

---

### 39. Unsaved CMS drafts are stored in localStorage under a non-user-scoped key and are never cleared on sign-out

- **id:** `site-content-draft-survives-signout`
- **severity (claimed):** medium
- **location:** `src/lib/siteContentDraft.js:5`
- **status:** UNVERIFIED

**What the auditor claims**

draftKey() builds the storage key from the section key alone ('xert:admin:site-content-draft:hero'); nothing in the key identifies which admin authored the draft. ContentManager's SectionEditor writes on every keystroke while dirty (ContentManager.jsx:212) and recovers unconditionally on mount (ContentManager.jsx:197-199), seeding `data` with the recovered draft and setting dirty=true so the Save button is immediately enabled. The draft is only removed on an explicit Discard (ContentManager.jsx:223) or a successful Save (ContentManager.jsx:234). signOut in src/lib/SupabaseAuthContext.jsx:111-114 does nothing but `await supabase.auth.signOut()` — it does not touch localStorage, and there is no other caller of clearSiteContentDraft. This is the only client cache in the app that is neither user-scoped nor cleared at sign-out (webCheckoutRecovery.js:41 compares the stored userID, checkoutAttempt.js is namespaced server-side by userID inside checkoutIdempotencyKey in api/checkout.js:245, and siteContent.js's Map holds only public CMS data).

**Claimed failure scenario**

On the shared front-desk browser, admin A opens Admin > Site Content, retypes the Contact page email to a personal address and the FAQ answers, does not save, and clicks Sign Out (the app clears the Supabase session but leaves 'xert:admin:site-content-draft:contact' in localStorage). Admin B signs in on the same browser and opens Site Content. SectionEditor mounts, readSiteContentDraft returns A's draft, `data` is seeded with it, dirty is true, and the banner reads "1 section with unsaved changes". B, believing these are B's own pending edits, clicks "Save section" — normalizeSiteContent + saveSiteContent publish A's unreviewed copy to the live public site, and the admin_content_changes audit row records changed_by = B (supabase/migrations/20260714013000_content_change_audit.sql:8), so the history permanently misattributes the change.

**Quoted evidence (verify this exists verbatim)**

```
function draftKey(sectionKey) {
  return `${SITE_CONTENT_DRAFT_PREFIX}${String(sectionKey || '').trim()}`;
}
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Namespace the draft key by the authenticated user id (pass session.user.id into readSiteContentDraft/writeSiteContentDraft and include it in draftKey), and additionally sweep every key with SITE_CONTENT_DRAFT_PREFIX out of localStorage inside SupabaseAuthContext's signOut (and on the SIGNED_OUT auth event) so nothing survives a session change.

---

### 40. Admin sign-in email and password fields have no accessible name — the <label> elements are siblings with no htmlFor and the inputs have no id or aria-label

- **id:** `adminlogin-inputs-have-no-accessible-name`
- **severity (claimed):** medium
- **location:** `src/pages/AdminLogin.jsx:41`
- **status:** UNVERIFIED

**What the auditor claims**

AdminLogin renders `<label className="block ...">Email</label>` followed by a sibling `<input type="email">`. The label has no htmlFor, the input has no id, no aria-label and no aria-labelledby, and the input is not nested inside the label — so no accessible name is computed for either the email or the password field (same pattern at lines 55-68). This is a WCAG 2.2 AA failure of 1.3.1 Info and Relationships, 3.3.2 Labels or Instructions and 4.1.2 Name, Role, Value. It is the outlier in this codebase: the member Login page uses `<Label htmlFor="email">` / `<Label htmlFor="password">` (src/pages/Login.jsx:107 and 125), Account.jsx nests its inputs inside <label> (Account.jsx:485-499), the public forms are contract-tested for htmlFor/id pairing (test/public-accessibility-contract.test.js:76-78), and MembersManager even ships an sr-only label for its notice title. AdminLogin is not covered by any test — grep of test/ for "AdminLogin" returns nothing. AdminLogin is not a dead page: AdminRoute renders it for any unauthenticated visitor to /admin (src/components/admin/AdminRoute.jsx:29) and it is bundled into the main entry chunk.

**Claimed failure scenario**

A blind gym owner using VoiceOver or NVDA navigates to /admin. Form-controls mode announces "edit text, blank" then "secure edit text, blank" with no field names — the visible "Email" and "Password" text is never associated with either control. The user cannot tell which box is which without reading the surrounding static text in browse mode and guessing at the DOM order, and password managers keyed on label text also fail to match.

**Quoted evidence (verify this exists verbatim)**

```
            <label className="block font-body text-xs uppercase tracking-wider mb-2" style={{ color: 'rgba(209,221,230,0.5)' }}>Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Add `htmlFor="admin-login-email"` / `htmlFor="admin-login-password"` to the two labels and the matching `id` to each input (or nest the inputs inside their labels, as Account.jsx does), and extend test/public-accessibility-contract.test.js to assert the htmlFor/id pairing for AdminLogin.jsx the way it already does for the public forms.

---

### 41. Privacy Policy has no overseas-disclosure statement despite all processing being offshore, and does not disclose the silent referrer/UTM/landing-path capture the code performs

- **id:** `privacy-policy-omits-offshore-and-attribution`
- **severity (claimed):** medium
- **location:** `src/pages/Privacy.jsx:22`
- **status:** UNVERIFIED

**What the auditor claims**

APP 1.4(f) and (g) require an APP privacy policy to state whether the entity is likely to disclose personal information to overseas recipients and, if practicable, the countries where those recipients are located; APP 8.1 imposes accountability for those disclosures. The 'Services And Disclosure' section names Supabase, Vercel, Stripe and Apple but never says the data leaves Australia and names no country - every one of those is a US-headquartered processor. It also omits Google: index.html:8-10 loads a stylesheet from `fonts.googleapis.com` with `preconnect` to `fonts.gstatic.com`, and vercel.json's CSP explicitly allowlists both (`style-src ... https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com`), so every page view sends the visitor's IP address and User-Agent to Google LLC. src/pages/Contact.jsx:11 additionally frames `www.openstreetmap.org` (CSP `frame-src https://www.openstreetmap.org`). Separately, the 'Information We Collect' section frames automatic collection as "limited technical information needed for security and operation, such as authentication records, request timestamps and payment status" - but src/lib/captureLeadSource.js silently harvests `document.referrer`, the full UTM set and `landing_path` on every lead submission (src/lib/submitForms.js:22, 34, 46) and stores it against the named, identified lead; src/lib/adminData.js:49 then reads it back for marketing attribution reporting in CampaignStats. That is marketing analytics, not security and operation, and the policy never mentions it.

**Claimed failure scenario**

An OAIC assessment or a member's APP 12 request asks which countries hold their personal information and which third parties receive it. The answer is: the US (Supabase, Vercel, Stripe, Apple APNs) plus Google and OpenStreetMap receiving IP/User-Agent on every page load, plus marketing attribution (referrer, utm_source/medium/campaign/content, landing path) held against their name, email and phone in `member_interest`. None of that appears in the policy the member was pointed at by MemberInterestForm.jsx:237 before consenting - so the consent was not informed, and the policy fails the mandatory APP 1.4(f)/(g) content requirements.

**Quoted evidence (verify this exists verbatim)**

```
      'XERT uses service providers including Supabase for authentication and application data, Vercel for website and API hosting, Stripe for payments, and Apple services when you choose native calendar or notification features. These providers process information under their own security and privacy commitments.',
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Add to the Services And Disclosure section: an explicit statement that Supabase, Vercel, Stripe and Apple store and process information in the United States (and any other regions configured), and name Google (web fonts) and OpenStreetMap (map embed) as recipients of IP address and browser information. Add a sentence to Information We Collect covering referral source, campaign parameters and landing page captured when a form is submitted. Alternatively self-host the Bebas Neue/DM Sans woff2 files (they are already bundled for iOS at ios/.../Fonts/BebasNeue-Regular.ttf) and drop fonts.googleapis.com/fonts.gstatic.com from index.html and the CSP, removing the Google disclosure entirely.

---

### 42. Public /timetable field labels render at 3.09:1 contrast — below the WCAG 2.2 AA 4.5:1 minimum for normal-size text

- **id:** `public-timetable-contrast-below-aa`
- **severity (claimed):** medium
- **location:** `src/pages/SoftLaunchTimetable.jsx:53`
- **status:** UNVERIFIED

**What the auditor claims**

The class card's Date / Time / Duration / Capacity labels (lines 53, 59, 65, 69) and the Intensity label (line 45) use `text-xs text-xert-concrete/40` on a `bg-xert-ink` card (SoftLaunchTimetable.jsx:25). tailwind.config.js maps xert.concrete to #D1DDE6 and xert.ink to #0d1720; the emitted CSS is `.text-xert-concrete\/40{color:#d1dde666}` and `.bg-xert-ink{background-color:#0d1720}` (dist/assets/index-DnnV_dKa.css). Compositing #D1DDE6 at 40% over #0d1720 gives rgb(91,102,111), which measures 3.09:1 against the card — the AA threshold for text under 18.66px/24px bold is 4.5:1, and text-xs is 12px, so this fails 1.4.3 Contrast (Minimum). On hover the card switches to bg-xert-charcoal (#32485A) and the same text drops to 2.45:1. The "Full" badge at line 38 (`text-xert-concrete/50` on `bg-xert-steel/30` over the card) measures 3.15:1 and is the only indicator that a class cannot be booked. For reference the palette is otherwise sound — solid xert-steel #7BA7BC on xert-navy #101820 is 6.90:1 and concrete/60 on the card is 5.40:1, both passing — so the failure is specific to the /40 and /50 alpha steps, not the brand colours.

**Claimed failure scenario**

A visitor with mild low vision or on a phone in daylight opens /timetable. The 12px "DATE", "TIME", "DURATION", "CAPACITY" column captions render at 3.09:1 and are effectively invisible against the near-black card, leaving four bare values ("Tue 4 Aug", "06:00", "45min", "12") with no readable headings — the user cannot tell that "12" is capacity rather than duration. On a full class the "FULL" badge at 3.15:1 is likewise unreadable, so the only cue that the class is unavailable is missed.

**Quoted evidence (verify this exists verbatim)**

```
          <p className="font-body text-xs text-xert-concrete/40 uppercase tracking-wider">Date</p>
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Raise these captions to at least `text-xert-concrete/60` (5.40:1 on #0d1720) — or solid text-xert-steel (6.90:1) — for every /40 and /50 caption in SoftLaunchTimetable.jsx, and verify the hover state (bg-xert-charcoal #32485A) also clears 4.5:1. Adding a contrast assertion for the timetable to test/public-accessibility-contract.test.js would stop the /40 step returning.

---

### 43. Roll call marks the class completed while leaving 'requested' bookings unresolved, freezing their consumed credits with no UI recovery path

- **id:** `roll-call-strands-requested-bookings`
- **severity (claimed):** medium
- **location:** `src/supabase/attendance_roll_call_upgrade.sql:45`
- **status:** UNVERIFIED

**What the auditor claims**

admin_record_session_attendance defines the roll-call population as status in ('confirmed','attended','no_show'). A request_to_book booking sitting at 'requested' has already had a credit deducted (book_session sets v_booking_status='requested' and decrements credit_batches in the same transaction) and still occupies capacity (session_bookings_unique_active covers 'requested'), but it is invisible to the roll call — the INCOMPLETE_ROLL_CALL guard neither counts nor requires it. The function then unconditionally sets the class to 'completed'. Once the class is 'completed', ClassCalendarAdmin.jsx:23 (`if (sessionStatus !== 'published') return [status];`) collapses the roster dropdown to a single read-only option and line 941 disables the <select> outright, so no admin can move that booking to 'cancelled' to trigger the refund branch of admin_set_booking_status. The member cannot self-serve either: partitionAccountBookings (src/lib/accountBookings.js:9-17) routes any past booking to 'history', and Account.jsx only renders the cancel control for the pending and upcoming groups (lines 730, 783); iOS BookingItem.isCancellable (Models.swift:416) likewise requires start_time > now.

**Claimed failure scenario**

A request_to_book class has 5 confirmed members and 1 member M whose request staff never got to. The class runs; the admin opens the roster and completes the roll call for the 5 eligible members. v_input_count (5) equals v_eligible_count (5), so the guard passes, and the function sets the session to status='completed', public_visible=false. M's booking is still 'requested' with credit_batch_id pointing at the credit that was deducted when they requested the spot. The admin's roster dropdown for M is now disabled (s.status !== 'published'), M's Account page files the booking under history with no cancel button, and the iOS app hides cancel because start_time is in the past. M's credit is consumed for a class they were never confirmed into, recoverable only by direct database intervention.

**Quoted evidence (verify this exists verbatim)**

```
  select count(*) into v_eligible_count
    from public.session_bookings
    where class_session_id = p_session_id and status in ('confirmed', 'attended', 'no_show');
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Resolve pending requests inside the same transaction as the roll call. Before flipping the session to 'completed', cancel any remaining 'requested' bookings for the session and return their credits (the same refund the admin_set_booking_status 'requested' -> 'cancelled' path performs), or raise a distinct PENDING_REQUESTS_UNRESOLVED error so staff must clear them first. As a backstop, relax rosterStatusOptions so a 'requested' booking on a completed/cancelled class still offers 'cancelled'.

---

### 44. public.orders has no index on user_id, and the member purchase-history query supplies no user_id predicate, so every Account page sequentially scans the whole orders table

- **id:** `orders-missing-user-id-index`
- **severity (claimed):** medium
- **location:** `src/supabase/booking_schema.sql:185`
- **status:** UNVERIFIED

**What the auditor claims**

`orders` is the only owner-scoped table in the schema with no user_id index: credit_batches has `credit_batches_user_idx` (line 287), session_bookings has `session_bookings_member_status_session_idx` (admin_cms_schema.sql:273), receipts/targets/push_subscriptions/private_session_requests all have theirs. The only indexes on orders are `(status, created_at desc, id desc)` and a partial `(created_at desc, id desc) where status in ('pending','failed')` — neither can serve a user_id lookup. Worse, `src/lib/bookingData.js:74` (`getMyOrders`) issues `supabase.from('orders').select('*, products(name)').order('created_at', {ascending:false})` with no `.eq('user_id', ...)` and no limit, relying entirely on the RLS policy `orders_select_own_or_admin` (booking_schema.sql:975). I confirmed on PostgreSQL 16 with 200k rows that the policy's shape `user_id = (select auth.uid()) or (select public.is_admin())` compiles to two InitPlans and `Filter: ((user_id = $0) OR $1)`, which forces a Seq Scan even after creating an index on user_id — the OR branch is not tied to any column so it is unindexable. Adding an explicit equality predicate flips it: with `.eq('user_id', uid)` the same query plans as `Index Scan using orders_t_user_idx ... Index Cond: (user_id = '...')`. Both halves of the fix are required; today neither exists.

**Claimed failure scenario**

Once the gym has, say, 50k paid orders, every member who opens Account -> purchase history executes a full sequential scan plus a sort of the entire orders table (including every other member's Stripe IDs and amounts) to return their two rows. The same scan happens for `adminData.js:1568` (member detail drawer), which does pass `.eq('user_id', userId)` but has no index to use. Page latency and database CPU grow linearly with total order volume, and the load is proportional to member logins, not to the member's own data.

**Quoted evidence (verify this exists verbatim)**

```
create index if not exists orders_status_created_idx on public.orders(status, created_at desc, id desc);
create index if not exists orders_unresolved_checkout_idx on public.orders(created_at desc, id desc) where status in ('pending', 'failed');
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Add `create index if not exists orders_user_created_idx on public.orders(user_id, created_at desc, id desc);` and change `getMyOrders` in src/lib/bookingData.js to pass the caller's id explicitly (`.eq('user_id', session.user.id)`) plus a sane `.limit()`. The same explicit-predicate change is worth making in `getMyCredits` (bookingData.js:65), which relies on `credit_batches_select_own_or_admin` alone and therefore cannot use the existing `credit_batches_user_idx` either.

---

### 45. Public-form INSERT policies constrain only status and consent, leaving the staff-only admin_notes column writable by the anon role

- **id:** `public-form-insert-allows-anon-to-write-admin-notes`
- **severity (claimed):** medium
- **location:** `src/supabase/rls_hardening.sql:58`
- **status:** UNVERIFIED

**What the auditor claims**

member_interest, trainer_interest, partner_interest, class_bookings and private_session_requests all carry an INSERT policy granted to `anon, authenticated`. Every one of those policies constrains exactly two columns -- the initial workflow status and consent_to_contact (plus user_id ownership for private_session_requests). Nothing constrains admin_notes, which is the staff-authored servicing column: public.admin_update_lead (src/supabase/lead_pipeline_audit_upgrade.sql:161) and public.admin_update_request (src/supabase/admin_request_status_audit_upgrade.sql) are is_admin()-gated precisely because that column is staff-only, and the admin UI renders it as authoritative staff commentary (src/components/admin/PTRequestsTable.jsx:280 and src/components/admin/BookingRequestsTable.jsx:294 render `r.admin_notes` under the column header "Admin notes").

I checked the guards that would otherwise stop this: there is no BEFORE INSERT trigger on any of these five tables (the only triggers are lead_pipeline_audit_upgrade.sql:100-112, all `after update of status, admin_notes`), and there are no column-level GRANTs anywhere in src/supabase/ or supabase/migrations/ (grep for "grant insert (" returns nothing), so the default table-level privileges apply to every column. Because the forged value arrives on INSERT rather than UPDATE, the immutable admin_lead_changes / admin_request_status_changes audit trails never record it -- the note appears with no author and no history.

**Claimed failure scenario**

An unauthenticated attacker holding only the public VITE_SUPABASE_ANON_KEY sends POST /rest/v1/private_session_requests with {"status":"requested","consent_to_contact":true,"full_name":"Sam","email":"sam@x.com","admin_notes":"Verified paid in cash by Dan - approve and comp 10 sessions"}. The WITH CHECK passes (status and consent match), the row is created, and the Owner Command Centre renders that attacker-supplied string in italics under "Admin notes" alongside genuine staff notes, with no entry in admin_request_status_changes to reveal it was never written by staff. The same works against member_interest/trainer_interest/partner_interest with status='new'.

**Quoted evidence (verify this exists verbatim)**

```
create policy "public_insert_private_session_requests" on public.private_session_requests
  for insert to anon, authenticated
  with check (
    status = 'requested'
    and consent_to_contact is true
    and (
      ((select auth.uid()) is null and user_id is null)
      or ((select auth.uid()) is not null and user_id = (select auth.uid()))
    )
  );
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Add `and admin_notes is null` (and null-checks for any other staff-managed column such as the audit/assignment fields) to the WITH CHECK of all five public_insert_* policies in src/supabase/rls_policies.sql, src/supabase/rls_hardening.sql, src/supabase/public_form_integrity_upgrade.sql, src/supabase/member_pt_request_tracking.sql and supabase/migrations/20260714004300_public_form_integrity.sql; alternatively replace the table-level INSERT grant with a column-level `grant insert (col, ...)` that omits admin_notes. Extend test/public-form-rls.test.js to assert the new clause in every file, the same way it already asserts the status/consent clauses.

---

### 46. schedule_blackout_guard's data preflight only checks future overlaps while the trigger it installs checks all time, permanently locking historical classes out of editing

- **id:** `blackout-preflight-narrower-than-trigger`
- **severity (claimed):** medium
- **location:** `supabase/migrations/20260714004000_schedule_blackout_guard.sql:22`
- **status:** UNVERIFIED

**What the auditor claims**

The migration's opening DO block refuses to install if a published class overlaps a blackout, but bounds the check to rows still in the future (`coalesce(session.end_time, ...) > now()` and `blackout.end_time > now()`). The trigger function it then installs, `enforce_class_blackout_conflict`, applies no time bound at all — it rejects any published/full session overlapping any blackout, past or future. It also lacks the no-op short-circuit that its sibling in the very next migration has (`enforce_session_reschedule_conflicts`, 20260714002000_booking_time_conflicts.sql:96, returns early when start_time/end_time/duration_minutes are all unchanged). Because `admin_update_class_session` assigns start_time, end_time, duration_minutes and status unconditionally (20260713000000_class_session_update_guard.sql:84-91), the `before update of start_time, end_time, duration_minutes, status` trigger fires on every admin edit even when none of those values change — I verified on PostgreSQL 16 that an `UPDATE ... SET title=..., start_time=start_time, status=status` does fire an `UPDATE OF` trigger on the unchanged columns. So the migration certifies the database as clean while leaving rows the trigger will reject forever.

**Claimed failure scenario**

A gym closure on 3 May is recorded as a blackout period after the fact, overlapping classes on that day that were left in status 'published' (roll call was never run, so they never became 'completed'). The migration installs cleanly because both rows are in the past. Later an admin opens one of those historical classes to correct the coach name and saves; `admin_update_class_session` runs, the SET list mentions start_time/status, `enforce_class_blackout_conflict` fires with new.status='published', finds the overlapping past blackout and raises SESSION_OVERLAPS_BLACKOUT. That class row can never be edited again through the admin UI, and there is no admin-facing way to clear the condition short of deleting the blackout record.

**Quoted evidence (verify this exists verbatim)**

```
    where session.status in ('published', 'full')
      and coalesce(
        session.end_time,
        session.start_time + make_interval(mins => greatest(coalesce(session.duration_minutes, 60), 1))
      ) > now()
      and blackout.end_time > now()
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Make the trigger match the preflight: in `enforce_class_blackout_conflict`, return early when the session already ended (`if v_end <= now() then return new; end if;`) and add the same no-op short-circuit its sibling uses (`if tg_op = 'UPDATE' and new.start_time is not distinct from old.start_time and new.end_time is not distinct from old.end_time and new.duration_minutes is not distinct from old.duration_minutes and new.status is not distinct from old.status then return new; end if;`). Mirror the change in src/supabase/availability_schema.sql:87 and apply the symmetric bound to `enforce_blackout_class_conflict`.

---


## LOW

### 47. The publish path never checks audience, so a restored targeted notice fans a private member message out to every device

- **id:** `publish-path-missing-audience-guard`
- **severity (claimed):** low
- **location:** `api/admin-publish-announcement.js:159`
- **status:** UNVERIFIED

**What the auditor claims**

normalizeAnnouncementPublish validates title, body, tone, CTA and expiry but never reads audience, and the publish branch calls sendMemberAnnouncementPushes with no targetUserIds, which makes loadSubscriptions return every enabled device in the system (api/apns.js:95-103 - userIds is null, so no .in('user_id', ...) filter is applied). Targeted notices normally have published_at set at creation (admin_send_member_notice and create_class_cancellation_notice both insert published_at = now()), which is what keeps the fan-out gate closed. That protection is erasable: admin_archive_member_announcement sets 'archived_at = now(), archived_by = v_actor, published_at = null' with no audience filter (supabase/migrations/20260714010000_announcement_archival.sql:212-214), and unarchive does not restore published_at. Both admin_archive_member_announcement and publishMemberAnnouncement (src/lib/adminData.js:620,668) accept an arbitrary announcement id from the browser. The endpoint's own notify_class_cancellation and notify_targeted_announcement branches carefully re-check audience and source_kind and pass explicit targetUserIds, so the missing check on the one path that broadcasts to everyone is an inconsistency, not a policy.

**Claimed failure scenario**

An admin sends a private notice to one member via admin_send_member_notice ('Your membership is suspended pending the assault allegation - call us before Friday'), audience 'targeted'. Later they archive that notice for tidiness, which sets published_at = NULL, then unarchive it, then call publishMemberAnnouncement(thatId, ...) - for example from the member-notice screen or a retry of a stale admin action. existing.published_at is NULL, so the handler pushes the notice title and body to every enabled push_subscriptions row in the business. The message stays private in-app (RLS still filters by member_announcement_targets) but has already been rendered on every member's lock screen.

**Quoted evidence (verify this exists verbatim)**

```
    const publish = normalizeAnnouncementPublish(body);

    let existing = null;
    if (publish.id) {
      const result = await admin.from('member_announcements').select('id,published_at,archived_at,updated_at').eq('id', publish.id).maybeSingle();
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Select audience alongside published_at/archived_at in the existing-announcement lookup and reject the publish (409) when audience is not 'all', mirroring the audience/source_kind checks the two notify_* branches already perform. Belt and braces: have sendMemberAnnouncementPushes refuse to broadcast (targetUserIds === null) for any announcement whose audience is not 'all'.

---

### 48. delete-account returns raw upstream database and auth error text to the client

- **id:** `delete-account-raw-error-leak`
- **severity (claimed):** low
- **location:** `api/delete-account.js:67`
- **status:** UNVERIFIED

**What the auditor claims**

Every other endpoint in api/ maps failures to fixed public strings (checkout.js publicCheckoutFailure, admin-reconcile-order.js SAFE_ERRORS, push-subscription.js 'Push subscription could not be updated.', stripe-webhook.js's deliberately generic 500 with the comment 'A generic 500 makes Stripe retry without exposing provider or SQL details'). delete-account.js is the exception: deleteMemberAccount rethrows the untouched PostgrestError or AuthApiError from Supabase, and the handler serialises error.message straight into the response body. Those messages carry Postgres table names, column names, constraint names, RLS/permission wording, and GoTrue internals - free schema reconnaissance for any authenticated member, on the one endpoint that also happens to be the destructive one.

**Claimed failure scenario**

A member calls POST /api/delete-account with a valid token and {confirmation:'DELETE'} at a moment when the service role lacks a grant or a trigger rejects the write. The orders update fails and the raw error propagates, so the member receives HTTP 500 with a body such as {"error":"permission denied for table orders"} or {"error":"update or delete on table \"profiles\" violates foreign key constraint \"session_bookings_user_id_fkey\" on table \"session_bookings\""} - internal table, constraint and privilege details that no other endpoint in this API discloses.

**Quoted evidence (verify this exists verbatim)**

```
  } catch (error) {
    return json({ error: error.message || 'Could not delete account.' }, 500);
  }
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Return a fixed public string ({ error: 'Could not delete account.' }, 500) and log the real error server-side with the request id, following the createRequestTrace + console.error pattern already used in admin-refund-order.js:176-180 and admin-reconcile-order.js:166-170. Adopting createRequestTrace here would also give the member a correlatable id without leaking internals.

---

### 49. requestText re-serialises a pre-parsed body, and the bodyParser:false escape hatch it relies on is a Next.js-only option in this Vite project

- **id:** `request-text-reserialises-body-for-hmac`
- **severity (claimed):** low
- **location:** `api/http.js:29`
- **status:** UNVERIFIED

**What the auditor claims**

`requestText` is the raw-body source for Stripe HMAC verification (`constructVerifiedStripeEvent(stripe.webhooks, rawBody, signature, ...)`, api/stripe-webhook.js:483 and 495). Its second branch returns `JSON.stringify(request.body)` — a re-serialisation, not the bytes Stripe signed. The only thing keeping that branch unreachable is `export const config = { api: { bodyParser: false } }` at api/stripe-webhook.js:12, which is a Next.js API-route convention; this repository is a Vite SPA (package.json `"dev": "vite"`, `"build": "vite build"`, vercel.json declares only headers and rewrites) whose `api/*.js` files run as plain Vercel Node Functions, where body-parsing behaviour is a property of the runtime helper layer rather than of this config export. The default handler is not covered by any test — test/stripe-webhook.test.js exercises only the exported helpers — so nothing in CI would catch the branch being taken.

**Claimed failure scenario**

If the function is served by any layer that populates `request.body` with a parsed object (a Vercel Node helper that defines a lazy `body` getter, or an Express/connect shim used for local emulation), `requestText` returns `JSON.stringify(parsedEvent)` rather than Stripe's exact payload bytes. Any difference in whitespace or number formatting makes `constructEventAsync` throw, and the handler returns 400 'Invalid webhook signature.' for every delivery — combined with the ledger gap described in the signature-rejection finding, this is a total, silent fulfilment outage: members are charged, orders stay 'pending', and Operations Health stays green.

**Quoted evidence (verify this exists verbatim)**

```
export async function requestText(request) {
  if (request.body !== undefined) {
    if (typeof request.body === 'string' || Buffer.isBuffer(request.body)) {
      return request.body.toString();
    }
    return JSON.stringify(request.body);
  }
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Never HMAC a re-serialised body. Give the webhook its own raw-bytes reader that throws if the stream has already been consumed (rather than silently falling back to JSON.stringify), and prefer `Buffer` over `string` so the exact bytes reach `constructEventAsync`. Add one handler-level test that posts a genuinely signed payload through the default export so a runtime that pre-parses bodies fails in CI instead of in production.

---

### 50. ESLint has no global ignore for dist/, so `eslint .` walks 95 minified production build artefacts

- **id:** `eslint-lints-build-output`
- **severity (claimed):** low
- **location:** `eslint.config.js:7`
- **status:** UNVERIFIED

**What the auditor claims**

ESLint 9's only built-in global ignore is `**/node_modules/`; flat config does not read .gitignore. eslint.config.js contains no top-level `{ ignores: [...] }` entry, and the one `ignores` that does exist (line 14) is scoped to a config object that already has `files`, so it only narrows that object. Measured with the project's own config via the ESLint API: `lintFiles(['.'])` returns 389 results, of which 94 are under `dist/assets` and one is `dist/sw.js`. It exits 0 today only because those files resolve to `"rules": {}` — the same hole as the two findings above. This actively blocks the obvious fix for those findings: the moment a repo-wide config object is added (which is what you must do to lint api/ and src/lib/), `npm run lint` starts parsing 94 minified Rollup chunks. In CI it currently happens to be masked because .github/workflows/quality.yml runs Lint before Build, so dist/ does not exist yet — the failure only reproduces locally, which is the worst place for it.

**Claimed failure scenario**

A developer runs `npm run build` (dist/ now exists) and then adds the repo-wide config object needed to lint api/. `npm run lint` now applies eslint:recommended to `dist/assets/adminData-46pCFh5p.js` and the 93 other minified chunks, producing hundreds of `no-undef`/`no-empty`/`no-fallthrough` errors from generated code. The developer's rational response is to revert the config change, so api/ and src/lib/ stay permanently unlinted.

**Quoted evidence (verify this exists verbatim)**

```
export default [
  {
    files: [
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Add `{ ignores: ["dist/**", "node_modules/**", "coverage/**"] }` as the first element of the exported array — a config object containing only `ignores` is treated as a global ignore in flat config.

---

### 51. Calendar integration requests full read access on iOS 17+ where write-only would do, and the purpose string hides it

- **id:** `eventkit-full-access-over-request`
- **severity (claimed):** low
- **location:** `ios/XertFitnessApp/XertFitnessApp/Services/EventCalendarWriter.swift:124`
- **status:** UNVERIFIED

**What the auditor claims**

`EventCalendarWriter.requestAccess` calls `requestFullAccessToEvents()` on iOS 17+, which grants XERT read access to every event in the member's personal calendars, purely so that `add(_:)` can run `store.events(matching: predicate)` (lines 63 and 98) as a duplicate check before saving. EventKit on iOS 17 provides `requestWriteOnlyAccessToEvents()` for exactly this add-only use case. The declared purpose string is `NSCalendarsFullAccessUsageDescription` = "XERT adds the fitness events you choose to your calendar." (Info.plist:77-78) — it describes writing only and never discloses that the app will be able to enumerate the user's existing calendar. `NSCalendarsWriteOnlyAccessUsageDescription` is not declared at all, so the app cannot fall back to the narrower prompt.

**Claimed failure scenario**

A member on iOS 17 taps "Add to Calendar" on a booked class (AccountView / EventsView:257). The system prompt renders the write-sounding purpose string, the member taps Allow, and XERT is now permanently authorised to read the full contents of their default calendar — medical appointments, legal meetings, everything — which `store.events(matching:)` then actively enumerates on every subsequent add. Nothing in the app or in the PrivacyInfo.xcprivacy manifest (which declares no calendar data type at all) tells the member this happened.

**Quoted evidence (verify this exists verbatim)**

```
    private static func requestAccess(using store: EKEventStore) async -> Bool {
        if #available(iOS 17.0, *) {
            return (try? await store.requestFullAccessToEvents()) ?? false
        }

        return await withCheckedContinuation { continuation in
            store.requestAccess(to: .event) { granted, _ in
                continuation.resume(returning: granted)
            }
        }
    }
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Request `requestWriteOnlyAccessToEvents()` on iOS 17+ and add `NSCalendarsWriteOnlyAccessUsageDescription` to Info.plist. Drop the `store.events(matching:)` de-duplication (or gate it behind an explicit, separately-requested full-access opt-in) — EventKit write-only access is sufficient for `EKEvent` + `store.save`. If the duplicate check must stay, change `NSCalendarsFullAccessUsageDescription` to state plainly that XERT reads existing events to avoid creating duplicates.

---

### 52. Account deletion and sign-out leave member-linked identifiers in UserDefaults

- **id:** `account-deletion-leaves-local-member-state`
- **severity (claimed):** low
- **location:** `ios/XertFitnessApp/XertFitnessApp/Store/XertStore.swift:433`
- **status:** UNVERIFIED

**What the auditor claims**

`deleteAccount()` (and `signOut()`) purge only the Keychain session and pending local notifications. Every other on-device store keyed to the member survives: `PendingCheckoutStore` ("xert.checkout.pending") holds the member's `userID` UUID plus the UUIDs of their orders for 24h; `XertPinnedWorkspaceStore` / `XertWorkspaceOrderStore` / `XertOwnerWorkspacePinsStore` write keys of the form `xert.navigation.pins.v1.<user-uuid>` (XertNavigation.swift:479, 426; OwnerNavigation.swift:324); `PushDeviceTokenStore` retains the APNs token; `AdminSiteContentDraftStore` (AdminModels.swift:737-751) retains unpublished admin CMS drafts; and `AdminCommandCentreView`'s `@SceneStorage("xert.adminWorkspaceHistory")` / `"xert.adminNavigationUserID"` (lines 13-14) keep the admin's own user UUID and the member/order UUIDs they last inspected in the scene-restoration archive — `prepareOwnerNavigation` (line 168) only clears them when a *different* admin signs in, which never happens if the next user is a plain member.

**Claimed failure scenario**

A member exercises "Delete my account" in the iOS app. `api.deleteAccount` succeeds and the server row is gone, but the app container still contains, in cleartext UserDefaults, `{"userID":"<their uuid>","baselineOrderIDs":["<order uuid>",...]}` under `xert.checkout.pending`, `xert.navigation.pins.v1.<their uuid>` and `xert.navigation.workspace-order.v1.<their uuid>` keys, and their APNs device token. All of it is readable from an unencrypted iTunes/Finder backup or by anyone who signs into the app afterwards on the shared device, and it persists indefinitely because nothing keyed to a deleted account is ever expired. The same residue exists after ordinary sign-out on a shared/handed-over device.

**Quoted evidence (verify this exists verbatim)**

```
    @discardableResult
    func deleteAccount() async -> Bool {
        errorMessage = nil
        isDeletingAccount = true
        defer { isDeletingAccount = false }
        do {
            let authSession = try await validAuthSession()
            try await api.deleteAccount(session: authSession)
            replaceAuthSession(with: nil)
            KeychainStore.clearSession()
            await ClassReminderScheduler.shared.clearAll()
            return true
        } catch {
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Add a single `purgeLocalMemberState(userID:)` helper and call it from both `signOut()` and `deleteAccount()`: `PendingCheckoutStore.clear()`, `PushDeviceTokenStore.clear()`, `MemberPushPreference.setEnabled(false)`, `ClassReminderPreference.setEnabled(false)`, removal of the `xert.navigation.pins.v1.<uuid>`, `xert.navigation.workspace-order.v1.<uuid>` and `xert.owner-navigation.pins.v1.<uuid>` keys, and `AdminSiteContentDraftStore.clear(_:)` for every section. Also reset the admin `@SceneStorage` keys on sign-out (not only when a different admin signs in) by clearing `restoredNavigationUserID`, `restoredWorkspaceHistory` and `restoredRecentWorkspaces` from `RootView.resetMemberNavigationAfterSignOut`.

---

### 53. Eleven declared runtime dependencies are never imported by any first-party file, including three (28 MB) and date-fns (37 MB)

- **id:** `unused-runtime-dependencies`
- **severity (claimed):** low
- **location:** `package.json:25`
- **status:** UNVERIFIED

**What the auditor claims**

Scanning every .js/.jsx/.mjs/.css/.html file under src/, api/, scripts/ plus index.html, vite.config.js, tailwind.config.js and postcss.config.js for a quoted module specifier finds zero import sites for: @hello-pangea/dnd, @hookform/resolvers, @stripe/react-stripe-js, @stripe/stripe-js, canvas-confetti, date-fns, react-hot-toast, react-leaflet, react-markdown, three, zod. Spot-checked individually (`grep -rn "from 'three'"` etc.) — all eleven return 0 hits, and `grep -rlE 'THREE|WebGLRenderer' dist/assets` confirms three never reaches the bundle. These are in `dependencies`, not `devDependencies`, so `npm ci` installs all of them in the Vercel production build and in both CI jobs (three alone is 28 MB on disk, date-fns 37 MB, zod 5.2 MB). Every one is an npm package whose install/postinstall runs with the build's credentials for code the application never executes. Worth noting for the CSP reviewer: because @stripe/stripe-js is unused, no `js.stripe.com` script is ever injected, which is why the strict `script-src 'self'` in vercel.json does not currently break checkout — the app redirects to Stripe-hosted Checkout instead.

**Claimed failure scenario**

A routine `npm install`/`npm update` or a Dependabot bump resolves `three@^0.171.0` or `canvas-confetti@^1.9.4` to a newly published, compromised release. `npm ci` on the next Vercel deploy and on both CI runners executes that package's install lifecycle scripts with access to SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY and the Codemagic signing material — for a package no line of XERT code ever calls, so nothing in the app would look different and no test would fail.

**Quoted evidence (verify this exists verbatim)**

```
    "@stripe/react-stripe-js": "^3.0.0",
    "@stripe/stripe-js": "^5.2.0",
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Remove the eleven unimported packages from `dependencies` and re-run `npm ci && npm run build && node --test "test/**/*.test.js"` to confirm nothing regresses. date-fns and zod are still installed transitively (by react-day-picker and @hookform/resolvers' peers respectively) if anything genuinely needs them; declaring them directly while never importing them only widens the trusted install surface.

---

### 54. Two operations-health checks discard the Supabase error and report every failure as an uninstalled migration

- **id:** `health-check-misdiagnoses-any-error-as-missing-migration`
- **severity (claimed):** low
- **location:** `src/lib/adminData.js:1528`
- **status:** UNVERIFIED

**What the auditor claims**

The 'credit-audit' and 'schema-contract' health checks destructure `error` and then branch on its mere presence, discarding the error object and its code entirely, to conclude that a migration is not installed. Any failure — an RLS denial, an expired token, a 5xx, a network blip — produces the same verdict and the same remediation text. Every other capability probe in this same file discriminates on the PostgREST error code before drawing that conclusion: adminSearchMembers (l.737), adminListMemberNotes (l.851), adminListMemberNotices (l.882), adminListMemberFollowUps (l.925), adminWaitlistOverview (l.1021), getAdminDailyOperations (l.1030) and updateClassSession (l.147) all test `['42883', 'PGRST202'].includes(error.code)` (or PGRST202 alone) and rethrow anything else. These two checks skip that test, and unlike healthCheck's own catch branch (l.1258-1268) they never surface `error.message`, so the operator has nothing to diagnose from.

**Claimed failure scenario**

The `admins_read_credit_grants` RLS policy on admin_credit_grants is accidentally dropped during a migration replay (or the admin's JWT expires mid-page-load). The head-count query returns a 401/permission error. Operations Health renders 'Audited credit grants — attention: Manual credit grant auditing is not installed. Apply src/supabase/credit_grant_audit_upgrade.sql in Supabase.' The owner re-runs that SQL file, which is idempotent and changes nothing, the check still says 'not installed', and the real cause — that admins can no longer read the credit-grant audit trail — is never shown. The same applies to xert_public_capabilities, whose failure blanks the entire release-readiness contract behind 'Database capability reporting is not installed.'

**Quoted evidence (verify this exists verbatim)**

```
    healthCheck('credit-audit', 'Audited credit grants', async () => {
      const { count, error } = await supabase.from('admin_credit_grants').select('id', { count: 'exact', head: true });
      if (error) {
        return {
          status: 'attention',
          detail: 'Manual credit grant auditing is not installed.',
          action: 'Apply src/supabase/credit_grant_audit_upgrade.sql in Supabase.'
        };
      }
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

In both checks, gate the 'not installed' verdict on the missing-object codes the rest of the file uses (`['42883', '42P01', 'PGRST202', 'PGRST205'].includes(error.code)`) and `throw error` otherwise so healthCheck's catch branch reports status 'error' with the real message; alternatively append `error.message` to the detail string so the operator sees the actual cause.

---

### 55. metadataForPath echoes the raw request path into the canonical link and og:url, letting a crafted path point them at an attacker origin

- **id:** `canonical-url-reflects-external-origin`
- **severity (claimed):** low
- **location:** `src/lib/pageMetadata.js:42`
- **status:** UNVERIFIED

**What the auditor claims**

For any path that is not an exact key of PUBLIC_METADATA, metadataForPath returns `path: normalized`, where normalized is the request pathname with only trailing slashes stripped. RouteMetadata.jsx:20 then computes `new URL(metadata.path || '/', window.location.origin).href`. A pathname beginning with two slashes (or a slash followed by a backslash) is parsed by the WHATWG URL algorithm as scheme-relative, so the origin argument is discarded and the resolved href is an entirely different host. That value is written to <link rel="canonical"> (RouteMetadata.jsx:37) and to the og:url meta tag (RouteMetadata.jsx:27). The Vercel rewrite in vercel.json:40 serves index.html for every non-/api path, so any such URL reaches the SPA.

**Claimed failure scenario**

A visitor is sent to https://xert-fitness.vercel.app//evil.example/xert-deal . Vercel rewrites it to index.html, React Router reports pathname '//evil.example/xert-deal', metadataForPath returns path '//evil.example/xert-deal', and RouteMetadata sets <link rel="canonical" href="https://evil.example/xert-deal"> plus <meta property="og:url" content="https://evil.example/xert-deal"> on a page served from the XERT origin — the site declares an attacker-controlled domain as its own canonical location. Impact is limited today only because the same branch also emits robots "noindex, nofollow" (pageMetadata.js:41 -> RouteMetadata.jsx:24); anyone who later makes unmatched paths indexable, or any JS-rendering crawler that honours canonical over robots, gets a live SEO hijack.

**Quoted evidence (verify this exists verbatim)**

```
    indexable: false,
    path: normalized,
  };
}
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Do not echo unmatched paths back. Return a fixed safe path for the fallback branch (e.g. `path: '/'` when the pathname is not a known key), or sanitise before use: reject any normalized value that does not match /^\/(?![/\\])[\w\-/]*$/ and fall back to '/'.

---

### 56. Re-running booking_schema.sql re-grants the superseded, version-unchecked admin_update_product and admin_archive_member_announcement overloads that later migrations revoked

- **id:** `booking-schema-regrants-superseded-overloads`
- **severity (claimed):** low
- **location:** `src/supabase/booking_schema.sql:155`
- **status:** UNVERIFIED

**What the auditor claims**

Migration 20260714020000_catalog_optimistic_locking.sql:119 deliberately revokes EXECUTE on the two-argument `admin_update_product(uuid, jsonb)` from `authenticated` so every product edit must go through the three-argument overload that enforces `PRODUCT_STALE`; 20260714019000_shared_admin_optimistic_locking.sql:68 does the same for `admin_archive_member_announcement(uuid, boolean)` in favour of the version-checked three-argument form. But booking_schema.sql still defines both superseded overloads and grants them back to `authenticated` (lines 154-155 and 1228), and the README documents booking_schema.sql as idempotent, safe to re-run, and part of both the fresh-database and the already-deployed apply sequences. PostgREST resolves RPC overloads by the set of argument names in the JSON body, so once both overloads are executable a request that omits `p_expected_updated_at` silently lands on the unguarded one. The capability markers in `xert_schema_capabilities` are unaffected, so `release_readiness_check.sql` and Operations Health still report green after the regression.

**Claimed failure scenario**

An operator applies all 42 migrations, then re-runs booking_schema.sql to pick up an unrelated fix (the README says the scripts are idempotent). `admin_update_product(uuid, jsonb)` becomes EXECUTE-able by `authenticated` again. A client that omits the version argument — an older iOS build, or any build where `AdminProduct.updated_at` decodes as nil so JSONEncoder drops `p_expected_updated_at` from AdminProductUpdateRequest (ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift:1183) — now resolves to the two-argument overload. Two admins editing the same session pack concurrently both succeed, the second silently overwrites the first's price change, and no PRODUCT_STALE error is ever raised. Operations Health continues to report catalog_optimistic_locking as installed.

**Quoted evidence (verify this exists verbatim)**

```
revoke execute on function public.admin_update_product(uuid, jsonb) from public, anon;
grant execute on function public.admin_update_product(uuid, jsonb) to authenticated;
```

**Auditor's proposed fix (evaluate, do not apply blindly)**

Delete the superseded overloads rather than re-granting them. In booking_schema.sql replace lines 154-155 with `drop function if exists public.admin_update_product(uuid, jsonb);` and line 1228 with `drop function if exists public.admin_archive_member_announcement(uuid, boolean);` (or, if the definitions must stay for rollback, change both grants to `revoke execute ... from public, anon, authenticated`). Add a release_readiness_check.sql assertion that `has_function_privilege('authenticated', 'public.admin_update_product(uuid,jsonb)', 'execute')` is false.

---

