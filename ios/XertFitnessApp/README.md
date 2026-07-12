# XERT Fitness SwiftUI App

This folder contains a SwiftUI iOS companion app scaffold for the Vercel/Supabase XERT Fitness web app. It uses Supabase REST/Auth directly with `URLSession`, so there is no extra SDK requirement.

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
- Secure token persistence in Keychain.
- Member contact-detail viewing and editing, matching the web account workflow.
- Product, class session, booking, credit, and event loading.
- Booking RPC support through `book_session`.
- Instant booking, staff-confirmed booking requests, and request cancellation.
- Vercel checkout launch through `/api/checkout`.
- Refresh-token renewal on launch and focused decoding tests for the Supabase data contract.

The app expects the same Supabase schema used by the web app in `src/supabase/booking_schema.sql`. Apply
`src/supabase/booking_modes_upgrade.sql` to the deployed project before using request-to-book classes in either app.
