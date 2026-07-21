import assert from 'node:assert/strict';
import test from 'node:test';
import { neutralizeFormula, toCsv } from '../src/lib/csv.js';

test('neutralizeFormula prefixes only cells a spreadsheet would treat as a formula', () => {
  for (const dangerous of ['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '\rx', '\nx',
    '=HYPERLINK("http://evil","x")', '=cmd|\'/c calc\'!A1', '+61412345678']) {
    assert.equal(neutralizeFormula(dangerous), `'${dangerous}`,
      `expected ${JSON.stringify(dangerous)} to be neutralized`);
  }
  // Ordinary values are left untouched (no spurious quote, no data change).
  for (const safe of ['Jane Doe', 'jane@example.com', '0412 345 678', '', '  spaces',
    'a=b', 'price is -5']) {
    assert.equal(neutralizeFormula(safe), safe,
      `expected ${JSON.stringify(safe)} to be unchanged`);
  }
});

test('toCsv neutralizes a formula payload with no comma/quote (bare-cell path)', () => {
  const rows = [{ name: '=2+5+cmd', email: 'a@b.com' }];
  const csv = toCsv(rows, [{ key: 'name', label: 'Name' }, { key: 'email', label: 'Email' }]);
  const dataLine = csv.split('\n')[1];
  // No structural quoting needed, so the cell is simply apostrophe-prefixed.
  assert.equal(dataLine, `'=2+5+cmd,a@b.com`);
  assert.ok(!/^=/.test(dataLine), 'cell must not begin with a bare =');
});

test('toCsv neutralizes AND quotes a formula payload that also contains commas/quotes', () => {
  const rows = [{ name: '=HYPERLINK("http://evil.com","clickme")', email: 'a@b.com' }];
  const csv = toCsv(rows, [{ key: 'name', label: 'Name' }, { key: 'email', label: 'Email' }]);
  const dataLine = csv.split('\n')[1];
  // Quote-wrapped for the commas/quotes, apostrophe INSIDE the quotes so the
  // value a spreadsheet extracts still begins with ' (text, not a formula).
  assert.match(dataLine, /^"'=HYPERLINK/,
    `formula payload not neutralized inside quotes: ${dataLine}`);
  assert.ok(!/^"=HYPERLINK/.test(dataLine), 'quoted cell value must not begin with a bare =');
});

test('toCsv still quotes cells containing commas, quotes and newlines', () => {
  const rows = [{ note: 'Smith, John said "hi"\nsecond line' }];
  const csv = toCsv(rows, [{ key: 'note', label: 'Note' }]);
  const dataLine = csv.slice(csv.indexOf('\n') + 1);
  // Quote-wrapped, inner quotes doubled — structural escaping is preserved.
  assert.match(dataLine, /^"Smith, John said ""hi""/);
});

test('toCsv neutralization composes with quoting when a formula also needs quoting', () => {
  const rows = [{ v: '=1,2' }]; // starts with '=' AND contains a comma
  const csv = toCsv(rows, [{ key: 'v', label: 'V' }]);
  const dataLine = csv.slice(csv.indexOf('\n') + 1);
  // "'=1,2" — apostrophe-prefixed then wrapped in quotes because of the comma.
  assert.equal(dataLine, `"'=1,2"`);
});

test('toCsv returns empty string for no rows (unchanged contract)', () => {
  assert.equal(toCsv([]), '');
  assert.equal(toCsv(null), '');
});
