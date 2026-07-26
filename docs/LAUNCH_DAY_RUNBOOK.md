# XERT Launch Day Runbook

Use this checklist for the public member-app and booking launch. The protected
Command Centre is the operational source of truth; do not infer readiness from
the public website alone.

## Owners

- Launch lead: Byron (platform controls and member communications)
- Technical release: confirm the deployed Git SHA, Codemagic result and service health
- Payment incident owner: pause payments first, then reconcile from Operations Health
- Class-day owner: protect the roster, member credits and attendance record

## 30 minutes before opening

1. Open **Command Centre → Operations Health** and refresh.
2. Require the **Member purchase + booking path** gate to show **Ready to open**.
3. Confirm the timestamp is current. Never launch from a stale last-known snapshot.
4. Confirm the TestFlight owner device appears under **Member push
   notifications**, send the private production owner push test, and require a
   successful attempt from the last 24 hours.
5. Run the portable live preflight from the repository:

   ```bash
   npm run stripe:launch:check
   ```

   This gate expects payments to remain paused while it checks the production
   deployment, Stripe catalogue, webhook, database contracts and kill switch.
6. Confirm at least one future public class has the intended capacity, coach,
   booking mode and location.
7. Confirm Byron can sign in on a second device before changing either launch switch.
8. Record the production Git SHA and the successful Codemagic iOS Verify build ID.
9. In App Store Connect, confirm TestFlight **Beta App Description**, feedback
   email and review contact are populated before starting an external beta build.
10. In the iOS app, open **Command Centre → Class Desk → target class**. Refresh,
    require a current **Roster verified** timestamp, then use the share button to
    export the class roster CSV. Store it securely for check-in continuity. The
    **Roll call draft** column may include unsaved local marks; Supabase remains
    authoritative. Reconcile after recovery, then delete every temporary roster copy.
    If iOS restores an interrupted roll call, review the recovered marks against
    the newly verified roster before saving. Committed server attendance always wins.

## Pre-open member smoke path

Use a non-admin member account. Do not use a real card until the guarded payment
activation step is complete.

1. Create/sign in to the member account.
2. Complete readiness and verify the app advances to the next activation step.
3. Open a specific class and confirm the app preserves it when the member signs in.
4. Open session packs and confirm checkout remains clearly paused before activation.
5. Confirm the target class is instant-book or request-to-book, not interest-only.
6. Check Byron's Activation Cockpit and class roster without exposing private
   readiness details.

## Opening bookings and payments

1. Enable **Bookings** only after the launch gate is current and ready.
2. Complete the guarded Stripe activation in **Platform Controls**.
3. Immediately run:

   ```bash
   npm run stripe:launch:verify
   ```

4. Make one controlled live purchase, verify exactly one paid order and one
   credit grant, then confirm the exact class survives checkout return.
5. Confirm the app asks the member to book; it must never auto-book after payment.
6. Book, cancel and rebook according to the displayed policy. Verify credits once.
7. Enable reminders and confirm the booking appears in the member itinerary.
8. Reopen Operations Health, require **Launch path is live**, and capture the refreshed result.

## Kill switches and rollback

If checkout, fulfillment or reconciliation is uncertain:

1. Turn **Session pack payments** off. Existing bookings and credits remain visible.
2. Do not manually grant credits until the Stripe Event ID and order are checked.
3. In Operations Health, copy the incident ID and use **Retry safely** only when
   the incident has no manual-review resolution. The path is idempotent.
4. If booking integrity is uncertain, turn **Bookings enabled** off. Members fall
   back to interest/contact paths; existing places are not deleted.
5. Never mark a Stripe incident handled until the member's payment and entitlement
   are reconciled and evidence is recorded.

## Service incidents

### Owner cannot sign in

- Keep both launch switches off.
- Verify network reachability and Supabase status.
- Use the second tested owner device; never alter roles from a member session.
- If no protected owner session is available, hold launch.

### Supabase or Command Centre unavailable

- Do not act from missing counts or a stale health snapshot.
- Pause new bookings/payments if owner access is still available.
- Use the last exported roster only for contact/check-in continuity; reconcile
  attendance after the authoritative service returns.
- The iOS Class Desk retains an unfinished roll call for up to 12 hours on that
  owner device. It stores booking IDs and marks only, never member contact or
  readiness data. Reopen and refresh the same class before completing it.

### Stripe/webhook incident

- Pause payments immediately.
- Preserve the Stripe Event ID, order ID, timestamp and member email.
- Use the recovery controls in Operations Health and follow
  `docs/STRIPE_LAUNCH_RUNBOOK.md` for detailed reconciliation.

### Push unavailable

- Keep launch switches off until APNs configuration, a production owner device
  and a successful owner push test are current in Operations Health.
- Use the in-app notice plus direct email/SMS for time-sensitive class changes.
- After restoring APNs, retry device registration from **Account → App
  Preferences**, send another owner push test, and refresh all launch gates.

## Evidence to retain

- deployed Git SHA and Vercel production URL
- successful Codemagic build ID for that SHA
- launch-gate timestamp and required-gate result
- production owner push-test timestamp and result
- Stripe preflight and post-activation verification output
- controlled purchase order ID and Stripe Event ID
- any rollback time, owner, reason and member remediation

Launch is complete only after the controlled live purchase and booking are
reconciled, Byron can operate the class desk, and both health and member flows
remain stable for the agreed observation window.
