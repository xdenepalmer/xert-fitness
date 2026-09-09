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
node scripts/verify-design.mjs --tag=nav --routes=/ --navigation --announcement
node scripts/verify-design.mjs --tag=motion --motion=default --quick
node scripts/verify-design.mjs --tag=panels --routes=/admin,/admin/calendar,/admin/forms
node scripts/verify-design.mjs --tag=owner --routes=/admin --shell --commands --recovery
```

The full matrix uses 390×844, 768×1024, 1440×900 and 1920×1080. It captures resting,
scrolled, signed-in/signed-out menu and 200% text states, checks horizontal overflow,
keyboard containment and Escape focus restoration, records runtime errors, and
exports a real 1024px branded QR PNG. `--quick` uses the phone and desktop sizes.
`--navigation` additionally verifies the collapse heights, active underline,
next-class and account content, failed availability/retry, breakpoint cleanup,
and real touch gestures (finger tracking, dismissal and non-dismissal while the
content is scrolled). `--announcement` uses a long fictional announcement to
check that the full banner clears the header and hero at both text sizes.
Interaction results are reported separately so an unrelated page overflow does
not hide the navigation test outcomes.
`--shell` checks persistent density, pointer-independent sidebar resizing, an icon
rail, fuzzy results, manual-activation tabs, shortcuts and preservation of an
actual unsaved editor draft when navigation is cancelled. `--commands` enables an
explicit in-memory fixture for five reviewed command flows: confirmation,
attendee addition, attendance correction/Undo, form publication and SMS preview.
Only that fixture can simulate successful writes; all real destinations remain
blocked, including the SMS endpoint. Failure/retry and duplicate-submit checks
assert exact fixture receipts. The command review is also checked at 200% text.
`--recovery` deliberately fails one local workspace chunk download and verifies
that the shell survives and explicitly chosen reload recovery preserves URL
parameters. A browser-cached module failure needs a fresh document, distinct
from the local region retry offered for ordinary render errors.
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

Use **XERT iOS Verify**, not **XERT iOS TestFlight**, for design checks. The manual
build dialog selects the branch and workflow separately; confirm both and then
confirm the resulting build overview names the intended SHA. Keep SSH/VNC off.

The verification workflow opts into XCTest attachment export. Its artifacts
include `build/test-results.xcresult` and exported PNG/JSON files under
`build/test-attachments/`. The test runner preserves Xcode's original result even
if attachment export fails. A successful build with no images is compilation/test
evidence only, not visual approval. A failed compile means the new tests did not
run, even when the workflow still produces a result bundle.

For each native change, record the following separately:

1. Exact commit and successful Xcode build/test result.
2. The real test fixture or workspace rendered, text size and simulator/device.
3. Retrieved screenshots inspected for wrapping, clipping, contrast and hierarchy.
4. Interaction checks for touch targets, selection, disabled/loading states and
   focus. A larger outer frame or a taller screenshot does not prove a hit area.
5. VoiceOver reading order, labels, values and actions on an actual simulator or
   device, plus Reduce Motion and Reduce Transparency behavior.

Native design-kit fixtures run inside the test target with fictional state and
no production screen, account or network requests. Their screenshots cover the
primitives, not owner workspaces that have not yet been converted. Never add an
authentication bypass to production screens to obtain screenshots. If a browser
blocks an artifact download, do not bypass its protections; report the missing
evidence and request the artifact through the normal user download flow.

Native visual evidence must cover the converted screens at default and
accessibility text sizes. A separate VoiceOver pass remains necessary; neither
source-pattern tests nor a compile-only result establishes that pass.
