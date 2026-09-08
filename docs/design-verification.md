# Design verification

The design overhaul lives on `feat/design-overhaul`. Its source specification is
[DESIGN_OVERHAUL_PLAN.md](DESIGN_OVERHAUL_PLAN.md). A passing web build does not
prove the native app compiles or that a screen works with VoiceOver.

## Automated gates

```sh
npm test
npm run lint
npm run build
```

The build first checks that the generated CSS, Tailwind and Swift artifacts match
`design/tokens.json`. Edit the source tokens and run `npm run tokens:build`; do not
edit the generated outputs.

## Isolated browser checks

`scripts/verify-design.mjs` starts its own loopback Vite server and a separate,
headless browser. It does not attach to an existing browser profile. Fictional
sessions and network responses live in `test/fixtures/design-data.mjs`, outside
the application bundle. All remote data traffic and local `/api/` mutations are
blocked; unauthenticated Google Fonts requests are permitted for accurate type.
The app's real authentication provider, route guards and components still run.

The runner requires Playwright, installed independently of production dependencies.
When it is not in the repository's module search path, set `PLAYWRIGHT_MODULE` to
the installed package's absolute `index.mjs` path. Set `BROWSER_CHANNEL=chrome`
to use an installed Chrome binary instead of Playwright's bundled Chromium.

```sh
node scripts/verify-design.mjs --tag=after-nav
node scripts/verify-design.mjs --tag=motion --motion=default --quick
node scripts/verify-design.mjs --tag=panels --routes=/admin,/admin/calendar,/admin/forms
```

The full matrix uses 390×844, 768×1024, 1440×900 and 1920×1080. It captures resting,
scrolled, signed-in/signed-out menu and 200% text states, checks horizontal overflow,
keyboard containment and Escape focus restoration, records runtime errors, and
exports a real 1024px branded QR PNG. `--quick` uses the phone and desktop sizes.
Results and images are written under `.superpowers/design-proof/<tag>/` (local,
git-excluded proof). Keep the result JSON alongside screenshots: a screenshot alone
is not a passing assertion. Read the fixture request logs to distinguish a genuine
empty state from an endpoint the fixture has not implemented.

These are UI checks with controlled I/O, not end-to-end production transaction
tests. They never confirm a real booking, send a message or take a payment.

## Native verification

The existing **XERT iOS Verify** Codemagic workflow can be manually run against
`feat/design-overhaul`. Check the selected commit before starting. It generates
the Xcode project and runs the Swift unit tests on a Mac simulator. This workflow
does not publish a TestFlight build. Keep its build URL and exact SHA as evidence.

Native visual evidence must cover the converted screens at default and
accessibility text sizes. A separate VoiceOver pass remains necessary; neither
source-pattern tests nor a compile-only result establishes that pass.
