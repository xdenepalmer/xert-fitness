import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('native roster decisions preserve verified receipts and lock stale class actions', async () => {
  const [store, view] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
  ]);

  const decision = store.slice(
    store.indexOf('func setBookingStatus'),
    store.indexOf('func bookMemberIntoClass'),
  );
  assert.match(store, /@Published private\(set\) var bookingDecisionStatusMessage/);
  assert.match(store, /@Published private\(set\) var bookingDecisionStatusIsWarning/);
  assert.match(store, /@Published private\(set\) var bookingDecisionStatusSessionID: UUID\?/);
  assert.match(decision, /rosterLoadErrorSessionID != classSessionID/);
  assert.match(decision, /let outcome: AdminBookingDecisionOutcome/);
  assert.match(decision, /outcome = try await api\.adminSetBookingStatus/);
  assert.match(decision, /let rosterRefreshed = await loadClassRoster/);
  assert.match(decision, /markCatalogueSourceUnavailable\("today's classes"\)/);
  assert.match(decision, /markCatalogueSourceUnavailable\("waitlists"\)/);
  assert.match(decision, /outcome\.decision\.booking_id\.uuidString\.lowercased\(\)/);
  assert.match(decision, /Do not repeat this decision; refresh the roster/);
  assert.match(decision, /lastUpdatedAt = Date\(\)[\s\S]*return true/);

  const roster = view.slice(
    view.indexOf('private struct AdminClassRosterView'),
    view.indexOf('private struct AdminRosterMemberPicker'),
  );
  assert.match(roster, /admin\.bookingDecisionStatusSessionID == operation\.id,[\s\S]*let status = admin\.bookingDecisionStatusMessage/);
  assert.match(roster, /admin\.bookingDecisionStatusSessionID == operation\.id,[\s\S]*let warning = admin\.bookingDecisionNoticeWarning/);
  assert.match(roster, /owner\.roster\.bookingDecisionReceipt/);
  assert.match(roster, /\.textSelection\(\.enabled\)/);
  assert.match(roster, /let succeeded = await admin\.setBookingStatus/);
  assert.match(roster, /admin\.bookingDecisionStatusIsWarning[\s\S]*\.warning/);
  assert.match(roster, /\.disabled\(admin\.updatingBookingID != nil \|\| loadFailed\)/);
});
