import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const homeURL = new URL('../ios/XertFitnessApp/XertFitnessApp/Views/HomeView.swift', import.meta.url);
const heroAssetURL = new URL('../ios/XertFitnessApp/XertFitnessApp/Assets.xcassets/HeroTraining.imageset/hero-training.jpg', import.meta.url);
const heroContentsURL = new URL('../ios/XertFitnessApp/XertFitnessApp/Assets.xcassets/HeroTraining.imageset/Contents.json', import.meta.url);
const trainingStyleURL = new URL('../ios/XertFitnessApp/XertFitnessApp/Assets.xcassets/TrainingStyle.imageset/training-style.jpg', import.meta.url);
const themeURL = new URL('../ios/XertFitnessApp/XertFitnessApp/Theme.swift', import.meta.url);

test('native home opens with the photographic XERT website hero language', async () => {
  const home = await readFile(homeURL, 'utf8');
  assert.match(home, /NativeHomeHero/);
  assert.match(home, /Image\("HeroTraining"\)/);
  assert.match(home, /XertLogoHeader\(height: 36\)/);
  assert.match(home, /store\.publicContent\(for: \.hero\)/);
  assert.match(home, /Text\(content\.headline \?\? "Beat Your Best\."\)/);
  assert.match(home, /Functional Fitness Training Facility/);
  assert.match(home, /Structured functional fitness coaching designed for strength/);
  assert.match(home, /Booking-based semi-private classes · Kingaroy QLD/);
  assert.match(home, /Book Your First Session/);
  assert.match(home, /bookingsEnabled: store\.memberBookingsEnabled/);
  assert.match(home, /Register interest/);
  assert.match(home, /View Event Calendar/);
  assert.match(home, /@Environment\(\\\.accessibilityReduceMotion\) private var reduceMotion/);
  assert.match(home, /@State private var photoIndex = 0/);
  assert.match(home, /heroPhotoURLs\.indices/);
  assert.match(home, /\.frame\(width: 44, height: 44\)/);
  assert.match(home, /Task\.sleep\(nanoseconds: 5_000_000_000\)/);
  assert.match(home, /withAnimation\(\.easeInOut\(duration: 1\.2\)\)/);
  assert.ok(home.includes('Show training photo \\(index + 1) of \\(heroPhotoURLs.count)'));
  assert.match(home, /guard heroPhotoURLs\.count > 1, allowsAutomaticCarousel else \{ return \}/);
  assert.match(home, /scenePhase == \.active && !reduceMotion && !isLowPowerModeEnabled/);
  assert.match(home, /\["https", "http"\]\.contains\(url\.scheme\?\.lowercased\(\)\)/);
});

test('native hero stays functional and leaves member operations directly below it', async () => {
  const home = await readFile(homeURL, 'utf8');
  assert.match(home, /onBook: openBookingOrInterest/);
  assert.match(home, /private func openBookingOrInterest\(\)/);
  assert.match(home, /onEvents: \{ onNavigate\(\.events\) \}/);
  assert.match(home, /onRefresh: \{ Task \{ await store\.refresh\(\) \} \}/);
  assert.match(home, /NativeHomeHero[\s\S]*NativeValueStrip[\s\S]*announcementsSection[\s\S]*NativeTrainingIdentity[\s\S]*todayTrainingSection[\s\S]*creditExpirySection/);
  assert.match(home, /\.ignoresSafeArea\(edges: \.top\)/);
  assert.match(home, /\.toolbar\(\.hidden, for: \.navigationBar\)/);
});

test('native home carries the website visual system below the hero', async () => {
  const [home, theme] = await Promise.all([
    readFile(homeURL, 'utf8'),
    readFile(themeURL, 'utf8'),
  ]);
  assert.match(home, /Discipline[\s\S]*Structure[\s\S]*Purpose[\s\S]*Performance/);
  assert.match(home, /Image\("TrainingStyle"\)/);
  assert.match(home, /Purposeful\.\\nProgressive\.\\nSustainable\./);
  assert.match(home, /Coach-led[\s\S]*Progressive[\s\S]*Event-led/);
  assert.match(theme, /struct XertScreenBackdrop/);
  assert.match(theme, /Canvas\([\s\S]*rendersAsynchronously: true\) \{ context, size in/);
  assert.match(theme, /background\(XertScreenBackdrop\(\)\.ignoresSafeArea\(\)\)/);
  await access(trainingStyleURL);
});

test('native hero ships the real training photograph through the asset catalogue', async () => {
  const contents = JSON.parse(await readFile(heroContentsURL, 'utf8'));
  assert.equal(contents.images[0].filename, 'hero-training.jpg');
  assert.equal(contents.images[0].idiom, 'universal');
  await access(heroAssetURL);
});
