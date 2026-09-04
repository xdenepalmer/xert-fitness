// ─── Answer validation, matching the database exactly ───────────────────────
// The submit RPC is the authority: it re-checks every answer and refuses the
// whole submission if one is wrong. Left to that alone, somebody who typed
// "name@gmail" reaches the last question, presses Submit and is told only that
// "one or more answers are invalid", with no way to tell which. These rules
// mirror the server's so the same answer is caught at the question it belongs
// to, while it is still on screen.

export const ANSWER_LIMITS = Object.freeze({
  short_text: 1000,
  long_text: 20000,
  email: 320,
  phone: 60,
  url: 2048,
  date: 40,
  time: 40,
  datetime: 40,
});

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function text(value) {
  return typeof value === 'string' ? value : '';
}

function present(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.values(value).some(present);
  return value !== undefined && value !== null && String(value).trim() !== '';
}

/** Returns a message for an answer the database would reject, else null. */
export function answerValidationMessage(question, value) {
  if (!question || !present(value)) return null;
  const type = String(question.type || '');
  const limit = ANSWER_LIMITS[type];
  if (limit && text(value).length > limit) {
    return `Keep this answer under ${limit} characters.`;
  }
  if (type === 'email' && !EMAIL_PATTERN.test(text(value).trim())) {
    return 'Enter a complete email address, including the part after the dot — for example name@example.com.au.';
  }
  if (type === 'number' && !Number.isFinite(Number(value))) {
    return 'Enter a number.';
  }
  if (['single_choice', 'dropdown'].includes(type) && !question.allow_other) {
    const options = Array.isArray(question.options) ? question.options : [];
    if (options.length && !options.includes(text(value))) return 'Choose one of the options listed.';
  }
  if (type === 'yes_no' && !['Yes', 'No'].includes(text(value))) {
    return 'Choose Yes or No.';
  }
  return null;
}

/**
 * The first answer the database would reject, so a failed submission can send
 * the respondent back to the exact question instead of a dead end.
 */
export function firstInvalidAnswer(questions, answers = {}) {
  for (const question of questions || []) {
    const message = answerValidationMessage(question, answers?.[question.id]);
    if (message) return { question, message };
  }
  return null;
}
