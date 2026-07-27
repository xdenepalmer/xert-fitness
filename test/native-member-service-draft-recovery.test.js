import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('native member-service drafts are codable and isolated by owner and member', async () => {
  const [models, catalogueStore, intakeStore, swiftTests] = await Promise.all([
    read('ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
    read('ios/XertFitnessApp/XertFitnessApp/Services/AdminCatalogueDraftStore.swift'),
    read('ios/XertFitnessApp/XertFitnessApp/Services/AdminIntakeDraftStore.swift'),
    read('ios/XertFitnessApp/XertFitnessAppTests/ModelsTests.swift'),
  ]);

  assert.match(models, /enum AdminMemberNoticeAction: String, CaseIterable, Identifiable, Codable, Hashable/);
  assert.match(models, /struct AdminMemberNoticeDraft: Codable, Hashable/);
  assert.match(catalogueStore, /case memberNotice/);
  assert.match(intakeStore, /case memberStaffNote/);
  assert.match(swiftTests, /testAdminMemberServiceDraftsRoundTripPerMemberAndOwner/);
  assert.match(swiftTests, /recordID: otherMemberID\.uuidString/);
  assert.match(swiftTests, /recordID: otherMemberID,/);
});

test('member staff notes recover, retry, and clear only after a confirmed mutation', async () => {
  const view = await read(
    'ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift',
  );
  const start = view.indexOf('private struct AdminMemberDetailView: View');
  const end = view.indexOf('private struct AdminMemberNoticeHistoryRow: View', start);
  const member = view.slice(start, end);

  assert.match(member, /AdminIntakeDraftStore\.load\([\s\S]*kind: \.memberStaffNote/);
  assert.match(member, /AdminIntakeDraftStore\.save\([\s\S]*kind: \.memberStaffNote/);
  assert.match(member, /AdminIntakeDraftStore\.clear\([\s\S]*kind: \.memberStaffNote/);
  assert.match(member, /\.task\(id: staffNoteDraft\)/);
  assert.match(member, /guard !Task\.isCancelled, !hasCommittedStaffNote, !isBusy/);
  assert.match(member, /if await admin\.addMemberNote[\s\S]*hasCommittedStaffNote = true[\s\S]*clearStaffNoteDraft\(\)/);
  assert.match(member, /Button\("Discard note", role: \.destructive\)[\s\S]*clearStaffNoteDraft\(\)/);
});

test('private member notices persist through failed sends and clear after success or discard', async () => {
  const view = await read(
    'ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift',
  );
  const start = view.indexOf('private struct AdminMemberNoticeComposer: View');
  const end = view.indexOf('private struct AdminCreditGrantView: View', start);
  const composer = view.slice(start, end);

  assert.match(composer, /let onSend: \(AdminMemberNoticeDraft\) async -> Bool/);
  assert.match(composer, /AdminCatalogueDraftStore\.load\([\s\S]*kind: \.memberNotice/);
  assert.match(composer, /AdminCatalogueDraftStore\.save\([\s\S]*kind: \.memberNotice/);
  assert.match(composer, /AdminCatalogueDraftStore\.clear\([\s\S]*kind: \.memberNotice/);
  assert.match(composer, /\.task\(id: draft\)/);
  assert.match(composer, /guard await onSend\(draft\) else \{ return \}[\s\S]*hasCommitted = true[\s\S]*clearRecoveryDraft\(\)/);
  assert.match(composer, /Button\("Discard draft", role: \.destructive\)[\s\S]*clearRecoveryDraft\(\)/);
  assert.match(composer, /guard !Task\.isCancelled, !hasCommitted, !isSending/);
});
