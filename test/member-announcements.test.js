import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { announcementState, normalizeAnnouncementInput } from '../src/lib/memberAnnouncements.js';

test('announcement lifecycle distinguishes draft, scheduled, live and expired notices', () => {
  const now = new Date('2026-07-13T04:00:00Z');
  assert.equal(announcementState({}, now), 'draft');
  assert.equal(announcementState({ published_at: '2026-07-14T04:00:00Z' }, now), 'scheduled');
  assert.equal(announcementState({ published_at: '2026-07-12T04:00:00Z' }, now), 'live');
  assert.equal(announcementState({ published_at: '2026-07-12T04:00:00Z', expires_at: '2026-07-13T03:59:59Z' }, now), 'expired');
});

test('announcement input is trimmed, bounded and emits an ISO expiry', () => {
  assert.deepEqual(normalizeAnnouncementInput({
    title: '  Location update ',
    body: ' Saturday training has moved indoors. ',
    tone: 'urgent',
    expires_at: '2026-07-14T14:30',
  }), {
    title: 'Location update',
    body: 'Saturday training has moved indoors.',
    tone: 'urgent',
    expires_at: new Date('2026-07-14T14:30').toISOString(),
  });
  assert.throws(() => normalizeAnnouncementInput({ title: '', body: 'Message' }), /Title/);
  assert.throws(() => normalizeAnnouncementInput({ title: 'Title', body: '' }), /Message/);
  assert.throws(() => normalizeAnnouncementInput({ title: 'Title', body: 'x'.repeat(2001) }), /2,000/);
});

test('announcement schema and clients enforce member visibility and privacy lifecycle', async () => {
  const [migration, receiptMigration, bookingData, adminData, account, store, api, home] = await Promise.all([
    readFile(new URL('../supabase/migrations/20260713040000_member_announcements.sql', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260713050000_announcement_receipts.sql', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/bookingData.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/adminData.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/Account.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Store/XertStore.swift', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Views/HomeView.swift', import.meta.url), 'utf8'),
  ]);

  assert.match(migration, /published_at is not null[\s\S]*?published_at <= now\(\)[\s\S]*?expires_at > now\(\)/i);
  assert.match(migration, /to authenticated[\s\S]*?with check \(public\.is_admin\(\)\)/i);
  assert.match(migration, /revoke all on table public\.member_announcements from public, anon/i);
  assert.doesNotMatch(migration, /for select\s+to anon/i);
  assert.match(receiptMigration, /function public\.my_member_announcements\(\)/i);
  assert.match(receiptMigration, /on conflict \(announcement_id, user_id\) do update/i);
  assert.match(receiptMigration, /receipt\.dismissed_at is null/i);
  assert.match(receiptMigration, /function public\.dismiss_member_announcement\(p_announcement_id uuid\)/i);
  assert.match(receiptMigration, /if not public\.is_admin\(\) then raise exception 'ADMIN_REQUIRED'/i);
  assert.match(receiptMigration, /returns table \(announcement_id uuid, read_count bigint, dismissed_count bigint\)/i);
  assert.match(receiptMigration, /revoke execute on function public\.my_member_announcements\(\) from public, anon/i);
  assert.match(receiptMigration, /grant select on table public\.member_announcement_receipts to authenticated/i);
  assert.doesNotMatch(receiptMigration, /grant (?:insert|update|select, insert)/i);
  assert.match(bookingData, /getMemberAnnouncements[\s\S]*?rpc\('my_member_announcements'\)/);
  assert.match(bookingData, /dismissMemberAnnouncement[\s\S]*?rpc\('dismiss_member_announcement'/);
  assert.match(adminData, /createMemberAnnouncement[\s\S]*?created_by: user\.id/);
  assert.match(adminData, /rpc\('admin_announcement_metrics'\)/);
  assert.match(account, /getMemberAnnouncements\(\)\.catch\(\(\) => \[\]\)/);
  assert.match(account, /handleDismissAnnouncement[\s\S]*?dismissMemberAnnouncement/);
  assert.match(store, /announcements = \[\][\s\S]*?unavailableDataSources\.subtract/);
  assert.match(store, /func dismissAnnouncement[\s\S]*?canApplyMemberState/);
  assert.match(api, /func announcements[\s\S]*?my_member_announcements/);
  assert.match(api, /func dismissAnnouncement[\s\S]*?dismiss_member_announcement/);
  assert.match(home, /Member notices[\s\S]*?MemberAnnouncementRow/);
  assert.match(home, /accessibilityLabel\("Dismiss/);
});
