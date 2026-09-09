// Fictional, read-only forms and submissions for the real owner UI.
// Never imported by the app; every mutation remains blocked by the parent fixture.
const questions = [
  { id: 'intro', type: 'statement', content: 'Current form introduction — not the historical agreement.', hidden: false },
  { id: 'experience', type: 'single_choice', question: 'How was your first session?', options: ['Excellent', 'Good', 'Needs improvement'], required: true },
  { id: 'comments', type: 'long_text', question: 'What would you like us to know?', required: false },
];

function makeForm(id, title, type, active, responses) {
  return {
    id, title, description: 'Fictional form for safe local design verification.', form_type: type,
    slug: id.replace('fixture-form-', 'fixture-'), questions: structuredClone(questions),
    is_active: active, response_count: responses, show_progress_bar: true,
    collect_name: true, collect_name_required: true, collect_email: true, collect_email_required: true,
    collect_phone: false, collect_phone_required: false, one_response_per_email: false, notify_admin: true,
    thank_you_message: 'Thanks for your feedback.', redirect_url: null, header_media_type: null,
    header_media_url: null, header_media_caption: '', prerequisite_form_id: null, tags: [], archived_at: null,
    created_at: '2026-08-01T02:00:00Z', updated_at: '2026-09-01T02:00:00Z',
  };
}

export function installFormData() {
  const forms = [
    makeForm('fixture-form-survey', 'Member experience survey', 'survey', true, 503),
    makeForm('fixture-form-registration', 'Coaching registration', 'registration', false, 0),
    makeForm('fixture-form-feedback', 'Post-session feedback', 'feedback', true, 0),
  ];
  const responses = Array.from({ length: 503 }, (_, index) => {
    const number = String(index + 1).padStart(3, '0');
    const date = new Date(Date.UTC(2026, 8, 8, 12) - index * 60000).toISOString();
    return {
      id: `fixture-response-${number}`, form_id: forms[0].id,
      respondent_name: `Form Member ${number}`, respondent_email: `form.member.${number}@example.invalid`, respondent_phone: '',
      status: ['new', 'reviewed', 'followed_up', 'closed'][index % 4],
      completed_at: date, created_at: date, time_taken_seconds: 90 + index % 120, archived_at: null,
      source_url: 'https://example.invalid/forms/fixture-survey',
      answers: { experience: ['Excellent', 'Good', 'Needs improvement'][index % 3], comments: `Fictional response ${number}: clear coaching and a welcoming class.` },
      form_snapshot: structuredClone(forms[0]),
    };
  });
  responses[0].form_snapshot = {
    title: 'Original launch agreement', description: 'Preserved submission-time wording.', form_type: 'registration',
    slug: 'original-launch', questions: [
      { id: 'old-terms', type: 'statement', content: 'Original recorded terms — fictional fixture only.' },
      { id: 'acceptance', type: 'yes_no', question: 'Do you accept these original terms?', required: true },
      { id: 'internal', type: 'short_text', question: 'Internal legacy label', hidden: true },
    ],
  };
  responses[0].answers = { acceptance: 'Yes', internal: 'Archived administrative value', 'retired-field': 'Original unmatched value' };
  responses[1].form_snapshot = null;
  const tables = { xert_forms: forms, xert_form_responses: responses };
  return {
    read(name, url) {
      if (!Object.hasOwn(tables, name)) return undefined;
      const params = url.searchParams;
      let rows = tables[name];
      for (const key of ['id', 'form_id', 'status']) {
        const filter = params.get(key);
        if (filter?.startsWith('eq.')) rows = rows.filter(row => row[key] === filter.slice(3));
      }
      if (params.get('archived_at') === 'is.null') rows = rows.filter(row => row.archived_at === null);
      const total = rows.length;
      const offset = Math.max(0, Number(params.get('offset') || 0));
      const limit = Math.max(0, Number(params.get('limit') || rows.length));
      const fields = params.get('select')?.split(',').map(field => field.trim());
      rows = rows.slice(offset, offset + limit).map(row => fields && !fields.includes('*')
        ? Object.fromEntries(fields.map(field => [field, row[field] ?? null])) : row);
      return { rows: structuredClone(rows), total, offset };
    },
  };
}
