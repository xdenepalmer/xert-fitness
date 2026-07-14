# XERT Fitness SwiftUI App

This folder contains the SwiftUI iOS companion app for the Vercel/Supabase XERT Fitness web app. It uses Supabase REST/Auth directly with `URLSession`, so there is no extra SDK requirement.

## Setup

1. On a Mac with Xcode 15+ installed, install XcodeGen once: `brew install xcodegen`.
2. Copy `Config.example.xcconfig` to `Config.xcconfig` and fill in your Supabase and Vercel values.
   Keep the `https:/$()/` URL style in the xcconfig file; Xcode expands it to `https://` without treating the value as a comment.
3. From this directory, run `xcodegen generate`, then open `XertFitness.xcodeproj` in Xcode.
4. Choose your Apple development team and a unique bundle identifier before running on a device. The generated project targets iOS 16+.

`project.yml` wires the application target, test target, `Config.xcconfig`, and the bundled `Info.plist`; no manual file-target assembly is needed.

The included `Info.plist` already contains these xcconfig substitutions:

```xml
<key>SUPABASE_URL</key>
<string>$(SUPABASE_URL)</string>
<key>SUPABASE_ANON_KEY</key>
<string>$(SUPABASE_ANON_KEY)</string>
<key>VERCEL_BASE_URL</key>
<string>$(VERCEL_BASE_URL)</string>
```

## Included

- Native SwiftUI tab app: Home, Book, Events, Account.
- Admin-only native Command Centre tab with owner business metrics, today's
  class desk, FIFO waitlist promotion, searchable member directory, retention
  follow-up logging, finance visibility, and optimistic-locked live platform
  controls, native PT request management, and immediate member notice publishing
  to web, in-app inboxes, and APNs. Supabase role checks and every admin RPC
  remain enforced server-side. Native operations health reports the complete
  migration contract alongside authenticated Stripe and APNs readiness.
  The native audit ledger merges recent access, credit, request, notice, lead,
  schedule, content, and booking changes into one searchable owner timeline.
  Owners can also edit live session-pack names, descriptions, prices, credit
  counts, validity, ordering, sale state, featured state, and Stripe Price IDs.
  Updates use the same optimistic-locked Supabase RPC and catalogue as the web
  command centre, so native changes flow directly into member checkout.
  The event command centre provides native event creation, editing, visibility,
  deletion, Queensland date handling, member training-goal counts, and contactable
  training-group rosters from the same calendar shown on the website and member app.
  Native team-directory controls create, edit, order, publish, hide, and remove
  coaches and practitioners, including bios, experience, training goals, imagery,
  and social links with the same optimistic locking used by the desktop manager.
  The native class desk opens live member rosters, resolves requested bookings,
  manages waitlist removals and cancellations, provides direct member contact,
  and records complete attended/no-show roll calls atomically. Credit release,
  capacity checks, FIFO promotion, and class completion remain server enforced.
  A searchable full-timetable manager creates and edits class metadata, booking
  modes, capacity, visibility and delivery details; duplicates classes as future
  drafts; and uses the dedicated cancellation workflow to return credits and
  request member push notification. Terminal classes cannot be reopened.
- Supabase password auth, sign-up, reset, and signed-in password updates.
- Password recovery that sends members to the existing web reset page.
- Secure token persistence in Keychain.
- Optional Face ID, Touch ID, or device-passcode privacy lock that hides all signed-in tabs whenever the app leaves the foreground.
- Member contact-detail viewing and editing, matching the web account workflow.
- Product, class session, booking, credit, and event loading.
- Searchable class discovery with Queensland-aware today/7-day windows, open-spot and beginner-friendly filters.
- Source-level offline and partial-refresh notices, with cached public data kept usable when individual services fail.
- Coalesced, generation-guarded refreshes that cannot restore private member data after sign-out or an account change.
- Bounded API timeouts with clear offline, timeout, service reachability and secure-connection errors.
- Upcoming-event filtering in the XERT/Queensland calendar, plus event detail links when an admin supplies one.
- Booking RPC support through `book_session`.
- Instant booking, staff-confirmed booking requests, waitlist visibility, and member cancellation or waitlist withdrawal.
- Self-service joining for full-class waitlists without consuming a class credit.
- Live FIFO waitlist positions with atomic next-member promotion enforced by the shared backend.
- Member-controlled device reminders before future confirmed classes; permission is requested only when enabled, reminders are removed when disabled, cancelled, or signed out, and tapping one opens the matching booking even after a cold launch or privacy unlock.
- Interest-only class handoff to the live XERT timetable/registration form.
- Vercel checkout launch through `/api/checkout`, with a user-bound 24-hour
  pending-purchase baseline so cold launches, sign-in recovery and delayed
  Stripe webhooks keep reconciling credits and purchase history safely.
- Native purchase history includes reconciled refund dates and amounts from the shared Stripe audit workflow.
- Live member notices authored in the admin command centre, with priority, automatic expiry, member dismissal, and aggregate reach shared across web and iOS.
- Seven-day credit-expiry warnings for members, backed by an admin follow-up queue for proactive retention.
- Refresh-token renewal on launch and focused decoding tests for the Supabase data contract.

Members can enable the privacy lock under **Account → Account Security**. The preference stays on the device; biometric and passcode results are evaluated by iOS and are never sent to XERT or Supabase.

The app expects the same Supabase schema used by the web app in `src/supabase/booking_schema.sql`. Apply
`src/supabase/booking_modes_upgrade.sql` to the deployed project before using request-to-book classes in either app.

## Codemagic

The repository-root `codemagic.yaml` has two macOS workflows:

- `ios-verify` runs on pushes and pull requests to `main`; it generates the XcodeGen project and executes the Swift unit tests on an available iPhone simulator without code signing.
- `ios-testflight` is a manual, signed TestFlight release workflow. It runs the same tests, increments the App Store build number, creates an IPA, and uploads it to TestFlight.

Both workflows use `ci/run-swift-tests.sh`, which explicitly boots the selected iPhone simulator and bounds simulator startup and test execution. A stalled test host now fails with a clear timeout instead of consuming the full build duration.

Create the XERT-specific Codemagic environment group named `xert_env` and add these variables to it. The same group is loaded by both workflows:

```text
SUPABASE_URL       # Supabase project URL
SUPABASE_ANON_KEY  # Supabase anon/public client key
VERCEL_BASE_URL    # deployed Vercel https:// URL
```

`ios-verify` can run without these variables: it uses compile-only placeholders and never makes a service request. `ios-testflight` requires the real values and stops with a clear setup error when one is absent.

Codemagic discovers the repository configuration from the root-level `codemagic.yaml` filename. A separate `config.yaml` is not a Codemagic workflow file and is intentionally not used.

The signed release workflow also loads the shared `appstore` group. It expects the secure `CERTIFICATE_PRIVATE_KEY` supplied by the team (with compatible legacy fallback names) and reuses that key to fetch the existing App Store distribution certificate rather than creating another certificate.

Create or use the shared App Store Connect integration named `codemagic`, then enable **Push Notifications** for `com.xertfitness.app` in Apple Developer and fetch its App Store provisioning profile. The release guard verifies the bundle identifier, complete iPad orientation metadata, export-compliance declaration, `aps-environment`, `application-identifier`, and the bundled `PrivacyInfo.xcprivacy` in the signed IPA before TestFlight upload. It intentionally fails when the App ID/profile is missing the push capability or Apple-required bundle metadata is absent.

Before starting a signed build, run `src/supabase/release_readiness_check.sql` in the production Supabase SQL editor. All 30 rows must show `installed = true` and `release_ready = true`; otherwise the service-contract preflight stops before signing and names the missing capability.

Remote member notices also require these server-only Vercel variables. Never place them in `xert_env`, the app bundle, or a `VITE_` variable:

```text
APNS_KEY_ID       # Apple Push Notification authentication key ID
APNS_TEAM_ID      # Apple Developer Team ID
APNS_PRIVATE_KEY  # complete .p8 private key, stored as a Vercel secret
APNS_BUNDLE_ID    # com.xertfitness.app
```

The APNs authentication key is team-wide and reusable across apps, so keep one stable key rather than creating per-build certificates. TestFlight reports Stripe and APNs readiness as warnings while those Vercel services are being configured; signing, schema, entitlements, privacy, and Apple bundle validation remain hard release gates. Add `REQUIRE_PRODUCTION_SERVICES=true` to `xert_env` when the team wants Stripe/APNs warnings to block releases as well.
