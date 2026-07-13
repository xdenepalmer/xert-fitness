import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sqlPaths = [
  '../src/supabase/booking_schema.sql',
  '../src/supabase/booking_modes_upgrade.sql',
  '../src/supabase/member_waitlist_upgrade.sql',
];

test('every database path installs a secure no-credit member waitlist RPC', async () => {
  for (const path of sqlPaths) {
    const sql = await readFile(new URL(path, import.meta.url), 'utf8');
    const start = sql.indexOf('create or replace function public.join_session_waitlist');
    const end = sql.indexOf('end; $$;', start);
    const rpc = sql.slice(start, end);
    assert.ok(start >= 0 && end > start, `${path} must install join_session_waitlist`);
    assert.match(rpc, /from public\.class_sessions where id = p_session_id for update/i);
    assert.match(rpc, /status in \('requested', 'confirmed', 'waitlisted'\)/i);
    assert.match(rpc, /if v_booked < v_capacity then raise exception 'SESSION_HAS_CAPACITY'/i);
    assert.match(rpc, /credit_batch_id, status[\s\S]*null, 'waitlisted'/i);
    assert.doesNotMatch(rpc, /update public\.credit_batches/i);
    assert.match(sql, /revoke execute on function public\.join_session_waitlist\(uuid\) from public, anon/i);
    assert.match(sql, /grant execute on function public\.join_session_waitlist\(uuid\) to authenticated/i);
    assert.match(sql, /values \('member_waitlist_join'\)/i);
  }
});

test('web and SwiftUI clients expose self-service waitlisting through the shared RPC', async () => {
  const [webData, webPage, swiftAPI, swiftStore, swiftView] = await Promise.all([
    readFile(new URL('../src/lib/bookingData.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/Booking.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Store/XertStore.swift', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Views/BookingView.swift', import.meta.url), 'utf8'),
  ]);
  assert.match(webData, /supabase\.rpc\('join_session_waitlist'/);
  assert.match(webPage, /await joinSessionWaitlist\(s\.id\)/);
  assert.match(webPage, /No class credit has been used/);
  assert.match(swiftAPI, /path: "join_session_waitlist"/);
  assert.match(swiftStore, /func joinWaitlist\(_ session: ClassSession\) async/);
  assert.match(swiftView, /session\.isFull/);
  assert.match(swiftView, /"Join waitlist"/);
});
