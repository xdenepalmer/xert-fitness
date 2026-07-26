import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  assertCheckoutProduct,
  buildCheckoutSessionParameters,
  checkoutReceiptDetails,
  stripePendingOrderGuardIsReady,
  stripeOrderTermsSnapshotIsReady,
  stripeWebhookLedgerIsReady,
  assertStripePriceMatchesProduct,
  checkoutIdempotencyKey,
  inspectCheckoutEnvironment,
  normalizeCheckoutAttemptID,
  normalizeCheckoutRequest,
  pendingOrderForCheckout,
  inspectWebhookDeliveryGaps,
  paymentFulfillmentDeliveryIsHealthy,
  paymentFulfillmentIsReady,
  paymentActivationDriftGuardIsReady,
  publicCheckoutFailure,
  reusableCheckoutURL,
  sessionPackPaymentsAreEnabled,
  stripeModeForSecret,
  verifiedCreatedCheckoutURL,
} from '../api/checkout.js';

const checkoutAttemptID = '7b464e63-6e3f-4f7d-94be-d8ef4231d589';

const validProduct = {
  name: 'Starter 4',
  price_cents: 4800,
  currency: 'aud',
  sessions_count: 4,
  validity_days: 28,
};

test('builds authenticated and immutable receipt terms from the product contract', () => {
  const details = checkoutReceiptDetails(
    { id: 'member-xert', email: ' Member@Example.com ' },
    validProduct,
  );
  assert.deepEqual(details, {
    email: 'member@example.com',
    terms: 'This purchase adds 4 XERT training sessions to your member account. Credits expire 28 days after successful payment.',
    description: 'XERT Fitness - Starter 4: 4 sessions, valid for 28 days from payment.',
    contractVersion: 'receipt_terms_v1',
  });
  assert.ok(details.terms.length <= 1200);
  assert.throws(
    () => checkoutReceiptDetails({ id: 'member-xert', email: 'invalid' }, validProduct),
    /valid email address/i,
  );
  assert.ok(checkoutReceiptDetails(
    { email: 'member@example.com' },
    { ...validProduct, name: `  Premium\n${'x'.repeat(300)}  ` },
  ).description.length < 300);
});

const productWithStripePrice = {
  ...validProduct,
  id: '00000000-0000-4000-8000-000000000004',
  slug: 'starter-4',
  stripe_price_id: 'price_XERT4800',
};

const matchingStripePrice = {
  id: 'price_XERT4800',
  active: true,
  type: 'one_time',
  unit_amount: 4800,
  currency: 'aud',
  metadata: {
    xert_product_id: productWithStripePrice.id,
    xert_catalog_slug: productWithStripePrice.slug,
    xert_sessions: String(productWithStripePrice.sessions_count),
    xert_validity_days: String(productWithStripePrice.validity_days),
  },
};

test('checkout fails closed until atomic payment fulfillment is installed', async () => {
  const query = {
    select() { return query; },
    eq() { return query; },
    async maybeSingle() {
      return { data: { capability: 'stripe_payment_fulfillment' }, error: null };
    },
  };
  assert.equal(await paymentFulfillmentIsReady({ from() { return query; } }), true);

  query.maybeSingle = async () => ({ data: null, error: null });
  assert.equal(await paymentFulfillmentIsReady({ from() { return query; } }), false);
  query.maybeSingle = async () => ({ data: null, error: new Error('schema unavailable') });
  assert.equal(await paymentFulfillmentIsReady({ from() { return query; } }), false);

  const source = await readFile(new URL('../api/checkout.js', import.meta.url), 'utf8');
  const authenticationGate = source.indexOf("if (!token) return json({ error: 'Not authenticated.' }, 401)");
  const gate = source.indexOf('paymentFulfillmentIsReady(admin)');
  const stripeConfigurationGate = source.indexOf('if (!process.env.STRIPE_SECRET_KEY)');
  const sessionCreation = source.indexOf('stripe.checkout.sessions.create');
  assert.ok(authenticationGate >= 0 && stripeConfigurationGate > authenticationGate);
  assert.ok(gate >= 0 && stripeConfigurationGate > gate);
  assert.ok(gate >= 0 && sessionCreation > gate);
  assert.match(source, /payment services are being upgraded[\s\S]*503/);
});

test('checkout fails closed until Stripe fulfillment requires its pending order', async () => {
  const query = {
    select() { return query; },
    eq() { return query; },
    async maybeSingle() {
      return { data: { capability: 'stripe_pending_order_guard' }, error: null };
    },
  };
  assert.equal(await stripePendingOrderGuardIsReady({ from() { return query; } }), true);
  query.maybeSingle = async () => ({ data: null, error: null });
  assert.equal(await stripePendingOrderGuardIsReady({ from() { return query; } }), false);

  const source = await readFile(new URL('../api/checkout.js', import.meta.url), 'utf8');
  const guard = source.indexOf('stripePendingOrderGuardIsReady(admin)');
  const paymentSwitch = source.indexOf('sessionPackPaymentsAreEnabled(admin)');
  const sessionCreation = source.indexOf('stripe.checkout.sessions.create');
  assert.ok(guard >= 0 && paymentSwitch > guard && sessionCreation > paymentSwitch);
  assert.match(source, /payment order safeguards are being upgraded[\s\S]*503/);
});

test('checkout fails closed until purchased credit terms are snapshotted', async () => {
  const query = {
    select() { return query; },
    eq() { return query; },
    async maybeSingle() {
      return { data: { capability: 'stripe_order_terms_snapshot' }, error: null };
    },
  };
  assert.equal(await stripeOrderTermsSnapshotIsReady({ from() { return query; } }), true);
  query.maybeSingle = async () => ({ data: null, error: null });
  assert.equal(await stripeOrderTermsSnapshotIsReady({ from() { return query; } }), false);

  const source = await readFile(new URL('../api/checkout.js', import.meta.url), 'utf8');
  const guard = source.indexOf('stripeOrderTermsSnapshotIsReady(admin)');
  const paymentSwitch = source.indexOf('sessionPackPaymentsAreEnabled(admin)');
  const sessionCreation = source.indexOf('stripe.checkout.sessions.create');
  assert.ok(guard >= 0 && paymentSwitch > guard && sessionCreation > paymentSwitch);
  assert.match(source, /purchased pack terms are being secured[\s\S]*503/);
});

test('checkout fails closed until Stripe delivery monitoring is installed', async () => {
  const query = {
    select() { return query; },
    eq() { return query; },
    async maybeSingle() {
      return { data: { capability: 'stripe_webhook_ledger' }, error: null };
    },
  };
  assert.equal(await stripeWebhookLedgerIsReady({ from() { return query; } }), true);
  query.maybeSingle = async () => ({ data: null, error: null });
  assert.equal(await stripeWebhookLedgerIsReady({ from() { return query; } }), false);

  const source = await readFile(new URL('../api/checkout.js', import.meta.url), 'utf8');
  const guard = source.indexOf('stripeWebhookLedgerIsReady(admin)');
  const paymentSwitch = source.indexOf('sessionPackPaymentsAreEnabled(admin)');
  const sessionCreation = source.indexOf('stripe.checkout.sessions.create');
  assert.ok(guard >= 0 && paymentSwitch > guard && sessionCreation > paymentSwitch);
  assert.match(source, /payment delivery monitoring is being installed[\s\S]*503/);
});

function paymentDeliveryAdmin({
  failed = 0,
  stalled = 0,
  signatureFailures = 0,
  paidBeyondLedger = 0,
  failedError = null,
  stalledError = null,
  signatureFailureError = null,
  ordersError = null,
  newestLedgerAt = '2026-07-17T00:15:00.000Z',
} = {}) {
  const calls = [];
  return {
    calls,
    admin: {
      from(table) {
        calls.push(['from', table]);
        if (table === 'stripe_webhook_signature_failures') {
          const query = {
            select() { return query; },
            gte(field, value) {
              calls.push(['gte', field, value]);
              return query;
            },
            then(resolve) {
              return resolve({
                data: null,
                count: signatureFailures,
                error: signatureFailureError,
              });
            },
          };
          return query;
        }
        if (table === 'orders') {
          const query = {
            select() { return query; },
            eq(field, value) {
              calls.push(['eq', field, value]);
              return query;
            },
            is(field, value) {
              calls.push(['is', field, value]);
              return query;
            },
            gt(field, value) {
              calls.push(['gt', field, value]);
              return query;
            },
            gte(field, value) {
              calls.push(['gte', field, value]);
              return query;
            },
            then(resolve) {
              return resolve({
                data: null,
                count: paidBeyondLedger,
                error: ordersError,
              });
            },
          };
          return query;
        }
        assert.equal(table, 'stripe_webhook_events');
        let status = null;
        const query = {
          select(fields, options) {
            calls.push(['select', table, fields, options]);
            return query;
          },
          in(field, values) {
            calls.push(['in', field, values]);
            return query;
          },
          eq(field, value) {
            calls.push(['eq', field, value]);
            if (field === 'status') status = value;
            return query;
          },
          lt(field, value) {
            calls.push(['lt', field, value]);
            return query;
          },
          order(field, options) {
            calls.push(['order', field, options]);
            return query;
          },
          limit(n) {
            calls.push(['limit', n]);
            return Promise.resolve({
              data: newestLedgerAt ? [{ last_received_at: newestLedgerAt }] : [],
              error: null,
            });
          },
          then(resolve, reject) {
            const count = status === 'failed' ? failed : stalled;
            const error = status === 'failed' ? failedError : stalledError;
            return Promise.resolve({ count, error }).then(resolve, reject);
          },
        };
        return query;
      },
    },
  };
}

test('checkout pauses when paid Stripe fulfillment is failed or stalled', async () => {
  const now = new Date('2026-07-17T00:20:00.000Z');
  const healthy = paymentDeliveryAdmin();
  assert.equal(await paymentFulfillmentDeliveryIsHealthy(healthy.admin, now), true);
  assert.deepEqual(
    healthy.calls.filter(([method, field, value]) => (
      method === 'eq' && field === 'status' && (value === 'failed' || value === 'processing')
    )),
    [
      ['eq', 'status', 'failed'],
      ['eq', 'status', 'processing'],
    ],
  );
  assert.deepEqual(healthy.calls.filter(([method]) => method === 'in'), [
    ['in', 'event_type', [
      'checkout.session.completed',
      'checkout.session.async_payment_succeeded',
    ]],
    ['in', 'event_type', [
      'checkout.session.completed',
      'checkout.session.async_payment_succeeded',
    ]],
  ]);
  assert.deepEqual(healthy.calls.filter(([method]) => method === 'lt'), [
    ['lt', 'last_received_at', '2026-07-17T00:10:00.000Z'],
  ]);

  assert.equal(await paymentFulfillmentDeliveryIsHealthy(paymentDeliveryAdmin({
    failed: 1,
  }).admin, now), false);
  assert.equal(await paymentFulfillmentDeliveryIsHealthy(paymentDeliveryAdmin({
    stalled: 1,
  }).admin, now), false);
});

test('checkout pauses when Operations Health would mark signature or delivery gaps', async () => {
  const now = new Date('2026-07-17T00:20:00.000Z');
  assert.equal(await paymentFulfillmentDeliveryIsHealthy(paymentDeliveryAdmin({
    signatureFailures: 2,
  }).admin, now), false);
  assert.equal(await paymentFulfillmentDeliveryIsHealthy(paymentDeliveryAdmin({
    paidBeyondLedger: 1,
  }).admin, now), false);
  // Missing signature ledger must not pause checkout during a rolling upgrade.
  assert.equal(await paymentFulfillmentDeliveryIsHealthy(paymentDeliveryAdmin({
    signatureFailureError: {
      code: 'PGRST205',
      message: 'stripe_webhook_signature_failures not found in schema cache',
    },
  }).admin, now), true);

  const withLedger = paymentDeliveryAdmin({ paidBeyondLedger: 1 });
  await inspectWebhookDeliveryGaps(withLedger.admin, now);
  assert.ok(withLedger.calls.some(([method, field, value]) => (
    method === 'is' && field === 'reconciled_at' && value === null
  )));
  assert.ok(withLedger.calls.some(([method, field]) => method === 'gt' && field === 'paid_at'));

  const emptyLedger = paymentDeliveryAdmin({ newestLedgerAt: null, paidBeyondLedger: 0 });
  const emptyGaps = await inspectWebhookDeliveryGaps(emptyLedger.admin, now);
  assert.equal(emptyGaps.deliveryGap, false);
  assert.equal(emptyGaps.probeFailed, false);
  assert.ok(emptyLedger.calls.some(([method, field]) => method === 'gte' && field === 'paid_at'));
  assert.ok(!emptyLedger.calls.some(([method, field]) => method === 'gt' && field === 'paid_at'));
});

test('checkout delivery circuit breaker fails closed on uncertain ledger health', async () => {
  const now = new Date('2026-07-17T00:20:00.000Z');
  assert.equal(await paymentFulfillmentDeliveryIsHealthy(paymentDeliveryAdmin({
    failedError: new Error('ledger unavailable'),
  }).admin, now), false);
  assert.equal(await paymentFulfillmentDeliveryIsHealthy(paymentDeliveryAdmin({
    ordersError: new Error('orders count unavailable'),
  }).admin, now), false);
  assert.equal(await paymentFulfillmentDeliveryIsHealthy(paymentDeliveryAdmin({
    signatureFailureError: {
      code: '57014',
      message: 'canceling statement due to statement timeout',
    },
  }).admin, now), false);
  const uncertainOrders = paymentDeliveryAdmin({
    ordersError: new Error('orders count unavailable'),
  });
  const uncertainGaps = await inspectWebhookDeliveryGaps(uncertainOrders.admin, now);
  assert.equal(uncertainGaps.probeFailed, true);
  assert.equal(uncertainGaps.deliveryGap, false);
  assert.equal(await paymentFulfillmentDeliveryIsHealthy({
    from() {
      throw new Error('database unavailable');
    },
  }, now), false);
  assert.equal(await paymentFulfillmentDeliveryIsHealthy({}, new Date('invalid')), false);
});

test('checkout delivery circuit breaker runs before reuse and Stripe operations', async () => {
  const source = await readFile(new URL('../api/checkout.js', import.meta.url), 'utf8');
  const circuitBreaker = source.indexOf('paymentFulfillmentDeliveryIsHealthy(admin)');
  assert.ok(circuitBreaker >= 0);
  assert.ok(circuitBreaker < source.indexOf('await findReusableCheckout({'));
  assert.ok(circuitBreaker < source.indexOf('stripe.prices.retrieve'));
  assert.ok(circuitBreaker < source.indexOf('stripe.checkout.sessions.create'));
  assert.match(source, /payment delivery issue is being resolved[\s\S]*503/);
});

test('checkout has a fail-closed owner payment switch before any Stripe operation', async () => {
  const settingsId = '81fdd46a-d2a9-4ab4-a479-0e687c72c4f2';
  const actorId = '9bb45f52-9022-4b5b-933f-d8998dbe659f';
  const updatedAt = '2026-07-16T03:05:00.000Z';
  const settings = { id: settingsId, payments_enabled: true, updated_at: updatedAt };
  const receipt = {
    resource_id: settingsId,
    action: 'updated',
    changed_by: actorId,
    previous_snapshot: { payments_enabled: false },
    new_snapshot: { payments_enabled: true, updated_at: updatedAt },
    created_at: '2026-07-16T03:05:00.100Z',
  };
  const activationAdmin = ({ settingsRows = [settings], auditRows = [receipt], settingsError = null, auditError = null } = {}) => ({
    from(table) {
      const query = {
        select() { return query; },
        eq() { return query; },
        order() { return query; },
        async limit() {
          return table === 'admin_settings'
            ? { data: settingsRows, error: settingsError }
            : { data: auditRows, error: auditError };
        },
      };
      return query;
    },
  });

  assert.equal(await sessionPackPaymentsAreEnabled(activationAdmin()), true);
  assert.equal(await sessionPackPaymentsAreEnabled(activationAdmin({
    settingsRows: [{ ...settings, payments_enabled: false }],
  })), false);
  assert.equal(await sessionPackPaymentsAreEnabled(activationAdmin({ settingsRows: [] })), false);
  assert.equal(await sessionPackPaymentsAreEnabled(activationAdmin({ settingsRows: [settings, settings] })), false);
  assert.equal(await sessionPackPaymentsAreEnabled(activationAdmin({
    settingsError: new Error('settings unavailable'),
  })), false);
  assert.equal(await sessionPackPaymentsAreEnabled(activationAdmin({
    auditRows: [{ ...receipt, changed_by: null }],
  })), false);
  assert.equal(await sessionPackPaymentsAreEnabled(activationAdmin({
    auditRows: [{
      ...receipt,
      new_snapshot: { ...receipt.new_snapshot, updated_at: '2026-07-16T03:04:00.000Z' },
    }],
  })), false);
  assert.equal(await sessionPackPaymentsAreEnabled(activationAdmin({
    auditError: new Error('audit unavailable'),
  })), false);

  const source = await readFile(new URL('../api/checkout.js', import.meta.url), 'utf8');
  const runtimeGate = source.indexOf('inspectCheckoutEnvironment(process.env)');
  const authenticationGate = source.indexOf("if (!token) return json({ error: 'Not authenticated.' }, 401)");
  const paymentGate = source.indexOf('sessionPackPaymentsAreEnabled(admin)', authenticationGate);
  const sessionCreation = source.indexOf('stripe.checkout.sessions.create');
  assert.ok(runtimeGate >= 0 && runtimeGate < authenticationGate);
  assert.ok(paymentGate > authenticationGate);
  assert.ok(sessionCreation > paymentGate);
  assert.match(source, /payment activation could not be verified[\s\S]*503/);
  assert.match(source, /Promise\.all\(\[[\s\S]*sessionPackPaymentsAreEnabled\(admin\)/);
});

test('checkout requires the database live-settings drift guard', async () => {
  const query = {
    select() { return query; },
    eq() { return query; },
    async maybeSingle() {
      return { data: { capability: 'payment_activation_drift_guard' }, error: null };
    },
  };
  assert.equal(await paymentActivationDriftGuardIsReady({ from() { return query; } }), true);
  query.maybeSingle = async () => ({ data: null, error: null });
  assert.equal(await paymentActivationDriftGuardIsReady({ from() { return query; } }), false);

  const source = await readFile(new URL('../api/checkout.js', import.meta.url), 'utf8');
  const guard = source.indexOf('paymentActivationDriftGuardIsReady(admin)');
  const activation = source.indexOf('sessionPackPaymentsAreEnabled(admin)');
  const sessionCreation = source.indexOf('stripe.checkout.sessions.create');
  assert.ok(guard >= 0 && activation > guard && sessionCreation > activation);
  assert.match(source, /live payment settings are being secured[\s\S]*503/);
});

test('checkout exposes a value-free gate for the complete canonical payment environment', () => {
  const validEnvironment = {
    SUPABASE_URL: 'https://ugmkwoapjcpiucsrxwzt.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-value',
    STRIPE_SECRET_KEY: 'sk_test_stripe-secret-value',
    STRIPE_WEBHOOK_SECRET: 'whsec_webhook_value',
    APP_BASE_URL: 'https://xert-fitness.vercel.app',
  };
  assert.deepEqual(inspectCheckoutEnvironment(validEnvironment), { ready: true, invalid: [] });

  for (const [name, value] of [
    ['SUPABASE_URL', 'https://another-project.supabase.co'],
    ['SUPABASE_SERVICE_ROLE_KEY', ''],
    ['STRIPE_SECRET_KEY', 'secret-value'],
    ['STRIPE_WEBHOOK_SECRET', 'webhook-value'],
    ['APP_BASE_URL', 'https://preview-xert.vercel.app'],
  ]) {
    const result = inspectCheckoutEnvironment({ ...validEnvironment, [name]: value });
    assert.equal(result.ready, false);
    assert.ok(result.invalid.includes(name));
    assert.doesNotMatch(JSON.stringify(result), /service-role-value|stripe-secret-value|webhook_value/);
  }

  for (const environment of [
    { ...validEnvironment, SUPABASE_SERVICE_ROLE_KEY: ` ${validEnvironment.SUPABASE_SERVICE_ROLE_KEY}` },
    { ...validEnvironment, STRIPE_SECRET_KEY: `${validEnvironment.STRIPE_SECRET_KEY}\n` },
    { ...validEnvironment, STRIPE_WEBHOOK_SECRET: `${validEnvironment.STRIPE_WEBHOOK_SECRET} ` },
    {
      ...validEnvironment,
      SUPABASE_SERVICE_ROLE_KEY: 'public-key-reused-by-mistake',
      SUPABASE_ANON_KEY: 'public-key-reused-by-mistake',
    },
  ]) {
    assert.equal(inspectCheckoutEnvironment(environment).ready, false);
  }
});

test('accepts a valid product before creating Stripe Checkout', () => {
  assert.doesNotThrow(() => assertCheckoutProduct(validProduct));
});

test('scopes Stripe idempotency to one member pack target and checkout attempt', () => {
  const base = {
    attemptID: checkoutAttemptID,
    userID: 'member-xert',
    productID: 'product-xert',
    returnTarget: 'web',
  };
  assert.equal(normalizeCheckoutAttemptID(checkoutAttemptID.toUpperCase()), checkoutAttemptID);
  assert.equal(checkoutIdempotencyKey(base), checkoutIdempotencyKey(base));
  assert.notEqual(checkoutIdempotencyKey(base), checkoutIdempotencyKey({ ...base, userID: 'another-member' }));
  assert.notEqual(checkoutIdempotencyKey(base), checkoutIdempotencyKey({ ...base, productID: 'another-product' }));
  assert.notEqual(checkoutIdempotencyKey(base), checkoutIdempotencyKey({ ...base, returnTarget: 'ios' }));
  assert.throws(() => normalizeCheckoutAttemptID('shared-or-guessable'), /identifier is invalid/i);
});

test('normalizes a bounded checkout request before any database or Stripe operation', () => {
  assert.deepEqual(normalizeCheckoutRequest({
    product_slug: ' Starter-4 ',
    return_target: 'ios',
    checkout_attempt_id: checkoutAttemptID,
    ignored_amount: 1,
  }), {
    productSlug: 'starter-4',
    returnTarget: 'ios',
    suppliedAttemptID: checkoutAttemptID,
  });
  assert.deepEqual(normalizeCheckoutRequest({ product_slug: 'single' }), {
    productSlug: 'single',
    returnTarget: 'web',
    suppliedAttemptID: undefined,
  });
  for (const input of [
    null,
    [],
    {},
    { product_slug: '../admin' },
    { product_slug: 'a'.repeat(81) },
    { product_slug: 'single', return_target: 'external' },
  ]) assert.throws(() => normalizeCheckoutRequest(input), /request|product identifier|return target/i);
});

test('checkout never exposes raw provider errors to members', async () => {
  const secretBearingError = Object.assign(new Error('Stripe sk_live_private failed at Supabase'), {
    code: 'api_connection_error',
    requestId: 'req_xert',
  });
  assert.deepEqual(publicCheckoutFailure(secretBearingError), {
    status: 500,
    message: 'Checkout could not be started. Please try again.',
  });
  assert.doesNotMatch(JSON.stringify(publicCheckoutFailure(secretBearingError)), /sk_live|Supabase|req_xert/);
  assert.deepEqual(publicCheckoutFailure({ code: 'CHECKOUT_RECORDING_FAILED' }), {
    status: 503,
    message: 'Checkout could not be recorded. No payment was taken; please try again.',
  });
  assert.deepEqual(publicCheckoutFailure({ code: 'CHECKOUT_ATTEMPT_STALE' }), {
    status: 409,
    code: 'CHECKOUT_ATTEMPT_STALE',
    message: 'That checkout attempt expired. Please try again.',
  });

  const source = await readFile(new URL('../api/checkout.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /json\(\{ error: e\.message/);
  assert.match(source, /failure\.code \? \{ error: failure\.message, code: failure\.code \}/);
  // Recording failure must leave the Stripe session open so the same attempt id
  // can finish the pending-order write on retry via Stripe idempotency replay.
  const recordingCatch = source.slice(
    source.indexOf('Pending checkout order could not be saved.'),
    source.indexOf('return json({ url: checkoutURL, checkout_session_id: session.id });'),
  );
  assert.doesNotMatch(recordingCatch, /sessions\.expire/);
  assert.match(source, /CHECKOUT_ATTEMPT_STALE/);
});

test('accepts only an active one-time Stripe price matching the configured pack', () => {
  assert.doesNotThrow(() => assertStripePriceMatchesProduct(productWithStripePrice, matchingStripePrice));

  for (const stripePrice of [
    { ...matchingStripePrice, id: 'price_OTHER' },
    { ...matchingStripePrice, active: false },
    { ...matchingStripePrice, type: 'recurring' },
    { ...matchingStripePrice, unit_amount: 1200 },
    { ...matchingStripePrice, currency: 'usd' },
    { ...matchingStripePrice, metadata: { ...matchingStripePrice.metadata, xert_product_id: 'another-product' } },
    { ...matchingStripePrice, metadata: { ...matchingStripePrice.metadata, xert_catalog_slug: 'another-pack' } },
    { ...matchingStripePrice, metadata: { ...matchingStripePrice.metadata, xert_sessions: '99' } },
    { ...matchingStripePrice, metadata: { ...matchingStripePrice.metadata, xert_validity_days: '365' } },
    { id: matchingStripePrice.id, deleted: true },
  ]) {
    assert.throws(
      () => assertStripePriceMatchesProduct(productWithStripePrice, stripePrice),
      /does not match the product configuration/i
    );
  }
});

test('keeps test and live Stripe objects in the same payment environment', () => {
  assert.equal(stripeModeForSecret('sk_test_example'), 'test');
  assert.equal(stripeModeForSecret('rk_live_example'), 'live');
  assert.equal(stripeModeForSecret('secret-value'), 'unknown');
  assert.doesNotThrow(() => assertStripePriceMatchesProduct(
    productWithStripePrice,
    { ...matchingStripePrice, livemode: true },
    true,
  ));
  assert.throws(() => assertStripePriceMatchesProduct(
    productWithStripePrice,
    { ...matchingStripePrice, livemode: false },
    true,
  ), /does not match/i);
});

test('reuses only the current same-platform pack snapshot from an open unpaid Checkout session', () => {
  const user = { id: 'member-xert' };
  const product = { id: 'product-xert', ...validProduct };
  const checkout = {
    status: 'open', payment_status: 'unpaid', url: 'https://checkout.stripe.com/c/pay/cs_test_xert',
    amount_total: 4800, currency: 'aud', livemode: false,
    customer_email: 'member@example.com',
    metadata: {
      user_id: user.id,
      product_id: product.id,
      product_slug: product.slug,
      sessions_count: String(product.sessions_count),
      validity_days: String(product.validity_days),
      return_target: 'ios',
      checkout_contract: 'receipt_terms_v1',
    },
  };
  const options = {
    returnTarget: 'ios', stripeMode: 'test', memberEmail: 'member@example.com',
  };
  assert.equal(reusableCheckoutURL(checkout, user, product, options), checkout.url);
  for (const invalid of [
    { ...checkout, status: 'complete' },
    { ...checkout, payment_status: 'paid' },
    { ...checkout, livemode: true },
    { ...checkout, amount_total: 4900 },
    { ...checkout, url: 'javascript:alert(1)' },
    { ...checkout, url: 'https://checkout.stripe.com.attacker.example/c/pay/cs_test_xert' },
    { ...checkout, url: 'https://member:secret@checkout.stripe.com/c/pay/cs_test_xert' },
    { ...checkout, metadata: { ...checkout.metadata, user_id: 'another-member' } },
    { ...checkout, metadata: { ...checkout.metadata, product_id: 'another-product' } },
    { ...checkout, metadata: { ...checkout.metadata, product_slug: 'another-pack' } },
    { ...checkout, metadata: { ...checkout.metadata, sessions_count: '99' } },
    { ...checkout, metadata: { ...checkout.metadata, validity_days: '365' } },
    { ...checkout, metadata: { ...checkout.metadata, return_target: 'web' } },
    { ...checkout, metadata: { ...checkout.metadata, checkout_contract: 'legacy' } },
    { ...checkout, customer_email: 'another@example.com' },
  ]) assert.equal(reusableCheckoutURL(invalid, user, product, options), null);
});

test('builds and verifies the complete Stripe Checkout handoff contract', () => {
  const user = { id: 'member-xert', email: 'member@example.com' };
  const product = { id: 'product-xert', slug: 'starter-4', ...validProduct };
  const lineItem = { price: 'price_XERT4800', quantity: 1 };
  const returnURLs = {
    success: 'https://xert-fitness.vercel.app/payment/success?platform=ios&session_id={CHECKOUT_SESSION_ID}',
    cancel: 'https://xert-fitness.vercel.app/payment/cancel?platform=ios',
  };
  const receiptDetails = checkoutReceiptDetails(user, product);
  const parameters = buildCheckoutSessionParameters({
    user,
    product,
    lineItem,
    returnTarget: 'ios',
    returnURLs,
    receiptDetails,
    checkoutAttemptID,
  });

  assert.equal(parameters.mode, 'payment');
  assert.equal(parameters.origin_context, 'mobile_app');
  assert.equal(parameters.customer_email, user.email);
  assert.equal(parameters.client_reference_id, user.id);
  assert.deepEqual(parameters.line_items, [lineItem]);
  // The stable checkout idempotency key requires a byte-identical request body
  // on every retry, so no wall-clock expiry may be embedded.
  assert.equal('expires_at' in parameters, false);
  assert.equal(parameters.custom_text.submit.message, receiptDetails.terms);
  assert.equal(parameters.payment_intent_data.receipt_email, user.email);
  assert.equal(
    parameters.payment_intent_data.metadata.xert_checkout_attempt_id,
    checkoutAttemptID,
  );
  assert.equal(parameters.metadata.xert_checkout_attempt_id, checkoutAttemptID);
  assert.equal(parameters.metadata.checkout_attempt_id, checkoutAttemptID);
  assert.equal(parameters.metadata.checkout_contract, receiptDetails.contractVersion);

  const checkout = {
    id: 'cs_test_xert123',
    status: 'open',
    payment_status: 'unpaid',
    livemode: false,
    url: 'https://checkout.stripe.com/c/pay/cs_test_xert123',
    amount_total: product.price_cents,
    currency: product.currency,
    customer_email: user.email,
    client_reference_id: user.id,
    origin_context: 'mobile_app',
    success_url: returnURLs.success,
    cancel_url: returnURLs.cancel,
    metadata: parameters.metadata,
  };
  const options = {
    returnTarget: 'ios',
    returnURLs,
    stripeMode: 'test',
    memberEmail: user.email,
    checkoutAttemptID,
  };

  assert.equal(verifiedCreatedCheckoutURL(checkout, user, product, options), checkout.url);
  for (const invalid of [
    { ...checkout, id: 'not_a_checkout_session' },
    { ...checkout, client_reference_id: 'another-member' },
    { ...checkout, origin_context: 'web' },
    { ...checkout, success_url: 'https://attacker.example/success' },
    { ...checkout, cancel_url: 'https://attacker.example/cancel' },
    {
      ...checkout,
      metadata: { ...checkout.metadata, xert_checkout_attempt_id: crypto.randomUUID() },
    },
    {
      ...checkout,
      metadata: { ...checkout.metadata, checkout_attempt_id: crypto.randomUUID() },
    },
  ]) {
    assert.throws(
      () => verifiedCreatedCheckoutURL(invalid, user, product, options),
      /did not match the requested purchase/i,
    );
  }
});

test('rejects invalid pricing, credits, expiry, and currency before Checkout', () => {
  for (const product of [
    { ...validProduct, price_cents: 0 },
    { ...validProduct, sessions_count: 0 },
    { ...validProduct, validity_days: 0 },
    { ...validProduct, currency: 'australian-dollars' },
    // Fulfilment hard-requires AUD, so a valid-looking 3-letter non-AUD currency
    // must be refused before money is committed. These passed the
    // old /^[a-z]{3}$/i check and charged the member for credits never granted.
    { ...validProduct, currency: 'nzd' },
    { ...validProduct, currency: 'usd' },
    { ...validProduct, currency: 'USD' },
  ]) {
    assert.throws(() => assertCheckoutProduct(product), /configuration is invalid/i);
  }
  assert.doesNotThrow(() => assertCheckoutProduct({ ...validProduct, currency: 'AUD' }));
});

test('checkout session parameters are byte-stable for a fixed idempotency key', () => {
  const user = { id: 'member-xert', email: 'member@example.com' };
  const product = { id: 'product-xert', slug: 'starter-4', ...validProduct };
  const lineItem = { price: 'price_XERT4800', quantity: 1 };
  const returnURLs = {
    success: 'https://xert-fitness.vercel.app/account?purchase=success&checkout_session_id={CHECKOUT_SESSION_ID}',
    cancel: 'https://xert-fitness.vercel.app/booking?purchase=cancelled',
  };
  const receiptDetails = checkoutReceiptDetails(user, product);
  const build = () => buildCheckoutSessionParameters({
    user, product, lineItem, returnTarget: 'web', returnURLs, receiptDetails, checkoutAttemptID,
  });
  // A stable idempotency key only replays Stripe's saved session when the body
  // is identical, so two builds must be deep-equal.
  assert.deepEqual(build(), build());
});

test('records a member-bound pending order before handing off to Stripe', async () => {
  const order = pendingOrderForCheckout(
    { id: 'cs_xert', amount_total: 4800, currency: 'aud', payment_intent: null },
    { id: 'member-xert', email: 'member@example.com' },
    { id: 'product-xert', ...validProduct },
  );
  assert.deepEqual(order, {
    user_id: 'member-xert',
    product_id: 'product-xert',
    email: 'member@example.com',
    amount_cents: 4800,
    currency: 'aud',
    status: 'pending',
    credit_total: 4,
    credit_validity_days: 28,
    stripe_checkout_session_id: 'cs_xert',
    stripe_payment_intent_id: null,
  });

  const source = await readFile(new URL('../api/checkout.js', import.meta.url), 'utf8');
  assert.match(source, /from\('orders'\)[\s\S]*upsert\(pendingOrderForCheckout/);
  assert.match(source, /catch \{[\s\S]*checkout\.sessions\.expire\(session\.id\)/);
  assert.match(source, /findReusableCheckout/);
  assert.match(source, /stripeMode === 'live' && !product\.stripe_price_id/);
  assert.match(source, /customer_creation: 'if_required'/);
  assert.match(source, /origin_context: returnTarget === 'ios' \? 'mobile_app' : 'web'/);
  assert.match(source, /receipt_email: receiptDetails\.email/);
  assert.match(source, /submit: \{ message: receiptDetails\.terms \}/);
  assert.match(source, /checkout_contract: receiptDetails\.contractVersion/);
  assert.match(source, /payment_intent_data:/);
  assert.match(source, /checkout\.sessions\.create\(checkoutParameters, \{[\s\S]*idempotencyKey:/);
  assert.match(source, /verifiedCreatedCheckoutURL\(session, user, product/);
  assert.ok(
    source.indexOf('verifiedCreatedCheckoutURL(session, user, product')
      < source.indexOf(".upsert(pendingOrderForCheckout(session, user, product)"),
    'Stripe session verification must happen before persistence and handoff',
  );
  assert.throws(
    () => pendingOrderForCheckout(
      { id: 'cs_xert', amount_total: 4700, currency: 'aud' },
      { id: 'member-xert' },
      { id: 'product-xert', ...validProduct },
    ),
    /does not match the product/i,
  );
});
