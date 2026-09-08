import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  casualVisitCheckoutParameters, casualVisitPaymentFromCheckout, visitorPass, visitorPassLabel,
  THREE_MONTH_MEMBERSHIP_ACTION, THREE_MONTH_MEMBERSHIP_PRICE_CENTS,
} from '../src/lib/casualVisit.js';
import { formPath, returnKeyAfterForm, returnPathAfterForm } from '../src/lib/formPrerequisites.js';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const visitor = { fullName: 'Jane Smith', email: 'jane@example.com', phone: '+61400000000' };
const returnURLs = { success: 'https://xertfitness.com.au/3months?paid=1', cancel: 'https://xertfitness.com.au/3months?cancelled=1' };

test('the membership is priced by the server at $430, never by the browser', () => {
  assert.equal(THREE_MONTH_MEMBERSHIP_PRICE_CENTS, 43000);
  assert.equal(visitorPassLabel(THREE_MONTH_MEMBERSHIP_ACTION), 'Three month membership');
  assert.equal(visitorPass(THREE_MONTH_MEMBERSHIP_ACTION).needsSignedQuestionnaire, false,
    'the paperwork is checked by the server, not by a response id on the page');

  const parameters = casualVisitCheckoutParameters({
    visitor, passKind: THREE_MONTH_MEMBERSHIP_ACTION, priceCents: 100, returnURLs, now: 0, paperworkVerified: true,
  });
  assert.equal(parameters.line_items[0].price_data.unit_amount, 43000, 'a browser price is ignored');
  assert.equal(parameters.line_items[0].price_data.currency, 'aud');
  assert.equal(parameters.mode, 'payment');
  assert.equal(parameters.metadata.xert_pass_kind, THREE_MONTH_MEMBERSHIP_ACTION);
  assert.equal(parameters.metadata.xert_paperwork_verified, 'true');

  // Signing as part of the purchase leaves nothing for staff to check.
  const signedHere = casualVisitCheckoutParameters({
    visitor, passKind: THREE_MONTH_MEMBERSHIP_ACTION, returnURLs, now: 0,
  });
  assert.equal(signedHere.metadata.xert_paperwork_verified, undefined);
});

test('the recorded payment carries the pass and whether the paperwork was found', () => {
  const checkout = {
    id: 'cs_live_abc123', mode: 'payment', payment_status: 'paid', amount_total: 43000, currency: 'aud',
    metadata: {
      xert_casual_visit: 'true', xert_pass_kind: THREE_MONTH_MEMBERSHIP_ACTION, xert_paperwork_verified: 'false',
      casual_visit_name: 'Jane Smith', casual_visit_email: 'jane@example.com', casual_visit_phone: '+61400000000',
    },
  };
  const record = casualVisitPaymentFromCheckout(checkout);
  assert.equal(record.pass_kind, THREE_MONTH_MEMBERSHIP_ACTION);
  assert.equal(record.paperwork_verified, false, 'staff are told the paperwork was not found');
  assert.equal(record.amount_cents, 43000);

  // The price is checked on the way back too, so a tampered session is refused.
  assert.throws(() => casualVisitPaymentFromCheckout({ ...checkout, amount_total: 100 }),
    /Three month membership payment does not match/);

  // Signing during the purchase records nothing to chase up.
  const clean = { ...checkout, metadata: { ...checkout.metadata } };
  delete clean.metadata.xert_paperwork_verified;
  assert.equal(Object.hasOwn(casualVisitPaymentFromCheckout(clean), 'paperwork_verified'), false);
});

test('the questionnaire hands off to the agreement and still comes back to the payment', () => {
  assert.equal(returnPathAfterForm('?return=3months'), '/3months');
  assert.equal(returnKeyAfterForm('?return=3months'), '3months');
  assert.equal(returnKeyAfterForm('?return=https://evil.example.com'), null);

  // Without this the agreement would end on a thank-you screen half way
  // through paying, because the handoff dropped the page that sent them.
  assert.equal(formPath('terms-and-conditions', null, '3months'), '/forms/terms-and-conditions?return=3months');
  assert.equal(formPath('peq', 'terms-and-conditions', '3months'), '/forms/peq?next=terms-and-conditions&return=3months');
  assert.equal(formPath('peq', null, 'nowhere-good'), '/forms/peq');
});

test('the page asks for the paperwork before Stripe, and offers an already-signed route', async () => {
  const page = await read('../src/pages/CasualVisit.jsx');
  const app = await read('../src/App.jsx');
  const api = await read('../api/checkout.js');

  assert.match(app, /path="\/3months" element=\{<CasualVisit key="three-month-membership" threeMonth \/>\}/);
  assert.match(page, /const MEMBER_PEQ_SLUG = 'peq'/, 'a membership signs the member questionnaire, not the casual one');
  assert.match(page, /navigate\(`\/forms\/\$\{MEMBER_PEQ_SLUG\}\?return=3months`\)/);
  assert.match(page, /I have already signed both/);
  assert.match(page, /'Sign the questionnaire and agreement first'/);

  // Neither route reaches Stripe before the paperwork question is settled.
  const detour = page.indexOf('needsMembershipPaperwork');
  const checkout = page.indexOf("fetch('/api/checkout'");
  assert.ok(detour > 0 && detour < checkout, 'the paperwork guard comes before the checkout call');

  // The server treats "already signed" as a claim and looks for the records.
  assert.match(api, /already_signed === true/);
  assert.match(api, /xert_membership_paperwork_signed/);
  assert.match(api, /paperworkVerified = signed\?\.questionnaire === true && signed\?\.agreement === true/);
  assert.match(api, /capability', 'three_month_membership'/);
  const sql = await read('../supabase/migrations/20260908060000_three_month_membership.sql');
  assert.match(sql, /'casual', 'three_day_pass', 'three_month_membership'/);
  assert.match(sql, /no matching questionnaire and agreement were found/,
    'the owner alert says plainly when the paperwork is missing');
});

test('the membership page is reachable but never indexed', async () => {
  const { metadataForPath } = await import('../src/lib/pageMetadata.js');
  const meta = metadataForPath('/3months');
  assert.equal(meta.title, 'Three month membership | XERT Fitness');
  assert.equal(meta.indexable, false, 'the page is reached from a link or QR, never from search');
});
