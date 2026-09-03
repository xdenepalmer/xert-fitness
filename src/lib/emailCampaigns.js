// ─── Email campaigns (Resend via the admin_send_bulk_email RPC) ──────────────
// Pure audience shaping and validation for "Email members", testable under
// node. The database does the sending; the browser only chooses who and what.

export const EMAIL_MAX_RECIPIENTS = 500;
/** The database paces sends to stay under the provider's rate limit, so each call carries at most this many people. */
export const EMAIL_CHUNK_SIZE = 40;
export const EMAIL_SUBJECT_MAX_LENGTH = 150;
export const EMAIL_BODY_MAX_LENGTH = 5000;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmailAddress(value) {
  const email = String(value || '').trim().toLowerCase();
  return EMAIL_PATTERN.test(email) && email.length <= 320 ? email : null;
}

/**
 * Rows from any audience source → unique, emailable recipients.
 * Keeps the first row per address and records why others were dropped.
 */
export function emailRecipientsFromRows(rows = []) {
  const seen = new Set();
  const recipients = [];
  let missingEmail = 0;
  let invalidEmail = 0;
  let duplicates = 0;
  for (const row of rows) {
    const raw = String(row?.email || '').trim();
    if (!raw) { missingEmail += 1; continue; }
    const email = normalizeEmailAddress(raw);
    if (!email) { invalidEmail += 1; continue; }
    if (seen.has(email)) { duplicates += 1; continue; }
    seen.add(email);
    recipients.push({
      key: email,
      email,
      name: String(row?.full_name || row?.name || '').trim() || email,
      detail: String(row?.detail || '').trim(),
    });
  }
  return { recipients, missingEmail, invalidEmail, duplicates };
}

export function emailCampaignValidationError({ subject, body, recipients, ctaLabel, ctaUrl }) {
  const subjectText = String(subject || '').trim();
  const bodyText = String(body || '').trim();
  if (!subjectText) return 'Write a subject line.';
  if (subjectText.length > EMAIL_SUBJECT_MAX_LENGTH) return `Subject lines are limited to ${EMAIL_SUBJECT_MAX_LENGTH} characters.`;
  if (!bodyText) return 'Write the message to send.';
  if (bodyText.length > EMAIL_BODY_MAX_LENGTH) return `Emails are limited to ${EMAIL_BODY_MAX_LENGTH} characters.`;
  if (!Array.isArray(recipients) || recipients.length === 0) return 'Tick at least one recipient with an email address.';
  if (recipients.length > EMAIL_MAX_RECIPIENTS) return `Send to at most ${EMAIL_MAX_RECIPIENTS} people per email.`;
  if (recipients.some(recipient => !normalizeEmailAddress(recipient.email))) {
    return 'A ticked recipient no longer has a valid email address.';
  }
  const label = String(ctaLabel || '').trim();
  const url = String(ctaUrl || '').trim();
  if ((label && !url) || (!label && url)) return 'A button needs both a label and a link.';
  if (url && !/^https:\/\/\S+$/.test(url)) return 'The button link must start with https://.';
  return null;
}

/** The request body the RPC expects: one small object per person, nothing else. */
export function emailCampaignPayload({ subject, body, recipients, audience, greeting = true, ctaLabel, ctaUrl, campaignId = null }) {
  const label = String(ctaLabel || '').trim();
  const url = String(ctaUrl || '').trim();
  return {
    p_subject: String(subject || '').trim(),
    p_body: String(body || '').trim(),
    p_recipients: (recipients || []).map(recipient => ({ email: recipient.email, name: recipient.name === recipient.email ? null : recipient.name })),
    p_audience: audience ? String(audience) : null,
    p_greeting: Boolean(greeting),
    p_cta_label: label && url ? label : null,
    p_cta_url: label && url ? url : null,
    p_campaign_id: campaignId || null,
  };
}

/** Split recipients into the chunks the RPC accepts; the first chunk creates the campaign, later chunks join it. */
export function chunkRecipients(recipients, size = EMAIL_CHUNK_SIZE) {
  const chunks = [];
  const list = Array.isArray(recipients) ? recipients : [];
  for (let index = 0; index < list.length; index += size) chunks.push(list.slice(index, index + size));
  return chunks;
}

/** Merge the results of several chunked sends into one outcome. */
export function mergeCampaignResults(results) {
  return (results || []).reduce((total, result) => ({
    campaign_id: total.campaign_id || result?.campaign_id || null,
    recipients: total.recipients + Number(result?.recipients || 0),
    queued: total.queued + Number(result?.queued || 0),
    skipped: total.skipped + Number(result?.skipped || 0),
    failed: total.failed + Number(result?.failed || 0),
    invalid: total.invalid + Number(result?.invalid || 0),
    results: total.results.concat(Array.isArray(result?.results) ? result.results : []),
  }), { campaign_id: null, recipients: 0, queued: 0, skipped: 0, failed: 0, invalid: 0, results: [] });
}
