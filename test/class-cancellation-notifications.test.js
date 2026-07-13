import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import adminPublishAnnouncementHandler, { summarizePreviousClassAlertPushes } from '../api/admin-publish-announcement.js';
import { loadSubscriptions } from '../api/apns.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const source = read('../src/supabase/class_cancellation_notifications_upgrade.sql');
const migration = read('../supabase/migrations/20260714015000_class_cancellation_notifications.sql');
const adminData = read('../src/lib/adminData.js');
const adminCalendar = read('../src/components/admin/ClassCalendarAdmin.jsx');
const apns = read('../api/apns.js');
const endpoint = read('../api/admin-publish-announcement.js');

test('linked migration exactly installs targeted cancellation notices', () => {
  assert.equal(migration.replace(/\r\n/g, '\n'), source.replace(/\r\n/g, '\n'));
  assert.match(source, /add column if not exists audience text not null default 'all'/i);
  assert.match(source, /create table if not exists public\.member_announcement_targets/i);
  assert.match(source, /primary key \(announcement_id, user_id\)/i);
  assert.match(source, /audience = 'targeted'[\s\S]*target\.user_id = \(select auth\.uid\(\)\)/i);
  assert.match(source, /revoke all on table public\.member_announcement_targets from public, anon, authenticated/i);
  assert.match(source, /values \('class_cancellation_notifications'\)/i);
});

test('class cancellation saves targets before invalidating bookings and returning credits', () => {
  const helperStart = source.indexOf('create or replace function public.create_class_cancellation_notice');
  const cancellationStart = source.indexOf('create or replace function public.admin_cancel_class_session');
  const cancellation = source.slice(cancellationStart);
  assert.ok(helperStart > 0 && cancellationStart > helperStart);
  assert.match(source, /source_kind[\s\S]*'class_cancellation'/i);
  assert.match(source, /'Choose another class'[\s\S]*'\/booking'/i);
  assert.match(source, /insert into public\.member_announcement_targets[\s\S]*status in \('requested', 'confirmed', 'waitlisted'\)/i);
  assert.ok(cancellation.indexOf('perform public.create_class_cancellation_notice') < cancellation.indexOf('update public.session_bookings'));
  assert.match(cancellation, /set remaining = credits\.remaining \+ refunds\.credit_count/i);
  assert.match(source, /revoke all on function public\.create_class_cancellation_notice\(uuid\) from public, anon, authenticated/i);
  assert.match(read('../src/supabase/admin_cms_schema.sql'), /to_regprocedure\('public\.create_class_cancellation_notice\(uuid\)'\)/i);
  assert.match(read('../src/supabase/booking_modes_upgrade.sql'), /to_regprocedure\('public\.create_class_cancellation_notice\(uuid\)'\)/i);
});

test('member RPC and direct-read policy exclude alerts targeted to another account', () => {
  const rpc = source.slice(source.indexOf('create function public.my_member_announcements'), source.indexOf('create or replace function public.dismiss_member_announcement'));
  assert.match(rpc, /announcement\.audience = 'all'[\s\S]*announcement\.audience = 'targeted'/i);
  assert.match(rpc, /target\.announcement_id = announcement\.id[\s\S]*target\.user_id = v_user_id/i);
  assert.match(source, /create policy "member_announcements_select_live_or_admin"[\s\S]*target\.user_id = \(select auth\.uid\(\)\)/i);
  assert.match(source, /dismiss_member_announcement[\s\S]*announcement\.audience = 'targeted'[\s\S]*target\.user_id = v_user_id/i);
});

test('admin cancellation attempts bounded targeted APNs and retains contact fallback', () => {
  const flow = adminCalendar.slice(adminCalendar.indexOf('const handleCancel = async'), adminCalendar.indexOf('const handleBookingStatus'));
  assert.match(adminData, /notifyClassCancellation[\s\S]*\/api\/admin-publish-announcement[\s\S]*notify_class_cancellation/);
  assert.match(adminData, /member_announcements'\)\.select\('\*'\)\.eq\('audience', 'all'\)/);
  assert.ok(flow.indexOf('await cancelClassSession') < flow.indexOf('await notifyClassCancellation'));
  assert.match(adminCalendar, /Private in-app notice created for/);
  assert.match(adminCalendar, /Use the contact fallback below/);
  assert.match(endpoint, /member_announcement_targets/);
  assert.match(endpoint, /targetUserIds: userIds/);
  assert.match(apns, /TARGET_USER_BATCH_SIZE = 100/);
  assert.match(apns, /if \(userBatch\) query = query\.in\('user_id', userBatch\)/);
  assert.doesNotMatch(apns, /targetUserIds\.filter\(Boolean\)\)\]\.slice/);
});

test('delivery retries do not send a second push after an audited attempt', () => {
  assert.deepEqual(summarizePreviousClassAlertPushes([
    { status: 'delivered' },
    { status: 'failed' },
    { status: 'invalid_token' },
  ]), {
    configured: true,
    already_attempted: true,
    attempted: 3,
    delivered: 1,
    failed: 2,
  });
  assert.match(endpoint, /if \(\(previous \|\| \[\]\)\.length > 0\)/);
});

test('class notice endpoint authenticates before revealing server configuration', async () => {
  const response = await adminPublishAnnouncementHandler({
    method: 'POST',
    headers: {},
    body: { action: 'notify_class_cancellation' },
  });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Not authenticated.' });
});

test('targeted subscription loading chunks every recipient without truncation', async () => {
  const batches = [];
  const admin = {
    from() {
      const query = {
        select() { return this; },
        eq() { return this; },
        order() { return this; },
        range() { return this; },
        in(_column, values) { this.values = values; return this; },
        then(resolve, reject) {
          batches.push(this.values);
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const userIds = Array.from({ length: 205 }, (_, index) => `member-${index}`);
  await loadSubscriptions(admin, [...userIds, userIds[0]]);
  assert.deepEqual(batches.map(batch => batch.length), [100, 100, 5]);
  assert.equal(new Set(batches.flat()).size, 205);
});

test('web and SwiftUI consume cancellation alerts through the existing private notice inbox', () => {
  assert.match(read('../src/lib/bookingData.js'), /getMemberAnnouncements[\s\S]*my_member_announcements/);
  assert.match(read('../src/pages/Account.jsx'), /Member notices[\s\S]*announcements\.map/);
  assert.match(read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift'), /func announcements[\s\S]*my_member_announcements/);
  assert.match(read('../ios/XertFitnessApp/XertFitnessApp/Store/XertStore.swift'), /announcementRequest = api\.announcements/);
  assert.match(read('../ios/XertFitnessApp/XertFitnessApp/Views/HomeView.swift'), /Member notices[\s\S]*MemberAnnouncementRow/);
});
