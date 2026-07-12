export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const XERT_2026_EVENTS = [
  { name: 'Gold Coast Marathon', category: 'run', event_date: '2026-07-04', end_date: '2026-07-05', date_label: '4-5 Jul', location: 'Gold Coast', region: 'South East Queensland', sort_order: 1 },
  { name: 'ACTÍVATE Brisbane', category: 'fitness', event_date: '2026-07-12', end_date: null, date_label: '12 Jul', location: 'Brisbane', region: 'South East Queensland', sort_order: 2 },
  { name: 'The Guzzler Ultra', category: 'ultra', event_date: '2026-07-18', end_date: '2026-07-19', date_label: '18-19 Jul', location: 'South East Queensland', region: 'South East Queensland', sort_order: 3 },
  { name: 'Max Adventure Sunshine Coast', category: 'adventure', event_date: '2026-07-25', end_date: null, date_label: '25 Jul', location: 'Sunshine Coast', region: 'South East Queensland', sort_order: 4 },
  { name: 'Sunshine Coast Marathon Festival', category: 'run', event_date: '2026-08-02', end_date: null, date_label: '2 Aug', location: 'Sunshine Coast', region: 'South East Queensland', sort_order: 5 },
  { name: 'Brisbane to Gold Coast Cycle Challenge', category: 'cycling', event_date: '2026-08-23', end_date: null, date_label: '23 Aug', location: 'Brisbane to Gold Coast', region: 'South East Queensland', sort_order: 6 },
  { name: 'Coastal High Trail Run', category: 'trail', event_date: '2026-08-29', end_date: null, date_label: '29 Aug', location: 'Gold Coast', region: 'South East Queensland', sort_order: 7 },
  { name: 'Turf Games Gold Coast', category: 'functional', event_date: '2026-09-12', end_date: '2026-09-13', date_label: '12-13 Sep', location: 'Gold Coast', region: 'South East Queensland', sort_order: 8 },
  { name: 'IRONMAN 70.3 Sunshine Coast', category: 'triathlon', event_date: '2026-09-13', end_date: null, date_label: '13 Sep', location: 'Sunshine Coast', region: 'South East Queensland', sort_order: 9 },
  { name: 'Bridge to Brisbane', category: 'run', event_date: '2026-09-13', end_date: null, date_label: '13 Sep', location: 'Brisbane', region: 'South East Queensland', sort_order: 10 },
  { name: 'Butterfly Effect', category: 'community', event_date: '2026-09-26', end_date: '2026-09-27', date_label: '26-27 Sep', location: 'South East Queensland', region: 'South East Queensland', sort_order: 11 },
  { name: 'XERT Endurance Challenge', category: 'xert', event_date: '2026-09-26', end_date: null, date_label: 'Last Saturday of September', location: 'Kingaroy', region: 'South East Queensland', sort_order: 12 },
  { name: 'Cricket Season Begins', category: 'sport', event_date: '2026-10-01', end_date: null, date_label: 'October', location: 'South East Queensland', region: 'South East Queensland', sort_order: 13 },
  { name: 'AP&ES Games', category: 'games', event_date: '2026-10-11', end_date: '2026-10-12', date_label: '11-12 Oct', location: 'South East Queensland', region: 'South East Queensland', sort_order: 14 },
  { name: 'Blackall 100', category: 'ultra', event_date: '2026-10-17', end_date: null, date_label: '17 Oct', location: 'Blackall Range', region: 'South East Queensland', sort_order: 15 },
  { name: 'Noosa Triathlon', category: 'triathlon', event_date: '2026-11-01', end_date: null, date_label: '1 Nov', location: 'Noosa', region: 'South East Queensland', sort_order: 16 },
  { name: 'Robina Triathlon', category: 'triathlon', event_date: '2026-11-15', end_date: null, date_label: '15 Nov', location: 'Robina', region: 'South East Queensland', sort_order: 17 },
  { name: 'Summer Touch Football Season', category: 'sport', event_date: '2026-12-01', end_date: null, date_label: 'December', location: 'South East Queensland', region: 'South East Queensland', sort_order: 18 },
  { name: 'Cricket Season', category: 'sport', event_date: '2026-12-01', end_date: null, date_label: 'December', location: 'South East Queensland', region: 'South East Queensland', sort_order: 19 },
  { name: 'XERT Team Competition', category: 'xert', event_date: '2026-12-05', end_date: null, date_label: 'First Saturday of December', location: 'Kingaroy', region: 'South East Queensland', sort_order: 20 },
].map(event => ({
  ...event,
  id: `xert-2026-${event.sort_order}`,
  published: true,
  source: 'xert-default',
}));

export function parseCalendarDate(value) {
  if (!value) return null;
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

export function startOfCalendarDay(value) {
  const date = value instanceof Date ? new Date(value) : parseCalendarDate(value);
  if (!date) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

export function endOfCalendarDay(value) {
  const date = value instanceof Date ? new Date(value) : parseCalendarDate(value);
  if (!date) return null;
  date.setHours(23, 59, 59, 999);
  return date;
}

export function getEventState(event, now = new Date()) {
  const today = startOfCalendarDay(now);
  const start = startOfCalendarDay(event.event_date);
  const end = endOfCalendarDay(event.end_date || event.event_date);

  if (!start || !end) return { key: 'tbc', label: 'Date TBC' };
  if (today > end) return { key: 'complete', label: 'Complete' };
  if (today >= start && today <= end) return { key: 'live', label: 'Happening now' };
  return { key: 'upcoming', label: 'Coming up' };
}

export function formatEventRange(event) {
  if (event.date_label) return event.date_label;
  const start = parseCalendarDate(event.event_date);
  if (!start) return 'Date TBC';
  /** @type {Intl.DateTimeFormatOptions} */
  const opts = { day: 'numeric', month: 'short' };

  if (event.end_date && event.end_date !== event.event_date) {
    const end = parseCalendarDate(event.end_date);
    return `${start.getDate()}-${end.toLocaleDateString('en-AU', opts)}`;
  }

  return start.toLocaleDateString('en-AU', opts);
}

export function eventSortValue(event) {
  const date = parseCalendarDate(event.event_date);
  return date ? date.getTime() : Number.MAX_SAFE_INTEGER;
}

export function sortEvents(events) {
  return [...events].sort((a, b) => {
    const dateDiff = eventSortValue(a) - eventSortValue(b);
    if (dateDiff !== 0) return dateDiff;
    return (a.sort_order || 0) - (b.sort_order || 0);
  });
}

export function groupEventsByMonth(events) {
  const groups = {};
  for (const event of sortEvents(events)) {
    const date = parseCalendarDate(event.event_date);
    const key = date ? MONTHS[date.getMonth()] : 'Dates TBC';
    (groups[key] ||= []).push(event);
  }

  return MONTHS
    .map(month => ({ month, events: groups[month] || [] }))
    .filter(group => group.events.length > 0);
}

function addDaysIso(value, days) {
  const date = parseCalendarDate(value);
  if (!date) return '';
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function escapeIcs(value = '') {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function toIcsDate(value) {
  return String(value || '').replace(/-/g, '');
}

export function buildEventIcs(event) {
  const start = event.event_date;
  const end = addDaysIso(event.end_date || event.event_date, 1);
  const uid = `${event.name}-${event.event_date || 'tbc'}@xertfitness`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//XERT Fitness//Event Calendar//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${escapeIcs(uid)}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
    `DTSTART;VALUE=DATE:${toIcsDate(start)}`,
    `DTEND;VALUE=DATE:${toIcsDate(end)}`,
    `SUMMARY:${escapeIcs(event.name)}`,
    `LOCATION:${escapeIcs(event.location || event.region || '')}`,
    `DESCRIPTION:${escapeIcs('XERT training target event. Train with purpose. Compete together.')}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

export function downloadEventIcs(event) {
  const blob = new Blob([buildEventIcs(event)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${event.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'xert-event'}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
