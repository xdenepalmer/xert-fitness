import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('follow-up data loader is bounded and degrades only when its migration is absent', () => {
  const source = read('../src/lib/adminData.js');
  const helper = source.slice(
    source.indexOf('export async function adminListMemberFollowUps'),
    source.indexOf('async function getAuditProfiles')
  );
  assert.match(helper, /Math\.max\(1, Math\.min\(50/);
  assert.match(helper, /rpc\('admin_member_follow_up_queue', \{ p_limit: safeLimit \}\)/);
  assert.match(helper, /\['42883', 'PGRST202'\]/);
  assert.match(helper, /available: false/);
});

test('member admin renders direct contact actions and refreshes after staff follow-up', () => {
  const source = read('../src/components/admin/MembersManager.jsx');
  assert.match(source, /Follow-up queue/);
  assert.match(source, /No first booking/);
  assert.match(source, /Credits expiring/);
  assert.match(source, /Credits inactive/);
  assert.match(source, /Renewal due/);
  assert.match(source, /href=\{contact\.mailto\}/);
  assert.match(source, /href=\{`tel:\$\{member\.phone\}`\}/);
  assert.match(source, /onNotesChanged\?\.\(\)/);
  assert.match(source, /onNotesChanged=\{refresh\}/);
});

test('member private notice, staff notes and follow-up log refuse same-paint double submits', () => {
  const source = read('../src/components/admin/MembersManager.jsx');
  assert.match(source, /const noticeLockRef = useRef\(false\)/);
  assert.match(source, /if \(noticeLockRef\.current \|\| noticeSaving\) return/);
  assert.match(source, /noticeLockRef\.current = true/);
  assert.match(source, /const noteLockRef = useRef\(false\)/);
  assert.match(source, /if \(noteLockRef\.current \|\| noteSaving\) return/);
  assert.match(source, /function FollowUpModal[\s\S]*const saveLockRef = useRef\(false\)/);
  assert.match(source, /function FollowUpModal[\s\S]*if \(saveLockRef\.current \|\| saving\) return/);
});

for (const path of ['../src/supabase/admin_cms_schema.sql', '../src/supabase/admin_member_follow_up_upgrade.sql']) {
  test(`${path} installs a secure, indexed and bounded follow-up queue`, () => {
    const sql = read(path);
    assert.match(sql, /create index if not exists session_bookings_member_status_session_idx[\s\S]*user_id, status, class_session_id/i);
    assert.match(sql, /function public\.admin_member_follow_up_queue\(p_limit integer default 20\)/i);
    assert.match(sql, /greatest\(1, least\(coalesce\(p_limit, 20\), 50\)\)/i);
    assert.match(sql, /if not public\.is_admin\(\) then raise exception 'ADMIN_ONLY'/i);
    assert.match(sql, /bookings_count = 0[\s\S]*interval '7 days'[\s\S]*'no_first_booking'/i);
    assert.match(sql, /credits_expiring > 0 then 'credits_expiring'/i);
    assert.match(sql, /expires_at > now\(\)[\s\S]*expires_at <= now\(\) \+ interval '7 days'/i);
    assert.match(sql, /credits_expiring bigint, next_credit_expiry timestamptz/i);
    assert.match(sql, /credits_remaining > 0[\s\S]*next_booking_at is null[\s\S]*interval '14 days'[\s\S]*'idle_credits'/i);
    assert.match(sql, /credits_remaining = 0[\s\S]*last_attended_at >= now\(\) - interval '30 days'[\s\S]*'renewal_due'/i);
    assert.match(sql, /last_follow_up_at is null or a\.last_follow_up_at < now\(\) - interval '7 days'/i);
    assert.match(sql, /where c\.reason is not null[\s\S]*limit v_limit/i);
    assert.match(sql, /revoke execute on function public\.admin_member_follow_up_queue\(integer\) from public, anon/i);
    assert.match(sql, /grant execute on function public\.admin_member_follow_up_queue\(integer\) to authenticated/i);
  });
}
