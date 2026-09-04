import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { respondentIdentity, respondentLabel } from '../src/lib/formResponseRecord.js';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('a response is labelled by the name it actually carries, wherever that lives', async () => {
  // The questionnaire asks for a name as one of its questions rather than in a
  // separate contact block, which listed every response as anonymous.
  const snapshot = { questions: [
    { id: 'name', type: 'name_fields', question: 'Full name' },
    { id: 'email', type: 'email', question: 'Email' },
    { id: 'phone', type: 'phone', question: 'Mobile' },
  ] };
  const response = {
    answers: { name: { first: 'Neil', last: 'Cupples' }, email: 'neil@example.com', phone: '0400 000 000' },
    form_snapshot: snapshot,
  };
  assert.equal(respondentLabel(response), 'Neil Cupples');
  assert.deepEqual(respondentIdentity(response), {
    name: 'Neil Cupples', email: 'neil@example.com', phone: '0400 000 000',
  });
  // A separate contact block still wins, and nothing invents a name.
  assert.equal(respondentLabel({ respondent_name: 'From contact block', answers: {}, form_snapshot: snapshot }), 'From contact block');
  assert.equal(respondentLabel({ answers: {}, form_snapshot: snapshot }), 'Anonymous response');
  assert.equal(respondentLabel({ answers: { email: 'only@example.com' }, form_snapshot: snapshot }), 'only@example.com');

  const manager = await read('../src/components/admin/FormsSurveysManager.jsx');
  assert.match(manager, /respondentLabel\(response\)/);
  assert.doesNotMatch(manager, /respondent_name \|\| 'Anonymous response'/);
  const record = await read('../src/components/admin/FormResponseRecord.jsx');
  assert.match(record, /const respondent = respondentLabel\(response, definition\);/);
});

test('staff can book a member into a class from the Command Centre', async () => {
  // The database already did this atomically for the app; the web had no way in.
  const data = await read('../src/lib/adminData.js');
  assert.match(data, /export async function staffBookMemberIntoClass\(sessionId, memberId, requestId = globalThis\.crypto\?\.randomUUID\?\.\(\)\)/);
  assert.match(data, /supabase\.rpc\('admin_book_member_into_class', \{/);
  assert.match(data, /receipt\.request_id !== requestId \|\| receipt\.session_id !== sessionId \|\| receipt\.member_id !== memberId/,
    'an unverifiable receipt must not be reported as a booking');
  assert.match(data, /notifyTargetedAnnouncementPush\(receipt\.announcement_id\)/);
  for (const [code, wording] of [['SESSION_FULL', /class is full/], ['NO_CREDITS', /no session credits/], ['ALREADY_BOOKED', /already has a place/]]) {
    assert.match(data, new RegExp(`${code}[\\s\\S]{0,120}`), `${code} is handled`);
    assert.match(data, wording);
  }

  const calendar = await read('../src/components/admin/ClassCalendarAdmin.jsx');
  assert.match(calendar, /Add an attendee/);
  assert.match(calendar, /adminSearchMembers\(term\)/);
  assert.match(calendar, /staffBookMemberIntoClass\(session\.id, member\.id\)/);
  assert.match(calendar, /refreshRoster\(session\.id\), refreshBookings\(session\.id\)/,
    'the roster reflects the new booking straight away');
});
