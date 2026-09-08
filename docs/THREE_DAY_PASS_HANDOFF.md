# Three Day Pass handoff

Local implementation only; not pushed, merged, deployed, or enabled remotely.
Branch: `codex/three-day-pass-purchase`, based on `665bc0a348942d8ec23a401cd0805449d413282b`.
Intended public link after an approved deployment: `https://xertfitness.com.au/3daypass`.

## Scope and architecture

- Reuses the casual visitor page and signed pre-exercise questionnaire without requiring an account. Both questionnaire entry links preserve the visitor and the allow-listed `/3daypass` return.
- The new `three_day_pass` checkout action validates the visitor and checks a service-role-only boolean RPC against the exact saved, signed questionnaire response and participant contact details. A browser checkbox or response ID alone is not proof.
- The server fixes the new pass at AUD 3500 cents. Client-supplied price/currency/kind cannot change it. Stripe metadata distinguishes the pass. Minute-stable expiry and a hash of the complete server-built parameters keep retries consistent without colliding after contact/origin changes.
- The paid-session webhook verifies mode, amount, currency, session ID, approved kind and questionnaire metadata. It records the verified participant identity, not an editable Stripe payer email. Duplicate deliveries do not overwrite an existing receipt/refund; the visitor delivery ledger is completed. These two shared webhook reliability changes also cover casual receipts. Legacy casual price, checkout and identity selection are unchanged.
- The additive SQL defaults existing/new legacy records to `casual`, permits only `casual` and `three_day_pass`, and labels owner receipts distinctly. The owner payments list shows the pass kind and falls back to the legacy columns if the new column is absent.
- There is no membership, member credit, scanner entitlement, or automated visit provisioning. Staff confirm the receipt and arrange visits. The `paid=1` return is conditional receipt guidance, not evidence of payment.

## Price and terms need owner reconciliation

The user explicitly approved AUD **$35.00** for this route. The existing website agreement at `src/lib/xertTermsAgreement.js:60` instead says **$35.90**, **three trading days**, all classes over those days, and equipment during operational hours. Those legal terms were not edited. Earlier three-class/from-purchase wording originated in a different GymLoop tenant configuration and was removed because it was not verified for this website product. New page/Stripe/owner copy is neutral; confirm and reconcile the commercial/legal terms before launch.

## Deployment order and remaining gates

1. Review the exact final diff/SHA and CI, and resolve the price/terms discrepancy. This handoff does not authorize a merge or deployment; merges remain user-controlled in Chrome.
2. Follow the repository's manual SQL convention in the root README's **Database** section. Review dependencies, back up appropriately, and apply `supabase/migrations/20260908010000_three_day_visitor_pass.sql` only to an explicitly approved environment. There is no configured Supabase CLI project here; no remote database was connected or modified.
3. Deploy the reviewed checkout, webhook and frontend together after the migration. The new checkout fails closed without the capability/RPC/settings; the owner list's old-column fallback preserves casual visibility during an out-of-order rollout. The existing `casual_payments_enabled` switch controls both visitor variants; this work does not enable it.
4. Verify the approved environment with Stripe test mode and owner receipt handling before enabling/promoting. No live or test Stripe charge, test email, provider configuration, or end-to-end provider fulfilment was performed. No remote migration was applied.

## Verification (2026-09-08)

All commands below ran locally from this checkout after the review fixes:

| Command | Observed result |
| --- | --- |
| `npm test` | 1107 tests, 1107 passed, 0 failed/skipped/cancelled |
| `npm run lint` | Exit 0; no lint errors |
| `npm run typecheck` | Exit 0 |
| `npm run build` | Exit 0; 1983 modules; PWA precache verified 129 JS/CSS assets, including 8 admin chunks |
| `python -X utf8 scripts/check-sql-syntax.py` | Parsed 130 SQL files; no SQL syntax problems (bundled Python with pglast) |
| `psql -X -h 127.0.0.1 -p 54332 -U postgres -d postgres -v ON_ERROR_STOP=1 -v apply_migration=1 -f test/sql/three-day-pass.sql` | Exit 0; `Three Day Pass SQL fixture checks passed.`; transaction rolled back |
| Same SQL fixture with `-v apply_migration=0` before implementation | Expected failure: pass_kind missing, proving distinct storage regression |
| `git diff --check` | Exit 0; only Windows LF/CRLF conversion warnings |

The isolated PostgreSQL 16 fixture checks legacy defaults, allowed kind, service-role-only proof and signature/contact rejection, idempotent migration, one receipt per session, distinct/escaped owner label, and no repeated owner notification. It uses synthetic tables/alert transport and does not certify an entire production schema or live mail delivery.

Local Chrome verification used synthetic stored questionnaire completion and intercepted every non-local request. It checked mobile layout without horizontal overflow, the $35 price, both questionnaire handoffs, restored participant details, exact checkout payload, error display, home navigation, and neutral receipt return, with no page errors. Root review separately checked 390px/1440px. This is fixture UI verification, not a live signed-form/Stripe integration test.

Red/green tests also covered rejected proof and disabled/missing readiness, mismatched paid amount/kind/currency, duplicate webhook delivery, different payer email, same-minute retry stability, changed-parameter key separation, neutral copy, old-schema admin fallback, and lower questionnaire return link.

Evidence folder (outside the repo): `C:/Users/Deneo/AppData/Local/Temp/xert-3daypass-9e6dbee444874a778479b2602084bea8/`:

- `final-tests-after-review.log`, `final-static-build.log`, `final-sql.log` contain exact command output.
- `browser-check.mjs`, `three-day-pass-mobile.png`, `three-day-pass-return-mobile.png` contain the local browser fixture and screenshots.
- `data/`, `stdout.log`, `stderr.log` belong only to the disposable PostgreSQL fixture, not a shared or remote database.

The exact disposable data directory was verified before `pg_ctl -m fast stop`; shutdown returned `server stopped`. The local browser and Vite fixture server were also closed.

Non-blocking existing tooling notices: Browserslist data is seven months old; dependency install reported 9 audit findings (1 low, 3 moderate, 5 high). No dependency upgrade or audit fix was applied as part of this feature.
