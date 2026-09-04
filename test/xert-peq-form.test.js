import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  XERT_PEQ_FORM_DEFINITION,
  XERT_PEQ_FORM_ID,
  validateXertPeqFormDefinition,
} from '../src/lib/xertPeqForm.js';

test('the PEQ has a record of its own, separate from the signed terms history', () => {
  assert.equal(XERT_PEQ_FORM_ID, '000cc2da-1c51-59bf-a33e-c76bee4d7188');
  assert.equal(XERT_PEQ_FORM_DEFINITION.slug, 'peq');
  assert.equal(XERT_PEQ_FORM_DEFINITION.form_type, 'waiver');
  assert.equal(validateXertPeqFormDefinition(), null);
  assert.ok(XERT_PEQ_FORM_DEFINITION.questions.length <= 100);
});

test('the pre-exercise screen requires explicit Yes or No for every reference question', () => {
  const healthQuestions = XERT_PEQ_FORM_DEFINITION.questions.filter(question => question.type === 'yes_no')
    .filter(question => !/Friends Train Free|photos or video/i.test(question.question));
  assert.equal(healthQuestions.length, 8);
  assert.ok(healthQuestions.every(question => question.required));
  assert.match(healthQuestions.map(question => question.question).join('\n'), /stroke/i);
  assert.match(healthQuestions.map(question => question.question).join('\n'), /heart condition/i);
  assert.match(healthQuestions.map(question => question.question).join('\n'), /asthma attack/i);
  assert.match(healthQuestions.map(question => question.question).join('\n'), /muscle, bone or joint/i);
});

test('the declaration mirrors the supplied paper structure and uses conditional guardian and referral fields', () => {
  const allText = XERT_PEQ_FORM_DEFINITION.questions
    .map(question => `${question.question}\n${question.content}\n${question.description}`)
    .join('\n');
  assert.match(allText, /Risk warning & participant acknowledgement/i);
  assert.match(allText, /maximum extent permitted by applicable law/i);
  assert.match(allText, /cannot lawfully be excluded/i);
  assert.doesNotMatch(allText, /XERT representative/i, 'staff sign-off belongs on paper, not in the member\u2019s form');
  // No age question: the date of birth decides it. The guardian signs here and
  // again on the agreement, because they are two separate documents.
  assert.doesNotMatch(allText, /Is the participant under 18/i);
  const guardians = XERT_PEQ_FORM_DEFINITION.questions.filter(question => question.minor_only);
  assert.deepEqual(guardians.map(question => question.question),
    ['Parent or guardian first and last name', 'Parent or guardian signature']);
  assert.ok(guardians.every(question => question.required === false),
    'an adult submission must be accepted without them');
  // The full name is asked once, in Participant details.
  assert.doesNotMatch(allText, /Participant name/i);
  // Nothing is asked twice: the date of birth is the age, and it is the only
  // thing that decides whether a guardian must sign.
  assert.equal(XERT_PEQ_FORM_DEFINITION.questions.filter(question => /^age/i.test(question.question || '')).length, 0);
  // The complimentary trial is a membership term, not a health question.
  // A signature carries its own date, so nobody is asked to type one.
  assert.doesNotMatch(allText, /Date signed/i);
  assert.equal(XERT_PEQ_FORM_DEFINITION.questions.filter(question => question.type === 'date').length, 1);
  assert.doesNotMatch(allText, /free trial/i);
  assert.match(allText, /Friends Train Free Saturdays campaign/i);
  assert.match(allText, /consent to XERT using identifiable photos or video/i);

  const referralQuestion = XERT_PEQ_FORM_DEFINITION.questions.find(question => /Friends Train Free/i.test(question.question));
  assert.deepEqual(referralQuestion.skip_rules, [{ option: 'No', skip_to: 33 }]);
});

test('digital Yes/No and one-option consents show visible checkbox controls while retaining radio semantics', async () => {
  const source = await readFile(new URL('../src/pages/PublicForm.jsx', import.meta.url), 'utf8');
  assert.match(source, /role="radiogroup"/);
  assert.match(source, /role="radio"/);
  assert.match(source, /grid h-6 w-6 shrink-0 place-items-center border-2/);
  assert.match(source, /compactConsent/);
  assert.match(source, /aria-checked=\{checked\}/);
});
