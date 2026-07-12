const GROUP_CLASS_BLACKOUT_AFFECTS = new Set(['all', 'group_classes', 'facility_only']);
const AVAILABILITY_BLOCK_TYPES = new Set(['PT available', 'private session available', 'group class available', 'admin only', 'open gym placeholder', 'workshop placeholder']);
const BLACKOUT_AFFECTS = new Set(['all', 'group_classes', 'pt_only', 'facility_only', 'coach_only']);
const BLACKOUT_REASONS = new Set(['full day unavailable', 'partial day unavailable', 'recurring unavailable', 'personal work', 'facility maintenance', 'equipment install', 'private event', 'soft launch restricted']);

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

export function classSessionValidationError(session) {
  if (!session?.title?.trim()) return 'A class title is required.';

  const capacity = Number(session.capacity);
  if (!Number.isInteger(capacity) || capacity < 1) {
    return 'Capacity must be a whole number of at least 1.';
  }

  const duration = Number(session.duration_minutes);
  if (!Number.isInteger(duration) || duration < 1) {
    return 'Duration must be a whole number of at least 1 minute.';
  }

  const hasStartTime = Boolean(session.start_time);
  const hasEndTime = Boolean(session.end_time);
  if (session.status === 'published' && !hasStartTime) {
    return 'A published class needs a start time.';
  }
  if (hasStartTime && timestamp(session.start_time) === null) {
    return 'Use a valid class start time.';
  }
  if (hasEndTime && !hasValidTimeRange(session.start_time, session.end_time)) {
    return 'Class end time must be after its start time.';
  }

  return null;
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
