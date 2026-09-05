import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  CASUAL_VISIT_ACTION, casualVisitCheckoutParameters, casualVisitPaymentFromCheckout,
  casualVisitValidationError, formatCasualVisitPrice, normalizeCasualVisitPriceCents,
  normalizeCasualVisitor, normalizeVisitorPhone, summarizeCasualVisits,
} from '../src/lib/casualVisit.js';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const visitor = { first_name: 'Jane', last_name: 'Smith', email: 'jane@example.com', phone: '0400 000 000' };

test('a visitor is asked for everything the club needs, and nothing is guessed', () => {
  const clean = normalizeCasualVisitor({ ...visitor, first_name: ' jane ', email: ' Jane@Example.COM ' });
  assert.equal(clean.fullName, 'jane Smith');
  assert.equal(clean.email, 'jane@example.com');
  assert.equal(clean.phone, '+61400000000');
  assert.equal(normalizeVisitorPhone('(07) 4162 1234'), '+61741621234');
  assert.equal(normalizeVisitorPhone('nope'), '');

  assert.match(casualVisitValidationError({ ...visitor, first_name: '' }), /first name/);
  assert.match(casualVisitValidationError({ ...visitor, last_name: '' }), /last name/);
  assert.match(casualVisitValidationError({ ...visitor, email: 'jane@example' }), /part after the dot/);
  assert.match(casualVisitValidationError({ ...visitor, phone: '' }), /phone number/);
  assert.match(casualVisitValidationError({ ...visitor, phone: 'call me' }), /valid phone number/);
  assert.equal(casualVisitValidationError(visitor), null);
});

test('the amount comes from the club, never the browser', () => {
  const parameters = casualVisitCheckoutParameters({
    visitor: normalizeCasualVisitor(visitor),
    priceCents: 1560,
    returnURLs: { success: 'https://www.xertfitness.com.au/casual?paid=1', cancel: 'https://www.xertfitness.com.au/casual?cancelled=1' },
    now: 1_757_000_000_000,
  });
  assert.equal(parameters.mode, 'payment');
  assert.equal(parameters.line_items[0].price_data.unit_amount, 1560);
  assert.equal(parameters.line_items[0].price_data.currency, 'aud');
  assert.equal(parameters.customer_email, 'jane@example.com', 'the card screen opens with their email filled in');
  assert.equal(parameters.metadata.xert_casual_visit, 'true');
  assert.equal(parameters.metadata.casual_visit_phone, '+61400000000');
  assert.equal(parameters.payment_intent_data.description, 'Casual visit — Jane Smith');

  // A price the database could not supply must stop the payment, not invent one.
  assert.throws(() => casualVisitCheckoutParameters({ visitor: normalizeCasualVisitor(visitor), priceCents: 5, returnURLs: { success: 'https://x/a', cancel: 'https://x/b' } }), /price is not set/);
  assert.throws(() => casualVisitCheckoutParameters({ visitor: normalizeCasualVisitor(visitor), priceCents: 1560, returnURLs: { success: 'javascript:alert(1)', cancel: 'https://x/b' } }), /return URL/);
  assert.equal(normalizeCasualVisitPriceCents('abc'), 1560);
  assert.equal(normalizeCasualVisitPriceCents(2000), 2000);
  assert.equal(formatCasualVisitPrice(1560), '$15.60');
});

test('only a paid casual visit is recorded, and never as a member order', () => {
  const paid = casualVisitPaymentFromCheckout({
    id: 'cs_test_1', payment_status: 'paid', amount_total: 1560, currency: 'aud',
    customer_details: { email: 'jane@example.com' }, payment_intent: 'pi_test_1',
    metadata: { xert_casual_visit: 'true', casual_visit_name: 'Jane Smith', casual_visit_phone: '0400000000' },
  });
  assert.deepEqual(paid, {
    full_name: 'Jane Smith', email: 'jane@example.com', phone: '+61400000000',
    amount_cents: 1560, currency: 'aud', stripe_checkout_session_id: 'cs_test_1',
    stripe_payment_intent_id: 'pi_test_1', status: 'paid',
  });
  assert.equal(casualVisitPaymentFromCheckout({ id: 'cs_2', payment_status: 'unpaid', metadata: { xert_casual_visit: 'true' } }), null);
  assert.equal(casualVisitPaymentFromCheckout({ id: 'cs_3', payment_status: 'paid', metadata: { user_id: 'member' } }), null,
    'a member checkout is left to member fulfilment');
});

test('the door fee never touches the member fulfilment path', async () => {
  const checkout = await read('../api/checkout.js');
  assert.match(checkout, /if \(payload && payload\.action === CASUAL_VISIT_ACTION\) \{/);
  assert.match(checkout, /return handleCasualVisitCheckout\(\{ payload, request, admin, json \}\)/);
  assert.ok(checkout.indexOf('handleCasualVisitCheckout({ payload') < checkout.indexOf("if (!token) return json({ error: 'Not authenticated.' }, 401);"),
    'a walk-in has no account, so the casual path must come before the auth check');
  assert.match(checkout, /\.select\('casual_payments_enabled, casual_visit_price_cents'\)/);
  assert.match(checkout, /casual_payments_enabled === false/, 'the owner can switch it off');

  const webhook = await read('../api/stripe-webhook.js');
  assert.match(webhook, /const casualVisit = casualVisitPaymentFromCheckout\(event\.data\?\.object\);/);
  assert.match(webhook, /onConflict: 'stripe_checkout_session_id'/, 'a replayed webhook must not double-record');

  const sql = await read('../supabase/migrations/20260905010000_casual_visit_payments.sql');
  assert.match(sql, /create table if not exists public\.casual_visit_payments/);
  assert.match(sql, /stripe_checkout_session_id text not null unique/);
  assert.match(sql, /create policy "casual_visit_payments_admin_read"/);
  assert.match(sql, /casual_visit_price_cents integer not null default 1560/);
  assert.match(sql, /create trigger email_on_casual_visit_payment/, 'the owner is told a visit was paid');
  assert.match(sql, /values \('casual_visit_payments'\)/);

  const page = await read('../src/pages/CasualVisit.jsx');
  assert.match(page, /action: CASUAL_VISIT_ACTION/);
  assert.match(page, /XERT never sees or stores your card details/);
  assert.match(page, /forms\/peq-casual/, 'a first-time visitor is pointed at the questionnaire');
  const app = await read('../src/App.jsx');
  assert.match(app, /path="\/casual"/);
});

test('the owner sees door takings beside orders, counted only when actually paid', async () => {
  const now = new Date('2026-09-05T10:00:00+10:00');
  const summary = summarizeCasualVisits([
    { status: 'paid', amount_cents: 1560, currency: 'aud', created_at: '2026-09-05T00:30:00Z' },
    { status: 'paid', amount_cents: 1560, currency: 'aud', created_at: '2026-09-02T00:30:00Z' },
    { status: 'refunded', amount_cents: 1560, currency: 'aud', created_at: '2026-09-02T00:30:00Z' },
    { status: 'paid', amount_cents: 1560, currency: 'aud', created_at: '2026-08-20T00:30:00Z' },
  ], now);
  assert.equal(summary.count, 3, 'a refunded visit is not takings');
  assert.equal(summary.todayCount, 1);
  assert.equal(summary.todayRevenue, 1560);
  assert.equal(summary.monthCount, 2);
  assert.equal(summary.monthRevenue, 3120);
  assert.deepEqual(summarizeCasualVisits([], now).revenue, 0);

  const data = await read('../src/lib/adminData.js');
  assert.match(data, /export async function listCasualVisits/);
  assert.match(data, /from\('casual_visit_payments'\)/);
  assert.match(data, /return \{ installed: false, rows: \[\] \}/,
    'the screen says so rather than failing before the migration is applied');

  const orders = await read('../src/components/admin/OrdersManager.jsx');
  assert.match(orders, /Casual visits/);
  assert.match(orders, /Paid at the door on the visitor&apos;s own phone/);
  assert.match(orders, /summarizeCasualVisits\(casualVisits\.rows\)/);
  assert.match(orders, /casualVisits\.installed && casualVisits\.rows\.length > 0/,
    'an empty list adds nothing to the screen');
});
