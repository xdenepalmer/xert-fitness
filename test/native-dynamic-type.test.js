import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('native brand typography scales with Dynamic Type', async () => {
  const source = await readFile(
    new URL('../ios/XertFitnessApp/XertFitnessApp/Theme.swift', import.meta.url),
    'utf8',
  );

  assert.match(source, /\.custom\("BebasNeue-Regular", size: size, relativeTo: textStyle\)/);
  assert.match(source, /UIFontMetrics\(forTextStyle: textStyle\)\.scaledFont/);
  assert.match(source, /size >= 36[\s\S]*\.largeTitle/);
  assert.doesNotMatch(source, /return \.custom\("BebasNeue-Regular", size: size\)/);

  const home = await readFile(
    new URL('../ios/XertFitnessApp/XertFitnessApp/Views/HomeView.swift', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(home, /displayFont\(size: \d+\)/);
  assert.match(home, /displayFont\(size: 20, relativeTo: \.title3\)/);
});
