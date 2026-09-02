// FitBox through the Zapier MCP gateway.
//
// Zapier exposes the FitBox connector as MCP tools. Unlike the catch-hook Zaps,
// an MCP call is synchronous: XERT asks, FitBox answers in the same request.
// Every function here is pure so the contract can be tested without a network.
// The verified provider contract (2 September 2026, gym "XERT Fitness"):
//
//   user (profile)      id, firstname, lastname, email, dob, gender, address1,
//                       address2, city, state, postcode, country, contact_phone,
//                       current_weight, height, status, anniversary_date,
//                       secondary_email, role, customFields
//   status changed      id, email, gymId, status, role, created_at, updated_at
//   subscription        id, product_id, product_name, customer_id, email, status,
//                       payment_gateway, price_in_cents, set_up_price_in_cents,
//                       discount_percentage, start_date, expiration_date,
//                       sessions_count, sessions_count_last_reset, created_at,
//                       updated_at
//   attendance          attendanceId, classId, className, eventId,
//                       sessionStartTime, status, userId, gymId
//
// XERT deliberately never stores DOB, gender, weight, height, street address,
// secondary email or custom fields from FitBox.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FITBOX_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export const FITBOX_SELECTED_API = 'FitboxCLIAPI';
export const ZAPIER_MCP_HOST = 'mcp.zapier.com';
export const ZAPIER_READ_TOOL = 'execute_zapier_read_action';
export const ZAPIER_WRITE_TOOL = 'execute_zapier_write_action';
export const ZAPIER_INSPECT_TOOL = 'inspect_zapier_actions';
export const ZAPIER_ENUM_TOOL = 'list_dynamic_enum_values';


/** Polling feeds: each maps to one FitBox trigger exposed as a read action. */
export const FITBOX_MCP_FEEDS = Object.freeze({
  users: Object.freeze({ action: 'user_profile_changed', tool: 'fitbox_user_profile_changed', label: 'Member profiles' }),
  statuses: Object.freeze({ action: 'user_status_changed', tool: 'fitbox_user_status_changed', label: 'Member statuses' }),
  subscriptions: Object.freeze({ action: 'user_subscription_changed', tool: 'fitbox_user_subscription_changed', label: 'Memberships' }),
  bookings: Object.freeze({ action: 'class_session_booked', tool: 'fitbox_class_session_booked', label: 'Class bookings' }),
  cancellations: Object.freeze({ action: 'class_session_cancelled', tool: 'fitbox_class_session_cancelled', label: 'Class cancellations' }),
  first_sessions: Object.freeze({ action: 'user_first_session_booked', tool: 'fitbox_user_first_session_booked', label: 'First sessions' }),
});
export const FITBOX_MCP_FEED_KEYS = Object.freeze(Object.keys(FITBOX_MCP_FEEDS));

/** Direct lookups and the one permitted write. Update User stays unavailable. */
export const FITBOX_MCP_ACTIONS = Object.freeze({
  get_user: Object.freeze({ action: 'get_user', tool: 'fitbox_get_user', kind: 'read' }),
  next_session: Object.freeze({ action: 'get_user_next_session', tool: 'fitbox_get_users_next_session', kind: 'read' }),
  register_user: Object.freeze({ action: 'register_user', tool: 'fitbox_register_user', kind: 'write' }),
});

/**
 * A Zapier MCP server is either "dynamic" (Claude-style execute tools that can
 * also run trigger feeds) or "static" (one tool per enabled action, no feeds).
 */
export function gatewayCapabilities(toolNames) {
  const names = new Set((Array.isArray(toolNames) ? toolNames : []).map(name => String(name || '')));
  const fitboxTools = [...names].filter(name => name.startsWith('fitbox_')).sort();
  const dynamic = names.has(ZAPIER_READ_TOOL) && names.has(ZAPIER_WRITE_TOOL);
  const mode = dynamic ? 'dynamic' : fitboxTools.length ? 'static' : 'empty';
  const has = tool => dynamic || names.has(tool);
  const feedTools = Object.values(FITBOX_MCP_FEEDS).map(feed => feed.tool);
  const feedsAvailable = dynamic || feedTools.some(tool => names.has(tool));
  return Object.freeze({
    mode,
    tools: fitboxTools,
    feeds_available: feedsAvailable,
    feeds: Object.freeze(Object.fromEntries(Object.entries(FITBOX_MCP_FEEDS).map(([key, feed]) => [key, has(feed.tool)]))),
    classes_available: dynamic || (names.has(ZAPIER_ENUM_TOOL) && names.has(FITBOX_MCP_FEEDS.bookings.tool)),
    actions: Object.freeze({
      get_user: has(FITBOX_MCP_ACTIONS.get_user.tool),
      next_session: has(FITBOX_MCP_ACTIONS.next_session.tool),
      register_user: has(FITBOX_MCP_ACTIONS.register_user.tool),
    }),
  });
}

function boundedText(value, maxLength) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function optionalId(value) {
  const id = boundedText(value, 128);
  if (!id) return null;
  if (!FITBOX_ID_PATTERN.test(id)) throw new Error('INVALID_FITBOX_RECORD');
  return id;
}

function optionalTimestamp(value) {
  const raw = boundedText(value, 64);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function optionalDate(value) {
  const iso = optionalTimestamp(value);
  return iso ? iso.slice(0, 10) : null;
}

function optionalInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) && Math.abs(number) <= 2_147_483_647 ? number : null;
}

function optionalEmail(value) {
  const email = boundedText(value, 320).toLowerCase();
  return EMAIL_PATTERN.test(email) ? email : null;
}

function lowerStatus(value) {
  return boundedText(value, 80).toLowerCase() || null;
}

export function fitboxMcpEnvironment(environment = {}) {
  const rawUrl = boundedText(environment.ZAPIER_MCP_URL, 2_048);
  const token = boundedText(environment.ZAPIER_MCP_TOKEN, 512);
  const gymId = boundedText(environment.FITBOX_GYM_ID, 128);
  const missing = [];
  let url = null;
  try {
    const parsed = new URL(rawUrl);
    const validPath = parsed.pathname.startsWith('/api/mcp/');
    if (parsed.protocol === 'https:' && parsed.hostname === ZAPIER_MCP_HOST && validPath && !parsed.username && !parsed.password) {
      url = parsed.toString();
    }
  } catch {
    url = null;
  }
  if (!url) missing.push('ZAPIER_MCP_URL');
  if (token && !/^[A-Za-z0-9_.=-]{16,512}$/.test(token)) missing.push('ZAPIER_MCP_TOKEN');
  if (!FITBOX_ID_PATTERN.test(gymId)) missing.push('FITBOX_GYM_ID');
  return Object.freeze({ ready: missing.length === 0, missing, url, token: token || null, gymId });
}

export function mcpRequest({ id, method, params = {} }) {
  const requestId = boundedText(id, 128);
  const methodName = boundedText(method, 64);
  if (!requestId || !/^[a-z]+(?:\/[a-z_]+)?$/.test(methodName)) throw new Error('INVALID_MCP_REQUEST');
  return Object.freeze({ jsonrpc: '2.0', id: requestId, method: methodName, params });
}

export function mcpToolCallRequest({ id, tool, arguments: toolArguments }) {
  const name = boundedText(tool, 128);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(name)) throw new Error('INVALID_MCP_TOOL');
  return mcpRequest({ id, method: 'tools/call', params: { name, arguments: toolArguments || {} } });
}

/** Arguments for Zapier's dynamic execute tools, scoped to the XERT gym. */
export function fitboxActionArguments({ action, tool, params = {}, gymId }) {
  const key = boundedText(action, 80);
  const toolName = boundedText(tool, 128);
  const gym = boundedText(gymId, 128);
  if (!/^[a-z_]{1,80}$/.test(key) || !/^[a-z0-9_]{1,128}$/.test(toolName) || !FITBOX_ID_PATTERN.test(gym)) {
    throw new Error('INVALID_FITBOX_ACTION');
  }
  return Object.freeze({
    selected_api: FITBOX_SELECTED_API,
    action: key,
    tool_name: toolName,
    params: { ...params, gym_id: gym },
  });
}

/**
 * Zapier answers MCP over plain JSON or server-sent events. Return the JSON-RPC
 * message whose id matches; the last matching `data:` line wins for SSE.
 */
export function parseMcpResponseText(text, expectedId) {
  const body = String(text || '').trim();
  if (!body) throw new Error('EMPTY_MCP_RESPONSE');
  const wanted = expectedId === undefined ? null : String(expectedId);
  const candidates = [];
  if (body.startsWith('{') || body.startsWith('[')) {
    const parsed = JSON.parse(body);
    (Array.isArray(parsed) ? parsed : [parsed]).forEach(message => candidates.push(message));
  } else {
    for (const line of body.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        candidates.push(JSON.parse(payload));
      } catch {
        // Keep scanning; a keepalive or partial frame is not the answer.
      }
    }
  }
  const matching = candidates.filter(message => message && typeof message === 'object' && (wanted === null || String(message.id) === wanted));
  const message = matching[matching.length - 1];
  if (!message) throw new Error('MCP_RESPONSE_MISSING');
  if (message.error) {
    const detail = boundedText(message.error.message, 200) || 'MCP_ERROR';
    throw new Error(`MCP_ERROR: ${detail}`);
  }
  return message.result;
}

/** Zapier wraps action output as text content carrying JSON. */
export function extractToolPayload(result) {
  if (!result || typeof result !== 'object') throw new Error('MCP_RESULT_INVALID');
  if (result.structuredContent && typeof result.structuredContent === 'object') return result.structuredContent;
  const parts = Array.isArray(result.content) ? result.content : [];
  const text = parts.filter(part => part?.type === 'text' && typeof part.text === 'string').map(part => part.text).join('\n').trim();
  if (result.isError) throw new Error(`FITBOX_ACTION_FAILED: ${boundedText(text, 200) || 'unknown'}`);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('MCP_RESULT_NOT_JSON');
  }
}

/** Results may arrive as {results:[...]}, a bare array, or a single record. */
export function toolResultRows(payload) {
  if (Array.isArray(payload)) return payload.filter(row => row && typeof row === 'object');
  if (payload && typeof payload === 'object') {
    if (Array.isArray(payload.results)) return payload.results.filter(row => row && typeof row === 'object');
    if (payload.result && typeof payload.result === 'object') return toolResultRows(payload.result);
    if (payload.id !== undefined || payload.attendanceId !== undefined) return [payload];
  }
  return [];
}

export function normalizeFitboxUser(raw, gymId) {
  const fitboxUserId = optionalId(raw?.id ?? raw?.userId);
  if (!fitboxUserId) throw new Error('INVALID_FITBOX_RECORD');
  return Object.freeze({
    fitbox_gym_id: boundedText(gymId, 128),
    fitbox_user_id: fitboxUserId,
    first_name: boundedText(raw.firstname ?? raw.first_name, 80) || null,
    last_name: boundedText(raw.lastname ?? raw.last_name, 80) || null,
    email: optionalEmail(raw.email),
    phone: boundedText(raw.contact_phone ?? raw.phone, 60) || null,
    city: boundedText(raw.city, 120) || null,
    state: boundedText(raw.state, 120) || null,
    postcode: boundedText(raw.postcode, 20) || null,
    country: boundedText(raw.country, 8) || null,
    status: lowerStatus(raw.status),
    role: lowerStatus(raw.role),
    anniversary_date: optionalDate(raw.anniversary_date),
  });
}

export function normalizeFitboxStatus(raw, gymId) {
  const fitboxUserId = optionalId(raw?.id ?? raw?.userId);
  if (!fitboxUserId) throw new Error('INVALID_FITBOX_RECORD');
  const rowGym = boundedText(raw.gymId ?? raw.gym_id, 128);
  if (rowGym && rowGym !== boundedText(gymId, 128)) throw new Error('FITBOX_GYM_MISMATCH');
  return Object.freeze({
    fitbox_gym_id: boundedText(gymId, 128),
    fitbox_user_id: fitboxUserId,
    email: optionalEmail(raw.email),
    status: lowerStatus(raw.status),
    role: lowerStatus(raw.role),
    provider_created_at: optionalTimestamp(raw.created_at),
    provider_updated_at: optionalTimestamp(raw.updated_at),
  });
}

export function normalizeFitboxSubscription(raw, gymId) {
  const fitboxSubscriptionId = optionalId(raw?.id);
  const fitboxUserId = optionalId(raw?.customer_id ?? raw?.userId ?? raw?.user_id);
  if (!fitboxSubscriptionId || !fitboxUserId) throw new Error('INVALID_FITBOX_RECORD');
  return Object.freeze({
    fitbox_gym_id: boundedText(gymId, 128),
    fitbox_subscription_id: fitboxSubscriptionId,
    fitbox_user_id: fitboxUserId,
    email: optionalEmail(raw.email),
    product_id: optionalId(raw.product_id),
    product_name: boundedText(raw.product_name, 160) || null,
    status: lowerStatus(raw.status),
    payment_gateway: lowerStatus(raw.payment_gateway),
    price_in_cents: optionalInteger(raw.price_in_cents),
    setup_price_in_cents: optionalInteger(raw.set_up_price_in_cents ?? raw.setup_price_in_cents),
    discount_percentage: optionalInteger(raw.discount_percentage),
    start_date: optionalDate(raw.start_date),
    expiration_date: optionalDate(raw.expiration_date),
    sessions_count: optionalInteger(raw.sessions_count),
    sessions_count_last_reset: optionalDate(raw.sessions_count_last_reset),
    provider_created_at: optionalTimestamp(raw.created_at),
    provider_updated_at: optionalTimestamp(raw.updated_at),
  });
}

export const FITBOX_ATTENDANCE_FEEDS = Object.freeze(['booked', 'cancelled', 'first_session', 'next_session']);

export function normalizeFitboxAttendance(raw, gymId, feed) {
  const fitboxAttendanceId = optionalId(raw?.attendanceId ?? raw?.attendance_id ?? raw?.id);
  const fitboxUserId = optionalId(raw?.userId ?? raw?.user_id);
  if (!fitboxAttendanceId || !fitboxUserId || !FITBOX_ATTENDANCE_FEEDS.includes(feed)) throw new Error('INVALID_FITBOX_RECORD');
  const rowGym = boundedText(raw.gymId ?? raw.gym_id, 128);
  if (rowGym && rowGym !== boundedText(gymId, 128)) throw new Error('FITBOX_GYM_MISMATCH');
  return Object.freeze({
    fitbox_gym_id: boundedText(gymId, 128),
    fitbox_attendance_id: fitboxAttendanceId,
    fitbox_event_id: optionalId(raw.eventId ?? raw.event_id),
    fitbox_class_id: optionalId(raw.classId ?? raw.class_id),
    class_name: boundedText(raw.className ?? raw.class_name, 160) || null,
    fitbox_user_id: fitboxUserId,
    session_start_time: optionalTimestamp(raw.sessionStartTime ?? raw.session_start_time),
    status: lowerStatus(raw.status),
    feed,
  });
}

const FEED_NORMALIZERS = Object.freeze({
  users: (row, gymId) => normalizeFitboxUser(row, gymId),
  statuses: (row, gymId) => normalizeFitboxStatus(row, gymId),
  subscriptions: (row, gymId) => normalizeFitboxSubscription(row, gymId),
  bookings: (row, gymId) => normalizeFitboxAttendance(row, gymId, 'booked'),
  // FitBox's cancellation poll returns recent bookings as samples when nothing
  // has been cancelled, so only a row that says it was cancelled counts.
  cancellations: (row, gymId) => {
    const attendance = normalizeFitboxAttendance(row, gymId, 'cancelled');
    if (attendance.status === 'booked' || attendance.status === null) throw new Error('NOT_A_CANCELLATION');
    return attendance;
  },
  first_sessions: (row, gymId) => normalizeFitboxAttendance(row, gymId, 'first_session'),
});

/** Normalize a whole feed; malformed rows are counted, never stored. */
export function normalizeFitboxFeed(feedKey, rows, gymId) {
  const normalize = FEED_NORMALIZERS[feedKey];
  if (!normalize) throw new Error('INVALID_FITBOX_FEED');
  const accepted = [];
  let rejected = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    try {
      accepted.push(normalize(row, gymId));
    } catch {
      rejected += 1;
    }
  }
  return Object.freeze({ feed: feedKey, accepted, rejected });
}

export function normalizeFitboxClasses(enumValues) {
  const classes = [];
  for (const entry of Array.isArray(enumValues) ? enumValues : []) {
    const id = boundedText(entry?.value, 128);
    const name = boundedText(entry?.label, 160);
    if (FITBOX_ID_PATTERN.test(id) && name) classes.push(Object.freeze({ fitbox_class_id: id, name }));
  }
  return classes;
}

/**
 * Link XERT member profiles to FitBox users only on a unique, exact email
 * match on both sides. Names are never used; ambiguity leaves both unlinked.
 */
export function matchProfilesToFitboxUsers(fitboxUsers, profiles) {
  const byEmail = new Map();
  for (const user of Array.isArray(fitboxUsers) ? fitboxUsers : []) {
    const email = optionalEmail(user?.email);
    const id = boundedText(user?.fitbox_user_id ?? user?.id, 128);
    if (!email || !FITBOX_ID_PATTERN.test(id)) continue;
    byEmail.set(email, byEmail.has(email) ? null : id);
  }
  const profileEmails = new Map();
  for (const profile of Array.isArray(profiles) ? profiles : []) {
    const email = optionalEmail(profile?.email);
    const id = boundedText(profile?.id, 64);
    if (!email || !UUID_PATTERN.test(id)) continue;
    profileEmails.set(email, profileEmails.has(email) ? null : id);
  }
  const links = [];
  for (const [email, profileId] of profileEmails) {
    const fitboxUserId = byEmail.get(email);
    if (!profileId || !fitboxUserId) continue;
    links.push(Object.freeze({ profile_id: profileId, fitbox_user_id: fitboxUserId, email }));
  }
  return links;
}

/** The bounded prospect payload for Register User; FitBox needs mobile + email. */
export function fitboxRegisterArguments(lead) {
  if (!lead || typeof lead !== 'object') throw new Error('INVALID_FITBOX_PROSPECT');
  const fullName = boundedText(lead.full_name, 160);
  const parts = fullName.split(' ').filter(Boolean);
  if (parts.length < 2) throw new Error('FITBOX_FULL_NAME_REQUIRED');
  const email = optionalEmail(lead.email);
  const phone = boundedText(lead.phone, 60);
  if (!email) throw new Error('FITBOX_EMAIL_REQUIRED');
  if (!phone) throw new Error('FITBOX_PHONE_REQUIRED');
  const city = boundedText(lead.suburb_town, 120);
  return Object.freeze({
    firstname: parts.shift().slice(0, 80),
    lastname: parts.join(' ').slice(0, 80),
    email,
    contact_phone: phone,
    ...(city ? { city } : {}),
  });
}

export function summarizeFitboxMirror({ users = [], subscriptions = [], attendance = [], now = new Date() } = {}) {
  const nowMs = now.getTime();
  const count = (rows, predicate) => rows.filter(predicate).length;
  return Object.freeze({
    users: {
      total: users.length,
      active: count(users, user => user.status === 'active' && user.role !== 'staff'),
      prospects: count(users, user => user.status === 'prospect'),
      staff: count(users, user => user.role === 'staff'),
    },
    subscriptions: {
      total: subscriptions.length,
      active: count(subscriptions, row => row.status === 'active'),
      paid_active: count(subscriptions, row => row.status === 'active' && Number(row.price_in_cents || 0) > 0),
    },
    attendance: {
      upcoming: count(attendance, row => row.status === 'booked' && row.session_start_time && Date.parse(row.session_start_time) >= nowMs),
      cancelled: count(attendance, row => row.status === 'cancelled'),
    },
  });
}
