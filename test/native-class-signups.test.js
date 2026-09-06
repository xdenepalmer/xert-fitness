import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('the owner can see who signed up through the timetable, from the phone', async () => {
  const [store, view] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
  ]);

  // The roster loaded credit members only, so an instant_book class filled
  // through the public timetable read as "No member bookings for this class."
  assert.match(store, /@Published private\(set\) var classSignups: \[AdminLegacyBookingRequest\] = \[\]/);
  assert.match(store, /api\.adminClassSignups\(session: session, classSessionID: classSessionID\)/);
  // A failure loading them must not blank the member roster that already loaded.
  assert.match(store, /classSignups = \[\][\s\S]{0,200}Timetable sign-ups could not be loaded/);

  assert.match(view, /Section\("Timetable sign-ups"\)/);
  assert.match(view, /signupGroup\("In the class", confirmedSignups\)/);
  assert.match(view, /signupGroup\("Awaiting your decision", pendingSignups\)/);
  assert.match(view, /signupGroup\("Waitlist", waitlistedSignups\)/);
  assert.match(view, /publicSignupsSection/);
});

test('every count on the phone covers both doors into the room', async () => {
  const [models, view, migration] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../supabase/migrations/20260906010000_booking_integrity_overhaul.sql'),
  ]);

  // admin_daily_operations reported the member side only, so the Today desk
  // said "0 confirmed / 8 capacity" for a class the timetable had filled — and
  // attendance_due never fired for it either.
  assert.match(migration, /public_confirmed_count bigint/);
  assert.match(migration, /public_waitlist_count bigint/);
  assert.match(migration, /places_held bigint/);
  assert.match(models, /var confirmedInRoom: Int \{ confirmed_count \+ \(public_confirmed_count \?\? 0\) \}/);
  assert.match(view, /\\\(item\.confirmedInRoom\) confirmed \/ \\\(capacity\)/);
  // The roster header used to be the one place that left public requests out.
  assert.match(view, /operation\.requested_count \+ operation\.public_request_count\) requested/);
  assert.match(view, /owner\.roster\.placesHeld/);
});

test('public sign-ups on iOS go through the validated RPC, not straight at the table', async () => {
  const [api, models, migration] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Models.swift'),
    read('../supabase/migrations/20260906010000_booking_integrity_overhaul.sql'),
  ]);

  // anon no longer holds an insert policy on class_bookings, so the old direct
  // POST would simply start failing.
  assert.match(migration, /drop policy if exists "public_insert_class_bookings" on public\.class_bookings;/);
  assert.match(api, /path: "\/rest\/v1\/rpc\/submit_class_signup"/);
  assert.doesNotMatch(api, /path: "\/rest\/v1\/class_bookings"\n\s*\)\n\s*request\.httpMethod = "POST"/);
  assert.match(models, /struct ClassSignupPayload: Encodable, Equatable/);
  // And a duplicate sign-up no longer shows the member raw Postgres text.
  assert.match(models, /class_bookings_active_signup_per_email[\s\S]{0,120}already signed up for this class/);
  assert.match(models, /enum ClassSignupMessage/);
});

test('a clash outranks a full class on iOS, matching the web', async () => {
  const booking = await read('../ios/XertFitnessApp/XertFitnessApp/Views/BookingView.swift');
  // Conflict detection used to be switched off for full classes, so the app
  // actively invited members to waitlist a class overlapping one they held.
  assert.match(booking, /let timeConflict = BookingItem\.timeConflict\(for: session, in: store\.bookings\)/);
  const conflictAt = booking.indexOf('} else if timeConflict != nil {');
  const fullAt = booking.indexOf('} else if session.isFull {');
  assert.ok(conflictAt > 0 && fullAt > 0, 'both branches exist');
  assert.ok(conflictAt < fullAt, 'the conflict branch is evaluated first');
});

test('overbooking from the phone is offered, not hidden behind a raw error', async () => {
  const [api, store, view, models] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
  ]);
  assert.match(api, /var p_allow_overbook: Bool = false/);
  assert.match(api, /allowOverbook: Bool = false/);
  assert.match(store, /@Published var overbookPrompt: AdminOverbookPrompt\?/);
  assert.match(store, /raw\.contains\("CLASS_FULL"\) \|\| raw\.contains\("CLASS_WAITLISTED"\)/);
  assert.match(store, /AdminBookingDecisionMessage\.friendly\(raw\)/);
  assert.match(view, /Button\("Squeeze them in"\)/);
  assert.match(models, /enum AdminBookingDecisionMessage/);
});

test('both iOS calendars run on the gym clock', async () => {
  const [month, adminCal, booking] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/XertMonthCalendar.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminClassCalendarView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/BookingView.swift'),
  ]);
  // A phone that picks up Sydney time in summer used to group and create
  // classes an hour out from the gym they belong to.
  assert.match(month, /static let gymCalendar: Calendar = EventItem\.calendar/);
  assert.match(month, /calendar: Calendar = XertCalendarMonth\.gymCalendar/);
  assert.match(adminCal, /private var calendar: Calendar \{ XertCalendarMonth\.gymCalendar \}/);
  assert.match(booking, /XertCalendarMonth\.gymCalendar\.isDate\(\$0\.start_time, inSameDayAs: day\)/);
  for (const source of [month, adminCal, booking]) {
    assert.doesNotMatch(source, /Calendar\.current/);
  }
});

test('the booking mode picker says what each mode does to the room', async () => {
  const [view, models] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
  ]);
  assert.match(view, /Text\("Sign-ups accepted \(takes a spot\)"\)\.tag\("instant_book"\)/);
  assert.match(view, /bookingModeExplanation\(draft\.bookingMode\)/);
  assert.match(models, /func bookingModeExplanation\(_ mode: String\) -> String/);
  assert.match(models, /take real places, up to the capacity above/);
});
