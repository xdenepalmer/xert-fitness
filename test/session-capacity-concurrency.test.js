import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

for (const path of [
  '../supabase/migrations/20260726117000_session_capacity_concurrency_guard.sql',
  '../src/supabase/session_capacity_concurrency_guard.sql',
]) {
  test(`${path} installs a session-locked capacity guard for concurrent bookings`, () => {
    const sql = read(path);
    assert.match(sql, /create or replace function public\.enforce_session_capacity\(\)/i);
    assert.match(sql, /from public\.class_sessions as session[\s\S]*for update/i);
    assert.match(sql, /raise exception 'SESSION_FULL'/i);
    assert.match(
      sql,
      /before insert or update of status, class_session_id on public\.session_bookings/i,
    );
    // Active-place churn may skip, but a class_session_id move must re-check.
    assert.match(
      sql,
      /old\.class_session_id is not distinct from new\.class_session_id/i,
    );
    assert.match(sql, /values \('session_capacity_concurrency_guard'\)/i);
    assert.match(sql, /revoke all on function public\.enforce_session_capacity\(\)/i);
  });
}

test('book_session still serialises capacity checks on the session row', () => {
  for (const path of [
    '../src/supabase/booking_modes_upgrade.sql',
    '../src/supabase/booking_schema.sql',
  ]) {
    const sql = read(path);
    const book = sql.match(
      /create or replace function public\.book_session\([\s\S]*?^end; \$\$;/m,
    )?.[0];
    assert.ok(book, `${path} must define book_session`);
    assert.match(book, /from public\.class_sessions[\s\S]*for update|from class_sessions where id = p_session_id for update/i);
    assert.match(book, /raise exception 'SESSION_FULL'/i);
  }
});
