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
- Supabase password auth and sign-up.
- Password recovery that sends members to the existing web reset page.
- Secure token persistence in Keychain.
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
- Member-controlled device reminders two hours before future confirmed classes; permission is requested only when enabled, and reminders are removed when disabled, cancelled, or signed out.
- Interest-only class handoff to the live XERT timetable/registration form.
- Vercel checkout launch through `/api/checkout`.
- Refresh-token renewal on launch and focused decoding tests for the Supabase data contract.

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

Create or use the shared App Store Connect integration named `codemagic`, then enable **Push Notifications** for `com.xertfitness.app` in Apple Developer and fetch its App Store provisioning profile. The release guard verifies `aps-environment`, `application-identifier`, and the bundled `PrivacyInfo.xcprivacy` in the signed IPA before TestFlight upload, so it intentionally fails when the App ID/profile is missing that capability or the App Store privacy declarations are absent.

Before starting a signed build, run `src/supabase/release_readiness_check.sql` in the production Supabase SQL editor. All six rows must show `installed = true` and `release_ready = true`; otherwise the service-contract preflight stops before signing and names the missing capability.
