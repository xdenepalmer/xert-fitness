import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const iosRoot = new URL('../ios/XertFitnessApp/XertFitnessApp/', import.meta.url);

test('native member progress is attendance-only, timezone-aware and visible before booking history', async () => {
  const [models, home, account] = await Promise.all([
    readFile(new URL('Models.swift', iosRoot), 'utf8'),
    readFile(new URL('Views/HomeView.swift', iosRoot), 'utf8'),
    readFile(new URL('Views/AccountView.swift', iosRoot), 'utf8'),
  ]);

  assert.match(models, /struct MemberTrainingProgress: Equatable/);
  assert.match(models, /booking\.status == "attended" && booking\.start_time <= now/);
  assert.match(models, /attendanceBySession: \[UUID: Date\]/);
  assert.match(models, /TimeZone\(identifier: "Australia\/Brisbane"\)/);
  assert.match(models, /activeWeeksLastFour = activeWeeks\.intersection\(allowedWeeks\)\.count/);

  assert.match(home, /dashboardTrainingMomentum/);
  assert.match(home, /Training momentum/);
  assert.match(home, /Progress is unavailable until bookings refresh/);
  assert.match(home, /ViewThatFits\(in: \.horizontal\)/);

  const signedIn = account.slice(
    account.indexOf('private func signedInSections'),
    account.indexOf('private var memberReadinessSection'),
  );
  assert.ok(signedIn.indexOf('trainingProgressSection') < signedIn.indexOf('activeBookingSections'));
  assert.match(account, /Text\("Training Momentum"\)\.xertEyebrow\(\)/);
  assert.match(account, /Confirmed, cancelled and missed classes never inflate your totals/);
  assert.match(account, /Attendance only · active weeks use Brisbane Monday–Sunday weeks/);
});

test('booked native class cards expose exact booking management', async () => {
  const booking = await readFile(new URL('Views/BookingView.swift', iosRoot), 'utf8');

  assert.match(booking, /if let booking \{[\s\S]*Text\("Manage booking"\)|if let booking \{[\s\S]*Label\("Manage booking"/);
  assert.match(booking, /xertfitness:\/\/account\/bookings\//);
  assert.match(booking, /booking\.id\.uuidString\.lowercased\(\)/);
  assert.match(booking, /minHeight: 44/);
});
