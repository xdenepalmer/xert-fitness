import { supabase } from '@/lib/supabase';
import { protectCSVFormula } from '@/lib/csvSafety';
export { computeSkippedQuestionIDs } from '@/lib/formBranching';

export const FORM_TYPES = Object.freeze([
  ['contact', 'Contact Form'], ['registration', 'Registration'], ['application', 'Application'],
  ['feedback', 'Feedback'], ['booking', 'Booking Request'], ['survey', 'Survey'],
  ['quiz', 'Quiz / Assessment'], ['waiver', 'Waiver / Consent'], ['order', 'Order / Request'],
  ['custom', 'Custom Form'],
].map(([value, label]) => ({ value, label })));

export const FIELD_TYPES = Object.freeze([
  ['Text', 'short_text', 'Short text'], ['Text', 'long_text', 'Long text'],
  ['Text', 'number', 'Number'], ['Text', 'email', 'Email'], ['Text', 'phone', 'Phone'],
  ['Text', 'url', 'Website / URL'], ['Choice', 'single_choice', 'Single choice'],
  ['Choice', 'multiple_choice', 'Multiple choice'], ['Choice', 'dropdown', 'Dropdown'],
  ['Choice', 'yes_no', 'Yes / No'], ['Rating', 'star_rating', 'Star rating'],
  ['Rating', 'linear_scale', 'Linear scale'], ['Rating', 'nps', 'NPS score'],
  ['Date', 'date', 'Date'], ['Date', 'time', 'Time'], ['Date', 'datetime', 'Date & time'],
  ['Other', 'file_upload', 'File upload'], ['Other', 'signature', 'Signature'],
  ['Other', 'address', 'Address'], ['Other', 'name_fields', 'Name fields'],
  ['Layout', 'section_break', 'Section break'], ['Layout', 'statement', 'Statement'],
].map(([group, value, label]) => ({ group, value, label })));

export const CHOICE_TYPES = new Set(['single_choice', 'multiple_choice', 'dropdown', 'yes_no']);
export const CHARTABLE_TYPES = new Set(['single_choice', 'multiple_choice', 'dropdown', 'yes_no', 'star_rating', 'linear_scale', 'nps']);
export const INPUT_TYPES = new Set(FIELD_TYPES.filter(field => field.group !== 'Layout').map(field => field.value));

export function createField(type = 'short_text') {
  return {
    id: crypto.randomUUID(), type, question: '', description: '', required: false,
    hidden: false, placeholder: '', options: ['Option 1', 'Option 2', 'Option 3'],
    allow_other: false, scale_min: type === 'nps' ? 0 : 1, scale_max: type === 'star_rating' ? 5 : 10,
    scale_min_label: '', scale_max_label: '', media_type: null, media_url: '',
    media_caption: '', correct_answer: null, points: 0, content: '', skip_rules: [],
  };
}

export function slugifyFormTitle(title) {
  const stem = String(title || 'form').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'form';
  return `${stem.slice(0, 84)}-${crypto.randomUUID().slice(0, 6)}`;
}

export function createFormDraft(type = 'survey', title = '') {
  const label = FORM_TYPES.find(item => item.value === type)?.label || 'Form';
  const resolvedTitle = title.trim() || `New ${label}`;
  return {
    title: resolvedTitle, description: '', form_type: type, slug: slugifyFormTitle(resolvedTitle),
    questions: [createField()], is_active: false, show_progress_bar: true,
    thank_you_message: 'Thanks — your response has been received.', redirect_url: '',
    header_media_type: null, header_media_url: '', header_media_caption: '',
    collect_name: true, collect_name_required: false, collect_email: true,
    collect_email_required: false, collect_phone: false, collect_phone_required: false,
    one_response_per_email: false, notify_admin: true, tags: [], prerequisite_form_id: null,
  };
}

export function publicFormPath(form) {
  return `/forms/${encodeURIComponent(form.slug)}`;
}

export function publicFormURL(form) {
  return new URL(publicFormPath(form), window.location.origin).toString();
}

export function activeQuestions(form) {
  return (form?.questions || []).filter(question => !question.hidden && INPUT_TYPES.has(question.type));
}

export function answerIsPresent(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.values(value).some(answerIsPresent);
  return value !== undefined && value !== null && String(value).trim() !== '';
}

export function validateFormDraft(form) {
  if (!form.title?.trim()) return 'Add a form title.';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug || '')) return 'Use lowercase letters, numbers and hyphens in the link slug.';
  const questions = form.questions || [];
  if (!questions.length) return 'Add at least one field.';
  const invalidSkipRule = questions.some((question, index) => (question.skip_rules || []).some(rule => {
    const target = Number(rule?.skip_to);
    return !Number.isInteger(target) || target <= index + 2 || target > questions.length + 1;
  }));
  if (invalidSkipRule) return 'Skip logic can only jump forward to a later field or the end of the form.';
  if (form.one_response_per_email && !form.collect_email_required) return 'Require email before limiting responses by email.';
  const incomplete = questions.find(question => question.type !== 'statement' && question.type !== 'section_break' && !question.question?.trim());
  if (incomplete) return 'Every response field needs a question or label.';
  return null;
}

function throwIfError(error) {
  if (error) throw new Error(error.message || 'The forms service could not complete the request.');
}

export async function listOwnerForms() {
  const { data, error } = await supabase.from('xert_forms').select('*').is('archived_at', null).order('updated_at', { ascending: false }).limit(200);
  throwIfError(error);
  return data || [];
}

export async function saveOwnerForm(form) {
  const allowed = [
    'title', 'description', 'form_type', 'slug', 'questions', 'is_active', 'show_progress_bar',
    'thank_you_message', 'redirect_url', 'header_media_type', 'header_media_url',
    'header_media_caption', 'collect_name', 'collect_name_required', 'collect_email',
    'collect_email_required', 'collect_phone', 'collect_phone_required',
    'one_response_per_email', 'notify_admin', 'tags', 'prerequisite_form_id',
  ];
  const payload = Object.fromEntries(allowed.map(key => [key, form[key]]));
  payload.redirect_url = payload.redirect_url?.trim() || null;
  payload.prerequisite_form_id = payload.prerequisite_form_id || null;
  payload.header_media_type = payload.header_media_type || null;
  if (form.id) {
    const { data, error } = await supabase.from('xert_forms').update(payload).eq('id', form.id).eq('updated_at', form.updated_at).select('*').single();
    throwIfError(error);
    return data;
  }
  const { data, error } = await supabase.from('xert_forms').insert(payload).select('*').single();
  throwIfError(error);
  return data;
}

export async function archiveOwnerForm(form) {
  const { error } = await supabase.from('xert_forms').update({ is_active: false, archived_at: new Date().toISOString() }).eq('id', form.id).eq('updated_at', form.updated_at);
  throwIfError(error);
}

const FORM_RESPONSE_PAGE_SIZE = 500;
const FORM_RESPONSE_LIST_FIELDS = [
  'id', 'form_id', 'answers', 'respondent_name', 'respondent_email', 'respondent_phone',
  'status', 'completed_at', 'time_taken_seconds', 'created_at', 'archived_at',
].join(',');

export async function listFormResponses(formID) {
  const responses = [];
  for (let from = 0; ; from += FORM_RESPONSE_PAGE_SIZE) {
    const { data, error } = await supabase.from('xert_form_responses')
      .select(FORM_RESPONSE_LIST_FIELDS)
      .eq('form_id', formID)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + FORM_RESPONSE_PAGE_SIZE - 1);
    throwIfError(error);
    const page = data || [];
    responses.push(...page);
    if (page.length < FORM_RESPONSE_PAGE_SIZE) break;
  }
  return responses;
}

export async function getFormResponse(responseID) {
  const { data, error } = await supabase.from('xert_form_responses').select('*').eq('id', responseID).single();
  throwIfError(error);
  return data;
}

export async function updateFormResponseStatus(responseID, status) {
  const { error } = await supabase.from('xert_form_responses').update({ status }).eq('id', responseID);
  throwIfError(error);
}

export async function archiveFormResponse(responseID) {
  const { error } = await supabase.rpc('xert_archive_form_response', { p_response_id: responseID, p_archived: true });
  throwIfError(error);
}

export async function loadPublicForm(slug) {
  const { data, error } = await supabase.rpc('xert_public_form', { p_slug: slug });
  throwIfError(error);
  return data?.[0] || null;
}

export async function submitPublicForm({ slug, formUpdatedAt, answers, name, email, phone, elapsedSeconds, sourceURL }) {
  const { data, error } = await supabase.rpc('submit_xert_form_response_v2', {
    p_slug: slug, p_answers: answers, p_form_updated_at: formUpdatedAt,
    p_respondent_name: name || null,
    p_respondent_email: email || null, p_respondent_phone: phone || null,
    p_time_taken_seconds: elapsedSeconds, p_source_url: sourceURL,
  });
  throwIfError(error);
  return data;
}

export function responseCSV(form, responses) {
  const questions = activeQuestions(form);
  const escape = value => `"${protectCSVFormula(value).replace(/"/g, '""')}"`;
  const display = value => {
    if (Array.isArray(value)) return value.join('; ');
    if (value && typeof value === 'object') return Object.values(value).filter(Boolean).join(', ');
    return value ?? '';
  };
  const rows = [
    ['Submitted', 'Name', 'Email', 'Phone', 'Status', 'Time (seconds)', ...questions.map(question => question.question)],
    ...responses.map(response => [
      response.completed_at, response.respondent_name, response.respondent_email,
      response.respondent_phone, response.status, response.time_taken_seconds,
      ...questions.map(question => display(response.answers?.[question.id])),
    ]),
  ];
  return rows.map(row => row.map(escape).join(',')).join('\r\n');
}
