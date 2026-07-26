import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('native owner launch gate distinguishes paused preflight from live launch', async () => {
  const model = await read('../ios/XertFitnessApp/XertFitnessApp/OwnerLaunchGate.swift');
  assert.match(model, /case preflightReady/);
  assert.match(model, /case bookingsOpen/);
  assert.match(model, /case liveReady/);
  assert.match(model, /if !bookingsEnabled && paymentsEnabled/);
  assert.match(model, /if bookingsEnabled && !paymentsEnabled/);
  assert.match(model, /phase: \.bookingsOpen/);
  assert.match(model, /phase: bookingsEnabled \? \.liveReady : \.preflightReady/);
  assert.match(model, /pushReady: Bool\?/);
  assert.match(model, /\(pushReady, "Complete a successful production owner push test\."\)/);
});

test('native Operations Health requires real booking and member-notification evidence', async () => {
  const view = await read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift');
  assert.match(view, /private var activeLinkedPacksReady: Bool\?/);
  assert.match(view, /private var bookableClassesReady: Bool\?/);
  assert.match(view, /\["instant_book", "request_to_book"\]\.contains/);
  assert.match(view, /\(item\.capacity \?\? 0\) > 0/);
  assert.match(view, /Section\("Member launch gate"\)/);
  assert.match(view, /admin\.launchGateUpdatedAt/);
  assert.match(view, /Refresh launch gates/);
  assert.match(view, /accessibilityIdentifier\("owner\.launchGate"\)/);
  assert.match(view, /private var productionPushReady: Bool\?/);
  assert.match(view, /push\.isOwnerLaunchReady\(\)/);
  assert.match(view, /pushReady: productionPushReady/);
  assert.match(view, /guard productionPushReady == true else \{ return nil \}/);
});
