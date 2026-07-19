import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('native home measures the physical top inset outside its full-bleed scroll view', async () => {
  const [home, theme] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/HomeView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Theme.swift'),
  ]);

  assert.match(home, /GeometryReader \{ viewport in[\s\S]*topSafeAreaInset: viewport\.safeAreaInsets\.top/);
  assert.match(home, /XertScreenLayout\.heroContentTopInset\(deviceTopInset: topSafeAreaInset\)/);
  assert.doesNotMatch(home, /max\(proxy\.safeAreaInsets\.top, 18\)/);
  assert.match(theme, /heroContentTopInset[\s\S]*max\(deviceTopInset, minimumHeroTopInset\) \+ 10/);
});

test('all primary member workspaces keep their final controls clear of the persistent dock', async () => {
  const views = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/HomeView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/BookingView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/EventsView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/ExploreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AccountView.swift'),
  ]);

  for (const source of views) {
    assert.match(source, /XertScreenLayout\.scrollEndClearance|XertScrollEndSpacer\(\)/);
  }
});

test('shared page heroes expand instead of clipping accessibility-sized copy', async () => {
  const theme = await read('../ios/XertFitnessApp/XertFitnessApp/Theme.swift');
  assert.match(theme, /pageHeroHeight\(usesAccessibilityText: Bool\)/);
  assert.match(theme, /usesAccessibilityText \? 420 : 250/);
  assert.match(theme, /@Environment\(\\\.dynamicTypeSize\) private var dynamicTypeSize/);
  assert.match(theme, /XertScreenLayout\.pageHeroHeight\(usesAccessibilityText: dynamicTypeSize\.isAccessibilitySize\)/);
  assert.equal((theme.match(/minHeight: heroHeight, maxHeight: heroHeight/g) || []).length, 2);
});
