import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('native schedule controls preserve exact save and delete receipts across stale readbacks', async () => {
  const [api, store, view] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
  ]);

  const scheduleAPI = api.slice(
    api.indexOf('func adminSaveAvailability'),
    api.indexOf('@discardableResult', api.indexOf('func adminSaveAvailability')),
  );
  assert.match(scheduleAPI, /adminSaveAvailability[\s\S]*async throws -> AdminAvailabilityBlock/);
  assert.match(scheduleAPI, /adminSaveBlackout[\s\S]*async throws -> AdminBlackoutPeriod/);
  assert.match(scheduleAPI, /adminDeleteAvailability[\s\S]*async throws -> UUID/);
  assert.match(scheduleAPI, /adminDeleteBlackout[\s\S]*async throws -> UUID/);
  assert.match(scheduleAPI, /private func adminScheduleMutation<Record: Decodable, Payload: Encodable>/);
  assert.match(scheduleAPI, /request\.setValue\("return=representation", forHTTPHeaderField: "Prefer"\)/);
  assert.match(scheduleAPI, /guard rows\.count == 1, let record = rows\.first else/);
  assert.match(scheduleAPI, /guard rows\.count == 1, rows\[0\]\.id == id else/);

  const scheduleStore = store.slice(
    store.indexOf('func saveAvailability'),
    store.lastIndexOf('\n}'),
  );
  assert.match(store, /@Published private\(set\) var scheduleMutationIsWarning = false/);
  assert.match(scheduleStore, /let saved = try await api\.adminSaveAvailability/);
  assert.match(scheduleStore, /let saved = try await api\.adminSaveBlackout/);
  assert.match(scheduleStore, /mergeAvailability\(saved\)/);
  assert.match(scheduleStore, /mergeBlackout\(saved\)/);
  assert.match(scheduleStore, /availabilityBlocks\.removeAll \{ \$0\.id == removedID \}/);
  assert.match(scheduleStore, /blackoutPeriods\.removeAll \{ \$0\.id == removedID \}/);
  assert.match(scheduleStore, /private func refreshAvailabilitySnapshot\(session: AuthSession\) async -> Bool/);
  assert.match(scheduleStore, /private func refreshBlackoutSnapshot\(session: AuthSession\) async -> Bool/);
  assert.match(scheduleStore, /Record \\\(saved\.id\.uuidString\.lowercased\(\)\)/);
  assert.match(scheduleStore, /Do not repeat this change; refresh Schedule Controls/);
  assert.match(scheduleStore, /Do not repeat this removal; refresh Schedule Controls/);

  const scheduleView = view.slice(
    view.indexOf('private struct AdminAvailabilityView'),
    view.indexOf('private struct AdminRetentionView'),
  );
  assert.match(scheduleView, /admin\.scheduleMutationIsWarning[\s\S]*Color\.orange : Color\.green/);
  assert.match(scheduleView, /\.textSelection\(\.enabled\)/);
  assert.match(scheduleView, /let succeeded: Bool[\s\S]*admin\.deleteAvailability[\s\S]*admin\.deleteBlackout/);
  assert.match(scheduleView, /admin\.scheduleMutationIsWarning \? \.warning : \.success/);
  assert.match(scheduleView, /XertHaptics\.play\(\.error\)/);
});
