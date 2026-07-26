import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  APNS_REQUEST_TIMEOUT_MS,
  buildAnnouncementPush,
  createAPNsProviderToken,
  inspectAPNsEnvironment,
  sendNotification,
} from '../api/apns.js';
import {
  normalizeAnnouncementPublish,
  sendOwnerPushSmokeTest,
} from '../api/admin-publish-announcement.js';
import { inspectPushEnvironment } from '../api/push-health.js';
import { normalizePushSubscription } from '../api/push-subscription.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('APNs configuration and provider tokens use the required team credentials', () => {
  assert.deepEqual(inspectAPNsEnvironment({}), {
    ready: false,
    missing: ['APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_PRIVATE_KEY'],
    keyId: '',
    teamId: '',
    bundleId: 'com.xertfitness.app',
    privateKey: '',
  });
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const config = inspectAPNsEnvironment({
    APNS_KEY_ID: 'KEY123',
    APNS_TEAM_ID: 'TEAM123',
    APNS_BUNDLE_ID: 'com.xertfitness.app',
    APNS_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  });
  assert.equal(config.ready, true);
  const token = createAPNsProviderToken(config, new Date('2026-07-14T00:00:00Z'));
  const [header, claims, signature] = token.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url')), { alg: 'ES256', kid: 'KEY123' });
  assert.deepEqual(JSON.parse(Buffer.from(claims, 'base64url')), { iss: 'TEAM123', iat: 1783987200 });
  assert.ok(signature.length > 40);
});

test('announcement pushes are bounded and carry a durable announcement route', () => {
  const payload = buildAnnouncementPush({
    id: '3a9791d6-d79b-4eeb-9ad0-d8a6a66bff45',
    title: ` Notice ${'x'.repeat(150)} `,
    body: ` Body ${'y'.repeat(550)} `,
    cta_url: '/account',
  });
  assert.equal(payload.aps.alert.title.length, 120);
  assert.equal(payload.aps.alert.body.length, 500);
  assert.equal(payload.announcement_id, '3a9791d6-d79b-4eeb-9ad0-d8a6a66bff45');
  assert.equal(payload.cta_url, '/account');
  assert.throws(() => buildAnnouncementPush({ title: '', body: 'Body' }), /ANNOUNCEMENT_PUSH_INVALID/);
});

test('owner launch tests cannot masquerade as member announcement routes', () => {
  const payload = buildAnnouncementPush({
    id: '178ad488-2f30-4b2b-a2f1-6f9d91e68cc4',
    title: 'XERT launch test',
    body: 'Production notifications are reaching this owner device.',
    push_kind: 'owner_launch_test',
  });
  assert.equal(payload.xert_push_test, 'owner_launch');
  assert.equal(payload.aps.category, 'xert.owner-launch-test');
  assert.equal('announcement_id' in payload, false);
  assert.equal('cta_url' in payload, false);
});

test('an unresponsive APNs stream fails within a bounded request deadline', async () => {
  class HangingStream extends EventEmitter {
    setEncoding() {}
    end() {}
    close() { this.closed = true; }
  }
  const stream = new HangingStream();
  const client = { request: () => stream };
  const subscription = {
    id: 'subscription-1',
    user_id: 'member-1',
    device_token: 'ab'.repeat(32),
    environment: 'production',
  };
  const result = await sendNotification(
    client,
    subscription,
    { id: '3a9791d6-d79b-4eeb-9ad0-d8a6a66bff45', title: 'Class update', body: 'Check your booking.' },
    { bundleId: 'com.xertfitness.app' },
    'provider-token',
    5,
  );

  assert.equal(APNS_REQUEST_TIMEOUT_MS, 8_000);
  assert.equal(result.subscription, subscription);
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'APNS_REQUEST_TIMEOUT');
  assert.equal(stream.closed, true);
});

test('a completed APNs response clears the deadline and remains successful', async () => {
  class SuccessfulStream extends EventEmitter {
    setEncoding() {}
    end() {
      queueMicrotask(() => {
        this.emit('response', { ':status': 200 });
        this.emit('end');
      });
    }
    close() { this.closed = true; }
  }
  const stream = new SuccessfulStream();
  const result = await sendNotification(
    { request: () => stream },
    { id: 'subscription-2', user_id: 'member-2', device_token: 'cd'.repeat(32), environment: 'production' },
    { id: '3a9791d6-d79b-4eeb-9ad0-d8a6a66bff45', title: 'Class update', body: 'Check your booking.' },
    { bundleId: 'com.xertfitness.app' },
    'provider-token',
    50,
  );

  assert.equal(result.status, 'delivered');
  assert.equal(result.reason, null);
  assert.notEqual(stream.closed, true);
});

test('a synchronous APNs connection failure is returned as an auditable delivery result', async () => {
  const subscription = {
    id: 'subscription-3', user_id: 'member-3', device_token: 'ef'.repeat(32), environment: 'production',
  };
  const result = await sendNotification(
    { request: () => { throw new Error('session unavailable'); } },
    subscription,
    { id: '3a9791d6-d79b-4eeb-9ad0-d8a6a66bff45', title: 'Class update', body: 'Check your booking.' },
    { bundleId: 'com.xertfitness.app' },
    'provider-token',
    50,
  );

  assert.deepEqual(result, { subscription, status: 'failed', reason: 'session unavailable' });
});

test('a synchronous APNs stream write failure settles once as an auditable result', async () => {
  class FailingWriteStream extends EventEmitter {
    setEncoding() {}
    end() { throw new Error('stream closed'); }
    close() { this.closed = true; }
  }
  const stream = new FailingWriteStream();
  const subscription = {
    id: 'subscription-4', user_id: 'member-4', device_token: '12'.repeat(32), environment: 'production',
  };
  const result = await sendNotification(
    { request: () => stream },
    subscription,
    { id: '3a9791d6-d79b-4eeb-9ad0-d8a6a66bff45', title: 'Class update', body: 'Check your booking.' },
    { bundleId: 'com.xertfitness.app' },
    'provider-token',
    5,
  );

  assert.deepEqual(result, { subscription, status: 'failed', reason: 'stream closed' });
  assert.equal(stream.closed, true);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(result, { subscription, status: 'failed', reason: 'stream closed' });
});

test('push registration accepts only APNs tokens and explicit environments', () => {
  assert.deepEqual(normalizePushSubscription({
    action: 'REGISTER',
    device_token: 'AB'.repeat(32),
    environment: 'production',
  }), {
    action: 'register',
    deviceToken: 'ab'.repeat(32),
    environment: 'production',
  });
  assert.throws(() => normalizePushSubscription({ device_token: 'not-a-token', environment: 'production' }), /PUSH_TOKEN_INVALID/);
  assert.throws(() => normalizePushSubscription({ device_token: 'ab'.repeat(32), environment: 'preview' }), /PUSH_ENVIRONMENT_INVALID/);
});

test('admin publishing rejects unsafe actions and expired notices', () => {
  const now = new Date('2026-07-14T00:00:00Z');
  const valid = normalizeAnnouncementPublish({ announcement: {
    title: 'Weekend session',
    body: 'Bring a water bottle.',
    tone: 'action',
    cta_label: 'View account',
    cta_url: '/account',
    expires_at: '2026-07-15T00:00:00Z',
  } }, now);
  assert.equal(valid.announcement.tone, 'action');
  const versioned = normalizeAnnouncementPublish({
    id: '9e604cf4-64c2-4a82-9ff0-ecf5bb8db629',
    expected_updated_at: '2026-07-14T01:00:00Z',
    announcement: { title: 'Updated', body: 'Review this notice.' },
  }, now);
  assert.equal(versioned.expectedUpdatedAt, '2026-07-14T01:00:00Z');
  assert.throws(() => normalizeAnnouncementPublish({
    id: '9e604cf4-64c2-4a82-9ff0-ecf5bb8db629',
    announcement: { title: 'Updated', body: 'Missing its version.' },
  }, now), /ANNOUNCEMENT_VERSION_INVALID/);
  assert.throws(() => normalizeAnnouncementPublish({ announcement: {
    title: 'Unsafe', body: 'Nope', cta_label: 'Open', cta_url: 'javascript:alert(1)',
  } }, now), /ANNOUNCEMENT_ACTION_INVALID/);
  assert.throws(() => normalizeAnnouncementPublish({ announcement: {
    title: 'Old', body: 'Expired', expires_at: '2026-07-13T00:00:00Z',
  } }, now), /ANNOUNCEMENT_EXPIRY_INVALID/);
});

test('push health reveals only release readiness', () => {
  assert.deepEqual(inspectPushEnvironment({}), { ready: false });
  assert.deepEqual(inspectPushEnvironment({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    APNS_KEY_ID: 'key',
    APNS_TEAM_ID: 'team',
    APNS_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nkey\\n-----END PRIVATE KEY-----',
  }), { ready: true });
});

test('owner push smoke tests are private, production-only, bounded, and auditable', async () => {
  const ownerId = '7fac26b4-07b8-4b2a-a288-8a574f97987c';
  const requestId = '178ad488-2f30-4b2b-a2f1-6f9d91e68cc4';
  let delivery;
  const result = await sendOwnerPushSmokeTest(
    { from() { throw new Error('sender owns persistence'); } },
    ownerId,
    {
      requestId,
      now: new Date('2026-07-27T06:00:00.000Z'),
      async sendPushes(input) {
        delivery = input;
        return { configured: true, attempted: 2, delivered: 1, failed: 1 };
      },
    },
  );

  assert.deepEqual(result, {
    request_id: requestId,
    configured: true,
    attempted: 2,
    delivered: 1,
    failed: 1,
  });
  assert.deepEqual(delivery.targetUserIds, [ownerId]);
  assert.deepEqual(delivery.targetEnvironments, ['production']);
  assert.equal(delivery.maximumSubscriptions, 5);
  assert.equal(delivery.deliveryAnnouncementId, null);
  assert.equal(delivery.deliveryReasonPrefix, 'OWNER_LAUNCH_TEST');
  assert.equal(delivery.announcement.id, requestId);
  assert.equal(delivery.announcement.push_kind, 'owner_launch_test');
  assert.equal(delivery.announcement.expires_at, '2026-07-27T06:05:00.000Z');
  assert.match(delivery.announcement.title, /XERT launch test/);
  await assert.rejects(
    sendOwnerPushSmokeTest({}, 'member-selected-by-client', { requestId }),
    /PUSH_SMOKE_TEST_INVALID/,
  );
});

test('push schema keeps device tokens service-only and exposes admin aggregate metrics', () => {
  const source = read('../src/supabase/member_push_notifications_upgrade.sql');
  const migration = read('../supabase/migrations/20260714009000_member_push_notifications.sql');
  assert.equal(migration.replace(/\r\n/g, '\n'), source.replace(/\r\n/g, '\n'));
  assert.match(source, /revoke all on table public\.push_subscriptions from anon, authenticated/i);
  assert.match(source, /revoke all on table public\.push_notification_deliveries from anon, authenticated/i);
  assert.match(source, /if not public\.is_admin\(\)/i);
  assert.match(source, /revoke execute on function public\.admin_announcement_push_metrics\(\) from public, anon/i);
  const deliveryTable = source.slice(source.indexOf('create table if not exists public.push_notification_deliveries'), source.indexOf('create index if not exists push_notification_deliveries_announcement_idx'));
  assert.doesNotMatch(deliveryTable, /device_token/i);
});

test('web and native clients route authenticated push registration and publishing', () => {
  const adminData = read('../src/lib/adminData.js');
  const manager = read('../src/components/admin/AnnouncementsManager.jsx');
  const registration = read('../ios/XertFitnessApp/XertFitnessApp/Services/MemberPushRegistration.swift');
  const api = read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift');
  const store = read('../ios/XertFitnessApp/XertFitnessApp/Store/XertStore.swift');
  const root = read('../ios/XertFitnessApp/XertFitnessApp/Views/RootView.swift');
  const account = read('../ios/XertFitnessApp/XertFitnessApp/Views/AccountView.swift');
  assert.match(adminData, /admin_announcement_push_metrics/);
  assert.match(adminData, /\/api\/admin-publish-announcement/);
  assert.match(manager, /publishMemberAnnouncement/);
  assert.match(registration, /registerForRemoteNotifications/);
  assert.match(registration, /#if DEBUG[\s\S]*sandbox[\s\S]*production/);
  assert.match(api, /\/api\/push-subscription/);
  assert.match(store, /func setMemberPushEnabled/);
  assert.match(store, /func syncMemberPushToken/);
  assert.match(root, /xertPushTokenUpdated/);
  assert.match(root, /consumePendingAnnouncementID/);
  assert.match(account, /Member notice notifications/);
});

test('the shared admin endpoint derives a push smoke-test recipient from the authenticated owner', () => {
  const endpoint = read('../api/admin-publish-announcement.js');
  assert.match(endpoint, /body\?\.action === 'test_owner_push'/);
  assert.match(endpoint, /sendOwnerPushSmokeTest\(admin, user\.id\)/);
  assert.doesNotMatch(endpoint, /sendOwnerPushSmokeTest\(admin, body/);
  assert.match(endpoint, /targetEnvironments: \['production'\]/);
  assert.match(endpoint, /maximumSubscriptions: 5/);
  assert.match(endpoint, /deliveryAnnouncementId: null/);
});

test('both owner command centres expose the same confirmed production smoke test', () => {
  const adminData = read('../src/lib/adminData.js');
  const operations = read('../src/components/admin/OperationsHealth.jsx');
  const launchGate = read('../src/lib/launchGate.js');
  assert.match(adminData, /export async function sendOwnerPushSmokeTest\(\)/);
  assert.match(adminData, /body: JSON\.stringify\(\{ action: 'test_owner_push' \}\)/);
  assert.match(adminData, /ownerSmokeTest\?\.status === 'delivered'/);
  assert.match(adminData, /smokeTestAge <= 24 \* 60 \* 60 \* 1000/);
  assert.match(operations, /Send owner push test/);
  assert.match(operations, /Send a production push test\?/);
  assert.match(operations, /targets no other member/);
  assert.match(launchGate, /'commerce-config',[\s\S]*'push-notifications',[\s\S]*'classes'/);
});
