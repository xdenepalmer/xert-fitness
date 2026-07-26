import http2 from 'node:http2';
import { createSign } from 'node:crypto';

const INVALID_TOKEN_REASONS = new Set(['BadDeviceToken', 'DeviceTokenNotForTopic', 'Unregistered']);
const DELIVERY_BATCH_SIZE = 25;
const TARGET_USER_BATCH_SIZE = 100;
export const APNS_REQUEST_TIMEOUT_MS = 8_000;

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
      category: 'xert.member-notice',
      'thread-id': 'xert-member-notices',
    },
    announcement_id: announcement.id,
    cta_url: clean(announcement.cta_url) || undefined,
  };
}

function apnsHost(environment) {
  return environment === 'sandbox' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';
}

export function sendNotification(
  client,
  subscription,
  announcement,
  config,
  providerToken,
  timeoutMs = APNS_REQUEST_TIMEOUT_MS,
) {
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
    let statusCode = 0;
    let responseBody = '';
    let settled = false;
    let timeoutId;
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve(result);
    };
    let request;
    try {
      request = client.request(headers);
    } catch (error) {
      finish({ subscription, status: 'failed', reason: clean(error.message) || 'APNS_NETWORK_ERROR' });
      return;
    }
    request.setEncoding('utf8');
    request.on('response', responseHeaders => { statusCode = Number(responseHeaders[':status'] || 0); });
    request.on('data', chunk => { responseBody += chunk; });
    request.on('error', error => finish({ subscription, status: 'failed', reason: clean(error.message) || 'APNS_NETWORK_ERROR' }));
    request.on('end', () => {
      let reason = '';
      try { reason = JSON.parse(responseBody || '{}').reason || ''; } catch { reason = ''; }
      finish({
        subscription,
        status: statusCode === 200 ? 'delivered' : INVALID_TOKEN_REASONS.has(reason) ? 'invalid_token' : 'failed',
        reason: reason || (statusCode === 200 ? null : `APNS_HTTP_${statusCode || 'UNKNOWN'}`),
      });
    });
    timeoutId = setTimeout(() => {
      finish({ subscription, status: 'failed', reason: 'APNS_REQUEST_TIMEOUT' });
      try { request.close(http2.constants.NGHTTP2_CANCEL); } catch { /* stream already closed */ }
    }, Math.max(1, Number(timeoutMs) || APNS_REQUEST_TIMEOUT_MS));
    try {
      request.end(JSON.stringify(buildAnnouncementPush(announcement)));
    } catch (error) {
      finish({ subscription, status: 'failed', reason: clean(error.message) || 'APNS_NETWORK_ERROR' });
      try { request.close(http2.constants.NGHTTP2_CANCEL); } catch { /* stream already closed */ }
    }
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

export async function loadDeliveredSubscriptionIds(admin, announcementId) {
  const ids = new Set();
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from('push_notification_deliveries')
      .select('subscription_id,status')
      .eq('announcement_id', announcementId)
      .order('subscription_id')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    for (const row of data || []) {
      // Terminal outcomes only. Transient `failed` (timeout / APNs blip) must
      // not permanently silence a later operator retry — Privacy/operator copy
      // says publish again can finish devices that still need a delivery.
      if (row.subscription_id && (row.status === 'delivered' || row.status === 'invalid_token')) {
        ids.add(row.subscription_id);
      }
    }
    if ((data || []).length < pageSize) break;
  }
  return ids;
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
  // Fail closed: a broadcast (no explicit recipient list) is only ever safe for
  // an 'all' audience. A targeted notice that reaches this path without its
  // recipients would be pushed to every enrolled device.
  if (targetUserIds === null && announcement?.audience !== 'all') {
    throw new Error('ANNOUNCEMENT_PUSH_TARGETING_REQUIRED');
  }
  const config = inspectAPNsEnvironment(environment);
  if (!config.ready) return { configured: false, missing: config.missing, attempted: 0, delivered: 0, failed: 0 };
  const subscriptions = await loadSubscriptions(admin, targetUserIds);
  if (subscriptions.length === 0) return { configured: true, attempted: 0, delivered: 0, failed: 0 };
  // Resend is driven by terminal delivery rows, not published_at: devices with
  // delivered / invalid_token are skipped; transient `failed` stays retryable so
  // re-publish can finish an interrupted fan-out without re-notifying successes.
  const alreadyDelivered = await loadDeliveredSubscriptionIds(admin, announcement.id);
  const pending = subscriptions.filter(subscription => !alreadyDelivered.has(subscription.id));
  if (pending.length === 0) {
    return { configured: true, attempted: 0, delivered: 0, failed: 0, skipped: subscriptions.length };
  }
  const providerToken = createAPNsProviderToken(config);
  const results = [];

  for (const targetEnvironment of ['production', 'sandbox']) {
    const targets = pending.filter(subscription => subscription.environment === targetEnvironment);
    if (targets.length === 0) continue;
    const client = http2.connect(apnsHost(targetEnvironment));
    client.on('error', () => {});
    try {
      for (let index = 0; index < targets.length; index += DELIVERY_BATCH_SIZE) {
        const batch = await Promise.all(
          targets.slice(index, index + DELIVERY_BATCH_SIZE)
            .map(subscription => sendNotification(client, subscription, announcement, config, providerToken))
        );
        results.push(...batch);
        // Persist each batch as it completes so a 60s function timeout mid-loop
        // keeps what was already sent instead of discarding every delivery row.
        await saveDeliveryResults(admin, announcement.id, batch);
      }
    } finally {
      client.close();
    }
  }

  const delivered = results.filter(result => result.status === 'delivered').length;
  return {
    configured: true,
    attempted: results.length,
    delivered,
    failed: results.length - delivered,
  };
}
