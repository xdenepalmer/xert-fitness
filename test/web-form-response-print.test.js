import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  fieldsForResponseRecord, formatResponseAnswer, formDefinitionForResponse,
  responseFileDetails, safeResponseMediaURL, safeResponseSignatureURL,
} from '../src/lib/formResponseRecord.js';
import { waitForPrintableImages } from '../src/lib/printReady.js';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('print records prefer the immutable submission snapshot over an edited form', () => {
  const form = {
    title: 'Edited waiver',
    questions: [{ id: 'current-question', type: 'short_text', question: 'New label' }],
  };
  const response = {
    form_snapshot: {
      title: 'Original waiver', description: 'Terms in force on the day', form_type: 'waiver',
      header_media_type: 'image', header_media_url: 'https://xert.com.au/original-header.jpg',
      header_media_caption: 'Original safety diagram',
      slug: 'original-waiver', questions: [{ id: 'original-question', type: 'yes_no', question: 'I agree' }],
    },
    answers: { 'original-question': 'Yes' },
  };

  const definition = formDefinitionForResponse(form, response);
  const record = fieldsForResponseRecord(definition, response);

  assert.equal(definition.title, 'Original waiver');
  assert.equal(definition.headerMediaURL, 'https://xert.com.au/original-header.jpg');
  assert.equal(definition.headerMediaCaption, 'Original safety diagram');
  assert.equal(definition.usesSubmissionSnapshot, true);
  assert.equal(definition.isReconstructed, false);
  assert.deepEqual(record.fields.map(field => [field.question, field.answer]), [['I agree', 'Yes']]);
  assert.deepEqual(record.unmatchedAnswers, []);
});

test('an older immutable snapshot never borrows newer header media from the edited form', () => {
  const definition = formDefinitionForResponse(
    { title: 'Current', header_media_url: 'https://xert.com.au/new.jpg', questions: [] },
    { form_snapshot: { title: 'Original', questions: [] } },
  );
  assert.equal(definition.headerMediaURL, '');
});

test('legacy and backfilled snapshots are explicitly treated as reconstructed records', () => {
  const current = { title: 'Current form', questions: [{ id: 'terms', type: 'statement', content: 'Current terms' }] };
  const legacy = formDefinitionForResponse(current, { answers: {} });
  const backfilled = formDefinitionForResponse(current, {
    form_snapshot: { title: 'Backfill', snapshot_source: 'legacy_backfill', questions: [] },
  });

  assert.equal(legacy.isReconstructed, true);
  assert.equal(legacy.usesSubmissionSnapshot, false);
  assert.equal(backfilled.isReconstructed, true);
  assert.equal(backfilled.usesSubmissionSnapshot, false);
  const record = fieldsForResponseRecord(legacy, { answers: {} });
  assert.equal(record.fields.length, 0);
  assert.deepEqual(record.unverifiedLayoutItems.map(item => item.id), ['terms']);
});

test('branched consent content is not represented as seen or unanswered', () => {
  const questions = [
    { id: 'member', type: 'yes_no', question: 'Are you a member?', skip_rules: [{ option: 'No', skip_to: 4 }] },
    { id: 'terms', type: 'statement', content: 'Member-only terms and conditions' },
    { id: 'consent', type: 'yes_no', question: 'Accept member terms?' },
    { id: 'contact', type: 'short_text', question: 'How can we help?' },
  ];
  const definition = { questions };
  const record = fieldsForResponseRecord(definition, {
    answers: { member: 'No', contact: 'Casual visit' },
  });

  assert.deepEqual(record.fields.map(field => field.id), ['member', 'contact']);
  assert.deepEqual(record.skippedItems.map(field => field.id), ['terms', 'consent']);
  assert.equal(record.administrativeAnswers.length, 0);
  assert.equal(record.unmatchedAnswers.length, 0);
});

test('hidden, branched, and unmatched historical values remain complete without entering the visible form', () => {
  const definition = {
    questions: [
      { id: 'route', type: 'yes_no', question: 'Route?', skip_rules: [{ option: 'No', skip_to: 3 }] },
      { id: 'branched', type: 'short_text', question: 'Branched field' },
      { id: 'hidden', type: 'short_text', question: 'Internal note', hidden: true },
      { id: 'visible', type: 'short_text', question: 'Visible field' },
    ],
  };
  const record = fieldsForResponseRecord(definition, {
    answers: { route: 'No', branched: 'stale value', hidden: 'admin value', visible: 'answer', orphan: 'preserved' },
  });

  assert.deepEqual(record.fields.map(field => field.id), ['route', 'visible']);
  assert.deepEqual(record.administrativeAnswers.map(field => [field.id, field.reason]), [
    ['branched', 'branched'], ['hidden', 'hidden'],
  ]);
  assert.deepEqual(record.unmatchedAnswers, [{ id: 'orphan', answer: 'preserved' }]);
});

test('structured, file, and signature answers receive safe printable representations', () => {
  assert.equal(formatResponseAnswer({ street: '10 Gym St', suburb: 'Byron Bay', empty: '' }), 'Street: 10 Gym St\nSuburb: Byron Bay');
  assert.deepEqual(responseFileDetails({ name: 'waiver.pdf', size: 2048, type: 'application/pdf' }), {
    name: 'waiver.pdf', sizeLabel: '2.0 KB', type: 'application/pdf',
  });
  assert.equal(safeResponseSignatureURL('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
  assert.equal(safeResponseSignatureURL('data:image/svg+xml;base64,AAAA'), null);
  assert.equal(safeResponseSignatureURL('javascript:alert(1)'), null);
});

test('print waits for image decode settlement without a broken signature blocking the record', async () => {
  let decoded = 0;
  const images = [
    { decode: async () => { decoded += 1; } },
    { decode: async () => { decoded += 1; throw new Error('broken historical image'); } },
  ];
  const results = await waitForPrintableImages({ querySelectorAll: selector => selector === 'img' ? images : [] });
  assert.equal(decoded, 2);
  assert.deepEqual(results.map(result => result.status), ['fulfilled', 'rejected']);
});

test('printable media references allow only non-credentialed http links', () => {
  assert.equal(safeResponseMediaURL('https://xert.com.au/forms/media?id=1'), 'https://xert.com.au/forms/media?id=1');
  assert.equal(safeResponseMediaURL('javascript:alert(1)'), '');
  assert.equal(safeResponseMediaURL('https://owner:secret@example.com/file'), '');
});

test('web response detail is selectable, navigable, and print/PDF scoped', async () => {
  const [manager, detail, css] = await Promise.all([
    read('../src/components/admin/FormsSurveysManager.jsx'),
    read('../src/components/admin/FormResponseRecord.jsx'),
    read('../src/index.css'),
  ]);

  assert.match(manager, /selectedResponseID[\s\S]*View full form/);
  assert.match(manager, /<FormResponseRecord[\s\S]*responses=\{responses\}[\s\S]*onSelect=\{setSelectedResponseID\}/);
  assert.match(manager, /Search name, email or phone/);
  assert.match(detail, /All responses[\s\S]*Newer[\s\S]*Older[\s\S]*Print \/ Save PDF/);
  assert.match(detail, /window\.print\(\)/);
  assert.match(detail, /await waitForPrintableImages\(recordRef\.current\)[\s\S]*window\.print\(\)/);
  assert.match(detail, /Configured \{field\.media_type \|\| 'media'\} reference/);
  assert.match(detail, /Configured \{definition\.headerMediaType \|\| 'header media'\} reference/);
  assert.match(detail, /external URL may change/);
  assert.match(detail, /timeZone: 'Australia\/Brisbane'[\s\S]*timeZoneName: 'short'/);
  assert.match(detail, /Unmatched archived answers/);
  assert.match(detail, /Legacy reconstructed record/);
  assert.match(css, /@media print[\s\S]*body\.xert-response-detail-open[\s\S]*\.xert-response-print-record/);
  assert.match(css, /\.xert-print-controls[\s\S]*display: none !important/);
  assert.match(css, /break-inside: avoid/);
  assert.match(css, /html:has\(body\.xert-response-detail-open\)[\s\S]*background: #fff !important/);
  assert.match(css, /\.xert-response-print-record[\s\S]*margin: 0 !important/);
});
