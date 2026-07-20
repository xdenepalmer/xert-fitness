import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('navigation status formatting reuses one Brisbane formatter', async () => {
  const source = await readFile(
    new URL('../ios/XertFitnessApp/XertFitnessApp/XertNavigation.swift', import.meta.url),
    'utf8',
  );

  const formatterAllocations = source.match(/DateFormatter\(\)/g) ?? [];
  assert.equal(formatterAllocations.length, 1);
  assert.match(source, /private enum XertNavigationFormatters/);
  assert.match(source, /XertNavigationFormatters\.brisbaneSchedule\.string\(from: startTime\)/);
  assert.match(source, /XertNavigationFormatters\.brisbaneSchedule\.string\(from: date\)/);
});
