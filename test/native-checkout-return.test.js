import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [api, deepLink, info, root, app, page] = await Promise.all([
  readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift', import.meta.url), 'utf8'),
  readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/CheckoutDeepLink.swift', import.meta.url), 'utf8'),
  readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Info.plist', import.meta.url), 'utf8'),
  readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Views/RootView.swift', import.meta.url), 'utf8'),
  readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/CheckoutReturn.jsx', import.meta.url), 'utf8'),
]);

test('native checkout requests the bounded iOS return target', () => {
  const checkout = api.slice(api.indexOf('func checkout('), api.indexOf('func requestPrivateSession'));
  assert.match(checkout, /"return_target": "ios"/);
  assert.doesNotMatch(checkout, /success_url|cancel_url/);
});

test('native app accepts only the XERT checkout callback and refreshes member data', () => {
  assert.match(info, /<string>xertfitness<\/string>/);
  assert.match(deepLink, /url\.scheme\?\.lowercased\(\) == "xertfitness"/);
  assert.match(deepLink, /url\.host\?\.lowercased\(\) == "checkout"/);
  assert.match(deepLink, /CheckoutReturnStatus\(rawValue: value\)/);
  assert.match(root, /\.onOpenURL/);
  assert.match(root, /CheckoutDeepLink\.status\(from: url\)/);
  assert.match(root, /selectedTab = 1/);
  assert.match(root, /Task \{ await store\.refresh\(\) \}/);
});

test('public checkout return page can reopen the app without requiring web auth', () => {
  assert.match(app, /path="\/checkout-return"/);
  assert.match(page, /xertfitness:\/\/checkout\?status=\$\{status\}/);
  assert.match(page, /Payment received/);
  assert.match(page, /No payment was taken/);
  assert.doesNotMatch(page, /useSupabaseAuth|AdminRoute/);
});
