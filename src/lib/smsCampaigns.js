// ─── SMS campaigns (Twilio via /api/admin-send-sms) ──────────────────────────
// Everything here is pure audience shaping and validation, testable under
// node. The authenticated send call lives in smsSend.js. Twilio credentials
// live only in server-side environment variables; the browser never sees them.

export const SMS_MAX_LENGTH = 1600; // Twilio's hard body limit
export const SMS_MAX_RECIPIENTS = 500;

// GSM 03.38 basic set + extension. Anything outside forces UCS-2 encoding,
// which shrinks each segment from 160 to 70 characters (153/67 when linked).
// eslint-disable-next-line no-control-regex
const GSM_BASIC = /^[A-Za-z0-9 \r\n@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑܧ¿äöñüà^{}\\[~\]|€]*$/;
const GSM_EXTENDED = new Set(['^', '{', '}', '\\', '[', ']', '~', '|', '€']);

export function smsSegments(message) {
  const text = String(message || '');
  if (!text) return { characters: 0, segments: 0, encoding: 'GSM-7' };
  const gsm = GSM_BASIC.test(text);
  if (!gsm) {
    const characters = [...text].length;
    return {
      characters,
      segments: characters <= 70 ? 1 : Math.ceil(characters / 67),
      encoding: 'UCS-2',
    };
  }
  let characters = 0;
  for (const char of text) characters += GSM_EXTENDED.has(char) ? 2 : 1;
  return {
    characters,
    segments: characters <= 160 ? 1 : Math.ceil(characters / 153),
    encoding: 'GSM-7',
  };
}

/**
 * Normalise an Australian mobile to E.164. Accepts 04xx xxx xxx, +614...,
 * 614..., and formatting noise. Returns null for anything that is not an
 * Australian mobile — the sender refuses rather than guessing a country.
 */
export function normalizeAUMobile(value) {
  const digits = String(value || '').replace(/[^\d+]/g, '');
  const bare = digits.startsWith('+') ? digits.slice(1) : digits;
  if (/^614\d{8}$/.test(bare)) return `+${bare}`;
  if (/^04\d{8}$/.test(bare)) return `+61${bare.slice(1)}`;
  return null;
}

/**
 * Rows from any audience source → unique, sendable recipients.
 * Keeps the first row per phone number and records why others were dropped.
 */
export function recipientsFromRows(rows = []) {
  const seen = new Set();
  const recipients = [];
  let missingPhone = 0;
  let invalidPhone = 0;
  let duplicates = 0;
  for (const row of rows) {
    const rawPhone = String(row?.phone || '').trim();
    if (!rawPhone) { missingPhone += 1; continue; }
    const phone = normalizeAUMobile(rawPhone);
    if (!phone) { invalidPhone += 1; continue; }
    if (seen.has(phone)) { duplicates += 1; continue; }
    seen.add(phone);
    recipients.push({
      key: phone,
      name: String(row?.full_name || row?.name || '').trim() || rawPhone,
      phone,
      detail: String(row?.detail || '').trim(),
    });
  }
  return { recipients, missingPhone, invalidPhone, duplicates };
}

export function smsCampaignValidationError({ message, recipients }) {
  const text = String(message || '').trim();
  if (!text) return 'Write the message to send.';
  if (text.length > SMS_MAX_LENGTH) return `SMS messages are limited to ${SMS_MAX_LENGTH} characters.`;
  if (!Array.isArray(recipients) || recipients.length === 0) return 'Tick at least one recipient with a mobile number.';
  if (recipients.length > SMS_MAX_RECIPIENTS) return `Send to at most ${SMS_MAX_RECIPIENTS} people per campaign.`;
  if (recipients.some(recipient => !normalizeAUMobile(recipient.phone))) {
    return 'A ticked recipient no longer has a valid Australian mobile.';
  }
  return null;
}

