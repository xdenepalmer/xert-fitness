import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('native owner calendar mirrors the web class calendar with bank quick-add', async () => {
  const [calendarView, scheduleHost, api, models] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminClassCalendarView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
  ]);

  // The calendar is the owner's default view of the timetable workspace,
  // with the classic list one segment away.
  assert.match(scheduleHost, /@State private var mode = AdminScheduleViewMode\.calendar/);
  assert.match(scheduleHost, /accessibilityIdentifier\("owner\.timetable\.mode"\)/);
  assert.match(scheduleHost, /AdminClassCalendarSections\(/);
  assert.match(scheduleHost, /initialStartTime: createInitialStart/);

  // Pressing a date drives the day panel: manage that day's classes,
  // quick-add a bank preset, or start a pre-filled custom class.
  assert.match(calendarView, /Section\("Add from the class bank"\)/);
  assert.match(calendarView, /Label\("New class this day"/);
  assert.match(calendarView, /admin\.saveClass\(session: session, classSession: nil, draft: draft\)/);
  assert.match(calendarView, /guard quickAddAllowed/);
  assert.match(calendarView, /accessibilityIdentifier\("owner\.calendar\.newClassThisDay"\)/);

  // Quick-add is blocked without a current timetable snapshot, and the bank
  // fails soft with a retry when class_templates is missing.
  assert.match(calendarView, /timetableIsCurrent && admin\.savingClassID == nil/);
  assert.match(calendarView, /apply the class_template_bank migration/);

  // The bank rides the same shared class_templates table as the web app.
  assert.match(api, /func adminClassTemplates/);
  assert.match(api, /\/rest\/v1\/class_templates/);
  assert.match(models, /struct AdminClassTemplate: Identifiable, Codable, Hashable/);
  assert.match(models, /func draft\(on day: Date, startMinute: Int, publish: Bool/);

  // A pre-filled start date must not open the editor dirty.
  assert.match(scheduleHost, /baseline\.startTime = initialStartTime/);
});

test('the member app gets its own month calendar over the shared grid', async () => {
  const [booking, grid, discovery] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/BookingView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/XertMonthCalendar.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/ClassSessionDiscovery.swift'),
  ]);

  // Pressing a day narrows the existing class list rather than rendering a
  // second set of cards, so every booking rule carries over untouched.
  assert.match(discovery, /day: Date\? = nil/);
  assert.match(discovery, /let matchesDay = day\.map \{ calendar\.isDate\(session\.start_time, inSameDayAs: \$0\) \} \?\? true/);
  assert.match(booking, /day: selectedClassDay/);
  assert.match(booking, /ForEach\(visibleSessions\)/);

  // The calendar sits between the filters and the class list.
  assert.match(booking, /classDiscoverySection\s+classCalendarSection\s+classesSection\(/);
  assert.match(booking, /Text\("Class Calendar"\)\.xertEyebrow\(\)/);
  assert.match(booking, /Show all days/);

  // Clearing filters also clears the chosen day.
  assert.match(booking, /private func resetClassDiscovery\(\)[\s\S]*selectedClassDay = nil/);

  // Grid geometry is shared, pure and locale-aware.
  assert.match(grid, /enum XertCalendarMonth/);
  assert.match(grid, /static func cells\(for anchor: Date/);
  assert.match(grid, /calendar\.firstWeekday/);
  assert.match(grid, /struct XertMonthCalendarView: View/);
});

test('roster status changes work from the calendar view as well as the list view', async () => {
  const admin = await read('../src/components/admin/ClassCalendarAdmin.jsx');
  assert.match(admin, /const activeRosterSessionId = \(\) => expandedBookings \|\| boardRosterSessionId;/);
  assert.match(admin, /const handleRosterStatus = async \(bookingId, status\) => \{\s*const sessionId = activeRosterSessionId\(\);/);
  assert.match(admin, /const handleBookingStatus = async \(id, status\) => \{\s*const sessionId = activeRosterSessionId\(\);/);
  assert.doesNotMatch(admin, /const sessionId = expandedBookings;\s*if \(!sessionId\) return;/, 'a missing session must never fail silently');
});
