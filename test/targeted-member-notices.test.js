import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizeTargetedMemberNotice } from '../src/lib/memberAdmin.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('targeted member notice input is bounded and maps native actions', () => {
  const now = new Date('2026-07-14T00:00:00.000Z');
  assert.deepEqual(normalizeTargetedMemberNotice(
    '11111111-1111-4111-8111-111111111111',
    { title: ' Booking reminder ', body: ' Your class is ready. ', tone: 'ACTION', action: 'booking', expiryDays: '7' },
    now,
  ), {
    userId: '11111111-1111-4111-8111-111111111111',
    title: 'Booking reminder',
    body: 'Your class is ready.',
    tone: 'action',
    ctaLabel: 'Book a class',
    ctaUrl: '/booking',
    expiresAt: '2026-07-21T00:00:00.000Z',
  });
  assert.throws(() => normalizeTargetedMemberNotice('bad-id', { title: 'Valid', body: 'Valid' }), /valid member/i);
  assert.throws(() => normalizeTargetedMemberNotice('11111111-1111-4111-8111-111111111111', { title: 'No', body: 'Valid' }), /titles/i);
  assert.throws(() => normalizeTargetedMemberNotice('11111111-1111-4111-8111-111111111111', { title: 'Valid', body: 'No', expiryDays: 365 }), /messages|expiry/i);
});

for (const path of [
  '../src/supabase/targeted_member_notices_upgrade.sql',
  '../supabase/migrations/20260714021000_targeted_member_notices.sql',
]) {
  test(`${path} installs a private, transactional and bounded member-notice contract`, () => {
    const sql = read(path);
    assert.match(sql, /function public\.admin_send_member_notice\(/i);
    assert.match(sql, /if not public\.is_admin\(\) then raise exception 'ADMIN_ONLY'/i);
    assert.match(sql, /audience, source_kind, source_id[\s\S]*'targeted', 'member_direct', v_announcement_id/i);
    assert.match(sql, /insert into public\.member_announcement_targets[\s\S]*p_user_id/i);
    assert.match(sql, /created_by, last_changed_by[\s\S]*auth\.uid\(\), auth\.uid\(\)/i);
    assert.match(sql, /function public\.admin_list_member_notices\(p_user_id uuid\)/i);
    assert.match(sql, /left join public\.member_announcement_receipts/i);
    assert.match(sql, /left join public\.push_notification_deliveries/i);
    assert.match(sql, /limit 50/i);
    assert.match(sql, /revoke execute on function public\.admin_send_member_notice[\s\S]*from public, anon/i);
    assert.match(sql, /grant execute on function public\.admin_send_member_notice[\s\S]*to authenticated/i);
    assert.match(sql, /values \('targeted_member_notices'\)/i);
  });
}

test('admin member service creates the notice before requesting idempotent APNs delivery', () => {
  const adminData = read('../src/lib/adminData.js');
  const api = read('../api/admin-publish-announcement.js');
  assert.match(adminData, /adminSendMemberNotice[\s\S]*rpc\('admin_send_member_notice'/);
  assert.match(adminData, /notify_targeted_announcement/);
  assert.match(adminData, /adminListMemberNotices[\s\S]*rpc\('admin_list_member_notices'/);
  assert.match(adminData, /memberNoticesAvailable: notices\.available/);
  assert.match(api, /notifyTargetedAnnouncement/);
  assert.match(api, /\.in\('source_kind', \['member_direct', 'waitlist_promotion', 'booking_decision'\]\)/);
  assert.match(api, /userIds\.length !== 1/);
  assert.match(api, /sendMemberAnnouncementPushes\(\{ admin, announcement, targetUserIds: userIds \}\)/);
  assert.match(api, /previous \|\| \[\]\)\.length > 0/);
});

test('member drawer composes, protects and reports private notices', () => {
  const members = read('../src/components/admin/MembersManager.jsx');
  assert.match(members, /Private notices/);
  assert.match(members, /adminSendMemberNotice\(member\.id, noticeDraft\)/);
  assert.match(members, /Discard private notice draft\?/);
  assert.match(members, /pendingSubjectSwitch/);
  assert.match(members, /Switching members permanently discards/);
  assert.match(members, /Read in app/);
  assert.match(members, /Push delivered/);
  assert.match(members, /targeted_member_notices_upgrade\.sql/);
});

test('SwiftUI already consumes targeted notices through the secure member RPC', () => {
  assert.match(read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift'), /func announcements[\s\S]*my_member_announcements/);
  assert.match(read('../ios/XertFitnessApp/XertFitnessApp/Views/HomeView.swift'), /MemberAnnouncementRow/);
  assert.match(read('../ios/XertFitnessApp/XertFitnessApp/Services/ClassReminderNavigation.swift'), /xertOpenAnnouncements/);
});
