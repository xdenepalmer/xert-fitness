import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildAnnouncementPush } from '../api/apns.js';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('member notice pushes opt into the backward-compatible native action category', () => {
  const payload = buildAnnouncementPush({
    id: '3a9791d6-d79b-4eeb-9ad0-d8a6a66bff45',
    title: 'Saturday timetable',
    body: 'Your updated class time is ready.',
  });

  assert.equal(payload.aps.category, 'xert.member-notice');
  assert.equal(payload.announcement_id, '3a9791d6-d79b-4eeb-9ad0-d8a6a66bff45');
  assert.equal(payload.aps['thread-id'], 'xert-member-notices');
});

test('native notification actions preserve an exact cold-launch return route', async () => {
  const [navigation, scheduler, root, store] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Services/ClassReminderNavigation.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Services/ClassReminderScheduler.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/RootView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/XertStore.swift'),
  ]);

  assert.match(navigation, /static let classReminder = "xert\.class-reminder"/);
  assert.match(navigation, /static let memberNotice = "xert\.member-notice"/);
  assert.match(navigation, /title: "View Booking"/);
  assert.match(navigation, /title: "Browse Classes"/);
  assert.match(navigation, /title: "View Notice"/);
  assert.match(navigation, /XertNotificationCategories\.register\(\)/);
  assert.match(navigation, /completionHandler\(\[\.banner, \.list, \.sound\]\)/);
  assert.match(scheduler, /content\.categoryIdentifier = XertNotificationCategories\.classReminder/);
  assert.match(scheduler, /static let maximumScheduledReminders = 32/);
  assert.match(scheduler, /sorted \{ \$0\.start_time < \$1\.start_time \}[\s\S]*prefix\(maximumScheduledReminders\)/);
  assert.match(scheduler, /content\.threadIdentifier = "xert-class-reminders"/);

  assert.match(navigation, /markPendingBrowseClasses[\s\S]*defaults\.removeObject\(forKey: pendingBookingIDKey\)/);
  assert.match(navigation, /markPending\(bookingID:[\s\S]*defaults\.removeObject\(forKey: pendingBrowseClassesKey\)/);
  assert.match(navigation, /response\.actionIdentifier == XertNotificationCategories\.browseClassesAction/);
  assert.match(root, /consumePendingBrowseClasses\(\)[\s\S]*openMemberRoute\(\.booking, source: \.pushNotification\)/);
  assert.match(root, /consumePendingBookingID\(\)[\s\S]*openMemberRoute\(\.upcomingBookings\(bookingID\), source: \.pushNotification\)/);
  assert.equal((root.match(/XertHaptics\.play\(\.mediumImpact\)/g) ?? []).length >= 3, true);

  assert.match(store, /func toggleEventGoal[\s\S]*guard updatingEventGoalID == nil else \{ return \}/);
});
