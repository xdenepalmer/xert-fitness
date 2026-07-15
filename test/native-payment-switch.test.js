import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('native owner controls round-trip the server-enforced payment switch', async () => {
  const models = await readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift', import.meta.url), 'utf8');
  const api = await readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift', import.meta.url), 'utf8');
  const commandCentre = await readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift', import.meta.url), 'utf8');

  assert.match(models, /struct AdminPlatformSettings[\s\S]*var payments_enabled: Bool/);
  assert.match(api, /select[^\n]*payments_enabled/);
  assert.match(api, /AdminSettingsUpdate\([\s\S]*payments_enabled: settings\.payments_enabled/);
  assert.match(api, /private struct AdminSettingsUpdate[\s\S]*let payments_enabled: Bool/);
  assert.match(commandCentre, /Toggle\("Session pack payments", isOn: settingBinding\(\\\.payments_enabled\)\)/);
});
