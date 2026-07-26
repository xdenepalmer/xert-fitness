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
});

test('native Operations Health requires real booking-path evidence', async () => {
  const view = await read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift');
  assert.match(view, /private var activeLinkedPacksReady: Bool\?/);
  assert.match(view, /private var bookableClassesReady: Bool\?/);
  assert.match(view, /\["instant_book", "request_to_book"\]\.contains/);
  assert.match(view, /\(item\.capacity \?\? 0\) > 0/);
  assert.match(view, /Section\("Member launch gate"\)/);
  assert.match(view, /admin\.launchGateUpdatedAt/);
  assert.match(view, /Refresh launch gates/);
  assert.match(view, /accessibilityIdentifier\("owner\.launchGate"\)/);
});
