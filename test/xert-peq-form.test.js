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
  // Age and guardian sign-off belong to the agreement, not the health screen:
  // the PEQ already records a date of birth, and a guardian signs the
  // agreement they are taking responsibility for.
  assert.doesNotMatch(allText, /under 18/i, 'the PEQ records a date of birth instead');
  assert.doesNotMatch(allText, /Parent or guardian/i);
  assert.match(allText, /Friends Train Free Saturdays campaign/i);
  assert.match(allText, /consent to XERT using identifiable photos or video/i);

  const referralQuestion = XERT_PEQ_FORM_DEFINITION.questions.find(question => /Friends Train Free/i.test(question.question));
  assert.deepEqual(referralQuestion.skip_rules, [{ option: 'No', skip_to: 35 }]);
});

test('digital Yes/No and one-option consents show visible checkbox controls while retaining radio semantics', async () => {
  const source = await readFile(new URL('../src/pages/PublicForm.jsx', import.meta.url), 'utf8');
  assert.match(source, /role="radiogroup"/);
  assert.match(source, /role="radio"/);
  assert.match(source, /grid h-6 w-6 shrink-0 place-items-center border-2/);
  assert.match(source, /compactConsent/);
  assert.match(source, /aria-checked=\{checked\}/);
});
