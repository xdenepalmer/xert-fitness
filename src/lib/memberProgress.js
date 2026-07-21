const DAY_MS = 24 * 60 * 60 * 1000;
const BRISBANE_UTC_OFFSET_MS = 10 * 60 * 60 * 1000;

function brisbaneWeekKey(value) {
  const local = new Date(value.getTime() + BRISBANE_UTC_OFFSET_MS);
  const weekday = local.getUTCDay() || 7;
  local.setUTCDate(local.getUTCDate() - weekday + 1);
  local.setUTCHours(0, 0, 0, 0);
  return local.toISOString().slice(0, 10);
}

function previousBrisbaneWeekKeys(now, count) {
  const local = new Date(now.getTime() + BRISBANE_UTC_OFFSET_MS);
  const weekday = local.getUTCDay() || 7;
  local.setUTCDate(local.getUTCDate() - weekday + 1);
  local.setUTCHours(0, 0, 0, 0);

  return new Set(Array.from({ length: count }, (_, index) => {
    const week = new Date(local);
    week.setUTCDate(week.getUTCDate() - (index * 7));
    return week.toISOString().slice(0, 10);
  }));
}

/**
 * Summarises recorded class attendance without collecting any new health data.
 * A class only counts after staff marks it attended; past confirmations,
 * cancellations and no-shows are deliberately excluded.
 */
export function summarizeMemberProgress(bookings, now = new Date()) {
  const currentTime = now instanceof Date ? now : new Date(now);
  const nowMs = currentTime.getTime();
  if (!Number.isFinite(nowMs)) throw new TypeError('A valid current date is required.');

  const attendedBySession = new Map();
  for (const booking of Array.isArray(bookings) ? bookings : []) {
    if (booking?.status !== 'attended') continue;
    const attendedAt = new Date(booking.start_time);
    const attendedAtMs = attendedAt.getTime();
    if (!Number.isFinite(attendedAtMs) || attendedAtMs > nowMs) continue;

    const identity = booking.session_id || booking.booking_id || `${booking.start_time}|${booking.title || ''}`;
    const existing = attendedBySession.get(identity);
    if (!existing || attendedAtMs > existing.getTime()) attendedBySession.set(identity, attendedAt);
  }

  const attendedDates = [...attendedBySession.values()].sort((left, right) => right - left);
  const recentCutoff = nowMs - (30 * DAY_MS);
  const recentDates = attendedDates.filter(date => date.getTime() >= recentCutoff);
  const recentWeeks = previousBrisbaneWeekKeys(currentTime, 4);
  const activeWeeksLastFour = new Set(
    attendedDates
      .map(brisbaneWeekKey)
      .filter(week => recentWeeks.has(week)),
  ).size;

  return {
    totalAttended: attendedDates.length,
    attendedLast30Days: recentDates.length,
    activeWeeksLastFour,
    lastAttendedAt: attendedDates[0] || null,
  };
}
