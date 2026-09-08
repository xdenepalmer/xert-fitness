// ─── Reading a question's answers side by side ──────────────────────────────
/**
 * The answers to one question, numbered by which respondent gave them.
 *
 * The overview lists every question's answers side by side, and staff read
 * across them: "who is number seven". Numbering each list 1..n independently
 * would break that the moment somebody skipped a question — name #7 and phone
 * #7 would be different people. So the number is the respondent's position in
 * the response list, and a skipped answer leaves a gap rather than shifting
 * everyone below it.
 */
export function numberedAnswers(responses, questionId) {
  const numbered = [];
  (responses || []).forEach((response, index) => {
    const value = response?.answers?.[questionId];
    if (value === undefined || value === null || value === '') return;
    const text = Array.isArray(value)
      ? value.filter(entry => entry !== null && entry !== undefined && entry !== '').join(', ')
      : value && typeof value === 'object'
        ? Object.values(value).filter(Boolean).join(', ')
        : String(value);
    if (text === '') return;
    numbered.push({ number: index + 1, text, id: response?.id ?? index });
  });
  return numbered;
}
