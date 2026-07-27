import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('native manual credit grants require an exact compact-safe review before mutation', async () => {
  const view = await readFile(
    new URL(
      '../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift',
      import.meta.url,
    ),
    'utf8',
  );
  const start = view.indexOf('private struct AdminCreditGrantView: View');
  const end = view.indexOf('private struct AdminClassesView: View', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const grant = view.slice(start, end);

  assert.match(grant, /private var normalizedReason: String/);
  assert.match(grant, /admin\.loadedMemberDetailID == member\.id/);
  assert.match(grant, /admin\.loadingMemberDetailID == nil/);
  assert.match(grant, /!admin\.memberDetailUnavailableSources\.contains\("credit audit"\)/);
  assert.match(grant, /verified credit audit is no longer current/);
  assert.match(grant, /\(3\.\.\.500\)\.contains\(normalizedReason\.count\)/);
  assert.match(grant, /if value\.count > 500 \{ reason = String\(value\.prefix\(500\)\) \}/);
  assert.match(grant, /Text\("\\\(reason\.count\)\/500"\)/);
  assert.match(grant, /\.safeAreaInset\(edge: \.bottom, spacing: 0\)/);
  assert.match(grant, /Label\("Review \\\(sessions\) credit/);
  assert.match(grant, /accessibilityIdentifier\("owner\.creditGrant\.review"\)/);
  assert.doesNotMatch(grant, /ToolbarItem\(placement: \.confirmationAction\)/);

  assert.match(grant, /Grant \\\(sessions\) class credit[\s\S]*to \\\(member\.displayName\)\?/);
  assert.match(grant, /Text\("\\\(expirySummary\) Audit reason: \\\(normalizedReason\)"\)/);
  assert.match(grant, /private func performGrant\(\)[\s\S]*guard canReviewGrant else \{ return \}/);
  assert.match(grant, /let id = requestID[\s\S]*requestID: id/);
  assert.match(grant, /note: normalizedReason/);
});

test('native staff notes match server bounds and remain reachable above the keyboard', async () => {
  const [view, api] = await Promise.all([
    readFile(
      new URL(
        '../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift',
        import.meta.url,
      ),
      'utf8',
    ),
    readFile(
      new URL(
        '../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift',
        import.meta.url,
      ),
      'utf8',
    ),
  ]);
  const start = view.indexOf('private struct AdminMemberDetailView: View');
  const end = view.indexOf('private struct AdminMemberNoticeHistoryRow: View', start);
  const member = view.slice(start, end);

  assert.match(member, /if value\.count > 1_000 \{ noteBody = String\(value\.prefix\(1_000\)\) \}/);
  assert.match(member, /Text\("\\\(noteBody\.count\)\/1000"\)/);
  assert.match(member, /if noteFocused \|\| hasNoteDraft \{[\s\S]*staffNoteSaveBar/);
  assert.match(member, /accessibilityIdentifier\("owner\.member\.staffNote\.save"\)/);
  assert.match(member, /\(3\.\.\.1_000\)\.contains\(normalizedNoteBody\.count\)/);
  assert.match(member, /private func addStaffNote\(\)[\s\S]*guard canAddStaffNote else \{ return \}/);
  assert.match(member, /body: normalizedNoteBody/);

  const apiStart = api.indexOf('func adminAddMemberNote');
  const contract = api.slice(apiStart, apiStart + 1_500);
  assert.match(contract, /\["general", "coaching", "follow_up", "billing"\]\.contains\(normalizedCategory\)/);
  assert.match(contract, /\(3\.\.\.1_000\)\.contains\(normalizedBody\.count\)/);
  assert.match(contract, /p_category: normalizedCategory/);
  assert.match(contract, /p_body: normalizedBody/);
});
