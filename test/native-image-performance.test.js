import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('native CMS photography is cached, bounded and downsampled off the main actor', async () => {
  const imagePipeline = await read('../ios/XertFitnessApp/XertFitnessApp/Services/XertRemoteImage.swift');

  assert.match(imagePipeline, /NSCache<NSString, UIImage>/);
  assert.match(imagePipeline, /totalCostLimit = 48 \* 1_024 \* 1_024/);
  assert.match(imagePipeline, /data\.count <= 12 \* 1_024 \* 1_024/);
  assert.match(imagePipeline, /min\(max\(maximumPixelDimension, 96\), 2_048\)/);
  assert.match(imagePipeline, /Task\.detached\(priority: \.utility\)/);
  assert.match(imagePipeline, /CGImageSourceCreateThumbnailAtIndex/);
  assert.match(imagePipeline, /Task\.checkCancellation\(\)/);
  assert.match(imagePipeline, /accessibilityReduceMotion/);
});

test('high-frequency public image surfaces use the shared native pipeline', async () => {
  const [home, explore] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/HomeView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/ExploreView.swift'),
  ]);

  assert.match(home, /XertRemoteImage\([\s\S]*maximumPointDimension: 760/);
  assert.doesNotMatch(home, /AsyncImage\(/);
  assert.match(home, /scenePhase == \.active && !reduceMotion && !isLowPowerModeEnabled/);
  assert.match(home, /NSProcessInfoPowerStateDidChange/);
  assert.match(explore, /XertRemoteImage\([\s\S]*maximumPointDimension: size/);
  assert.doesNotMatch(explore, /AsyncImage\(/);
  assert.match(explore, /struct CoachPhoto:[\s\S]*\.accessibilityHidden\(true\)/);
});
