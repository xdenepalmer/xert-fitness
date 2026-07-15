import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { nativeTaskFallback } from '../src/lib/nativeTaskLinks.js';

const navigationURL = new URL('../ios/XertFitnessApp/XertFitnessApp/XertNavigation.swift', import.meta.url);
const rootURL = new URL('../ios/XertFitnessApp/XertFitnessApp/Views/RootView.swift', import.meta.url);
const appURL = new URL('../src/App.jsx', import.meta.url);
const bridgeURL = new URL('../src/pages/NativeTaskBridge.jsx', import.meta.url);
const modelsTestsURL = new URL('../ios/XertFitnessApp/XertFitnessAppTests/ModelsTests.swift', import.meta.url);
const accountURL = new URL('../src/pages/Account.jsx', import.meta.url);
const eventsURL = new URL('../src/pages/Events.jsx', import.meta.url);

test('shared native task links fall back to the nearest real web workflow', () => {
  const noticeID = '00000000-0000-0000-0000-000000000023';
  const bookingID = '00000000-0000-0000-0000-000000000024';
  assert.equal(nativeTaskFallback('/open/home'), '/');
  assert.equal(nativeTaskFallback('/open/home/notices'), '/account#notices');
  assert.equal(nativeTaskFallback(`/open/home/notices/${noticeID}`), '/account#notices');
  assert.equal(nativeTaskFallback('/open/booking/packs'), '/booking#packs');
  assert.equal(nativeTaskFallback('/open/events/goals'), '/events#goals');
  assert.equal(nativeTaskFallback(`/open/account/bookings/${bookingID}`), '/account#bookings');
  assert.equal(nativeTaskFallback('/OPEN/BOOKING/'), '/booking');
  assert.equal(nativeTaskFallback('/open/admin'), '/app');
  assert.equal(nativeTaskFallback('/open/account/bookings/not-a-uuid'), '/app');
  assert.equal(nativeTaskFallback(null), '/app');
});

test('native routes expose trusted exact-task HTTPS sharing without changing signing entitlements', async () => {
  const [navigation, root, app, bridge, modelsTests, account, events] = await Promise.all([
    readFile(navigationURL, 'utf8'),
    readFile(rootURL, 'utf8'),
    readFile(appURL, 'utf8'),
    readFile(bridgeURL, 'utf8'),
    readFile(modelsTestsURL, 'utf8'),
    readFile(accountURL, 'utf8'),
    readFile(eventsURL, 'utf8'),
  ]);
  assert.match(navigation, /static let canonicalWebHost = AppConfig\.vercelHost/);
  assert.match(navigation, /var webURL: URL/);
  assert.match(navigation, /url\.scheme\?\.lowercased\(\) == "https"/);
  assert.match(navigation, /url\.host\?\.lowercased\(\) == canonicalWebHost/);
  assert.match(navigation, /path\.hasPrefix\("\/open\/"\)/);
  assert.match(navigation, /guard url\.user == nil, url\.password == nil, url\.query == nil/);
  assert.match(root, /ShareLink\(item: currentRoute\.webURL/);
  assert.match(root, /xert-navigation-share/);
  assert.match(app, /<Route path="\/open\/\*" element=\{<NativeTaskBridge \/>\} \/>/);
  assert.match(bridge, /<Navigate replace to=\{nativeTaskFallback\(location\.pathname\)\} \/>/);
  assert.match(account, /<section id="notices"/);
  assert.match(account, /<section id="bookings"/);
  assert.match(events, /<div id="goals"/);
  assert.match(modelsTests, /testCanonicalWebTaskLinksRoundTripAndRejectUntrustedOrigins/);
  assert.doesNotMatch(navigation, /com\.apple\.developer\.associated-domains/);
});
