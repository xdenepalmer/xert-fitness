const GROUP_CLASS_BLACKOUT_AFFECTS = new Set(['all', 'group_classes', 'facility_only']);
const AVAILABILITY_BLOCK_TYPES = new Set(['PT available', 'private session available', 'group class available', 'admin only', 'open gym placeholder', 'workshop placeholder']);
const BLACKOUT_AFFECTS = new Set(['all', 'group_classes', 'pt_only', 'facility_only', 'coach_only']);
const BLACKOUT_REASONS = new Set(['full day unavailable', 'partial day unavailable', 'recurring unavailable', 'personal work', 'facility maintenance', 'equipment install', 'private event', 'soft launch restricted']);
const CLASS_TYPES = new Set(['XERT Foundation', 'XERT Strength', 'XERT Engine', 'XERT Hybrid', 'XERT Event Prep', 'XERT Team']);
const CLASS_STATUSES = new Set(['draft', 'published', 'full', 'cancelled', 'completed']);
const TERMINAL_CLASS_STATUSES = new Set(['cancelled', 'completed']);
const BOOKING_MODES = new Set(['interest_only', 'request_to_book', 'instant_book']);
const INTENSITY_LEVELS = new Set(['Low', 'Moderate', 'High', 'Very high']);

function timestamp(value) {
  const valueMs = new Date(value).getTime();
  return Number.isNaN(valueMs) ? null : valueMs;
}

export function hasValidTimeRange(startTime, endTime) {
  const startMs = timestamp(startTime);
  const endMs = timestamp(endTime);
  return startMs !== null && endMs !== null && endMs > startMs;
}

function normalizedTimestamp(value, label) {
  const valueMs = timestamp(value);
  if (valueMs === null) throw new Error(`${label} needs a valid date and time.`);
  return new Date(valueMs).toISOString();
}

function optionalText(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

export function toDateTimeLocalInput(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function availabilityBlockEditorForm(block = {}) {
  return {
    start_time: toDateTimeLocalInput(block.start_time),
    end_time: toDateTimeLocalInput(block.end_time),
    type: AVAILABILITY_BLOCK_TYPES.has(block.type) ? block.type : 'PT available',
    coach_name: String(block.coach_name || ''),
    notes: String(block.notes || ''),
    is_bookable: Boolean(block.is_bookable),
  };
}

export function blackoutPeriodEditorForm(blackout = {}) {
  return {
    start_time: toDateTimeLocalInput(blackout.start_time),
    end_time: toDateTimeLocalInput(blackout.end_time),
    affects: BLACKOUT_AFFECTS.has(blackout.affects) ? blackout.affects : 'all',
    reason: BLACKOUT_REASONS.has(blackout.reason) ? blackout.reason : 'facility maintenance',
    notes: String(blackout.notes || ''),
  };
}

export function normalizeAvailabilityBlock(form = {}) {
  if (!AVAILABILITY_BLOCK_TYPES.has(form.type)) throw new Error('Choose a valid availability type.');
  const startTime = normalizedTimestamp(form.start_time, 'Availability block');
  const endTime = normalizedTimestamp(form.end_time, 'Availability block');
  if (!hasValidTimeRange(startTime, endTime)) throw new Error('Availability block must end after it starts.');

  return {
    start_time: startTime,
    end_time: endTime,
    type: form.type,
    coach_name: optionalText(form.coach_name),
    notes: optionalText(form.notes),
    is_bookable: Boolean(form.is_bookable),
  };
}

export function normalizeBlackoutPeriod(form = {}) {
  if (!BLACKOUT_AFFECTS.has(form.affects)) throw new Error('Choose a valid blackout scope.');
  if (!BLACKOUT_REASONS.has(form.reason)) throw new Error('Choose a valid blackout reason.');
  const startTime = normalizedTimestamp(form.start_time, 'Blackout period');
  const endTime = normalizedTimestamp(form.end_time, 'Blackout period');
  if (!hasValidTimeRange(startTime, endTime)) throw new Error('Blackout period must end after it starts.');

  return {
    start_time: startTime,
    end_time: endTime,
    affects: form.affects,
    reason: form.reason,
    notes: optionalText(form.notes),
  };
}

export function normalizeClassSession(session = {}, { now = Date.now() } = {}) {
  const title = String(session.title || '').trim();
  if (!title) throw new Error('A class title is required.');
  if (!CLASS_TYPES.has(session.class_type)) throw new Error('Choose a valid class type.');
  if (!CLASS_STATUSES.has(session.status)) throw new Error('Choose a valid class status.');
  if (!BOOKING_MODES.has(session.booking_mode)) throw new Error('Choose a valid booking mode.');
  if (!INTENSITY_LEVELS.has(session.intensity_level)) throw new Error('Choose a valid intensity level.');

  const capacity = Number(session.capacity);
  if (!Number.isInteger(capacity) || capacity < 1) throw new Error('Capacity must be a whole number of at least 1.');
  const duration = Number(session.duration_minutes);
  if (!Number.isInteger(duration) || duration < 1) throw new Error('Duration must be a whole number of at least 1 minute.');

  const startTime = session.start_time ? normalizedTimestamp(session.start_time, 'Class start time') : null;
  const endTime = session.end_time ? normalizedTimestamp(session.end_time, 'Class end time') : null;
  if (session.status === 'published' && !startTime) throw new Error('A published class needs a start time.');
  if (session.status === 'published' && Date.parse(startTime) <= now) throw new Error('A published class must start in the future.');
  if (endTime && !hasValidTimeRange(startTime, endTime)) throw new Error('Class end time must be after its start time.');

  return {
    class_type: session.class_type,
    title,
    description: optionalText(session.description),
    coach_name: optionalText(session.coach_name),
    start_time: startTime,
    end_time: endTime,
    duration_minutes: duration,
    capacity,
    location_zone: optionalText(session.location_zone),
    beginner_friendly: Boolean(session.beginner_friendly),
    intensity_level: session.intensity_level,
    status: session.status,
    public_visible: session.status === 'published' && Boolean(session.public_visible),
    booking_mode: session.booking_mode,
    notes: optionalText(session.notes),
  };
}

export function classSessionValidationError(session, options) {
  try {
    normalizeClassSession(session, options);
    return null;
  } catch (error) {
    return error.message;
  }
}

export function classSessionUpdateGuardError({
  currentStatus = '', nextStatus = '', capacity = 0, activeBookings = 0,
} = {}) {
  const current = String(currentStatus || '').trim();
  const next = String(nextStatus || '').trim();
  if (TERMINAL_CLASS_STATUSES.has(current) && next !== current) {
    return 'Cancelled and completed classes cannot be reopened. Create a new class instead.';
  }
  if (next === 'cancelled' && current !== 'cancelled') {
    return 'Use Cancel class so active bookings are cancelled and credits are returned safely.';
  }
  if (next === 'completed' && current !== 'completed') {
    return 'Use Take attendance to complete the class with a full roll call.';
  }
  const active = Number(activeBookings);
  const nextCapacity = Number(capacity);
  if (Number.isInteger(active) && active > 0 && Number.isInteger(nextCapacity) && nextCapacity < active) {
    return `Capacity cannot be lower than the ${active} active ${active === 1 ? 'booking' : 'bookings'}.`;
  }
  return null;
}

export function classSessionUpdateRpcError(message) {
  const value = String(message || 'Class session update failed.');
  const capacityMatch = value.match(/CAPACITY_BELOW_ACTIVE:(\d+)/i);
  if (capacityMatch) {
    const active = Number(capacityMatch[1]);
    return `Capacity cannot be lower than the ${active} active ${active === 1 ? 'booking' : 'bookings'}.`;
  }
  if (/USE_CANCELLATION_WORKFLOW/i.test(value)) {
    return 'Use Cancel class so active bookings are cancelled and credits are returned safely.';
  }
  if (/USE_ATTENDANCE_WORKFLOW/i.test(value)) {
    return 'Use Take attendance to complete the class with a full roll call.';
  }
  if (/SESSION_TIME_CONFLICTS_WITH_MEMBER_BOOKING/i.test(value)) {
    return 'This new time overlaps another active booking held by one or more members. Resolve those bookings before rescheduling the class.';
  }
  if (/TERMINAL_SESSION_IMMUTABLE/i.test(value)) {
    return 'Cancelled and completed classes cannot be reopened. Create a new class instead.';
  }
  if (/SESSION_NOT_FOUND/i.test(value)) return 'This class no longer exists. Refresh the calendar.';
  return value;
}

export function sessionEndTime(session) {
  const startMs = timestamp(session?.start_time);
  if (startMs === null) return null;

  const endMs = timestamp(session.end_time);
  if (endMs !== null && endMs > startMs) return endMs;

  const duration = Number(session.duration_minutes);
  const durationMs = Number.isFinite(duration) && duration > 0 ? duration * 60 * 1000 : 60 * 60 * 1000;
  return startMs + durationMs;
}

export function blackoutsOverlappingSession(session, blackouts = []) {
  const startMs = timestamp(session?.start_time);
  const endMs = sessionEndTime(session);
  if (startMs === null || endMs === null) return [];

  return blackouts.filter(blackout => {
    if (!GROUP_CLASS_BLACKOUT_AFFECTS.has(blackout.affects || 'all')) return false;

    const blackoutStartMs = timestamp(blackout.start_time);
    const blackoutEndMs = timestamp(blackout.end_time);
    return blackoutStartMs !== null
      && blackoutEndMs !== null
      && blackoutStartMs < endMs
      && blackoutEndMs > startMs;
  });
}

export function repeatedClassSessionCopies(session, { intervalDays, count, keepPublished }) {
  const startMs = timestamp(session?.start_time);
  const interval = Number(intervalDays);
  const copyCount = Number(count);
  if (startMs === null) throw new Error('This class needs a valid start time before it can be repeated.');
  if (!Number.isInteger(interval) || interval < 1) throw new Error('Repeat interval must be at least one day.');
  if (!Number.isInteger(copyCount) || copyCount < 1) throw new Error('Create at least one class copy.');

  const endMs = timestamp(session.end_time);
  if (session.end_time && endMs === null) throw new Error('This class has an invalid end time.');

  const { id, created_at, updated_at, ...base } = session;
  const intervalMs = interval * 24 * 60 * 60 * 1000;
  return Array.from({ length: copyCount }, (_, index) => {
    const offsetMs = (index + 1) * intervalMs;
    return {
      ...base,
      start_time: new Date(startMs + offsetMs).toISOString(),
      end_time: endMs === null ? null : new Date(endMs + offsetMs).toISOString(),
      status: keepPublished ? session.status : 'draft',
      public_visible: keepPublished ? session.public_visible : false,
    };
  });
}
