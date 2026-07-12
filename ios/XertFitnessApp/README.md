# XERT Fitness SwiftUI App

This folder contains a SwiftUI iOS companion app scaffold for the Vercel/Supabase XERT Fitness web app. It uses Supabase REST/Auth directly with `URLSession`, so there is no extra SDK requirement.

## Setup

1. In Xcode, create a new iOS App project named `XertFitness`.
2. Add the files in `XertFitnessApp/` to the app target.
3. Copy `Config.example.xcconfig` to `Config.xcconfig`, fill in your Supabase and Vercel values, and add it to the app target build settings.
   Keep the `https:/$()/` URL style in the xcconfig file; Xcode expands it to `https://` without treating the value as a comment.
4. Add these keys to the app `Info.plist` with the matching xcconfig substitutions:

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
- Product, class session, booking, credit, and event loading.
- Booking RPC support through `book_session`.
- Vercel checkout launch through `/api/checkout`.

The scaffold expects the same Supabase schema used by the web app in `src/supabase/booking_schema.sql`.
