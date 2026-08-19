import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('native home inherits the physical top inset before its full-bleed scroll view', async () => {
  const [root, home, theme, swiftTests] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/RootView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/HomeView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Theme.swift'),
    read('../ios/XertFitnessApp/XertFitnessAppTests/ModelsTests.swift'),
  ]);

  assert.match(root, /GeometryReader \{ viewport in[\s\S]*memberTabSurface\(deviceTopInset: viewport\.safeAreaInsets\.top\)/);
  assert.match(root, /private func memberTabSurface\(deviceTopInset: CGFloat\)[\s\S]*\.environment\(\\\.xertDeviceTopSafeAreaInset, deviceTopInset\)/);
  assert.match(home, /@Environment\(\\\.xertDeviceTopSafeAreaInset\) private var inheritedTopSafeAreaInset/);
  assert.match(home, /resolvedTopSafeAreaInset\([\s\S]*localInset: viewport\.safeAreaInsets\.top,[\s\S]*inheritedInset: inheritedTopSafeAreaInset/);
  assert.match(home, /topSafeAreaInset: topSafeAreaInset/);
  assert.match(home, /XertScreenLayout\.heroContentTopInset\(deviceTopInset: topSafeAreaInset\)/);
  assert.doesNotMatch(home, /max\(proxy\.safeAreaInsets\.top, 18\)/);
  assert.match(theme, /resolvedTopSafeAreaInset[\s\S]*max\(0, max\(localInset, inheritedInset\)\)/);
  assert.match(theme, /heroContentTopInset[\s\S]*max\(deviceTopInset, minimumHeroTopInset\) \+ 10/);
  assert.match(swiftTests, /resolvedTopSafeAreaInset\(localInset: 0, inheritedInset: 59\),[\s\S]*59/);
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
  assert.match(theme, /minHeight: heroHeight, maxHeight: \.infinity/);
  assert.match(theme, /\.frame\(maxWidth: \.infinity, minHeight: heroHeight\)/);
  assert.doesNotMatch(theme, /minHeight: heroHeight, maxHeight: heroHeight/);
});

test('bottom booking and retention actions adapt and scroll fully above native chrome', async () => {
  const [theme, booking, admin] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Theme.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/BookingView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
  ]);

  assert.match(theme, /scrollEndClearance: CGFloat = 112/);
  assert.match(booking, /ViewThatFits\(in: \.horizontal\)[\s\S]*Request PT Session/);
  assert.match(booking, /submitSection\s+XertScrollEndSpacer\(\)/);
  assert.match(admin, /ViewThatFits\(in: \.horizontal\)[\s\S]*retentionActions\(for: member, expands: true\)/);
  assert.match(admin, /Label\("Log follow-up", systemImage: "checkmark\.circle"\)/);
});

test('owner scheduling editors keep primary actions above the keyboard and home indicator', async () => {
  const admin = await read(
    '../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift',
  );

  const editorContracts = [
    {
      name: 'class',
      start: 'struct AdminClassEditor: View',
      end: 'private struct AdminAvailabilityView: View',
      bar: 'classSaveBar',
      identifier: 'owner.classEditor.save',
    },
    {
      name: 'availability',
      start: 'private struct AdminAvailabilityEditor: View',
      end: 'private struct AdminBlackoutEditor: View',
      bar: 'availabilitySaveBar',
      identifier: 'owner.availabilityEditor.save',
    },
    {
      name: 'blackout',
      start: 'private struct AdminBlackoutEditor: View',
      end: 'private struct AdminRetentionView: View',
      bar: 'blackoutSaveBar',
      identifier: 'owner.blackoutEditor.save',
    },
  ];

  for (const contract of editorContracts) {
    const start = admin.indexOf(contract.start);
    const end = admin.indexOf(contract.end, start);
    assert.notEqual(start, -1, `${contract.name} editor should exist`);
    assert.notEqual(end, -1, `${contract.name} editor boundary should exist`);

    const source = admin.slice(start, end);
    assert.match(
      source,
      new RegExp(`safeAreaInset\\(edge: \\.bottom, spacing: 0\\)[\\s\\S]*${contract.bar}`),
      `${contract.name} save action should reserve the bottom safe area`,
    );
    assert.match(
      source,
      new RegExp(`accessibilityIdentifier\\("${contract.identifier.replaceAll('.', '\\.')}"\\)`),
      `${contract.name} save action should remain addressable by UI tests`,
    );
    assert.match(
      source,
      /textInputFocused = false[\s\S]*Task \{/,
      `${contract.name} save action should dismiss the keyboard before mutation`,
    );
    assert.doesNotMatch(
      source,
      /\.listRowBackground\(Color\.xertSteel\)/,
      `${contract.name} save action should not be buried in the form`,
    );
  }
});
