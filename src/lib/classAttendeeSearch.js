// ─── Finding one person in the timetable ────────────────────────────────────
// The database returns one row per booking, which is the right shape for a
// database and the wrong shape for a person reading it: somebody who trains
// three times a week appears three times. These group the rows back into
// people, each with the classes they are in.

/** People are the same person when their email matches, or failing that their name. */
function personKey(row) {
  const email = String(row?.email || '').trim().toLowerCase();
  if (email) return `email:${email}`;
  const name = String(row?.full_name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (name) return `name:${name}`;
  return `booking:${row?.booking_id || ''}`;
}

export function attendeeDisplayName(row) {
  const name = String(row?.full_name || '').trim();
  if (name) return name;
  const email = String(row?.email || '').trim();
  if (email) return email;
  return 'Unnamed booking';
}

/** Statuses that mean the place is not currently held. */
const INACTIVE = new Set(['cancelled', 'declined', 'no_show']);

export function attendeeMatchesByPerson(rows, { now = Date.now() } = {}) {
  const people = new Map();

  for (const row of rows || []) {
    if (!row) continue;
    const key = personKey(row);
    if (!people.has(key)) {
      people.set(key, {
        key,
        name: attendeeDisplayName(row),
        email: String(row.email || '').trim(),
        phone: String(row.phone || '').trim(),
        memberId: row.member_id || null,
        // Somebody can reach a class both ways over time, so this is a set.
        sources: new Set(),
        classes: [],
        upcoming: 0,
      });
    }
    const person = people.get(key);
    person.sources.add(row.source === 'member' ? 'member' : 'signup');
    if (!person.memberId && row.member_id) person.memberId = row.member_id;
    if (!person.phone && row.phone) person.phone = String(row.phone).trim();

    const startsAt = row.session_start ? new Date(row.session_start).getTime() : NaN;
    const status = String(row.status || '').toLowerCase();
    const active = !INACTIVE.has(status);
    if (active && Number.isFinite(startsAt) && startsAt >= now) person.upcoming += 1;

    person.classes.push({
      bookingId: row.booking_id,
      sessionId: row.session_id,
      title: row.session_title || 'Class',
      startsAt: Number.isFinite(startsAt) ? startsAt : null,
      coach: row.coach_name || '',
      location: row.location_zone || '',
      status,
      source: row.source === 'member' ? 'member' : 'signup',
      active,
    });
  }

  for (const person of people.values()) {
    person.classes.sort((left, right) => (left.startsAt ?? 0) - (right.startsAt ?? 0));
    person.sources = [...person.sources].sort();
  }

  // Most classes first: the person somebody is looking for is usually the one
  // who turns up most, and a single stray match should not lead the list.
  return [...people.values()].sort((left, right) => (
    right.classes.length - left.classes.length
      || left.name.localeCompare(right.name, 'en-AU')
  ));
}

export function summarizeAttendeeSearch(people) {
  const bookings = (people || []).reduce((total, person) => total + person.classes.length, 0);
  const upcoming = (people || []).reduce((total, person) => total + person.upcoming, 0);
  return { people: (people || []).length, bookings, upcoming };
}
