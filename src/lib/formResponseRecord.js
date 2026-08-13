import { computeSkippedQuestionIDs } from './formBranching.js';

const RESPONSE_LAYOUT_TYPES = new Set(['section_break', 'statement']);
const MAX_SIGNATURE_DATA_URL_LENGTH = 524_288;

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function stringField(source, key, fallback = '') {
  return isRecord(source) && typeof source[key] === 'string' ? source[key] : fallback;
}

export function safeResponseMediaURL(value) {
  if (typeof value !== 'string' || value.length > 2048) return '';
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch {
    return '';
  }
}

/**
 * Resolves the form definition that existed when a response was submitted.
 * New records carry a server-written snapshot; legacy records safely fall back
 * to the current form without ever combining mismatched question sets.
 */
export function formDefinitionForResponse(form, response) {
  const current = isRecord(form) ? form : {};
  const snapshot = isRecord(response?.form_snapshot) ? response.form_snapshot : null;
  const hasSnapshotQuestions = Array.isArray(snapshot?.questions);
  const source = hasSnapshotQuestions ? snapshot : current;
  const snapshotSource = stringField(response, 'snapshot_source', stringField(snapshot, 'snapshot_source', stringField(snapshot, 'source')));
  const reconstructedSnapshot = snapshotSource === 'legacy_backfill';

  return {
    title: stringField(source, 'title', stringField(current, 'title', 'Untitled form')).trim() || 'Untitled form',
    description: stringField(source, 'description', stringField(current, 'description')),
    formType: stringField(source, 'form_type', stringField(current, 'form_type', 'custom')),
    slug: stringField(source, 'slug', stringField(current, 'slug')),
    headerMediaType: stringField(source, 'header_media_type', hasSnapshotQuestions ? '' : stringField(current, 'header_media_type')),
    headerMediaURL: stringField(source, 'header_media_url', hasSnapshotQuestions ? '' : stringField(current, 'header_media_url')),
    headerMediaCaption: stringField(source, 'header_media_caption', hasSnapshotQuestions ? '' : stringField(current, 'header_media_caption')),
    questions: (Array.isArray(source.questions) ? source.questions : []).filter(isRecord),
    usesSubmissionSnapshot: hasSnapshotQuestions && !reconstructedSnapshot,
    isReconstructed: !hasSnapshotQuestions || reconstructedSnapshot,
  };
}

/**
 * Produces the original form fields plus every answer key that cannot be tied
 * to that definition. This ensures edits or malformed historical definitions
 * can never make submitted data silently disappear from an owner's record.
 */
export function fieldsForResponseRecord(definition, response) {
  const answers = isRecord(response?.answers) ? response.answers : {};
  const skippedIDs = computeSkippedQuestionIDs(definition?.questions || [], answers);
  const matchedAnswerIDs = new Set();
  const fields = [];
  const administrativeAnswers = [];
  const skippedItems = [];
  const unverifiedLayoutItems = [];

  (definition?.questions || []).forEach((question, index) => {
    const id = typeof question.id === 'string' ? question.id : '';
    const hasAnswer = Boolean(id) && own(answers, id);
    if (hasAnswer) matchedAnswerIDs.add(id);

    const type = typeof question.type === 'string' ? question.type : 'short_text';
    const isLayout = RESPONSE_LAYOUT_TYPES.has(type);
    if (id && skippedIDs.has(id)) {
      // Submission removes skipped answers before writing. Should historical
      // data contain one, it remains visible in archival data instead of being
      // represented as a field the respondent completed.
      if (hasAnswer) administrativeAnswers.push({ id, question, answer: answers[id], reason: 'branched' });
      skippedItems.push({ id, type });
      return;
    }
    // Hidden fields and layout were not shown to the respondent. Never place
    // them in the filled-form body. If one carries a historical value, retain
    // it separately as administrative data without implying it was answered.
    if (question.hidden) {
      if (hasAnswer) administrativeAnswers.push({ id, question, answer: answers[id], reason: 'hidden' });
      return;
    }
    if (definition?.isReconstructed && isLayout) {
      unverifiedLayoutItems.push({ ...question, id, type });
      return;
    }

    fields.push({
      ...question,
      id,
      type,
      recordKey: id ? `${id}-${index}` : `field-${index}`,
      answer: hasAnswer ? answers[id] : undefined,
      hasAnswer,
      isLayout,
    });
  });

  const unmatchedAnswers = Object.entries(answers)
    .filter(([id]) => !matchedAnswerIDs.has(id))
    .map(([id, answer]) => ({ id, answer }));

  return { fields, administrativeAnswers, unmatchedAnswers, skippedItems, unverifiedLayoutItems };
}

export function responseAnswerIsPresent(value) {
  if (Array.isArray(value)) return value.some(responseAnswerIsPresent);
  if (isRecord(value)) return Object.values(value).some(responseAnswerIsPresent);
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function humanizeKey(key) {
  return String(key || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

export function formatResponseAnswer(value) {
  if (!responseAnswerIsPresent(value)) return '';
  if (Array.isArray(value)) return value.filter(responseAnswerIsPresent).map(formatResponseAnswer).join(', ');
  if (isRecord(value)) {
    return Object.entries(value)
      .filter(([, item]) => responseAnswerIsPresent(item))
      .map(([key, item]) => `${humanizeKey(key)}: ${formatResponseAnswer(item)}`)
      .join('\n');
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

export function responseFileDetails(value) {
  if (!isRecord(value) || typeof value.name !== 'string' || !value.name.trim()
    || (!own(value, 'size') && !own(value, 'type'))) return null;
  const size = Number(value.size);
  const sizeLabel = Number.isFinite(size) && size >= 0
    ? size < 1024
      ? `${Math.round(size)} B`
      : size < 1024 * 1024
        ? `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`
        : `${(size / (1024 * 1024)).toFixed(size < 10 * 1024 * 1024 ? 1 : 0)} MB`
    : '';
  return {
    name: value.name.trim(),
    type: typeof value.type === 'string' ? value.type.trim() : '',
    sizeLabel,
  };
}

export function safeResponseSignatureURL(value) {
  if (typeof value !== 'string' || value.length > MAX_SIGNATURE_DATA_URL_LENGTH) return null;
  return /^data:image\/(?:png|jpeg);base64,[a-z0-9+/]+={0,2}$/i.test(value) ? value : null;
}
