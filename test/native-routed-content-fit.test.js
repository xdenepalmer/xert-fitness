import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('native routed member content settles below navigation chrome with dock clearance', async () => {
  const [theme, booking, events, account, explore] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Theme.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/BookingView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/EventsView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AccountView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/ExploreView.swift'),
  ]);

  assert.match(theme, /static let routedContentAnchor = UnitPoint\(x: 0\.5, y: 0\.2\)/);
  assert.match(booking, /proxy\.scrollTo\(target, anchor: XertScreenLayout\.routedContentAnchor\)/);
  assert.match(
    events,
    /proxy\.scrollTo\([\s\S]*ScrollTarget\.goals,[\s\S]*anchor: XertScreenLayout\.routedContentAnchor/,
  );
  assert.doesNotMatch(booking, /proxy\.scrollTo\(target, anchor: \.top\)/);
  assert.doesNotMatch(events, /proxy\.scrollTo\(ScrollTarget\.goals, anchor: \.top\)/);

  for (const source of [booking, events, account, explore]) {
    assert.match(source, /XertScrollEndSpacer\(\)/);
  }
});
