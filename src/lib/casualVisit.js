// ─── Casual visit door payments ─────────────────────────────────────────────
// A walk-in pays for one visit on their own phone. Nobody at the club ever
// handles their card: the visitor types their own details, and Stripe collects
// the payment. This is a door fee, not a session pack, so it deliberately has
// nothing to do with accounts, credits or the fulfilment ledger.

export const CASUAL_VISIT_ACTION = 'casual_visit';
export const CASUAL_VISIT_METADATA_FLAG = 'xert_casual_visit';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

/** Australian mobiles and landlines, kept readable rather than reformatted. */
export function normalizeVisitorPhone(value) {
  const digits = clean(value).replace(/[^\d+]/g, '');
  if (!digits) return '';
  const bare = digits.startsWith('+') ? digits.slice(1) : digits;
  if (/^61\d{9}$/.test(bare)) return `+${bare}`;
  if (/^0\d{9}$/.test(bare)) return `+61${bare.slice(1)}`;
  return /^\+?\d{6,15}$/.test(digits) ? digits : '';
}

/**
 * Everything the checkout needs from the visitor, or a message saying what is
 * missing. Validated in the browser and again on the server: the browser copy
 * is a courtesy, the server copy is the rule.
 */
export function normalizeCasualVisitor(input = {}) {
  const firstName = clean(input.first_name ?? input.firstName);
  const lastName = clean(input.last_name ?? input.lastName);
  const email = clean(input.email).toLowerCase();
  const phone = normalizeVisitorPhone(input.phone);
  if (!firstName) throw new Error('Enter your first name.');
  if (!lastName) throw new Error('Enter your last name.');
  if (`${firstName} ${lastName}`.length > 120) throw new Error('That name is too long for our records.');
  if (!EMAIL_PATTERN.test(email) || email.length > 320) {
    throw new Error('Enter a complete email address, including the part after the dot.');
  }
  if (!clean(input.phone)) throw new Error('Enter a phone number so we can reach you.');
  if (!phone) throw new Error('Enter a valid phone number, for example 0400 000 000.');
  return { fullName: `${firstName} ${lastName}`, firstName, lastName, email, phone };
}

/** The message a form can show before anything is sent, or null when ready. */
export function casualVisitValidationError(input) {
  try {
    normalizeCasualVisitor(input);
    return null;
  } catch (error) {
    return error.message;
  }
}

export function formatCasualVisitPrice(cents, currency = 'aud') {
  const amount = Number(cents);
  if (!Number.isFinite(amount)) return '';
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: String(currency || 'aud').toUpperCase(),
  }).format(amount / 100);
}

export function normalizeCasualVisitPriceCents(value, fallback = 1560) {
  const cents = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(cents) && cents >= 100 && cents <= 100000 ? cents : fallback;
}

/**
 * The Stripe Checkout Session for one casual visit. The amount comes from the
 * database, never from the browser, and the visitor's own details are carried
 * in so they never retype them at the card screen.
 */
export function casualVisitCheckoutParameters({ visitor, priceCents, currency = 'aud', returnURLs, now = Date.now() }) {
  const amount = normalizeCasualVisitPriceCents(priceCents, NaN);
  if (!Number.isInteger(amount)) throw new Error('The casual visit price is not set correctly.');
  for (const value of [returnURLs?.success, returnURLs?.cancel]) {
    let url;
    try {
      url = new URL(value || '');
    } catch {
      throw new Error('Checkout return URL is invalid.');
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error('Checkout return URL must use HTTP or HTTPS.');
    }
  }
  const milliseconds = Number(now);
  if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new Error('Checkout session time is invalid.');
  return {
    mode: 'payment',
    customer_creation: 'if_required',
    billing_address_collection: 'auto',
    customer_email: visitor.email,
    success_url: returnURLs.success,
    cancel_url: returnURLs.cancel,
    expires_at: Math.floor(milliseconds / 1000) + 35 * 60,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: String(currency || 'aud').toLowerCase(),
        unit_amount: amount,
        product_data: {
          name: 'XERT Fitness casual visit',
          description: 'Entry and one class for a single visit.',
        },
      },
    }],
    payment_intent_data: {
      description: `Casual visit — ${visitor.fullName}`,
      receipt_email: visitor.email,
      metadata: {
        [CASUAL_VISIT_METADATA_FLAG]: 'true',
        casual_visit_name: visitor.fullName,
        casual_visit_phone: visitor.phone,
      },
    },
    metadata: {
      [CASUAL_VISIT_METADATA_FLAG]: 'true',
      casual_visit_name: visitor.fullName,
      casual_visit_email: visitor.email,
      casual_visit_phone: visitor.phone,
    },
  };
}

/** The paid visit to record, or null when a session is not a paid casual visit. */
export function casualVisitPaymentFromCheckout(checkout) {
  const metadata = checkout?.metadata || {};
  if (String(metadata[CASUAL_VISIT_METADATA_FLAG] || '') !== 'true') return null;
  if (String(checkout?.payment_status || '') !== 'paid') return null;
  const email = clean(checkout?.customer_details?.email || checkout?.customer_email || metadata.casual_visit_email).toLowerCase();
  const fullName = clean(metadata.casual_visit_name || checkout?.customer_details?.name);
  const sessionID = clean(checkout?.id);
  if (!EMAIL_PATTERN.test(email) || !fullName || !sessionID) return null;
  const amount = Number(checkout?.amount_total);
  return {
    full_name: fullName.slice(0, 120),
    email,
    phone: normalizeVisitorPhone(metadata.casual_visit_phone || checkout?.customer_details?.phone) || null,
    amount_cents: Number.isInteger(amount) && amount >= 0 ? amount : 0,
    currency: String(checkout?.currency || 'aud').toLowerCase(),
    stripe_checkout_session_id: sessionID,
    stripe_payment_intent_id: clean(typeof checkout?.payment_intent === 'string' ? checkout.payment_intent : checkout?.payment_intent?.id) || null,
    status: 'paid',
  };
}

/** Totals for the owner's screen: today, this month, and everything shown. */
export function summarizeCasualVisits(rows = [], now = new Date()) {
  const paid = (rows || []).filter(row => row?.status === 'paid');
  const day = new Date(now); day.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const total = list => list.reduce((sum, row) => sum + (Number(row.amount_cents) || 0), 0);
  const since = start => paid.filter(row => new Date(row.created_at) >= start);
  const today = since(day);
  const month = since(monthStart);
  const currencies = [...new Set(paid.map(row => String(row.currency || 'aud').toLowerCase()))];
  return {
    count: paid.length,
    revenue: total(paid),
    todayCount: today.length,
    todayRevenue: total(today),
    monthCount: month.length,
    monthRevenue: total(month),
    currency: currencies.length === 1 ? currencies[0] : 'aud',
    mixedCurrencies: currencies.length > 1,
  };
}

// ─── Remembering a visitor across the questionnaire ─────────────────────────
// Somebody who has not done the questionnaire is sent to fill it in before
// they pay. Their typed details wait here so the payment form is not blank
// when they come back. sessionStorage, so it belongs to one person in one
// sitting and a shared phone starts clean.

export const CASUAL_VISITOR_KEY = 'xert-casual-visitor';
export const CASUAL_VISITOR_TTL_MS = 12 * 60 * 60 * 1000;

function visitorStorage() {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function rememberCasualVisitor(visitor, { storage = visitorStorage(), now = Date.now() } = {}) {
  if (!storage) return false;
  try {
    storage.setItem(CASUAL_VISITOR_KEY, JSON.stringify({ ...visitor, at: now }));
    return true;
  } catch {
    return false;
  }
}

export function recallCasualVisitor({ storage = visitorStorage(), now = Date.now() } = {}) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(CASUAL_VISITOR_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const at = Number(parsed?.at);
    if (!Number.isFinite(at) || now - at > CASUAL_VISITOR_TTL_MS || now < at) return null;
    return parsed;
  } catch {
    return null;
  }
}
