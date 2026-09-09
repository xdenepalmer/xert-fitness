import test from 'node:test';
import assert from 'node:assert/strict';
import { installFormData } from './fixtures/admin-form-data.mjs';
import { formDefinitionForResponse, fieldsForResponseRecord } from '../src/lib/formResponseRecord.js';

const url = query => new URL(`https://example.invalid/rest/v1/fixture?${query}`);

test('form fixture preserves server pagination, filtering and list projections', () => {
  const fixture = installFormData();
  const forms = fixture.read('xert_forms', url('select=*&archived_at=is.null'));
  assert.equal(forms.total, 3);
  const first = fixture.read('xert_form_responses', url('select=id,respondent_name,status&form_id=eq.fixture-form-survey&archived_at=is.null&offset=0&limit=500'));
  const second = fixture.read('xert_form_responses', url('select=id,respondent_name,status&form_id=eq.fixture-form-survey&archived_at=is.null&offset=500&limit=500'));
  assert.equal(first.total, 503);
  assert.equal(first.rows.length, 500);
  assert.equal(second.rows.length, 3);
  assert.equal(new Set([...first.rows, ...second.rows].map(row => row.id)).size, 503);
  assert.deepEqual(Object.keys(first.rows[0]), ['id', 'respondent_name', 'status']);
  assert.equal(fixture.read('xert_form_responses', url('form_id=eq.missing')).total, 0);
  first.rows[0].respondent_name = 'Changed';
  assert.notEqual(fixture.read('xert_form_responses', url('limit=1')).rows[0].respondent_name, 'Changed');
  assert.equal(fixture.read('unconfigured', url('')), undefined);
});

test('historical form fixture distinguishes captured, reconstructed and archived answers', () => {
  const fixture = installFormData();
  const current = fixture.read('xert_forms', url('id=eq.fixture-form-survey')).rows[0];
  const captured = fixture.read('xert_form_responses', url('id=eq.fixture-response-001')).rows[0];
  const definition = formDefinitionForResponse(current, captured);
  assert.equal(definition.title, 'Original launch agreement');
  assert.equal(definition.usesSubmissionSnapshot, true);
  const record = fieldsForResponseRecord(definition, captured);
  assert.ok(record.fields.some(field => field.content === 'Original recorded terms — fictional fixture only.'));
  assert.ok(record.administrativeAnswers.some(field => field.id === 'internal' && field.reason === 'hidden'));
  assert.ok(record.unmatchedAnswers.some(field => field.id === 'retired-field'));
  const legacy = fixture.read('xert_form_responses', url('id=eq.fixture-response-002')).rows[0];
  const legacyDefinition = formDefinitionForResponse(current, legacy);
  assert.equal(legacyDefinition.isReconstructed, true);
  assert.ok(fieldsForResponseRecord(legacyDefinition, legacy).unverifiedLayoutItems.length > 0);
  assert.ok(captured.respondent_email.endsWith('@example.invalid'));
  assert.ok(captured.source_url.startsWith('https://example.invalid/'));
});
