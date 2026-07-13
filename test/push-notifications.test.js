import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildAnnouncementPush,
  createAPNsProviderToken,
  inspectAPNsEnvironment,
} from '../api/apns.js';
import { normalizeAnnouncementPublish } from '../api/admin-publish-announcement.js';
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
