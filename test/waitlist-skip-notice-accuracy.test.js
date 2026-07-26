import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('waitlist skip notices no longer claim a credit was returned', () => {
  // Tip mirror ships booking-decision pack-still-live honesty (26123).
  const tip = read('../src/supabase/waitlist_skip_notice_accuracy.sql');
  assert.match(tip, /admin_set_booking_status_with_notice\(/i);
  assert.match(tip, /v_booking\.status = 'waitlisted'/i);
  assert.match(tip, /Waitlist place removed/);
  assert.match(tip, /No class credit was charged/);
  assert.match(tip, /Reserved credit is returned when the pack is still live/);
  assert.doesNotMatch(tip, /Your reserved credit has been returned/);
  assert.match(tip, /values\s*\([\s\S]*'waitlist_skip_notice_accuracy'/i);
  assert.match(tip, /revoke execute on function public\.admin_set_booking_status_with_notice\(uuid, text, uuid\)\s+from public, anon/i);
  assert.match(tip, /grant execute on function public\.admin_set_booking_status_with_notice\(uuid, text, uuid\)\s+to authenticated/i);

  // Historical migration keeps the waitlist-skip shape and skip-if-newer for honesty.
  const historical = read('../supabase/migrations/20260726115000_waitlist_skip_notice_accuracy.sql');
  assert.match(historical, /Waitlist place removed/);
  assert.match(historical, /No class credit was charged/);
  assert.match(historical, /keeping newer admin_set_booking_status_with_notice/);
  assert.match(historical, /pack is still live/);
  assert.match(historical, /values \('waitlist_skip_notice_accuracy'\)/i);
});

test('skip still routes through the notice RPC so the accurate copy is delivered', () => {
  const skip = read('../src/supabase/waitlist_skip_concurrency_upgrade.sql');
  const data = read('../src/lib/adminData.js');
  assert.match(skip, /admin_set_booking_status_with_notice\(\s*p_expected_booking_id,\s*'cancelled',\s*p_request_id/i);
  assert.match(data, /admin_skip_waitlisted_head_with_notice/);
  assert.match(data, /notifyTargetedAnnouncementPush\(decision\.announcement_id\)/);
});
