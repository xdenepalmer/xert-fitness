import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = async path => readFile(new URL(path, import.meta.url), 'utf8');

test('native command centre loads activation independently and renders the six-stage journey', async () => {
  const [models, api, store, view] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
  ]);

  assert.match(models, /struct AdminMemberActivationOverview/);
  assert.match(models, /\("Access", training_access\)/);
  assert.match(models, /member_activation_cockpit/);
  assert.match(api, /path: "admin_member_activation_overview"/);
  assert.match(api, /path: "admin_member_activation_queue"/);
  assert.match(store, /async let activationOverviewRequest/);
  assert.match(store, /async let activationQueueRequest/);
  assert.match(store, /failures\.append\("member activation"\)/);
  assert.match(store, /logActivationFollowUp/);
  assert.match(view, /Member activation · 30 days/);
  assert.match(view, /Section\("Activation actions"\)/);
  assert.match(view, /ViewThatFits\(in: \.horizontal\)/);
  assert.match(view, /Outreach is disabled until you pull down to refresh/);
  assert.match(view, /allowsOutreach: !admin\.refreshUnavailableSources\.contains/);
  assert.match(view, /minHeight: 44/);
});

test('native activation follow-up refreshes the server queue after the audited note', async () => {
  const store = await read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift');
  const start = store.indexOf('func logActivationFollowUp');
  const method = store.slice(start, store.indexOf('func saveSettings', start));

  assert.match(method, /category: "follow_up"/);
  assert.match(method, /api\.adminMemberActivationQueue/);
  assert.match(method, /refreshUnavailableSources\.removeAll/);
  assert.match(method, /activationQueue\.removeAll/);
  assert.match(method, /if !refreshUnavailableSources\.contains/);
});
