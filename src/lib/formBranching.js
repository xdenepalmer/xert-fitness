const CHOICE_TYPES = new Set(['single_choice', 'multiple_choice', 'dropdown', 'yes_no']);
const LAYOUT_TYPES = new Set(['section_break', 'statement']);

/** Returns field IDs omitted by the form's forward-only branch rules. */
export function computeSkippedQuestionIDs(questions, answers) {
  const skipped = new Set();
  questions.forEach((question, index) => {
    if (skipped.has(question.id)) return;
    if (!CHOICE_TYPES.has(question.type)) return;
    const answer = answers[question.id];
    const rule = (question.skip_rules || []).find(candidate => {
      if (question.type === 'multiple_choice') return Array.isArray(answer) && answer.length === 1 && answer[0] === candidate.option;
      return answer === candidate.option;
    });
    const target = Number(rule?.skip_to);
    if (!Number.isInteger(target) || target <= index + 2) return;
    for (let step = index + 2; step < Math.min(target, questions.length + 1); step += 1) {
      const skippedID = questions[step - 1]?.id;
      if (skippedID) skipped.add(skippedID);
    }
  });
  return skipped;
}

/**
 * Groups informational layout blocks with the next answer field while keeping
 * the builder's complete, one-based skip destination sequence authoritative.
 * `omitted` names questions this respondent is not asked at all.
 * A trailing statement becomes its own review step so it is never silently
 * omitted before submission.
 */
export function buildPublicFormSteps(questions, answers, omitted = []) {
  const items = Array.isArray(questions) ? questions : [];
  // Questions that do not apply to this respondent join the skipped set rather
  // than being removed from the list: skip destinations are one-based
  // positions in the published definition, and dropping an item would silently
  // move every destination after it.
  const skipped = computeSkippedQuestionIDs(items, answers || {});
  for (const id of omitted) skipped.add(id);
  const steps = [];
  let information = [];

  items.forEach(item => {
    if (!item || item.hidden || skipped.has(item.id)) return;
    if (LAYOUT_TYPES.has(item.type)) {
      information.push(item);
      return;
    }
    steps.push({ information, question: item });
    information = [];
  });

  if (information.length) steps.push({ information, question: null });
  return { skipped, steps };
}
