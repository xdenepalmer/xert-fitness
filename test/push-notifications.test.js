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
import { normalizeAnnouncementPublish } from '../api/admin-publish-announcement.js';
import { inspectPushEnvironment } from '../api/push-health.js';
import {
  normalizePushSubscription,
  pushRegistrationRebindBlocked,
  MAX_ENABLED_PUSH_SUBSCRIPTIONS,
} from '../api/push-subscription.js';
import {
  loadDeliveredSubscriptionIds,
  sendMemberAnnouncementPushes,
} from '../api/apns.js';

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

test('push registration refuses to rebind a device still enabled for another member', () => {
  // A leaked device token must not silently rebind, which would
  // silence the current owner and redirect the caller's notices to their device.
  assert.equal(pushRegistrationRebindBlocked({ user_id: 'victim', enabled: true }, 'attacker'), true);
  // A device released by its previous owner (or disabled by APNs) is a genuine
  // handoff and may be rebound.
  assert.equal(pushRegistrationRebindBlocked({ user_id: 'victim', enabled: false }, 'attacker'), false);
  // The same member re-registering their own device is always allowed.
  assert.equal(pushRegistrationRebindBlocked({ user_id: 'owner', enabled: true }, 'owner'), false);
  assert.equal(pushRegistrationRebindBlocked(null, 'owner'), false);
  assert.ok(MAX_ENABLED_PUSH_SUBSCRIPTIONS >= 1);
});

test('push subscription failures log behind a request id instead of returning a silent 500', () => {
  const endpoint = read('../api/push-subscription.js');
  assert.match(endpoint, /createRequestTrace\(response\)/);
  assert.match(endpoint, /console\.error\('Push subscription update failed\.'[\s\S]*requestId: trace\.requestId/);
});

test('member announcement pushes fail closed for a targeted notice without recipients', async () => {
  // A broadcast (no recipient list) is only safe for an 'all'
  // audience; a targeted notice reaching this path would hit every device.
  await assert.rejects(
    () => sendMemberAnnouncementPushes({ admin: {}, announcement: { id: 'a1', audience: 'targeted' } }),
    /ANNOUNCEMENT_PUSH_TARGETING_REQUIRED/,
  );
  await assert.rejects(
    () => sendMemberAnnouncementPushes({ admin: {}, announcement: { id: 'a1' } }),
    /ANNOUNCEMENT_PUSH_TARGETING_REQUIRED/,
  );
  const broadcast = await sendMemberAnnouncementPushes({
    admin: {}, announcement: { id: 'a1', audience: 'all' }, environment: {},
  });
  assert.equal(broadcast.configured, false);
});

test('resend only targets devices without a delivery row for the notice', async () => {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const apnsEnv = {
    APNS_KEY_ID: 'KEY123', APNS_TEAM_ID: 'TEAM123', APNS_BUNDLE_ID: 'com.xertfitness.app',
    APNS_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
  const subs = [
    { id: 'sub-1', user_id: 'm1', device_token: 'a'.repeat(64), environment: 'production' },
    { id: 'sub-2', user_id: 'm2', device_token: 'b'.repeat(64), environment: 'production' },
  ];
  const admin = deliveredRows => ({
    from(table) {
      if (table === 'push_subscriptions') {
        let served = false;
        const query = {
          select() { return query; }, eq() { return query; }, in() { return query; }, order() { return query; },
          async range() { const data = served ? [] : subs; served = true; return { data, error: null }; },
        };
        return query;
      }
      if (table === 'push_notification_deliveries') {
        let served = false;
        const query = {
          select() { return query; }, eq() { return query; }, order() { return query; },
          async range() { const data = served ? [] : deliveredRows; served = true; return { data, error: null }; },
        };
        return query;
      }
      throw new Error(`unexpected table ${table}`);
    },
  });

  assert.deepEqual(
    [...await loadDeliveredSubscriptionIds(admin([{ subscription_id: 'sub-1' }]), 'ann-1')],
    ['sub-1'],
  );

  // Every device already has a delivery row, so a resend sends
  // nothing and never opens an APNs connection instead of re-notifying the base.
  const result = await sendMemberAnnouncementPushes({
    admin: admin([{ subscription_id: 'sub-1' }, { subscription_id: 'sub-2' }]),
    announcement: { id: 'ann-1', audience: 'all', title: 'Hi', body: 'There' },
    environment: apnsEnv,
  });
  assert.equal(result.attempted, 0);
  assert.equal(result.skipped, 2);
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
  // Public push-health 4xx/5xx must carry a correlatable request id like the
  // other api/ handlers (it previously answered via bare sendJson).
  assert.match(read('../api/push-health.js'), /createRequestTrace\(response\)/);
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
  assert.match(manager, /describeAnnouncementPublishPush/);
  assert.match(registration, /registerForRemoteNotifications/);
  assert.match(registration, /#if DEBUG[\s\S]*sandbox[\s\S]*production/);
  assert.match(api, /\/api\/push-subscription/);
  assert.match(store, /func setMemberPushEnabled/);
  assert.match(store, /func syncMemberPushToken/);
  assert.match(root, /xertPushTokenUpdated/);
  assert.match(root, /consumePendingAnnouncementID/);
  assert.match(account, /Member notice notifications/);
});

test('broadcast publish UI surfaces swallowed APNs failures instead of claiming no devices', async () => {
  const { describeAnnouncementPublishPush } = await import('../src/lib/memberAnnouncements.js');
  assert.match(
    describeAnnouncementPublishPush({ configured: true, attempted: 0, delivered: 0, failed: 1, reason: 'stream closed' }),
    /push delivery failed \(stream closed\)/i,
  );
  assert.doesNotMatch(
    describeAnnouncementPublishPush({ configured: true, attempted: 0, delivered: 0, failed: 1, reason: 'stream closed' }),
    /No enabled iOS devices/i,
  );
  assert.match(
    describeAnnouncementPublishPush({ configured: true, attempted: 2, delivered: 1, failed: 1, reason: 'BadDeviceToken' }),
    /1 device notification delivered; 1 failed \(BadDeviceToken\)/,
  );
  assert.match(
    describeAnnouncementPublishPush({ configured: true, attempted: 0, delivered: 0, failed: 0 }),
    /No enabled iOS devices were registered/,
  );
  assert.match(
    describeAnnouncementPublishPush({ configured: false, attempted: 0, delivered: 0, failed: 0 }),
    /Vercel push secrets/,
  );
});

test('private notice and class-cancel UI surface swallowed APNs failures instead of claiming no devices', async () => {
  const {
    describeTargetedMemberNoticePush,
    describeClassCancellationPush,
  } = await import('../src/lib/memberAnnouncements.js');
  assert.match(
    describeTargetedMemberNoticePush({ configured: true, attempted: 0, delivered: 0, failed: 1, reason: 'stream closed' }),
    /Apple push delivery failed \(stream closed\)/i,
  );
  assert.doesNotMatch(
    describeTargetedMemberNoticePush({ configured: true, attempted: 0, delivered: 0, failed: 1, reason: 'stream closed' }),
    /No active device received a push/i,
  );
  assert.match(
    describeClassCancellationPush({ configured: true, attempted: 0, delivered: 0, failed: 1, reason: 'BadDeviceToken' }),
    /Apple push delivery failed \(BadDeviceToken\)/i,
  );
  assert.doesNotMatch(
    describeClassCancellationPush({ configured: true, attempted: 0, delivered: 0, failed: 1, reason: 'BadDeviceToken' }),
    /No enabled Apple device was registered/i,
  );

  const members = read('../src/components/admin/MembersManager.jsx');
  const calendar = read('../src/components/admin/ClassCalendarAdmin.jsx');
  const iosApi = read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift');
  const iosStore = read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift');
  assert.match(members, /describeTargetedMemberNoticePush\(result\.push\)/);
  assert.match(calendar, /describeClassCancellationPush\(followUp\.notification\.push\)/);
  assert.match(iosApi, /targetedPushWarning\(/);
  assert.match(iosApi, /broadcastPushWarning\(push: response\.push\)/);
  assert.match(iosApi, /AdminAnnouncementPublishResponse/);
  assert.match(iosStore, /let pushWarning = try await api\.adminPublishAnnouncement/);
  assert.match(iosStore, /if let pushWarning \{\s*errorMessage = pushWarning/s);
});
