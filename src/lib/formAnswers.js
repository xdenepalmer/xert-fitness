// ─── Reading a form's written answers ───────────────────────────────────────
// The overview used to show one list per question, side by side: a column of
// names, a column of dates of birth, a column of mobiles. Reading them meant
// counting down each list and hoping the rows still lined up — and they stop
// lining up the moment somebody skips a question. These build the answers into
// one table instead, a row per person, so the name is next to the answer.

import { respondentIdentity, respondentLabel } from './formResponseRecord.js';

/** One answer rendered as a single readable line. Empty means "not answered". */
export function answerText(value) {
  if (value === undefined || value === null || value === '') return '';
  if (Array.isArray(value)) {
    return value.filter(entry => entry !== null && entry !== undefined && entry !== '').join(', ');
  }
  if (typeof value === 'object') return Object.values(value).filter(Boolean).join(', ');
  return String(value);
}

/**
 * The answers to one question, numbered by which respondent gave them.
 *
 * The number is the respondent's position in the response list, so a skipped
 * answer leaves a gap rather than shifting everyone below it. Kept for the
 * places that still show a single question's answers on their own.
 */
export function numberedAnswers(responses, questionId) {
  const numbered = [];
  (responses || []).forEach((response, index) => {
    const text = answerText(response?.answers?.[questionId]);
    if (text === '') return;
    numbered.push({ number: index + 1, text, id: response?.id ?? index });
  });
  return numbered;
}

/** The words in a name, lowercased and sorted, so "Collins, Aleisha" and
 *  "Aleisha Collins" compare equal. */
function nameKey(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .sort()
    .join(' ');
}

/**
 * Written answers as a table: a row per person, a column per question.
 *
 * Only people who wrote at least one answer get a row, and only questions
 * somebody actually answered get a column — a form with a dozen optional
 * fields should not produce a dozen empty columns to scroll past.
 */
export function answerTable(responses, questions) {
  const asked = (questions || []).filter(question => question && question.id);
  const rows = [];

  (responses || []).forEach((response, index) => {
    const cells = {};
    let answered = false;
    for (const question of asked) {
      const text = answerText(response?.answers?.[question.id]);
      cells[question.id] = text;
      if (text !== '') answered = true;
    }
    if (!answered) return;
    rows.push({
      id: response?.id ?? index,
      number: index + 1,
      person: respondentLabel(response),
      // A record with no stored name falls back to an email address. The name
      // they typed on the form is better, and the next step adopts it.
      named: Boolean(respondentIdentity(response).name),
      completedAt: response?.completed_at || null,
      cells,
    });
  });

  const answered = asked.filter(question => rows.some(row => row.cells[question.id] !== ''));

  // The person column already holds the name they typed, so the question that
  // asked for it repeats itself: "Aleisha Collins" beside "Collins, Aleisha".
  // Find that question — every named person's answer is their own name — and
  // let it fill in the people whose record has no name instead of an email.
  const nameColumn = answered.find(question => {
    let matched = false;
    for (const row of rows) {
      const text = row.cells[question.id];
      if (text === '' || !row.named) continue;
      if (nameKey(text) !== nameKey(row.person)) return false;
      matched = true;
    }
    return matched;
  });
  if (nameColumn) {
    for (const row of rows) {
      const typed = row.cells[nameColumn.id];
      if (!row.named && typed !== '') row.person = typed;
    }
  }

  const columns = answered
    .filter(question => question !== nameColumn)
    .map(question => ({
      id: question.id,
      label: String(question.question || question.content || 'Answer'),
    }));

  return { columns, rows };
}
