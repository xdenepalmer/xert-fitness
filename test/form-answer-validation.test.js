import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ANSWER_LIMITS, answerValidationMessage, firstInvalidAnswer } from '../src/lib/formAnswerValidation.js';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('an email the database would refuse is caught at the question, not at submit', () => {
  // The browser accepts "name@gmail" in <input type="email">; the database does
  // not, and used to reject the whole submission on the final screen.
  assert.match(answerValidationMessage({ type: 'email' }, 'name@gmail'), /including the part after the dot/);
  assert.match(answerValidationMessage({ type: 'email' }, 'name @gmail.com'), /complete email address/);
  assert.equal(answerValidationMessage({ type: 'email' }, 'name@gmail.com'), null);
  assert.equal(answerValidationMessage({ type: 'email' }, 'deneop24@bigpond.com.au'), null);
  assert.equal(answerValidationMessage({ type: 'email' }, ''), null, 'blank is the required check, not a format error');
  assert.equal(answerValidationMessage({ type: 'email' }, `${'a'.repeat(320)}@example.com`), 'Keep this answer under 320 characters.');
});

test('the client limits match the database limits exactly', async () => {
  const sql = await read('../supabase/migrations/20260813010000_xert_form_response_snapshots.sql');
  for (const [type, limit] of Object.entries(ANSWER_LIMITS)) {
    const pattern = new RegExp(`v_question_type (?:=|in \\\\()[^\\n]*'${type}'[^\\n]*(?:\\\\))?[^\\n]*char_length\\\\(v_answer_text\\\\) > ${limit}`);
    assert.match(sql.replace(/\s+/g, ' '), new RegExp(`'${type}'[^;]{0,120}char_length\\(v_answer_text\\) > ${limit}`), `${type} limit must mirror the database`);
    assert.ok(pattern instanceof RegExp);
  }
  assert.match(sql, /v_answer_text !~ '\^\[\^@\[:space:\]\]\+@\[\^@\[:space:\]\]\+\\\.\[\^@\[:space:\]\]\+\$'/);
});

test('choice answers must be one of the published options', () => {
  assert.equal(answerValidationMessage({ type: 'yes_no' }, 'Yes'), null);
  assert.match(answerValidationMessage({ type: 'yes_no' }, 'Maybe'), /Choose Yes or No/);
  assert.match(answerValidationMessage({ type: 'single_choice', options: ['A', 'B'] }, 'C'), /options listed/);
  assert.equal(answerValidationMessage({ type: 'single_choice', options: ['A'], allow_other: true }, 'C'), null);
  assert.match(answerValidationMessage({ type: 'number' }, 'twelve'), /Enter a number/);
});

test('a failed submission returns the respondent to the question that needs fixing', async () => {
  const questions = [{ id: 'a', type: 'short_text' }, { id: 'b', type: 'email' }, { id: 'c', type: 'yes_no' }];
  const offender = firstInvalidAnswer(questions, { a: 'fine', b: 'name@gmail', c: 'Yes' });
  assert.equal(offender.question.id, 'b');
  assert.equal(firstInvalidAnswer(questions, { a: 'fine', b: 'name@gmail.com', c: 'Yes' }), null);

  const source = await read('../src/pages/PublicForm.jsx');
  assert.match(source, /const answerProblem = question \? answerValidationMessage\(question, answers\[question\.id\]\) : null;/);
  assert.match(source, /const offender = firstInvalidAnswer\(/);
  assert.match(source, /if \(target >= 0\) setStep\(target \+ 1\);/);
});
