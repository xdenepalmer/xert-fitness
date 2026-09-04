import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('the app texts the same class audience as the web, not just the member roster', async () => {
  // A class holds member bookings (session_bookings, via admin_session_roster)
  // and public timetable sign-ups (class_bookings). The app used to load only
  // the roster, so a class of timetable sign-ups reported nobody to text while
  // the web listed their numbers.
  const view = await read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminSmsView.swift');
  assert.match(view, /async let rosterRequest = api\.adminSessionRoster\(session: session, classSessionID: classID\)/);
  assert.match(view, /async let signupRequest = api\.adminClassSignups\(session: session, classSessionID: classID\)/);
  assert.match(view, /detail: "Roster · \\\(\$0\.status\)"/);
  assert.match(view, /detail: "Sign-up · \\\(\$0\.status\)"/);

  const api = await read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift');
  assert.match(api, /func adminClassSignups\(/);
  assert.match(api, /adminClassBookings\(session: auth, classSessionID: classSessionID, statuses: nil\)/,
    'sign-ups are not filtered by status, matching getClassBookings on the web');
  assert.match(api, /statuses: \["requested", "confirmed", "waitlisted"\]/,
    'the cancellation notice keeps its narrower list');

  // The web screens both audiences through one loader.
  const audiences = await read('../src/lib/adminAudiences.js');
  assert.match(audiences, /getClassBookings\(\{ class_session_id: sessionId \}\)/);
  assert.match(audiences, /adminSessionRoster\(sessionId\)/);
  assert.match(audiences, /Roster · \$\{member\.status\}/);
  assert.match(audiences, /Sign-up · \$\{signup\.status\}/);
});
