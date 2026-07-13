import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [manifest, project, codemagic] = await Promise.all([
  readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/PrivacyInfo.xcprivacy', import.meta.url), 'utf8'),
  readFile(new URL('../ios/XertFitnessApp/project.yml', import.meta.url), 'utf8'),
  readFile(new URL('../codemagic.yaml', import.meta.url), 'utf8'),
]);

const collectedTypes = [
  'Name',
  'EmailAddress',
  'PhoneNumber',
  'UserID',
  'PurchaseHistory',
  'ProductInteraction',
  'Health',
  'Fitness',
  'OtherUserContent',
];

test('native privacy manifest declares required-reason API usage without tracking', () => {
  assert.match(manifest, /<key>NSPrivacyTracking<\/key>\s*<false\/>/);
  assert.match(manifest, /NSPrivacyAccessedAPICategoryUserDefaults/);
  assert.match(manifest, /<string>CA92\.1<\/string>/);
  assert.match(manifest, /<key>NSPrivacyTrackingDomains<\/key>\s*<array\/>/);
});

test('native privacy manifest describes XERT member data used for app functionality', () => {
  for (const type of collectedTypes) {
    assert.match(manifest, new RegExp(`NSPrivacyCollectedDataType${type}`));
  }
  assert.match(manifest, /NSPrivacyCollectedDataTypePurposeAppFunctionality/);
  assert.doesNotMatch(manifest, /Purpose(?:ThirdPartyAdvertising|DeveloperAdvertising)/);
});

test('native project bundles the manifest and Codemagic verifies the signed archive', () => {
  assert.match(project, /sources:\s*\n\s*- path: XertFitnessApp/);
  assert.match(codemagic, /APP_PATH\/PrivacyInfo\.xcprivacy/);
  assert.match(codemagic, /plutil -lint "\$PRIVACY_MANIFEST"/);
  assert.match(codemagic, /NSPrivacyAccessedAPICategoryUserDefaults/);
  assert.match(codemagic, /CA92\.1/);
});
