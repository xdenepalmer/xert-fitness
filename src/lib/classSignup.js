/**
 * Decides what the public timetable offers for a single class.
 *
 * Every class carries its own `booking_mode`, which the public site used to
 * ignore entirely — every class showed "Request spot" and nothing ever took a
 * place. The owner now chooses per class:
 *
 *   interest_only    register interest, no spot is held
 *   request_to_book  a request staff confirm, no spot is held
 *   instant_book     sign-ups accepted: the first `capacity` people take a spot
 *
 * Remaining places come from `public_class_availability()`, which counts
 * confirmed public sign-ups alongside member bookings. The database is what
 * actually enforces capacity; this module only decides what to show, and fails
 * safe to the non-committal option when availability is unknown.
 */

export const BOOKING_MODES = ['interest_only', 'request_to_book', 'instant_book'];

export const BOOKING_MODE_LABELS = {
  interest_only: 'Register interest only',
  request_to_book: 'Request to book (staff confirm)',
  instant_book: 'Sign-ups accepted (takes a spot)',
};

export function normalizeBookingMode(mode) {
  return BOOKING_MODES.includes(mode) ? mode : 'request_to_book';
}

/** Remaining places for one class, or null when capacity is unlimited/unknown. */
export function spotsRemaining(availability) {
  const left = availability?.spots_left;
  if (left === null || left === undefined) return null;
  const value = Number(left);
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : null;
}

export function spotsLabel(availability) {
  const left = spotsRemaining(availability);
  if (left === null) return null;
  if (left === 0) return 'No spots left';
  return `${left} spot${left === 1 ? '' : 's'} left`;
}

/**
 * @returns {{kind: string, label: string, detail: string|null, spotsLeft: number|null,
 *            takesSpot: boolean, actionable: boolean}}
 */
export function classSignupState({
  session = null,
  availability = null,
  bookingsEnabled = true,
  fitbox = null,
  now = new Date(),
} = {}) {
  if (fitbox?.active) {
    return {
      kind: 'fitbox',
      label: 'Book on the XERT member portal',
      detail: null,
      spotsLeft: null,
      takesSpot: false,
      actionable: true,
    };
  }

  const start = session?.start_time ? new Date(session.start_time) : null;
  if (start && Number.isFinite(start.getTime()) && start.getTime() <= now.getTime()) {
    return {
      kind: 'past',
      label: 'Class has started',
      detail: null,
      spotsLeft: null,
      takesSpot: false,
      actionable: false,
    };
  }

  const mode = normalizeBookingMode(session?.booking_mode);
  const spotsLeft = spotsRemaining(availability);

  // A site-wide booking pause never blocks interest capture: the class can
  // still collect names, it just cannot hold a place.
  if (!bookingsEnabled) {
    return {
      kind: 'interest',
      label: 'Register interest',
      detail: 'Bookings open soon — register and we will let you know first.',
      spotsLeft,
      takesSpot: false,
      actionable: true,
    };
  }

  if (mode === 'interest_only') {
    return {
      kind: 'interest',
      label: 'Register interest',
      detail: 'This class is collecting interest — no spot is held yet.',
      spotsLeft,
      takesSpot: false,
      actionable: true,
    };
  }

  if (mode === 'instant_book') {
    if (session?.status === 'full' || spotsLeft === 0) {
      return {
        kind: 'full',
        label: 'Class full',
        detail: 'Every spot is taken. Register interest and we will contact you if one frees up.',
        spotsLeft: 0,
        takesSpot: false,
        actionable: false,
      };
    }
    return {
      kind: 'signup',
      label: 'Sign up',
      detail: spotsLabel(availability),
      spotsLeft,
      takesSpot: true,
      actionable: true,
    };
  }

  return {
    kind: 'request',
    label: 'Request spot',
    detail: 'Staff confirm this booking.',
    spotsLeft,
    takesSpot: false,
    actionable: true,
  };
}

/** Confirmation copy shown after a successful submission. */
export function signupOutcomeMessage(result) {
  if (result?.took_spot) {
    const left = spotsRemaining(result);
    const tail = left === null ? '' : ` ${left} spot${left === 1 ? '' : 's'} remaining.`;
    return {
      title: "You're in",
      body: `Your spot is confirmed and we have your details.${tail}`,
    };
  }
  if (result?.booking_mode === 'interest_only') {
    return {
      title: 'Interest registered',
      body: 'Thanks — we have your details and will be in touch about this class.',
    };
  }
  return {
    title: 'Request received',
    body: 'Thanks — XERT will confirm your spot shortly.',
  };
}

/** Maps database errors to copy a member can act on. */
export const SIGNUP_ERRORS = {
  CLASS_FULL: 'That was the last spot — this class just filled up. Register interest and we will contact you if one frees up.',
  ALREADY_SIGNED_UP: 'That email is already signed up for this class.',
  CLASS_STARTED: 'This class has already started.',
  CLASS_NOT_OPEN: 'This class is not open for sign-ups.',
  CLASS_NOT_FOUND: 'This class is no longer on the timetable.',
  CONSENT_REQUIRED: 'Please tick the consent box so we can contact you.',
  NAME_REQUIRED: 'Enter your full name.',
  EMAIL_REQUIRED: 'Enter a valid email address.',
  PHONE_REQUIRED: 'Enter a valid phone number.',
  NOTES_TOO_LONG: 'Please shorten your note.',
};

export function friendlySignupError(error) {
  const raw = String(error?.message || error || '');
  for (const [code, message] of Object.entries(SIGNUP_ERRORS)) {
    if (raw.includes(code)) return message;
  }
  return 'Sign-up failed. Please try again.';
}
