import http2 from 'node:http2';
import { createSign } from 'node:crypto';

const INVALID_TOKEN_REASONS = new Set(['BadDeviceToken', 'DeviceTokenNotForTopic', 'Unregistered']);
const DELIVERY_BATCH_SIZE = 25;
const TARGET_USER_BATCH_SIZE = 100;

function clean(value) {
  return String(value || '').trim();
}

export function inspectAPNsEnvironment(environment = {}) {
  const values = {
    keyId: clean(environment.APNS_KEY_ID),
    teamId: clean(environment.APNS_TEAM_ID),
    bundleId: clean(environment.APNS_BUNDLE_ID || 'com.xertfitness.app'),
    privateKey: clean(environment.APNS_PRIVATE_KEY).replace(/\\n/g, '\n'),
  };
  const missing = [];
  if (!values.keyId) missing.push('APNS_KEY_ID');
  if (!values.teamId) missing.push('APNS_TEAM_ID');
  if (!values.bundleId) missing.push('APNS_BUNDLE_ID');
  if (!values.privateKey.includes('BEGIN PRIVATE KEY')) missing.push('APNS_PRIVATE_KEY');
  return { ready: missing.length === 0, missing, ...values };
}

export function createAPNsProviderToken(config, now = new Date()) {
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: config.keyId })).toString('base64url');
  const claims = Buffer.from(JSON.stringify({ iss: config.teamId, iat: Math.floor(now.getTime() / 1000) })).toString('base64url');
  const input = `${header}.${claims}`;
  const signer = createSign('SHA256');
  signer.update(input);
  signer.end();
  const signature = signer.sign({ key: config.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${input}.${signature}`;
}

export function buildAnnouncementPush(announcement) {
  const title = clean(announcement?.title).slice(0, 120);
  const body = clean(announcement?.body).slice(0, 500);
  if (!title || !body) throw new Error('ANNOUNCEMENT_PUSH_INVALID');
  return {
    aps: {
      alert: { title, body },
      sound: 'default',
      'thread-id': 'xert-member-notices',
    },
    announcement_id: announcement.id,
    cta_url: clean(announcement.cta_url) || undefined,
  };
}

function apnsHost(environment) {
  return environment === 'sandbox' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';
}

function sendNotification(client, subscription, announcement, config, providerToken) {
  return new Promise(resolve => {
    const headers = {
      ':method': 'POST',
      ':path': `/3/device/${subscription.device_token}`,
      authorization: `bearer ${providerToken}`,
      'apns-topic': config.bundleId,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'apns-collapse-id': `notice-${announcement.id}`,
    };
    if (announcement.expires_at) {
      const expiresAt = Math.floor(new Date(announcement.expires_at).getTime() / 1000);
      if (Number.isFinite(expiresAt)) headers['apns-expiration'] = String(expiresAt);
    }
    const request = client.request(headers);
    let statusCode = 0;
    let responseBody = '';
    request.setEncoding('utf8');
    request.on('response', responseHeaders => { statusCode = Number(responseHeaders[':status'] || 0); });
    request.on('data', chunk => { responseBody += chunk; });
    request.on('error', error => resolve({ subscription, status: 'failed', reason: clean(error.message) || 'APNS_NETWORK_ERROR' }));
    request.on('end', () => {
      let reason = '';
      try { reason = JSON.parse(responseBody || '{}').reason || ''; } catch { reason = ''; }
      resolve({
        subscription,
        status: statusCode === 200 ? 'delivered' : INVALID_TOKEN_REASONS.has(reason) ? 'invalid_token' : 'failed',
        reason: reason || (statusCode === 200 ? null : `APNS_HTTP_${statusCode || 'UNKNOWN'}`),
      });
    });
    request.end(JSON.stringify(buildAnnouncementPush(announcement)));
  });
}

export async function loadSubscriptions(admin, targetUserIds = null) {
  const rows = [];
  const pageSize = 500;
  const userIds = Array.isArray(targetUserIds)
    ? [...new Set(targetUserIds.filter(Boolean))]
    : null;
  if (userIds && userIds.length === 0) return rows;

  const userBatches = userIds
    ? Array.from({ length: Math.ceil(userIds.length / TARGET_USER_BATCH_SIZE) }, (_, index) =>
        userIds.slice(index * TARGET_USER_BATCH_SIZE, (index + 1) * TARGET_USER_BATCH_SIZE))
    : [null];
  for (const userBatch of userBatches) {
    for (let from = 0; ; from += pageSize) {
      let query = admin
        .from('push_subscriptions')
        .select('id,user_id,device_token,environment')
        .eq('enabled', true)
        .order('id')
        .range(from, from + pageSize - 1);
      if (userBatch) query = query.in('user_id', userBatch);
      const { data, error } = await query;
      if (error) throw error;
      rows.push(...(data || []));
      if ((data || []).length < pageSize) break;
    }
  }
  return rows;
}

async function saveDeliveryResults(admin, announcementId, results) {
  const deliveries = results.map(result => ({
    announcement_id: announcementId,
    subscription_id: result.subscription.id,
    user_id: result.subscription.user_id,
    environment: result.subscription.environment,
    status: result.status,
    reason: result.reason,
  }));
  for (let index = 0; index < deliveries.length; index += 500) {
    const { error } = await admin.from('push_notification_deliveries').insert(deliveries.slice(index, index + 500));
    if (error) throw error;
  }
  const invalidIds = results.filter(result => result.status === 'invalid_token').map(result => result.subscription.id);
  for (let index = 0; index < invalidIds.length; index += 500) {
    const { error } = await admin.from('push_subscriptions').update({ enabled: false }).in('id', invalidIds.slice(index, index + 500));
    if (error) throw error;
  }
}

export async function sendMemberAnnouncementPushes({ admin, announcement, targetUserIds = null, environment = process.env }) {
  const config = inspectAPNsEnvironment(environment);
  if (!config.ready) return { configured: false, missing: config.missing, attempted: 0, delivered: 0, failed: 0 };
  const subscriptions = await loadSubscriptions(admin, targetUserIds);
  if (subscriptions.length === 0) return { configured: true, attempted: 0, delivered: 0, failed: 0 };
  const providerToken = createAPNsProviderToken(config);
  const results = [];

  for (const targetEnvironment of ['production', 'sandbox']) {
    const targets = subscriptions.filter(subscription => subscription.environment === targetEnvironment);
    if (targets.length === 0) continue;
    const client = http2.connect(apnsHost(targetEnvironment));
    client.on('error', () => {});
    try {
      for (let index = 0; index < targets.length; index += DELIVERY_BATCH_SIZE) {
        results.push(...await Promise.all(
          targets.slice(index, index + DELIVERY_BATCH_SIZE)
            .map(subscription => sendNotification(client, subscription, announcement, config, providerToken))
        ));
      }
    } finally {
      client.close();
    }
  }

  await saveDeliveryResults(admin, announcement.id, results);
  const delivered = results.filter(result => result.status === 'delivered').length;
  return {
    configured: true,
    attempted: results.length,
    delivered,
    failed: results.length - delivered,
  };
}
