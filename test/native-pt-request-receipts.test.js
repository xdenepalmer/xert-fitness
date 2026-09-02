import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('native PT updates retain audit receipts across single, bulk, and stale readbacks', async () => {
  const [api, store, view] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
  ]);

  const updateAPI = api.slice(
    api.indexOf('func adminUpdatePTRequest'),
    api.indexOf('func adminUpdatePlatformSettings'),
  );
  assert.match(updateAPI, /async throws -> UUID/);
  assert.match(updateAPI, /let receipt: UUID\? = try await rpc/);
  assert.match(updateAPI, /guard let receipt else/);
  assert.match(updateAPI, /return receipt/);

  const single = store.slice(
    store.indexOf('func updatePTRequest'),
    store.indexOf('func sendOwnerPushSmokeTest'),
  );
  assert.match(store, /@Published private\(set\) var ptRequestStatusIsWarning/);
  assert.match(single, /let receipt: UUID/);
  assert.match(single, /receipt = try await api\.adminUpdatePTRequest/);
  assert.match(single, /let queueRefreshed = await refreshPTRequestsAfterMutation/);
  assert.match(single, /Audit receipt \\\(receiptText\)/);
  assert.match(single, /Do not repeat this change; refresh Personal training/);
  assert.match(single, /lastUpdatedAt = Date\(\)[\s\S]*return true/);

  const bulk = store.slice(
    store.indexOf('func bulkUpdatePTRequests'),
    store.indexOf('var ptRequestsAreCurrent'),
  );
  assert.match(bulk, /var auditReceipts: \[UUID\] = \[\]/);
  assert.match(bulk, /auditReceipts\.append\(receipt\)/);
  assert.match(bulk, /auditReceipts\.prefix\(3\)/);
  assert.match(bulk, /\+ \\\(remainingReceiptCount\) more in Activity log/);
  assert.match(bulk, /Do not repeat successful changes; refresh Personal training/);

  const desk = view.slice(
    view.indexOf('private struct AdminPTRequestsView'),
    view.indexOf('private struct AdminIntakeCSVDocument'),
  );
  assert.match(desk, /admin\.ptRequestStatusIsWarning[\s\S]*Color\.orange : Color\.green/);
  assert.match(desk, /\.textSelection\(\.enabled\)/);
  assert.match(desk, /let failedIDs = await admin\.bulkUpdatePTRequests/);
  assert.match(desk, /let succeeded = await admin\.updatePTRequest/);
  assert.match(desk, /admin\.ptRequestStatusIsWarning \? \.warning : \.success/);
});
