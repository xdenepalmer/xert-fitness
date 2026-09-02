import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('native waitlist promotion preserves its durable receipt across failed queue readbacks', async () => {
  const [store, view] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
  ]);

  const promote = store.slice(
    store.indexOf('func promoteNext'),
    store.indexOf('func loadClassRoster'),
  );
  assert.match(store, /@Published private\(set\) var promotionStatusMessage/);
  assert.match(store, /@Published private\(set\) var promotionStatusIsWarning/);
  assert.match(promote, /let outcome: AdminWaitlistPromotionOutcome/);
  assert.match(promote, /outcome = try await api\.adminPromoteNextWaitlisted/);
  assert.match(promote, /promotionNoticeWarning = outcome\.warning/);
  assert.match(promote, /markScheduleSourceUnavailable\("waitlists"\)/);
  assert.match(promote, /markScheduleSourceUnavailable\("today's classes"\)/);
  assert.match(promote, /outcome\.promotion\.booking_id\.uuidString\.lowercased\(\)/);
  assert.match(promote, /Do not promote another member; refresh Today's classes/);
  assert.match(promote, /lastUpdatedAt = Date\(\)[\s\S]*return true/);

  const classDesk = view.slice(
    view.indexOf('private struct AdminClassesView'),
    view.indexOf('private struct AdminClassRosterView'),
  );
  assert.match(classDesk, /if let status = admin\.promotionStatusMessage/);
  assert.match(classDesk, /\.textSelection\(\.enabled\)/);
  assert.match(classDesk, /admin\.promotionStatusIsWarning[\s\S]*Color\.orange/);
  assert.match(classDesk, /let succeeded = await admin\.promoteNext/);
  assert.match(classDesk, /admin\.promotionStatusIsWarning \|\| admin\.promotionNoticeWarning != nil/);
});
