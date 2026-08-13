import assert from 'node:assert/strict';
import test from 'node:test';
import { protectCSVFormula } from '../src/lib/csvSafety.js';

test('CSV export neutralises spreadsheet formulas while preserving leading whitespace', () => {
  assert.equal(protectCSVFormula('=HYPERLINK("https://example.com")'), "'=HYPERLINK(\"https://example.com\")");
  assert.equal(protectCSVFormula('  +SUM(1,2)'), "  '+SUM(1,2)");
  assert.equal(protectCSVFormula('\t@IMPORTDATA("https://example.com")'), "\t'@IMPORTDATA(\"https://example.com\")");
  assert.equal(protectCSVFormula('ordinary response'), 'ordinary response');
});
