import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import checkoutHandler from '../api/checkout.js';
import deleteAccountHandler from '../api/delete-account.js';
import commerceHealthHandler from '../api/admin-commerce-health.js';
import stripeWebhookHandler from '../api/stripe-webhook.js';
import adminRefundHandler from '../api/admin-refund-order.js';
import adminReconcileHandler from '../api/admin-reconcile-order.js';
import pushSubscriptionHandler from '../api/push-subscription.js';
import adminPublishAnnouncementHandler from '../api/admin-publish-announcement.js';
import pushHealthHandler from '../api/push-health.js';
import adminPushHealthHandler from '../api/admin-push-health.js';

function createVercelResponse() {
  return {
    completed: false,
    headers: {},
    statusCode: 200,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.completed = true;
      this.body = body;
      return this;
    },
    send(body) {
      this.completed = true;
      this.body = body;
      return this;
    },
    end() {
      this.completed = true;
      return this;
    },
  };
}

test('Hobby deployment stays within the twelve-function ceiling', () => {
  const functions = readdirSync(new URL('../api/', import.meta.url)).filter(name => name.endsWith('.js'));
  assert.equal(functions.length, 12);
});

for (const [name, handler, method] of [
  ['checkout', checkoutHandler, 'GET'],
  ['delete account', deleteAccountHandler, 'GET'],
  ['commerce health', commerceHealthHandler, 'PUT'],
  ['Stripe webhook', stripeWebhookHandler, 'GET'],
  ['admin refund', adminRefundHandler, 'GET'],
  ['admin order reconciliation', adminReconcileHandler, 'GET'],
  ['push subscription', pushSubscriptionHandler, 'GET'],
  ['admin announcement publishing', adminPublishAnnouncementHandler, 'GET'],
  ['push health', pushHealthHandler, 'POST'],
  ['admin push health', adminPushHealthHandler, 'POST'],
]) {
  test(`${name} completes the Vercel Node response for an unsupported method`, async () => {
    const response = createVercelResponse();
    await handler({ method, headers: {} }, response);

    assert.equal(response.completed, true);
    assert.equal(response.statusCode, 405);
    assert.match(String(response.body?.error || response.body), /Method not allowed/);
  });
}

test('payment endpoints fail closed before authentication when runtime identity is invalid', async () => {
  for (const handler of [checkoutHandler, adminRefundHandler, adminReconcileHandler]) {
    const response = createVercelResponse();
    await handler({ method: 'POST', headers: {} }, response);

    assert.equal(response.completed, true);
    assert.equal(response.statusCode, 503);
    assert.match(response.body?.error || '', /unavailable/i);
  }
});

test('checkout HEAD completes a body-free private commerce readiness probe', async () => {
  const response = createVercelResponse();
  await checkoutHandler({ method: 'HEAD', headers: {} }, response);

  assert.equal(response.completed, true);
  assert.equal(response.statusCode, 503);
  assert.equal(response.body, undefined);
  assert.equal(response.headers['cache-control'], 'private, no-store, max-age=0');
});
