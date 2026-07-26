import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [store, view] = await Promise.all([
  readFile(
    new URL('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift', import.meta.url),
    'utf8',
  ),
  readFile(
    new URL('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift', import.meta.url),
    'utf8',
  ),
]);

const memberLifecycle = store.slice(
  store.indexOf('func loadMemberDetail('),
  store.indexOf('private func refreshLoadedMemberDirectory('),
);
const loadMemberDetailLifecycle = memberLifecycle.slice(
  0,
  memberLifecycle.indexOf('func clearMemberDetail('),
);
const memberView = view.slice(
  view.indexOf('private struct AdminMemberDetailView'),
  view.indexOf('private struct AdminMemberNoticeHistoryRow'),
);

test('native member detail loading is latest-request-wins and same-member refresh preserving', () => {
  assert.doesNotMatch(loadMemberDetailLifecycle, /guard loadingMemberDetailID == nil else \{ return \}/);
  assert.doesNotMatch(loadMemberDetailLifecycle, /guard servicingMemberID == nil else \{ return \}/);
  assert.match(loadMemberDetailLifecycle, /guard servicingMemberID != memberID else \{ return \}/);
  assert.match(loadMemberDetailLifecycle, /preserveCurrent: Bool = false/);
  assert.match(
    loadMemberDetailLifecycle,
    /let canPreserveCurrent = preserveCurrent && loadedMemberDetailID == memberID/,
  );
  assert.match(loadMemberDetailLifecycle, /memberDetailGeneration &\+= 1/);
  assert.match(
    loadMemberDetailLifecycle,
    /memberDetailGeneration == generation, loadedMemberDetailID == memberID/,
  );
  assert.match(loadMemberDetailLifecycle, /if !canPreserveCurrent \{[\s\S]*memberNotes = \[\]/);
  assert.match(loadMemberDetailLifecycle, /if memberDetailGeneration == generation \{ loadingMemberDetailID = nil \}/);
});

test('native member private mutations require the exact settled record', () => {
  for (const method of [
    'addMemberNote',
    'archiveMemberNote',
    'sendMemberNotice',
    'setMemberRole',
  ]) {
    const start = memberLifecycle.indexOf(`func ${method}`);
    assert.notEqual(start, -1, `${method} must remain implemented`);
    const body = memberLifecycle.slice(start, memberLifecycle.indexOf('\n    func ', start + 8));
    assert.match(body, /loadedMemberDetailID == memberID/);
    assert.match(body, /loadingMemberDetailID == nil/);
  }

  assert.match(
    memberLifecycle,
    /func revealMemberEmergencyContact[\s\S]*loadedMemberDetailID == memberID,[\s\S]*loadingMemberDetailID == nil/,
  );
  assert.match(
    memberLifecycle,
    /func addMemberNote[\s\S]*let generation = memberDetailGeneration[\s\S]*memberDetailGeneration == generation,[\s\S]*loadedMemberDetailID == memberID/,
  );
  assert.match(
    memberLifecycle,
    /func archiveMemberNote[\s\S]*let generation = memberDetailGeneration[\s\S]*memberDetailGeneration == generation,[\s\S]*loadedMemberDetailID == memberID/,
  );
});

test('native member record exposes visible recovery and never renders an earlier private record', () => {
  assert.match(memberView, /private var memberRecordIsCurrent: Bool/);
  assert.match(memberView, /private var memberRecordMutationsAllowed: Bool/);
  assert.match(memberView, /Showing the last verified record/);
  assert.match(memberView, /Retry member record/);
  assert.match(memberView, /accessibilityLabel\("Refresh member record"\)/);
  assert.match(memberView, /\.task\(id: current\.id\)/);
  assert.match(
    memberView,
    /\.refreshable \{[\s\S]*preserveCurrent: true/,
  );
  assert.match(memberView, /if memberRecordIsCurrent \{[\s\S]*ForEach\(admin\.memberNotes\)/);
  assert.match(memberView, /if !memberRecordIsCurrent \{[\s\S]*Loading private notice history/);
  assert.match(memberView, /\.disabled\(!memberRecordMutationsAllowed\)/);
});
