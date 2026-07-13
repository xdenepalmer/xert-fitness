import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const plist = readFileSync(new URL('../ios/XertFitnessApp/XertFitnessApp/Info.plist', import.meta.url), 'utf8');
const project = readFileSync(new URL('../ios/XertFitnessApp/project.yml', import.meta.url), 'utf8');
const codemagic = readFileSync(new URL('../codemagic.yaml', import.meta.url), 'utf8');

test('native release metadata satisfies App Store iPad and export checks', () => {
  assert.match(project, /TARGETED_DEVICE_FAMILY: "1,2"/);
  assert.match(plist, /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/);

  const ipadOrientations = plist.match(
    /<key>UISupportedInterfaceOrientations~ipad<\/key>\s*<array>([\s\S]*?)<\/array>/,
  )?.[1] ?? '';
  for (const orientation of [
    'UIInterfaceOrientationPortrait',
    'UIInterfaceOrientationPortraitUpsideDown',
    'UIInterfaceOrientationLandscapeLeft',
    'UIInterfaceOrientationLandscapeRight',
  ]) {
    assert.match(ipadOrientations, new RegExp(`<string>${orientation}</string>`));
  }
});

test('Codemagic verifies signed App Store metadata before publishing', () => {
  assert.match(codemagic, /SIGNED_BUNDLE_ID/);
  assert.match(codemagic, /ITSAppUsesNonExemptEncryption/);
  assert.match(codemagic, /UISupportedInterfaceOrientations~ipad/);
  assert.match(codemagic, /App Store upload would fail validation/);
});
