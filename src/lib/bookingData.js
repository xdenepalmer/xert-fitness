import { supabase } from './supabase';
import { XERT_2026_EVENTS, sortEvents } from './eventCalendar';
import { clearCheckoutAttemptID, getOrCreateCheckoutAttemptID } from './checkoutAttempt';
import { sessionPackPaymentsEnabled } from './launchSettings';
import { savePendingWebCheckout } from './webCheckoutRecovery';
import { apiErrorMessage } from './apiError';
import { collectAdminBatches } from './adminPagination';

// ─── Products (session packs) ─────────────────────────────────────────────────

export async function getProducts() {
  const { data, error } = await supabase.from('products').select('*').eq('active', true).order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getSessionPackPaymentAvailability() {
  const { data, error } = await supabase
    .from('admin_settings')
    .select('payments_enabled')
    .limit(2);
  if (error) throw new Error(error.message);
  return data?.length === 1 && sessionPackPaymentsEnabled(data[0]);
}

// ─── Checkout (Stripe via Vercel serverless) ──────────────────────────────────

/**
 * Starts a Stripe Checkout session for a pack and redirects the browser to it.
 * Requires the member to be signed in (we pass their access token so the
 * serverless function can attribute the order + credits to their account).
 */
export async function startCheckout(productSlug) {
  const {
    data: { session }
  } = await supabase.auth.getSession();
  if (!session) throw new Error('Please sign in before purchasing a pack.');

  const checkoutAttemptID = getOrCreateCheckoutAttemptID(productSlug);
  const res = await fetch('/api/checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`
    },
    body: JSON.stringify({
      product_slug: productSlug,
      checkout_attempt_id: checkoutAttemptID
    })
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // A poisoned Stripe idempotency key (expired session replay) cannot recover
    // until the client mints a new attempt id.
    if (body?.code === 'CHECKOUT_ATTEMPT_STALE') {
      clearCheckoutAttemptID(productSlug);
    }
    throw new Error(apiErrorMessage(body, 'Could not start checkout. Please try again.'));
  }
  const { url, checkout_session_id: checkoutSessionID } = await res.json();
  if (!url || !checkoutSessionID) throw new Error('Checkout session did not return a complete handoff.');
  savePendingWebCheckout({ userID: session.user.id, checkoutSessionID });
  clearCheckoutAttemptID(productSlug);
  window.location.href = url;
}

// ─── Credits ──────────────────────────────────────────────────────────────────

// Both policies are `user_id = auth.uid() or is_admin()`, which the planner
// compiles to a filter it cannot drive an index from. Naming the member
// explicitly is what lets these use their user_id index instead of scanning
// every row in the table.
async function currentUserID() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || null;
}

export async function getMyCredits() {
  const userID = await currentUserID();
  if (!userID) return { total: 0, batches: [] };
  const nowIso = new Date().toISOString();
  // Page past PostgREST max_rows — a truncated active-pack list silently
  // undercounts bookable credits on Account (iOS credits paging parity).
  const batches = await collectAdminBatches(async (page, pageSize) => {
    const from = (page - 1) * pageSize;
    const { data, error } = await supabase
      .from('credit_batches')
      .select('*')
      .eq('user_id', userID)
      .gt('remaining', 0)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order('expires_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    return data || [];
  });
  const total = batches.reduce((sum, b) => sum + (b.remaining || 0), 0);
  return { total, batches };
}

export async function getMyOrders() {
  const userID = await currentUserID();
  if (!userID) return [];
  // Page past PostgREST max_rows / the old hard 200 cut — a truncated list
  // silently hides paid / refunded packs from Account (iOS orders paging parity).
  return collectAdminBatches(async (page, pageSize) => {
    const from = (page - 1) * pageSize;
    const { data, error } = await supabase
      .from('orders')
      .select('*, products(name)')
      .eq('user_id', userID)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    return data || [];
  });
}

export async function getMemberAnnouncements() {
  // Page past PostgREST max_rows — a truncated notice inbox silently hid later
  // class-cancel / booking-decision private notices from Account (iOS parity).
  return collectAdminBatches(async (page, pageSize) => {
    const from = (page - 1) * pageSize;
    const { data, error } = await supabase
      .rpc('my_member_announcements')
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    return data || [];
  });
}

export async function dismissMemberAnnouncement(announcementId) {
  const { error } = await supabase.rpc('dismiss_member_announcement', {
    p_announcement_id: announcementId,
  });
  if (error) throw new Error(error.message);
}

// ─── Sessions & bookings ──────────────────────────────────────────────────────

export async function getAvailableSessions() {
  // Page past PostgREST max_rows — a truncated RPC result silently hid later
  // bookable classes from /booking and Overview (iOS sessions() parity).
  return collectAdminBatches(async (page, pageSize) => {
    const from = (page - 1) * pageSize;
    const { data, error } = await supabase
      .rpc('sessions_with_availability')
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    return data || [];
  });
}

export async function getMyBookings() {
  // Page past PostgREST max_rows — a truncated Account booking list silently
  // hid later places (incl. cancelable credit holds) from web + iPhone.
  return collectAdminBatches(async (page, pageSize) => {
    const from = (page - 1) * pageSize;
    const { data, error } = await supabase
      .rpc('my_bookings')
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    return data || [];
  });
}

export async function getMyPrivateSessionRequests() {
  const userId = await requireCurrentUserId();
  // Page past PostgREST max_rows — a truncated PT history silently hides later
  // requests from Account (iOS privateSessionRequests paging parity).
  return collectAdminBatches(async (page, pageSize) => {
    const from = (page - 1) * pageSize;
    const { data, error } = await supabase
      .from('private_session_requests')
      .select('id,status,requested_session_type,preferred_day,preferred_time,training_goal,created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    return data || [];
  });
}

const BOOKING_ERRORS = {
  AUTH_REQUIRED: 'Please sign in to book a class.',
  SESSION_NOT_FOUND: 'That class could not be found.',
  SESSION_NOT_BOOKABLE: 'That class is not open for booking yet.',
  SESSION_IN_PAST: 'That class has already started.',
  ALREADY_BOOKED: "You've already booked this class.",
  BOOKING_TIME_CONFLICT: 'That class overlaps another active booking in your schedule.',
  SESSION_FULL: 'Sorry, this class is now full.',
  BOOKINGS_PAUSED: 'Online class bookings are currently paused. You can still register interest and XERT will follow up.',
  MEMBER_ONBOARDING_REQUIRED: 'Complete Member Readiness on your account before booking or joining a waitlist.',
  SESSION_INTEREST_ONLY: 'This class is collecting interest only. Please register your interest instead.',
  SESSION_HAS_CAPACITY: 'A place is available now. Book the class instead of joining its waitlist.',
  WAITLIST_PRIORITY: 'Members already on the waitlist have first claim on this place. Join the queue instead.',
  NO_CREDITS: 'You have no available class credits. Purchase a pack to book.',
  BOOKING_NOT_FOUND: 'That booking could not be found. Refresh your account and try again.',
  NOT_CANCELLABLE: 'That booking can no longer be cancelled.'
};

function friendlyBookingError(message) {
  for (const code of Object.keys(BOOKING_ERRORS)) {
    if (message?.includes(code)) return BOOKING_ERRORS[code];
  }
  return message || 'Could not complete the booking.';
}

export async function bookSession(sessionId) {
  const { data, error } = await supabase.rpc('book_session', {
    p_session_id: sessionId
  });
  if (error) throw new Error(friendlyBookingError(error.message));
  return data; // booking id
}

export async function joinSessionWaitlist(sessionId) {
  const { data, error } = await supabase.rpc('join_session_waitlist', {
    p_session_id: sessionId
  });
  if (error) throw new Error(friendlyBookingError(error.message));
  return data;
}

export async function cancelBooking(bookingId) {
  const { error } = await supabase.rpc('cancel_booking', {
    p_booking_id: bookingId
  });
  if (error) throw new Error(friendlyBookingError(error.message));
}

// ─── Profile / role ───────────────────────────────────────────────────────────

export async function updateMyProfile(updates = {}) {
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');
  // Email and role are auth/admin managed — never accept them from the client body.
  const payload = { updated_at: new Date().toISOString() };
  if ('full_name' in updates) payload.full_name = updates.full_name;
  if ('phone' in updates) payload.phone = updates.phone;
  const { error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('id', user.id);
  if (error) throw new Error(error.message);
}

const MEMBER_ONBOARDING_ERRORS = {
  AUTH_REQUIRED: 'Please sign in to update member readiness.',
  MEMBER_PROFILE_NOT_FOUND: 'Your member profile is unavailable. Sign out, sign back in, and try again.',
  INVALID_FULL_NAME: 'Enter your full name.',
  INVALID_MEMBER_PHONE: 'Enter a valid mobile number.',
  INVALID_EMERGENCY_CONTACT_NAME: 'Enter your emergency contact’s name.',
  INVALID_EMERGENCY_CONTACT_PHONE: 'Enter a valid phone number for your emergency contact.',
  INVALID_EMERGENCY_CONTACT_RELATIONSHIP: 'Enter how your emergency contact is connected to you.',
  CONTACT_AWARENESS_REQUIRED: 'Confirm that your emergency contact knows they are listed.',
  INVALID_ONBOARDING_SOURCE: 'Member readiness could not verify this app. Refresh and try again.',
  ONBOARDING_DOCUMENTS_REQUIRED: 'Review and acknowledge every current readiness document.',
  ONBOARDING_DOCUMENTS_STALE: 'A readiness document changed while you were reviewing it. Reload and review the latest version.',
};

export function memberOnboardingError(message) {
  for (const [code, friendlyMessage] of Object.entries(MEMBER_ONBOARDING_ERRORS)) {
    if (message?.includes(code)) return friendlyMessage;
  }
  return message || 'Member readiness is unavailable. Try again.';
}

function assertMemberOnboardingResponse(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)
      || !Array.isArray(data.required_documents)
      || !Array.isArray(data.accepted_documents)) {
    throw new Error('Member readiness returned an incomplete response. Refresh and try again.');
  }
  return data;
}

export async function getMyMemberOnboarding() {
  const { data, error } = await supabase.rpc('my_member_onboarding');
  if (error) throw new Error(memberOnboardingError(error.message));
  return assertMemberOnboardingResponse(data);
}

export async function saveMyMemberOnboarding({
  fullName,
  phone,
  emergencyContactName,
  emergencyContactPhone,
  emergencyContactRelationship,
  contactIsAware,
  acceptedDocumentIds,
}) {
  const { data, error } = await supabase.rpc('save_my_member_onboarding', {
    p_full_name: String(fullName || '').trim(),
    p_phone: String(phone || '').trim(),
    p_emergency_contact_name: String(emergencyContactName || '').trim(),
    p_emergency_contact_phone: String(emergencyContactPhone || '').trim(),
    p_emergency_contact_relationship: String(emergencyContactRelationship || '').trim(),
    p_contact_is_aware: contactIsAware === true,
    p_accepted_document_ids: Array.isArray(acceptedDocumentIds) ? acceptedDocumentIds : [],
    p_source: 'web_app',
  });
  if (error) throw new Error(memberOnboardingError(error.message));
  return assertMemberOnboardingResponse(data);
}

// ─── Public content: coaches & events ─────────────────────────────────────────

export async function getCoaches() {
  const { data, error } = await supabase.from('coaches').select('*').eq('published', true).order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getEvents() {
  // Page past PostgREST max_rows — a truncated public catalogue silently hid
  // later published events from Events / train-for (admin getAllEvents parity).
  // Fail closed on fetch errors — returning the seed calendar over an outage
  // hid the failure and let members train-for events that are not in the DB.
  const data = await collectAdminBatches(async (page, pageSize) => {
    const from = (page - 1) * pageSize;
    const { data: rows, error } = await supabase
      .from('events')
      .select('*')
      .eq('published', true)
      .order('event_date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    return rows || [];
  });
  return data.length ? sortEvents(data) : XERT_2026_EVENTS;
}

async function requireCurrentUserId() {
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Please sign in to manage your training goals.');
  return user.id;
}

// ─── Member event goals ──────────────────────────────────────────────────────

export async function getMyEventGoals() {
  const userId = await requireCurrentUserId();
  // Page past PostgREST max_rows — a truncated goals list silently hid later
  // train-for selections from Account / Events (iOS eventGoals parity).
  return collectAdminBatches(async (page, pageSize) => {
    const from = (page - 1) * pageSize;
    const { data, error } = await supabase
      .from('member_event_goals')
      .select('event_id, created_at, events(id, name, category, event_date, end_date, location, region, url, published, sort_order)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .order('event_id', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    return data || [];
  });
}

export async function addMyEventGoal(eventId) {
  const userId = await requireCurrentUserId();
  const { error } = await supabase.from('member_event_goals').upsert({ user_id: userId, event_id: eventId }, { onConflict: 'user_id,event_id', ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}

export async function removeMyEventGoal(eventId) {
  const userId = await requireCurrentUserId();
  const { error } = await supabase.from('member_event_goals').delete().eq('user_id', userId).eq('event_id', eventId);
  if (error) throw new Error(error.message);
}
