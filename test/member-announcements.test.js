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
  const [migration, bookingData, adminData, account, store, api, home] = await Promise.all([
    readFile(new URL('../supabase/migrations/20260713040000_member_announcements.sql', import.meta.url), 'utf8'),
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
  assert.match(bookingData, /getMemberAnnouncements[\s\S]*?\.lte\('published_at', nowIso\)[\s\S]*?expires_at\.gt/);
  assert.match(adminData, /createMemberAnnouncement[\s\S]*?created_by: user\.id/);
  assert.match(account, /getMemberAnnouncements\(\)\.catch\(\(\) => \[\]\)/);
  assert.match(store, /announcements = \[\][\s\S]*?unavailableDataSources\.subtract/);
  assert.match(api, /func announcements[\s\S]*?published_at\.desc/);
  assert.match(home, /Member notices[\s\S]*?MemberAnnouncementRow/);
});
