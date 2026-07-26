import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('waitlist skip notices no longer claim a credit was returned', () => {
  for (const path of [
    '../src/supabase/waitlist_skip_notice_accuracy.sql',
    '../supabase/migrations/20260726115000_waitlist_skip_notice_accuracy.sql',
  ]) {
    const sql = read(path);
    assert.match(sql, /admin_set_booking_status_with_notice\(/i);
    assert.match(sql, /v_booking\.status = 'waitlisted'/i);
    assert.match(sql, /Waitlist place removed/);
    assert.match(sql, /No class credit was charged/);
    assert.match(
      sql,
      /Any reserved class credit has been returned to your account/,
      `${path} must keep the credit-return copy for confirmed/requested cancels`,
    );
    assert.match(sql, /values \('waitlist_skip_notice_accuracy'\)/i);
    assert.match(sql, /revoke execute on function public\.admin_set_booking_status_with_notice\(uuid, text, uuid\)\s+from public, anon/i);
    assert.match(sql, /grant execute on function public\.admin_set_booking_status_with_notice\(uuid, text, uuid\)\s+to authenticated/i);
  }
});

test('skip still routes through the notice RPC so the accurate copy is delivered', () => {
  const skip = read('../src/supabase/waitlist_skip_concurrency_upgrade.sql');
  const data = read('../src/lib/adminData.js');
  assert.match(skip, /admin_set_booking_status_with_notice\(\s*p_expected_booking_id,\s*'cancelled',\s*p_request_id/i);
  assert.match(data, /admin_skip_waitlisted_head_with_notice/);
  assert.match(data, /notifyTargetedAnnouncementPush\(decision\.announcement_id\)/);
});
