const ACTIVE_CANCELLATION_STATUSES = new Set(['requested', 'confirmed', 'waitlisted']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAX_BCC_RECIPIENTS = 40;

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value) {
  const email = clean(value).toLowerCase();
  return EMAIL_PATTERN.test(email) ? email : '';
}

function normalizePhone(value) {
  const phone = clean(value);
  const dialable = phone.replace(/(?!^\+)[^0-9]/g, '');
  return dialable.length >= 8 ? { display: phone, dialable } : { display: '', dialable: '' };
}

export function collectClassCancellationContacts(...bookingGroups) {
  const contacts = [];
  for (const booking of bookingGroups.flat()) {
    if (!booking || !ACTIVE_CANCELLATION_STATUSES.has(booking.status)) continue;
    const email = normalizeEmail(booking.email);
    const phone = normalizePhone(booking.phone);
    if (!email && !phone.dialable) continue;

    const existing = contacts.find(contact =>
      (email && contact.email === email) ||
      (phone.dialable && contact.phoneDialable === phone.dialable)
    );
    if (existing) {
      if (!existing.email && email) existing.email = email;
      if (!existing.phoneDialable && phone.dialable) {
        existing.phone = phone.display;
        existing.phoneDialable = phone.dialable;
      }
      if (!existing.name && clean(booking.full_name)) existing.name = clean(booking.full_name);
      continue;
    }

    contacts.push({
      name: clean(booking.full_name),
      email,
      phone: phone.display,
      phoneDialable: phone.dialable,
    });
  }
  return contacts.sort((left, right) =>
    (left.name || left.email || left.phone).localeCompare(right.name || right.email || right.phone)
  );
}

export function buildClassCancellationMessage(session) {
  const title = clean(session?.title) || 'XERT class';
  const startDate = session?.start_time ? new Date(session.start_time) : null;
  const startsAt = startDate && !Number.isNaN(startDate.getTime())
    ? new Intl.DateTimeFormat('en-AU', {
        timeZone: 'Australia/Brisbane',
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: 'numeric',
        minute: '2-digit',
      }).format(startDate)
    : 'the scheduled time';

  return {
    subject: `XERT class cancelled: ${title}`,
    body: [
      'Hi,',
      '',
      `Unfortunately, XERT has cancelled ${title} on ${startsAt}. Any reserved session credit has been returned automatically.`,
      '',
      'We are sorry for the disruption. Please open XERT to choose another class, or reply if you need help.',
      '',
      'XERT Fitness',
    ].join('\n'),
  };
}

export function buildClassCancellationMailto(contacts, subject, body, limit = MAX_BCC_RECIPIENTS) {
  const emails = [...new Set((contacts || []).map(contact => normalizeEmail(contact.email)).filter(Boolean))];
  const boundedLimit = Math.max(1, Math.min(MAX_BCC_RECIPIENTS, Number(limit) || MAX_BCC_RECIPIENTS));
  const included = emails.slice(0, boundedLimit);
  if (included.length === 0) return { url: '', recipientCount: 0, omittedCount: 0 };
  const params = new URLSearchParams({
    bcc: included.join(','),
    subject: clean(subject),
    body: clean(body),
  });
  return {
    url: `mailto:?${params.toString()}`,
    recipientCount: included.length,
    omittedCount: Math.max(0, emails.length - included.length),
  };
}
