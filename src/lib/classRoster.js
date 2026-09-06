/**
 * One class has two doors into it: members booked with credits
 * (`session_bookings`) and people who signed up or asked through the public
 * timetable (`class_bookings`). The Command Centre kept them as two separate
 * lists, so the owner's question — "who is in this class?" — had two different
 * answers depending on which panel they happened to be looking at, and neither
 * was the number the member on the website saw.
 *
 * These helpers put the two sides into one list, keyed so that each row can be
 * changed through the right database function: a member booking moves credits
 * and writes the member a private notice, a public sign-up does neither.
 */

const MEMBER_PLACE_HOLDING = new Set(['requested', 'confirmed']);

export function rosterPeople(signups = [], members = []) {
  const byBookedAt = (a, b) => String(a.bookedAt || '').localeCompare(String(b.bookedAt || ''));
  return [
    ...(members || []).map(person => ({
      ...person,
      rowId: person.booking_id || person.id,
      source: 'member',
      name: person.full_name || person.member_name || 'Member',
      bookedAt: person.booked_at || person.created_at || '',
    })),
    ...(signups || []).map(person => ({
      ...person,
      rowId: person.id,
      source: 'signup',
      name: person.full_name || 'Unnamed',
      bookedAt: person.created_at || '',
    })),
  ].sort(byBookedAt);
}

/**
 * Places actually held in the room, counted the way the database counts them.
 * A member request already committed a credit, so it holds a place; a public
 * request is an enquiry and holds nothing until staff confirm it.
 */
export function rosterPlacesHeld(people = []) {
  return people.filter(person => (
    person.source === 'member'
      ? MEMBER_PLACE_HOLDING.has(person.status)
      : person.status === 'confirmed'
  )).length;
}
