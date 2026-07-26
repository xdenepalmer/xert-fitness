import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('native Explore mirrors public CMS, team, training and acquisition workflows', async () => {
  const [root, explore, home, booking, store, api, cache] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/RootView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/ExploreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/HomeView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/BookingView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/XertStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Services/PublicDataCache.swift'),
  ]);

  assert.match(root, /ExploreView/);
  assert.match(root, /Label\("Explore", systemImage: "safari"\)/);
  for (const feature of ['About XERT Fitness', 'Coaches and practitioners', 'Functional training guide', 'Frequently asked questions', 'Contact XERT']) {
    assert.match(explore, new RegExp(feature));
  }
  for (const kind of ['member', 'trainer', 'partner']) assert.match(explore, new RegExp(`NativeInterestFormView\\(kind: \\.${kind}\\)`));
  assert.match(explore, /NativeMultiSelect/);
  assert.match(home, /content: store\.publicContent\(for: \.hero\)/);
  assert.match(home, /content\.photos[\s\S]*compactMap[\s\S]*publicPhotoURL/);
  assert.match(booking, /store\.publicContent\(for: \.booking\)\.intro/);
  assert.match(store, /func submitInterest\(kind: NativeInterestKind/);
  assert.match(api, /func coaches\(\)/);
  assert.match(api, /func siteContent\(\)/);
  assert.match(api, /func submitMemberInterest/);
  assert.match(api, /func submitTrainerInterest/);
  assert.match(api, /func submitPartnerInterest/);
  assert.match(api, /source = "ios_app"|submitPublicInterest/);
  assert.match(cache, /let coaches: \[AdminCoach\]/);
  assert.match(cache, /let siteContent: \[AdminSiteContentRow\]/);
});
