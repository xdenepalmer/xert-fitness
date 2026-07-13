const FOLLOW_UP_CHANNELS = new Set(['email', 'phone', 'sms', 'in_person']);

const REASON_LABELS = {
  no_first_booking: 'first class booking',
  credits_expiring: 'expiring class credits',
  idle_credits: 'unused class credits',
  renewal_due: 'training renewal',
};

function firstName(member) {
  return String(member?.full_name || '').trim().split(/\s+/)[0] || 'there';
}

function bookingUrl(baseUrl) {
  try {
    return new URL('/booking', baseUrl).toString();
  } catch {
    return '/booking';
  }
}

function formatExpiry(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Australia/Brisbane',
  }).format(date);
}

export function createFollowUpCopy(member, baseUrl) {
  const name = firstName(member);
  const bookLink = bookingUrl(baseUrl);
  let subject = 'Your next XERT class';
  let message = `We would love to help you keep your training moving. You can view the timetable and book here: ${bookLink}`;

  if (member?.reason === 'no_first_booking') {
    subject = 'Ready for your first XERT class?';
    message = `We would love to help you book your first XERT class. You can view the timetable and choose a session here: ${bookLink}`;
  } else if (member?.reason === 'credits_expiring') {
    const count = Math.max(0, Number(member.credits_expiring) || 0);
    const expiry = formatExpiry(member.next_credit_expiry);
    subject = 'Use your XERT credits before they expire';
    message = `You have ${count} class credit${count === 1 ? '' : 's'} expiring${expiry ? ` on ${expiry}` : ' soon'}. Book your next class here: ${bookLink}`;
  } else if (member?.reason === 'idle_credits') {
    const count = Math.max(0, Number(member.credits_remaining) || 0);
    subject = 'Ready for your next XERT class?';
    message = `You have ${count} class credit${count === 1 ? '' : 's'} ready to use. You can view the timetable and book here: ${bookLink}`;
  } else if (member?.reason === 'renewal_due') {
    subject = 'Keep your XERT training moving';
    message = `Ready for your next training block? You can view the current timetable and session packs here: ${bookLink}`;
  }

  const emailBody = `Hi ${name},\n\n${message}\n\nTrain for Life. Compete for Fun.\nXERT Fitness`;
  return {
    subject,
    emailBody,
    mailto: `mailto:${encodeURIComponent(String(member?.email || '').trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`,
  };
}

export function createFollowUpLog(member, channel, note = '') {
  const normalizedChannel = String(channel || '').trim().toLowerCase();
  if (!FOLLOW_UP_CHANNELS.has(normalizedChannel)) {
    throw new Error('Choose how the member was contacted.');
  }
  const normalizedNote = String(note || '').trim().replace(/\s+/g, ' ');
  if (normalizedNote.length > 500) {
    throw new Error('Follow-up context must be 500 characters or fewer.');
  }
  const channelLabel = normalizedChannel === 'in_person'
    ? 'in person'
    : normalizedChannel.toUpperCase() === 'SMS' ? 'SMS' : normalizedChannel;
  const reason = REASON_LABELS[member?.reason] || 'member follow-up';
  return `Contacted via ${channelLabel} about ${reason}.${normalizedNote ? ` ${normalizedNote}` : ''}`;
}
