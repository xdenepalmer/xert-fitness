// Workout of the day: one workout per calendar day, shared by every class that
// day. Pure helpers so the date maths and display rules are unit testable.

export const BRISBANE_TIME_ZONE = 'Australia/Brisbane';

export const WORKOUT_TITLE_MAX = 120;
export const WORKOUT_BODY_MAX = 4000;

/**
 * Calendar date (YYYY-MM-DD) in Brisbane, regardless of the device's own zone.
 * The gym is in Kingaroy, and a UTC-derived date is a full day wrong for most
 * of the local morning — which would put yesterday's workout on the TV.
 */
export function brisbaneDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: BRISBANE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = type => parts.find(item => item.type === type)?.value;
  const year = part('year');
  const month = part('month');
  const day = part('day');
  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
}

/** Long human date for the display header, e.g. "Monday 28 July". */
export function brisbaneDisplayDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: BRISBANE_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
}

/** Wall clock for the display header, e.g. "5:42 am". */
export function brisbaneClock(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: BRISBANE_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date).toLowerCase();
}

/**
 * @typedef {Object} WorkoutOfTheDay
 * @property {string} workout_date Brisbane date key, `YYYY-MM-DD`.
 * @property {string} [title]
 * @property {string} [body]
 */

/**
 * What the TV should render right now.
 *
 * The critical rule: a workout is only ever shown on its own day. A cached
 * workout from a previous day must NEVER survive midnight onto the screen — a
 * TV left running overnight would otherwise show yesterday's session to the
 * 5:15am class.
 *
 * @param {{ workout?: WorkoutOfTheDay | null, todayKey?: string, loadFailed?: boolean }} [options]
 * @returns {{ status: 'ready' | 'unavailable' | 'empty', workout: WorkoutOfTheDay | null, dateKey: string, stale: boolean }}
 */
export function workoutDisplayState({ workout, todayKey, loadFailed = false } = {}) {
  const key = todayKey || brisbaneDateKey();
  const matchesToday = Boolean(workout) && workout.workout_date === key;

  if (matchesToday) {
    return { status: 'ready', workout, dateKey: key, stale: Boolean(loadFailed) };
  }
  if (loadFailed) {
    // No usable workout for today and the network is down: say so plainly
    // rather than implying nothing is programmed.
    return { status: 'unavailable', workout: null, dateKey: key, stale: true };
  }
  return { status: 'empty', workout: null, dateKey: key, stale: false };
}

/** Body split into display lines, blank lines preserved as spacing breaks. */
export function workoutBodyLines(body) {
  return String(body || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.trimEnd());
}

/**
 * Validates and normalizes an admin workout edit. Mirrors the database
 * constraints so a bad value fails in the form rather than as a Postgres error.
 */
export function normalizeWorkoutInput(form = {}) {
  const workoutDate = String(form.workout_date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workoutDate)) {
    throw new Error('Pick the day this workout runs.');
  }
  const parsed = new Date(`${workoutDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || brisbaneDateKeyFromIsoDate(workoutDate) !== workoutDate) {
    throw new Error('That date is not a real calendar day.');
  }

  const title = String(form.title || '').trim();
  if (title.length > WORKOUT_TITLE_MAX) {
    throw new Error(`Title must be ${WORKOUT_TITLE_MAX} characters or fewer.`);
  }

  const body = String(form.body || '').replace(/\r\n?/g, '\n').trim();
  if (!body) throw new Error('Add the workout before saving.');
  if (body.length > WORKOUT_BODY_MAX) {
    throw new Error(`Workout must be ${WORKOUT_BODY_MAX} characters or fewer.`);
  }

  return {
    workout_date: workoutDate,
    title: title || null,
    body,
    published: Boolean(form.published),
  };
}

/** Round-trips an ISO date string to catch impossible days like 2026-02-30. */
function brisbaneDateKeyFromIsoDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return null;
  const pad = value => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}
