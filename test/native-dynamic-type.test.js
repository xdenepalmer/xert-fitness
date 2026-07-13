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
  assert.match(home, /@Environment\(\\\.dynamicTypeSize\) private var dynamicTypeSize/);
  assert.equal((home.match(/dynamicTypeSize\.isAccessibilitySize/g) || []).length, 2);
  assert.match(home, /if dynamicTypeSize\.isAccessibilitySize \{[\s\S]*VStack\(spacing: 12\)/);
  assert.match(home, /if dynamicTypeSize\.isAccessibilitySize \{[\s\S]*VStack\(spacing: 14\)/);

  const booking = await readFile(
    new URL('../ios/XertFitnessApp/XertFitnessApp/Views/BookingView.swift', import.meta.url),
    'utf8',
  );
  assert.match(booking, /@Environment\(\\\.dynamicTypeSize\) private var dynamicTypeSize/);
  assert.equal((booking.match(/dynamicTypeSize\.isAccessibilitySize/g) || []).length, 3);
  assert.match(booking, /private func productSummary/);
  assert.match(booking, /private func sessionHeader/);
  assert.match(booking, /private func sessionMetadata/);
});
