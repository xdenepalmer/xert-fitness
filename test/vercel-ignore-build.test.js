import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { shouldBuildWeb } from '../scripts/vercel-ignore-build.mjs';

const config = JSON.parse(
  await readFile(new URL('../vercel.json', import.meta.url), 'utf8'),
);

test('Vercel skips native-only launch work without hiding web changes', () => {
  assert.equal(shouldBuildWeb([
    'ios/XertFitnessApp/XertFitnessApp/Views/HomeView.swift',
    'ios/XertFitnessApp/XertFitnessAppTests/ModelsTests.swift',
    'test/native-home-ui.test.js',
  ]), false);

  assert.equal(shouldBuildWeb([
    'codemagic.yaml',
    'README.md',
    'docs/launch-runbook.md',
    'supabase/migrations/20260727000000_example.sql',
  ]), false);

  for (const file of [
    'src/App.jsx',
    'public/sw.js',
    'api/checkout.js',
    'package-lock.json',
    'vite.config.js',
    'vercel.json',
    'scripts/inject-pwa-precache.mjs',
    'scripts/vercel-ignore-build.mjs',
    'vercel.ts',
  ]) {
    assert.equal(shouldBuildWeb([file]), true, `${file} must trigger a web build`);
  }

  assert.equal(shouldBuildWeb([
    'ios/XertFitnessApp/XertFitnessApp/Views/HomeView.swift',
    'src/pages/Home.jsx',
  ]), true);
});

test('vercel.json runs the fail-open web-impact classifier', () => {
  assert.equal(config.ignoreCommand, 'node scripts/vercel-ignore-build.mjs');
});

test('the Vercel classifier fails open when Git history is unavailable', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'xert-vercel-ignore-'));
  const script = fileURLToPath(
    new URL('../scripts/vercel-ignore-build.mjs', import.meta.url),
  );

  try {
    const result = spawnSync(process.execPath, [script], {
      cwd: directory,
      encoding: 'utf8',
    });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /proceeding with the build/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
