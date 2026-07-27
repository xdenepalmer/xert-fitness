import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('native class saves preserve confirmed mutation truth across failed readbacks', async () => {
  const [api, store, view] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
  ]);

  const createClass = api.slice(
    api.indexOf('func adminCreateClass'),
    api.indexOf('func adminUpdateClass'),
  );
  assert.match(createClass, /async throws -> UUID/);
  assert.match(createClass, /return=representation/);
  assert.match(createClass, /let rows: \[AdminMutationID\] = try await decode\(request\)/);
  assert.match(createClass, /guard let created = rows\.first, rows\.count == 1/);
  assert.match(createClass, /return created\.id/);

  const updateClass = api.slice(
    api.indexOf('func adminUpdateClass'),
    api.indexOf('func adminCancelClass'),
  );
  assert.match(updateClass, /async throws -> UUID/);
  assert.match(updateClass, /return try await rpc/);

  const saveClass = store.slice(
    store.indexOf('func saveClass'),
    store.indexOf('func duplicateClass'),
  );
  assert.match(store, /@Published private\(set\) var classMutationStatusMessage/);
  assert.match(store, /@Published private\(set\) var classMutationStatusIsWarning/);
  assert.match(saveClass, /let mutationID: UUID/);
  assert.match(saveClass, /mutationID = try await api\.adminCreateClass/);
  assert.match(saveClass, /markScheduleSourceUnavailable\("full timetable"\)/);
  assert.match(saveClass, /markScheduleSourceUnavailable\("today's classes"\)/);
  assert.match(saveClass, /Receipt \\\(receipt\)/);
  assert.match(saveClass, /Do not save or create it again; refresh Class Desk/);
  assert.match(saveClass, /lastUpdatedAt = Date\(\)[\s\S]*return true/);

  const schedule = view.slice(
    view.indexOf('private struct AdminScheduleView'),
    view.indexOf('private struct AdminClassCancellationFollowUpView'),
  );
  assert.match(schedule, /if let status = admin\.classMutationStatusMessage/);
  assert.match(schedule, /\.textSelection\(\.enabled\)/);
  assert.match(schedule, /admin\.classMutationStatusIsWarning[\s\S]*Color\.orange/);
  assert.match(view, /XertHaptics\.play\(admin\.classMutationStatusIsWarning \? \.warning : \.success\)/);
});
