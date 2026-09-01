// Supabase may issue newer RFC 9562 UUID versions (including time-ordered v7).
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FITBOX_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
export const FITBOX_EVENT_TYPES = Object.freeze([
  'class_session_booked',
  'class_session_cancelled',
  'user_first_session_booked',
  'user_profile_changed',
  'user_status_changed',
  'user_subscription_changed',
]);
const FITBOX_EVENT_TYPE_SET = new Set(FITBOX_EVENT_TYPES);

function boundedText(value, maxLength) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

export function normalizeFitboxLeadID(value) {
  const id = boundedText(value, 128);
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('INVALID_FITBOX_LEAD_ID');
  return id;
}

export function splitFitboxName(value) {
  const fullName = boundedText(value, 160);
  const parts = fullName.split(' ').filter(Boolean);
  if (parts.length < 2) throw new Error('FITBOX_FULL_NAME_REQUIRED');
  return {
    firstname: parts.shift().slice(0, 80),
    lastname: parts.join(' ').slice(0, 80),
  };
}

export function prospectForFitbox(lead) {
  if (!lead || typeof lead !== 'object' || Array.isArray(lead)) throw new Error('INVALID_FITBOX_PROSPECT');
  const { firstname, lastname } = splitFitboxName(lead.full_name);
  const email = boundedText(lead.email, 320).toLowerCase();
  const contactPhone = boundedText(lead.phone, 60);
  const city = boundedText(lead.suburb_town, 120);
  if (!EMAIL_PATTERN.test(email)) throw new Error('FITBOX_EMAIL_REQUIRED');
  if (!contactPhone) throw new Error('FITBOX_PHONE_REQUIRED');
  return Object.freeze({
    firstname,
    lastname,
    email,
    contact_phone: contactPhone,
    ...(city ? { city } : {}),
  });
}

export function fitboxIntegrationEnvironment(environment = {}) {
  const hookUrl = boundedText(environment.ZAPIER_FITBOX_REGISTER_HOOK_URL, 2_048);
  const appBaseUrl = boundedText(environment.APP_BASE_URL, 2_048).replace(/\/$/, '');
  const gymId = boundedText(environment.FITBOX_GYM_ID, 128);
  const validHttpsUrl = value => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password;
    } catch {
      return false;
    }
  };
  const missing = [];
  let hook;
  let app;
  try { hook = new URL(hookUrl); } catch { hook = null; }
  try { app = new URL(appBaseUrl); } catch { app = null; }
  if (!validHttpsUrl(hookUrl) || hook?.hostname !== 'hooks.zapier.com') missing.push('ZAPIER_FITBOX_REGISTER_HOOK_URL');
  if (!validHttpsUrl(appBaseUrl) || app?.pathname !== '/' || app.search || app.hash) missing.push('APP_BASE_URL');
  if (!FITBOX_ID_PATTERN.test(gymId)) missing.push('FITBOX_GYM_ID');
  return Object.freeze({ ready: missing.length === 0, missing, hookUrl, appBaseUrl, gymId });
}

export function fitboxGetUserEnvironment(environment = {}) {
  const hookUrl = boundedText(environment.ZAPIER_FITBOX_GET_USER_HOOK_URL, 2_048);
  const appBaseUrl = boundedText(environment.APP_BASE_URL, 2_048).replace(/\/$/, '');
  const gymId = boundedText(environment.FITBOX_GYM_ID, 128);
  let hook;
  let app;
  try { hook = new URL(hookUrl); } catch { hook = null; }
  try { app = new URL(appBaseUrl); } catch { app = null; }
  const missing = [];
  if (hook?.protocol !== 'https:' || hook.username || hook.password || hook.hostname !== 'hooks.zapier.com') {
    missing.push('ZAPIER_FITBOX_GET_USER_HOOK_URL');
  }
  if (app?.protocol !== 'https:' || app.username || app.password || app.pathname !== '/' || app.search || app.hash) {
    missing.push('APP_BASE_URL');
  }
  if (!FITBOX_ID_PATTERN.test(gymId)) missing.push('FITBOX_GYM_ID');
  return Object.freeze({ ready: missing.length === 0, missing, hookUrl, appBaseUrl, gymId });
}

export function fitboxProspectDispatchPayload({ jobId, callbackToken, lead, environment }) {
  if (!UUID_PATTERN.test(String(jobId || ''))) throw new Error('INVALID_FITBOX_JOB_ID');
  const token = boundedText(callbackToken, 256);
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(token)) throw new Error('INVALID_FITBOX_CALLBACK_TOKEN');
  const config = fitboxIntegrationEnvironment(environment);
  if (!config.ready) throw new Error('FITBOX_INTEGRATION_NOT_CONFIGURED');
  return Object.freeze({
    event_type: 'xert_fitbox_register_prospect',
    job_id: jobId,
    callback_url: `${config.appBaseUrl}/api/fitbox-prospect-result`,
    callback_token: token,
    fitbox_gym_id: config.gymId,
    ...prospectForFitbox(lead),
  });
}

export function fitboxGetUserDispatchPayload({ jobId, callbackToken, fitboxUserId, environment }) {
  if (!UUID_PATTERN.test(String(jobId || ''))) throw new Error('INVALID_FITBOX_JOB_ID');
  const token = boundedText(callbackToken, 256);
  const userId = boundedText(fitboxUserId, 128);
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(token)) throw new Error('INVALID_FITBOX_CALLBACK_TOKEN');
  if (!FITBOX_ID_PATTERN.test(userId)) throw new Error('INVALID_FITBOX_USER_ID');
  const config = fitboxGetUserEnvironment(environment);
  if (!config.ready) throw new Error('FITBOX_GET_USER_NOT_CONFIGURED');
  return Object.freeze({
    event_type: 'xert_fitbox_get_user',
    job_id: jobId,
    callback_url: `${config.appBaseUrl}/api/fitbox-prospect-result`,
    callback_token: token,
    fitbox_gym_id: config.gymId,
    fitbox_user_id: userId,
  });
}

export function normalizeFitboxCallback(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_FITBOX_CALLBACK');
  const jobId = boundedText(value.job_id, 64);
  const callbackToken = boundedText(value.callback_token, 256);
  const gymId = boundedText(value.fitbox_gym_id, 128);
  const userId = boundedText(value.fitbox_user_id, 128);
  const status = boundedText(value.fitbox_status, 80).toLowerCase();
  const failed = value.error === true || String(value.error || '').toLowerCase() === 'true';
  const message = boundedText(value.message, 500);
  if (!UUID_PATTERN.test(jobId) || !/^[A-Za-z0-9_-]{32,256}$/.test(callbackToken) || !FITBOX_ID_PATTERN.test(gymId)) {
    throw new Error('INVALID_FITBOX_CALLBACK');
  }
  if (!failed && !FITBOX_ID_PATTERN.test(userId)) throw new Error('INVALID_FITBOX_CALLBACK');
  const profileFirstName = boundedText(value.fitbox_first_name, 80);
  const profileLastName = boundedText(value.fitbox_last_name, 80);
  const profileEmail = boundedText(value.fitbox_email, 320).toLowerCase();
  const profilePhone = boundedText(value.fitbox_phone, 60);
  if (profileEmail && !EMAIL_PATTERN.test(profileEmail)) throw new Error('INVALID_FITBOX_CALLBACK');
  const profile = [profileFirstName, profileLastName, profileEmail, profilePhone].some(Boolean)
    ? Object.freeze({
      firstName: profileFirstName || null,
      lastName: profileLastName || null,
      email: profileEmail || null,
      phone: profilePhone || null,
    })
    : null;
  return Object.freeze({
    jobId,
    callbackToken,
    gymId,
    userId: userId || null,
    status: status || null,
    failed,
    message: message || null,
    ...(profile ? { profile } : {}),
  });
}

function optionalFitboxID(value) {
  const id = boundedText(value, 128);
  if (!id) return null;
  if (!FITBOX_ID_PATTERN.test(id)) throw new Error('INVALID_FITBOX_EVENT');
  return id;
}

function optionalIsoTimestamp(value) {
  const raw = boundedText(value, 64);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) throw new Error('INVALID_FITBOX_EVENT');
  return parsed.toISOString();
}

export function normalizeFitboxEvent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_FITBOX_EVENT');
  const eventType = boundedText(value.event_type, 80).toLowerCase();
  const gymId = optionalFitboxID(value.fitbox_gym_id);
  const userId = optionalFitboxID(value.fitbox_user_id);
  const bookingId = optionalFitboxID(value.fitbox_booking_id);
  const sessionId = optionalFitboxID(value.fitbox_session_id);
  const subscriptionId = optionalFitboxID(value.fitbox_subscription_id);
  const providerEventId = optionalFitboxID(value.provider_event_id);
  const deliveryId = optionalFitboxID(value.delivery_id);
  const status = boundedText(value.status, 80).toLowerCase() || null;
  if (!FITBOX_EVENT_TYPE_SET.has(eventType) || !gymId || ![userId, bookingId, sessionId, subscriptionId].some(Boolean)) {
    throw new Error('INVALID_FITBOX_EVENT');
  }
  return Object.freeze({
    eventType,
    gymId,
    userId,
    bookingId,
    sessionId,
    subscriptionId,
    providerEventId,
    deliveryId,
    status,
    providerOccurredAt: optionalIsoTimestamp(value.provider_occurred_at),
    providerUpdatedAt: optionalIsoTimestamp(value.provider_updated_at),
  });
}

export function fitboxEventEnvironment(environment = {}) {
  const secret = String(environment.FITBOX_ZAPIER_INGRESS_SECRET || '').trim();
  const gymId = boundedText(environment.FITBOX_GYM_ID, 128);
  const missing = [];
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(secret)) missing.push('FITBOX_ZAPIER_INGRESS_SECRET');
  if (!FITBOX_ID_PATTERN.test(gymId)) missing.push('FITBOX_GYM_ID');
  return Object.freeze({ ready: missing.length === 0, missing, secret, gymId });
}

export function publicFitboxJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    job_type: job.job_type || 'register_prospect',
    status: job.status,
    fitbox_user_id: job.fitbox_user_id || null,
    fitbox_status: job.fitbox_status || null,
    last_error_code: job.last_error_code || null,
    dispatched_at: job.dispatched_at || null,
    completed_at: job.completed_at || null,
    created_at: job.created_at,
  };
}
