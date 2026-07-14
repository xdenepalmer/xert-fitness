import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const homeURL = new URL('../ios/XertFitnessApp/XertFitnessApp/Views/HomeView.swift', import.meta.url);
const heroAssetURL = new URL('../ios/XertFitnessApp/XertFitnessApp/Assets.xcassets/HeroTraining.imageset/hero-training.jpg', import.meta.url);
const heroContentsURL = new URL('../ios/XertFitnessApp/XertFitnessApp/Assets.xcassets/HeroTraining.imageset/Contents.json', import.meta.url);

test('native home opens with the photographic XERT website hero language', async () => {
  const home = await readFile(homeURL, 'utf8');
  assert.match(home, /NativeHomeHero/);
  assert.match(home, /Image\("HeroTraining"\)/);
  assert.match(home, /XertLogoHeader\(height: 36\)/);
  assert.match(home, /Text\("Beat Your"\)[\s\S]*Text\("Best\."\)/);
  assert.match(home, /Functional Fitness Training Facility/);
  assert.match(home, /Structured functional fitness coaching designed for strength/);
  assert.match(home, /Booking-based semi-private classes · Kingaroy QLD/);
  assert.match(home, /Book Your First Session/);
  assert.match(home, /View Event Calendar/);
});

test('native hero stays functional and leaves member operations directly below it', async () => {
  const home = await readFile(homeURL, 'utf8');
  assert.match(home, /onBook: \{ onNavigate\(1\) \}/);
  assert.match(home, /onEvents: \{ onNavigate\(2\) \}/);
  assert.match(home, /onRefresh: \{ Task \{ await store\.refresh\(\) \} \}/);
  assert.match(home, /NativeHomeHero[\s\S]*announcementsSection[\s\S]*todayTrainingSection[\s\S]*creditExpirySection/);
  assert.match(home, /\.ignoresSafeArea\(edges: \.top\)/);
  assert.match(home, /\.toolbar\(\.hidden, for: \.navigationBar\)/);
});

test('native hero ships the real training photograph through the asset catalogue', async () => {
  const contents = JSON.parse(await readFile(heroContentsURL, 'utf8'));
  assert.equal(contents.images[0].filename, 'hero-training.jpg');
  assert.equal(contents.images[0].idiom, 'universal');
  await access(heroAssetURL);
});
