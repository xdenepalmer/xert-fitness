import test from 'node:test';
import assert from 'node:assert/strict';
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
import adminNotifyClassCancellationHandler from '../api/admin-notify-class-cancellation.js';

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
  };
}

for (const [name, handler, method] of [
  ['checkout', checkoutHandler, 'GET'],
  ['delete account', deleteAccountHandler, 'GET'],
  ['commerce health', commerceHealthHandler, 'POST'],
  ['Stripe webhook', stripeWebhookHandler, 'GET'],
  ['admin refund', adminRefundHandler, 'GET'],
  ['admin order reconciliation', adminReconcileHandler, 'GET'],
  ['push subscription', pushSubscriptionHandler, 'GET'],
  ['admin announcement publishing', adminPublishAnnouncementHandler, 'GET'],
  ['push health', pushHealthHandler, 'POST'],
  ['admin push health', adminPushHealthHandler, 'POST'],
  ['class cancellation notification', adminNotifyClassCancellationHandler, 'GET'],
]) {
  test(`${name} completes the Vercel Node response for an unsupported method`, async () => {
    const response = createVercelResponse();
    await handler({ method, headers: {} }, response);

    assert.equal(response.completed, true);
    assert.equal(response.statusCode, 405);
    assert.match(String(response.body?.error || response.body), /Method not allowed/);
  });
}
