import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('native intake recovery is bounded, owner scoped, and purged with private local state', async () => {
  const [store, localState, swiftTests] = await Promise.all([
    read('ios/XertFitnessApp/XertFitnessApp/Services/AdminIntakeDraftStore.swift'),
    read('ios/XertFitnessApp/XertFitnessApp/Services/MemberLocalState.swift'),
    read('ios/XertFitnessApp/XertFitnessAppTests/ModelsTests.swift'),
  ]);

  assert.match(store, /maximumAge: TimeInterval = 8 \* 60 \* 60/);
  assert.match(store, /maximumEncodedBytes = 16 \* 1_024/);
  assert.match(store, /snapshot\.ownerID == ownerID/);
  assert.match(store, /snapshot\.recordID == recordID/);
  assert.match(store, /snapshot\.baselineToken == baselineToken/);
  assert.match(store, /draft\.notes\.count <= 5_000/);
  assert.match(store, /draft\.status\?\.count \?\? 0\) <= 64/);
  assert.match(store, /static func clearAll\(ownerID: UUID/);
  assert.match(localState, /AdminIntakeDraftStore\.clearAll\(ownerID: userID/);
  assert.match(swiftTests, /testAdminIntakeDraftRecoveryIsBoundedScopedAndExpiring/);
});

test('all native intake editors recover work and keep save actions above phone chrome', async () => {
  const view = await read(
    'ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift',
  );
  const contracts = [
    {
      name: 'booking request',
      start: 'private struct AdminBookingRequestDetailView: View',
      end: 'private struct AdminSiteContentEditor: View',
      kind: 'bookingRequest',
      bar: 'bookingNotesSaveBar',
      identifier: 'owner.bookingRequest.notes.save',
    },
    {
      name: 'lead',
      start: 'private struct AdminLeadDetailView: View',
      end: 'private struct AdminPTRequestsView: View',
      kind: 'lead',
      bar: 'leadSaveBar',
      identifier: 'owner.lead.save',
    },
    {
      name: 'PT request',
      start: 'private struct AdminPTRequestDetailView: View',
      end: 'private struct AdminPlatformView: View',
      kind: 'ptRequest',
      bar: 'ptNotesSaveBar',
      identifier: 'owner.ptRequest.notes.save',
    },
  ];

  for (const contract of contracts) {
    const start = view.indexOf(contract.start);
    const end = view.indexOf(contract.end, start);
    assert.notEqual(start, -1, `${contract.name} editor should exist`);
    assert.notEqual(end, -1, `${contract.name} editor boundary should exist`);
    const source = view.slice(start, end);

    assert.match(source, new RegExp(`AdminIntakeDraftStore\\.load\\([\\s\\S]*kind: \\.${contract.kind}`));
    assert.match(source, new RegExp(`AdminIntakeDraftStore\\.save\\([\\s\\S]*kind: \\.${contract.kind}`));
    assert.match(source, new RegExp(`AdminIntakeDraftStore\\.clear\\([\\s\\S]*kind: \\.${contract.kind}`));
    assert.match(source, new RegExp(`safeAreaInset\\(edge: \\.bottom, spacing: 0\\)[\\s\\S]*${contract.bar}`));
    assert.match(source, new RegExp(`accessibilityIdentifier\\("${contract.identifier.replaceAll('.', '\\.')}"\\)`));
    assert.match(source, /\.task\(id: [^)]+\)/);
    assert.match(source, /guard !Task\.isCancelled, !hasCommitted,/);
  }
});
