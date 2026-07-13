import { supabase } from './supabase';
import { XERT_2026_EVENTS, sortEvents } from './eventCalendar';

// ─── Products (session packs) ─────────────────────────────────────────────────

export async function getProducts() {
  const { data, error } = await supabase.from('products').select('*').eq('active', true).order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
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

  const res = await fetch('/api/checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`
    },
    body: JSON.stringify({ product_slug: productSlug })
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Could not start checkout. Please try again.');
  }
  const { url } = await res.json();
  if (!url) throw new Error('Checkout session did not return a URL.');
  window.location.href = url;
}

// ─── Credits ──────────────────────────────────────────────────────────────────

export async function getMyCredits() {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase.from('credit_batches').select('*').gt('remaining', 0).or(`expires_at.is.null,expires_at.gt.${nowIso}`).order('expires_at', { ascending: true });
  if (error) throw new Error(error.message);
  const batches = data || [];
  const total = batches.reduce((sum, b) => sum + (b.remaining || 0), 0);
  return { total, batches };
}

export async function getMyOrders() {
  const { data, error } = await supabase.from('orders').select('*, products(name)').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getMemberAnnouncements() {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('member_announcements')
    .select('id,title,body,tone,published_at,expires_at,updated_at')
    .lte('published_at', nowIso)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order('published_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

// ─── Sessions & bookings ──────────────────────────────────────────────────────

export async function getAvailableSessions() {
  const { data, error } = await supabase.rpc('sessions_with_availability');
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getMyBookings() {
  const { data, error } = await supabase.rpc('my_bookings');
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getMyPrivateSessionRequests() {
  const userId = await requireCurrentUserId();
  const { data, error } = await supabase
    .from('private_session_requests')
    .select('id,status,requested_session_type,preferred_day,preferred_time,training_goal,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

const BOOKING_ERRORS = {
  AUTH_REQUIRED: 'Please sign in to book a class.',
  SESSION_NOT_FOUND: 'That class could not be found.',
  SESSION_NOT_BOOKABLE: 'That class is not open for booking yet.',
  SESSION_IN_PAST: 'That class has already started.',
  ALREADY_BOOKED: "You've already booked this class.",
  SESSION_FULL: 'Sorry, this class is now full.',
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

export async function getMyProfile() {
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return data;
}

export async function updateMyProfile(updates) {
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');
  const { error } = await supabase
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', user.id);
  if (error) throw new Error(error.message);
}

// ─── Public content: coaches & events ─────────────────────────────────────────

export async function getCoaches() {
  const { data, error } = await supabase.from('coaches').select('*').eq('published', true).order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getEvents() {
  const { data, error } = await supabase.from('events').select('*').eq('published', true).order('event_date', { ascending: true });
  if (error) return XERT_2026_EVENTS;
  return data?.length ? sortEvents(data) : XERT_2026_EVENTS;
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
  const { data, error } = await supabase.from('member_event_goals').select('event_id, created_at, events(id, name, category, event_date, end_date, location, region, url, published, sort_order)').eq('user_id', userId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
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
