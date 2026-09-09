# Three-month paperwork repair implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Follow the test-first checklist below.

**Goal:** Repair `/3months` so a new applicant can complete the member questionnaire and accepted, signed terms, then reach the existing payment flow.

**Architecture:** Keep originals in `xert_form_responses`. A server-only database function checks the exact two saved response IDs and matching purchaser identity, returning only a boolean. Browser completion markers guide navigation but never authorize checkout. Keep the existing already-signed staff-follow-up policy and payment architecture.

**Tech Stack:** React/Vite, Node checkout API, Supabase/PostgreSQL, existing Stripe Checkout; pinned PGlite for isolated executable SQL regression tests.

**Spec:** User approval in this thread: “And yes fix the 3montys”, following the published release's explicitly outstanding `/3months` paperwork defect. This document records the bounded repair contract; it does not resume the wider design/native overhaul.

## Global Constraints

- Work only in `Z:/Projects/xert-fitness/.worktrees/design-overhaul`, branch `feat/design-overhaul`; preserve unrelated work.
- Keep the $430 default and current editable prices/discounts unchanged. Do not change payment amounts, fees, activation, emails, Stripe/webhook behavior, or any Zap.
- Preserve the existing `already_signed: true` policy: purchase remains possible when records cannot be found, with `paperwork_verified: false` and the existing staff follow-up. Database errors still fail closed before Stripe.
- Never alter, delete, backfill, or recreate anyone's original submitted answers, signed terms, snapshots, or form definitions.
- No raw health answers, signatures, or date of birth may be added to checkout requests, payment metadata, RPC results, logs, or completion markers by this repair.
- New proof functions are `SECURITY INVOKER`, have an empty search path and schema-qualified relations, and are executable only by `service_role` (revoke PUBLIC, anon, authenticated).
- No production test submissions, payments, emails, membership changes, or database fixture rows. The controller alone publishes reviewed changes and applies the reviewed migration to the verified XERT project.

## Verified diagnosis and interfaces

Production XERT project: `ugmkwoapjcpiucsrxwzt`. Its deployed proof functions match the current migrations. Member PEQ: `000cc2da-1c51-59bf-a33e-c76bee4d7188`, slug `peq`. Casual PEQ: `e90f30f7-b0d2-56e7-8e1d-8b290721e234`, slug `peq-casual`. Terms: `0173f880-7bee-4a2e-bb0c-ac15af40ad9e`, slug `terms-and-conditions`.

Current `/3months` calls the casual-only questionnaire checker. The existing already-signed lookup counts completed responses without checking signature/acceptance. The terms form permits `I decline` to skip the signature; the terms form ID was also historically used for a different questionnaire. ID or completion timestamp alone is not signed agreement proof.

Stored PEQ answer keys (confirmed against live form definition; values remain private):

- name object `{ first, last }`: `84703ad7-a28d-4904-9868-6c832ce38055`
- email: `e4c4e161-43e3-5462-a865-f27c411ac809`
- phone: `5d5d7d53-d5ea-4743-8f94-22ecd5fd6ded`
- participant signature data URL: `576cbb02-2819-488f-a7d8-1719d8d53840`

Terms answers: `tc-accept` must equal `I accept the Terms and Conditions`, `tc-member-name` is the participant's typed name, `tc-signature` is their signature data URL. Existing `public.xert_valid_form_signature(text)` validates the stored signature format. Terms contact identity lives in respondent columns. Optional terms phone, when present, must match the purchaser; its absence alone must not reject a legitimate response. Match the PEQ phone (required) using existing Australian normalization conventions, accepting `04…`, `614…`, and `+614…` equivalents.

Use saved `form_snapshot.questions` to confirm expected signature/acceptance question types where evaluating current structured records, never today's editable form definition. Unrecognized historical shapes are not automatically verified; staff follow-up remains available. This proves matching recorded paperwork, not medical clearance, verified personal identity, or a new legal/guardian policy.

### Task 1: Repair the persisted proof and browser handoff together

**Files:**

- Modify `api/checkout.js` only the three-month handler and necessary imports.
- Modify `src/pages/CasualVisit.jsx`, `src/lib/formPrerequisites.js`, and only the necessary completion/handoff code in `src/pages/PublicForm.jsx`.
- Populate CLI-created `supabase/migrations/20260909081702_three_month_paperwork_proof.sql`; do not edit old migrations.
- Add `test/three-month-paperwork-sql.test.mjs` and a focused test-only SQL fixture helper if needed; extend existing membership checkout/completion tests found with `rg`.
- Add exact devDependency `@electric-sql/pglite` version `0.5.8`, lockfile included; no runtime dependency changes.
- Controller owns `test/browser/public-membership-paperwork.mjs`, release evidence and documentation. Do not edit those files.

**Interfaces:**

New private-to-server RPC:

```sql
public.xert_membership_checkout_paperwork_completed(
  p_questionnaire_response_id uuid,
  p_agreement_response_id uuid,
  p_name text, p_email text, p_phone text
) returns boolean
```

Return `true` only for two distinct, exact, unarchived, completed-at-or-before-now records with the correct member PEQ and terms form IDs, valid participant signature formats, accepted terms, and matching normalized purchaser identity. Require nonempty purchaser name/email/phone and matching typed terms member name. Missing/malformed/stale/other-person/casual/declined/unsigned/historically repurposed records return false, not an exception. UUID syntax is checked in Node before RPC. Do not require signing again merely because a record is old; completed_at is not a new expiry rule.

Maintain and strengthen existing `xert_membership_paperwork_signed(p_email text) returns jsonb` without changing its signature: questionnaire and agreement booleans must require valid signature/acceptance evidence in the saved records. Empty email cannot match empty stored emails. Preserve email-based lookup semantics for the already-signed option.

New checkout JSON for signing now:

```js
{
  action: 'three_month_membership', first_name, last_name, email, phone,
  already_signed: false, questionnaire_response_id, agreement_response_id
}
```

Before Stripe, validate both UUIDs and call the new RPC with normalized visitor fields. `false` returns 400 with actionable questionnaire/agreement wording; RPC errors return 503. No fallback to casual proof, browser state, or the weaker email-only claim. Keep null `paperworkVerified` for this genuinely verified signing-now flow so the existing receipt/staff behavior stays unchanged.

Browser behavior:

1. No matching PEQ marker → member questionnaire with `return=3months` (then agreement).
2. Matching PEQ but missing/mismatched/unaccepted terms marker → agreement with `return=3months`, not a repeat PEQ.
3. Both matching markers → send both response IDs to checkout for authoritative verification.
4. Editing purchaser details invalidates mismatching markers; comparing names/email is case/whitespace normalized and phone accepts Australian equivalents.
5. Terms completion marker adds only a boolean acceptance hint (not answers/signature); declined terms must not show as ready to pay. Older markers without that hint resume the agreement; already-signed remains available.
6. A server proof rejection provides an actionable route to re-complete paperwork; no stuck Pay retry loop. Do not erase original response records or silently mark the applicant already signed.
7. `PublicForm` prerequisite redirects preserve the allowlisted `return` key. Keep `/casual`, `/3daypass`, generic forms, and existing form record immutability behavior unchanged.

- [ ] **Step 1: Add executable regression tests before source changes.** Use real in-memory PostgreSQL via PGlite. Apply the existing signature validator definition and relevant actual migration SQL, not a JS imitation of the proof. Fixture rows are fictional and have representative respondent fields, answers, completion/archive state and saved question snapshots. Exercise actual RPCs. Baseline regression example:

```js
// A declined, unsigned terms response must not count as signed.
const { rows } = await db.query(
  'select public.xert_membership_paperwork_signed($1) as proof',
  ['alex@example.invalid'],
);
assert.deepEqual(rows[0].proof, { questionnaire: true, agreement: false });
```

Required cases: accepted+signed pair succeeds; member PEQ cannot be confused with casual; decline even with a leftover signature fails; missing/invalid signature fails; different email/name/phone fails; typed terms name mismatch fails; optional absent terms phone succeeds; all Australian phone forms normalize; missing/null/blank/invalid inputs fail; archived/future/incomplete responses fail; wrong UUID or wrong form ID fails; repurposed snapshot fails; old valid signed documents remain usable; already-signed email-only lookup distinguishes genuine/declined/unsigned records; public/anon/authenticated cannot execute new helpers/RPC while service_role can. Also integrate the real Node handler with the real SQL result, stubbing only Stripe network I/O and unrelated settings access, proving valid member paperwork creates checkout and rejected proof never does.

- [ ] **Step 2: Run focused tests and record expected RED failures.** Run `node --test test/three-month-paperwork-sql.test.mjs` plus the focused existing checkout test. Fix test setup errors before implementing. The failures should expose the casual-form mismatch and false-positive signed terms, not merely an absent file.

- [ ] **Step 3: Implement minimal database and API repair.** Reuse small private proof helpers only when shared predicates would otherwise be duplicated. Keep full saved-record evidence inside PostgreSQL. Add the new response ID to the Node call as shown:

```js
const { data: proven, error: proofError } = await admin.rpc('xert_membership_checkout_paperwork_completed', {
  p_questionnaire_response_id: payload.questionnaire_response_id,
  p_agreement_response_id: payload.agreement_response_id,
  p_name: visitor.fullName, p_email: visitor.email, p_phone: visitor.phone,
});
```

- [ ] **Step 4: Add failing identity/handoff tests, then repair browser navigation.** Keep marker logic in focused pure helpers where it genuinely normalizes/validates; test wrong-person, changed identity, missing marker and declined marker behavior, not source text. Use `formPath('terms-and-conditions', null, '3months')` for terms resume. Preserve the return key through prerequisite redirect.

- [ ] **Step 5: Verify GREEN.** Run focused tests, full `npm test`, `npm run lint`, `npm run typecheck`, `npm run tokens:check`, `npm run build`, and SQL grammar check. Existing SSR/Browserslist warnings are baseline, not new defects; report new warnings. SQL checker fallback is `C:/Users/Deneo/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe -X utf8 scripts/check-sql-syntax.py`.

- [ ] **Step 6: Self-review and report; hold the final source commit until controller's proof/docs checkpoint.** The final commit before publish must contain deploy-relevant source because Vercel's ignore script compares only HEAD^..HEAD. Stage only owned files and commit when controller confirms ready. No push or remote writes by implementer.

## Release gate (controller)

- Browser proof at mobile/desktop with fictional blocked I/O: missing terms resumes agreement, mismatched identity cannot skip, declined terms cannot pay, correct pair sends two IDs, rejection has recovery. Add fresh completion-flow coverage where practical.
- Task spec+quality review and final integrated review must pass.
- Apply only reviewed migration via Supabase `apply_migration` to verified XERT ref. Check function definitions/permissions, safe false input result and non-mutating aggregate comparison; run security advisors and distinguish pre-existing issues.
- Publish with normal non-force main push only after database ready. Verify Vercel production Ready and deployed commit, `/3months` live shows $430 and expected handoff. Do not create a live test payment/submission.
- Report honestly that no live charge, receipt delivery, or activation was performed as part of verification.
