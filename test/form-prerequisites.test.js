import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  FORM_COMPLETION_TTL_MS, ageInYears, completionIdentity, formPath, minorStatus, nextFormSlug,
  prerequisiteRedirect, readFormCompletion, writeFormCompletion,
} from '../src/lib/formPrerequisites.js';
import { XERT_TERMS_FORM_DEFINITION, XERT_TERMS_FORM_PREREQUISITE_ID, validateXertTermsFormDefinition } from '../src/lib/xertTermsForm.js';
import { XERT_PEQ_FORM_ID } from '../src/lib/xertPeqForm.js';
import { XERT_TERMS_SECTIONS } from '../src/lib/xertTermsAgreement.js';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const fakeStorage = () => {
  const data = new Map();
  return { getItem: key => (data.has(key) ? data.get(key) : null), setItem: (key, value) => data.set(key, value) };
};

test('a gated form sends a first-time visitor to its prerequisite and back again', () => {
  const storage = fakeStorage();
  const terms = { slug: 'terms-and-conditions', prerequisite_slug: 'peq' };
  assert.equal(prerequisiteRedirect(terms, { storage }), '/forms/peq?next=terms-and-conditions');
  assert.equal(nextFormSlug('?next=terms-and-conditions'), 'terms-and-conditions');
  writeFormCompletion('peq', { name: 'Cherie Ashby' }, { storage, now: 1_000 });
  assert.equal(prerequisiteRedirect(terms, { storage, now: 2_000 }), null, 'the gate opens once the PEQ is done');
});

test('a completion marker expires, and a form without a prerequisite is never gated', () => {
  const storage = fakeStorage();
  writeFormCompletion('peq', { name: 'Cherie' }, { storage, now: 1_000 });
  assert.equal(readFormCompletion('peq', { storage, now: 1_000 + FORM_COMPLETION_TTL_MS + 1 }), null);
  assert.equal(readFormCompletion('peq', { storage, now: 0 }), null, 'a marker from the future is ignored');
  assert.equal(prerequisiteRedirect({ slug: 'peq' }, { storage }), null);
  assert.equal(prerequisiteRedirect({ slug: 'peq', prerequisite_slug: 'peq' }, { storage }), null, 'a form cannot gate itself');
});

test('untrusted next and slug values can never become a path', () => {
  assert.equal(nextFormSlug('?next=../admin'), null);
  assert.equal(nextFormSlug('?next=https://evil.example'), null);
  assert.equal(nextFormSlug(''), null);
  assert.equal(formPath('peq'), '/forms/peq');
  assert.equal(formPath('peq', '../admin'), '/forms/peq');
});

test('the name, email and phone already given are carried to the next form', () => {
  const questions = [
    { id: 'blank', type: 'name_fields' },
    { id: 'name', type: 'name_fields' },
    { id: 'email', type: 'email' },
    { id: 'phone', type: 'phone' },
  ];
  const answers = { blank: { first: '  ' }, name: { first: 'Cherie', last: 'Ashby' }, email: ' Cherie@Bigpond.com ', phone: '0400 000 000' };
  assert.deepEqual(completionIdentity(questions, answers, {}), {
    name: 'Cherie Ashby', email: 'cherie@bigpond.com', phone: '0400 000 000', date_of_birth: '',
  });
  assert.deepEqual(completionIdentity([], {}, { name: ' Dene ', email: 'INFO@XERTFITNESS.COM.AU' }), {
    name: 'Dene', email: 'info@xertfitness.com.au', phone: '', date_of_birth: '',
  });
});

test('the date of birth on the questionnaire decides who needs a guardian', () => {
  const today = new Date('2026-09-04T00:00:00Z');
  assert.equal(ageInYears('2008-09-04', today), 18, 'turning 18 today counts as an adult');
  assert.equal(minorStatus({ date_of_birth: '2008-09-04' }, today), 'adult');
  assert.equal(minorStatus({ date_of_birth: '2008-09-05' }, today), 'minor', 'one day short of 18');
  assert.equal(minorStatus({ date_of_birth: '2010-01-01' }, today), 'minor');
  // Never guess: an unusable date leaves the guardian fields askable.
  assert.equal(minorStatus({ date_of_birth: '' }, today), 'unknown');
  assert.equal(minorStatus({ date_of_birth: 'sometime' }, today), 'unknown');
  assert.equal(minorStatus({ date_of_birth: '2027-01-01' }, today), 'unknown', 'a future date proves nothing');
  assert.equal(minorStatus(null, today), 'unknown');

  const dated = [{ id: 'dob', type: 'date', question: 'Date of birth' }, { id: 'signed', type: 'date', question: 'Date signed' }];
  const identity = completionIdentity(dated, { dob: '2010-09-05', signed: '2026-09-04' }, {});
  assert.equal(identity.date_of_birth, '2010-09-05', 'the birthday travels, not the signing date');
});

test('the guardian questions follow that answer instead of asking again', async () => {
  const { XERT_TERMS_FORM_DEFINITION } = await import('../src/lib/xertTermsForm.js');
  const guardians = XERT_TERMS_FORM_DEFINITION.questions.filter(question => question.minor_only);
  assert.equal(guardians.length, 2);
  assert.ok(guardians.every(question => question.required === false),
    'the database must accept an adult submission that omits them');

  const source = await read('../src/pages/PublicForm.jsx');
  assert.match(source, /const audience = useMemo\(\(\) => minorStatus\(carried\), \[carried\]\);/);
  assert.match(source, /\.filter\(item => !\(item\.minor_only && audience === 'adult'\)\)/,
    'an adult is never shown a guardian question');
  assert.match(source, /question\?\.minor_only && audience === 'minor'/,
    'a member under 18 cannot continue without one');
  assert.match(source, /A parent or guardian must complete this for a member under 18\./);
});

test('the terms form is the agreement, gated behind the PEQ, ending in accept or decline', () => {
  const definition = XERT_TERMS_FORM_DEFINITION;
  assert.equal(validateXertTermsFormDefinition(), null);
  assert.equal(definition.slug, 'terms-and-conditions', 'the printed QR code points here');
  assert.equal(XERT_TERMS_FORM_PREREQUISITE_ID, XERT_PEQ_FORM_ID);
  assert.ok(definition.collect_name_required && definition.collect_email_required);

  const ids = definition.questions.map(question => question.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const section of XERT_TERMS_SECTIONS) {
    assert.ok(ids.includes(section.id), `${section.title} is missing from the form`);
  }

  const accept = definition.questions.find(question => question.id === 'tc-accept');
  assert.ok(accept.required);
  assert.deepEqual(accept.options, ['I accept the Terms and Conditions', 'I decline']);
  assert.deepEqual(accept.skip_rules, [{ option: 'I decline', skip_to: definition.questions.length + 1 }],
    'declining ends the form instead of asking for a signature');
  // A guardian signature is itself the record of a member under 18, so the
  // agreement asks for it rather than asking anyone to state their age twice.
  assert.equal(definition.questions.find(question => question.id === 'tc-minor'), undefined);
  const guardianName = definition.questions.find(question => question.id === 'tc-guardian-name');
  const guardianSignature = definition.questions.find(question => question.id === 'tc-guardian-signature');
  assert.equal(guardianName.required, false);
  assert.equal(guardianSignature.required, false);
  assert.match(guardianName.description, /because the member is under 18/);
  const heading = definition.questions.find(question => question.id === 'tc-00-agreement');
  assert.equal(heading.content, 'XERT Fitness Terms and Conditions', 'no date in the heading to go stale');
  assert.equal(definition.questions.at(-1).id, 'tc-guardian-signature');
  assert.equal(definition.questions.find(question => question.id === 'tc-signature').type, 'signature');
});

test('signed responses stay on the form that collected them', async () => {
  // Submitted records are immutable by design: the database refuses to move a
  // response between forms. The terms form therefore keeps the id that has
  // been collecting signed agreements since August 2026, and the PEQ was given
  // a record of its own rather than the history being rewritten.
  const { XERT_TERMS_FORM_ID } = await import('../src/lib/xertTermsForm.js');
  assert.equal(XERT_TERMS_FORM_ID, '0173f880-7bee-4a2e-bb0c-ac15af40ad9e');
  assert.notEqual(XERT_PEQ_FORM_ID, XERT_TERMS_FORM_ID);

  const guard = await read('../supabase/migrations/20260813010000_xert_form_response_snapshots.sql');
  assert.match(guard, /new\.form_id is distinct from old\.form_id/);
  assert.match(guard, /Submitted form records are immutable/);

  // An exported record must show the questions its respondent actually saw.
  const forms = await read('../src/lib/xertForms.js');
  assert.match(forms, /export function responseCSVColumns\(form, responses\)/);
  assert.match(forms, /const snapshot = response\?\.form_snapshot;/);
  assert.match(forms, /'archived_at', 'form_snapshot'/);
});

test('the published agreement and the signed agreement come from one module', async () => {
  // The public terms page and the signed agreement are one document.
  const page = await read('../src/pages/Terms.jsx');
  assert.match(page, /XERT_TERMS_SECTIONS/);
  assert.match(page, /title="Terms And Conditions"/);
  assert.doesNotMatch(page, /TERMS_DEFAULTS|useSiteContent/, 'a signed document is not CMS copy');
  const app = await read('../src/App.jsx');
  assert.match(app, /path="\/membership-terms" element=\{<Navigate to="\/terms" replace \/>\}/,
    'the old address still lands on the agreement');
  const footer = await read('../src/components/public/PublicFooter.jsx');
  assert.match(footer, /Terms &amp; Conditions/);
  const metadata = await read('../src/lib/pageMetadata.js');
  assert.match(metadata, /'\/terms': \{ title: 'Terms and Conditions \| XERT Fitness'/);
  const contentManager = await read('../src/components/admin/ContentManager.jsx');
  assert.doesNotMatch(contentManager, /viewPath: '\/terms'/, 'Site Content must not offer to edit a signed agreement');
  const agreement = await read('../src/lib/xertTermsAgreement.js');
  assert.match(agreement, /ABN 65 327 079 634/);
  assert.match(agreement, /XERT FITNESS MEMBERSHIP OPTIONS/, 'the membership table image is transcribed as text');
  assert.match(agreement, /48 HOUR COOLING OFF PERIOD/);
  // The paper form's ruled signature block has no place in the digital one:
  // the form captures the name, date and signature as real fields, and the
  // long rules forced the reading panel to scroll sideways on a phone.
  assert.doesNotMatch(agreement, /Member Signature: _+/);
  assert.doesNotMatch(agreement, /Guardian Signature: _+/);
  assert.doesNotMatch(agreement, /_{10,}/, 'no ruled lines from the paper form');
  const form = await read('../src/pages/PublicForm.jsx');
  assert.match(form, /overflow-y-auto overflow-x-hidden/);
  assert.match(form, /whitespace-pre-wrap break-words text-sm leading-relaxed/);
});

test('the public form page enforces the gate, hands over and carries details across', async () => {
  const source = await read('../src/pages/PublicForm.jsx');
  assert.match(source, /prerequisiteRedirect\(form\)/);
  assert.match(source, /if \(gatePath\) navigate\(gatePath, \{ replace: true \}\)/);
  assert.match(source, /writeFormCompletion\(slug, completionIdentity\(formItems, kept, \{ name, email, phone \}\)\)/);
  assert.match(source, /const handoff = nextFormSlug\(search\)/);
  assert.match(source, /readFormCompletion\(data\.prerequisite_slug\)/);
  assert.match(source, /role="region"/, 'a long agreement scrolls inside its own panel');

  const sql = await read('../supabase/migrations/20260904010000_form_prerequisites.sql');
  assert.match(sql, /add column if not exists prerequisite_form_id uuid references public\.xert_forms\(id\) on delete set null/);
  assert.match(sql, /check \(prerequisite_form_id is null or prerequisite_form_id <> id\)/);
  assert.match(sql, /prerequisite_slug text/);
  assert.match(sql, /on p\.id = f\.prerequisite_form_id and p\.is_active = true and p\.archived_at is null/,
    'a paused prerequisite must not lock people out');

  const forms = await read('../src/lib/xertForms.js');
  assert.match(forms, /'tags', 'prerequisite_form_id'/);
  const manager = await read('../src/components/admin/FormsSurveysManager.jsx');
  assert.match(manager, /Complete this form first/);
});
