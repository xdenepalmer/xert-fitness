import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const adminStoreURL = new URL(
  '../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift',
  import.meta.url,
);

test('owner Members metric uses a directory total that filtered loads cannot overwrite', async () => {
  const source = await readFile(adminStoreURL, 'utf8');

  assert.match(source, /@Published private\(set\) var memberDirectoryTotalCount: Int = 0/);
  assert.match(
    source,
    /var memberCount: Int \{\s*memberDirectoryTotalCount > 0 \? memberDirectoryTotalCount : members\.count\s*\}/,
  );
  assert.match(source, /private func replaceMembers\(_ rows: \[AdminMemberSummary\], updatesDirectoryTotal: Bool\)/);
  assert.match(source, /replaceMembers\(try await memberRequest, updatesDirectoryTotal: true\)/);
  assert.match(
    source,
    /replaceMembers\(\s*try await api\.adminMembers\(session: session, search: query\),\s*updatesDirectoryTotal: normalized\.isEmpty\s*\)/,
  );
  assert.match(
    source,
    /let member = try await api\.adminMember\(session: session, id: memberID\)\s*members\.removeAll\(where: \{ \$0\.id == memberID \}\)\s*members\.insert\(member, at: 0\)/,
  );
  assert.doesNotMatch(
    source,
    /members\.insert\(member, at: 0\)[\s\S]{0,80}memberDirectoryTotalCount\s*=/,
  );
  assert.doesNotMatch(source, /var memberCount: Int \{ members\.first\?\.total_count/);
});

test('owner Waitlisted and Follow-ups metrics use the RPC ceiling instead of the default page of 20', async () => {
  const source = await readFile(adminStoreURL, 'utf8');
  const refresh = source.slice(
    source.indexOf('func refresh(session: AuthSession)'),
    source.indexOf('func refreshHealth(session: AuthSession)'),
  );
  const bookingSnapshot = source.slice(
    source.indexOf('private func refreshBookingOperationsSnapshot'),
    source.indexOf('func saveLegacyBookingNotes'),
  );

  assert.match(refresh, /adminWaitlist\(session: session, limit: 50\)/);
  assert.match(refresh, /adminFollowUps\(session: session, limit: 50\)/);
  assert.doesNotMatch(refresh, /adminWaitlist\(session: session\)(?!\s*,)/);
  assert.doesNotMatch(refresh, /adminFollowUps\(session: session\)(?!\s*,)/);
  assert.match(bookingSnapshot, /adminWaitlist\(session: session, limit: 50\)/);
  assert.doesNotMatch(bookingSnapshot, /adminWaitlist\(session: session\)(?!\s*,)/);
});
