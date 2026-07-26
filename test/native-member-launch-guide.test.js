import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const native = relative => readFile(
  new URL(`../ios/XertFitnessApp/XertFitnessApp/${relative}`, import.meta.url),
  'utf8',
);

test('native home presents one state-derived member launch step immediately after its hero', async () => {
  const [home, resolver] = await Promise.all([
    native('Views/HomeView.swift'),
    native('MemberLaunchGuide.swift'),
  ]);

  assert.match(home, /NativeHomeHero\([\s\S]*MemberLaunchGuideCard\([\s\S]*NativeValueStrip\(\)/);
  assert.match(resolver, /enum MemberLaunchGuideResolver/);
  for (const state of [
    'signIn',
    'completeReadiness',
    'chooseAccess',
    'bookFirstClass',
    'enableReminder',
    'activated',
  ]) {
    assert.match(resolver, new RegExp(`case ${state}`));
  }
  assert.match(resolver, /if let nextActiveBookingID[\s\S]*return \.activated/);
  assert.match(resolver, /guard creditTotal > 0 else \{ return \.chooseAccess \}/);
});

test('launch guide keeps actions typed, accessible and explicit', async () => {
  const [root, home] = await Promise.all([
    native('Views/RootView.swift'),
    native('Views/HomeView.swift'),
  ]);

  assert.match(root, /onOpenRoute: \{ openMemberRoute\(\$0, source: \.content\) \}/);
  assert.match(home, /onOpenRoute\(\.sessionPacks\)/);
  assert.match(home, /onOpenRoute\(\.booking\)/);
  assert.match(home, /onOpenRoute\(\.upcomingBookings\(bookingID\)\)/);
  assert.match(home, /bookingsEnabled: store\.memberBookingsEnabled/);
  assert.match(home, /bookingsEnabled \? "View Session Packs" : "Register interest"/);
  assert.match(home, /bookingsEnabled \? "Browse Classes" : "Register interest"/);
  assert.match(home, /store\.setClassRemindersEnabled\(true\)/);
  assert.match(home, /ViewThatFits\(in: \.horizontal\)/);
  assert.match(home, /\.frame\(minHeight: 44\)/);
  assert.match(home, /\.accessibilityHint\(actionHint\)/);
});
