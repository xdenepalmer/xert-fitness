import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import adminPublishAnnouncementHandler, {
  loadAnnouncementTargetUserIds,
  summarizePreviousClassAlertPushes,
} from '../api/admin-publish-announcement.js';
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

test('class cancellation notice targets credit-holding and waitlisted bookings', () => {
  const helperStart = source.indexOf('create or replace function public.create_class_cancellation_notice');
  assert.ok(helperStart > 0);
  assert.match(source, /source_kind[\s\S]*'class_cancellation'/i);
  assert.match(source, /'Choose another class'[\s\S]*'\/booking'/i);
  assert.match(
    source,
    /insert into public\.member_announcement_targets[\s\S]*status in \('requested', 'confirmed', 'waitlisted', 'attended', 'no_show'\)/i,
  );
  // Cancel+refund is owned by later credit-refund scripts so re-running this
  // upgrade cannot reinstall the silent RETURNING-status no-refund body.
  assert.doesNotMatch(source, /create or replace function public\.admin_cancel_class_session/i);
  assert.match(source, /revoke all on function public\.create_class_cancellation_notice\(uuid\) from public, anon, authenticated/i);
  assert.match(read('../src/supabase/admin_cms_schema.sql'), /to_regprocedure\('public\.create_class_cancellation_notice\(uuid\)'\)/i);
  assert.match(read('../src/supabase/booking_modes_upgrade.sql'), /to_regprocedure\('public\.create_class_cancellation_notice\(uuid\)'\)/i);
  assert.match(read('../src/supabase/credit_batch_refund_reactivation.sql'), /create or replace function public\.admin_cancel_class_session/i);
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
  assert.match(adminData, /collectAdminBatches[\s\S]*member_announcements[\s\S]*eq\('audience', 'all'\)/);
  assert.ok(flow.indexOf('await cancelClassSession') < flow.indexOf('await notifyClassCancellation'));
  assert.match(adminCalendar, /Private in-app notice created for/);
  assert.match(adminCalendar, /Use the contact fallback below/);
  assert.match(endpoint, /member_announcement_targets/);
  assert.match(endpoint, /loadAnnouncementTargetUserIds/);
  assert.match(endpoint, /loadAnnouncementDeliveryStatuses/);
  assert.match(endpoint, /targetUserIds: userIds/);
  assert.match(endpoint, /\.range\(from, from \+ pageSize - 1\)/);
  assert.match(apns, /TARGET_USER_BATCH_SIZE = 100/);
  assert.match(apns, /if \(userBatch\) query = query\.in\('user_id', userBatch\)/);
  assert.doesNotMatch(apns, /targetUserIds\.filter\(Boolean\)\)\]\.slice/);
  // Custom cancel dialog (not AdminConfirmDialog) needs its own same-paint lock
  // so credit return + notify cannot race twice before busy re-renders.
  assert.match(adminCalendar, /const cancelClassLockRef = useRef\(false\)/);
  assert.match(flow, /if \(!session \|\| cancelClassLockRef\.current \|\| isCancellingSession\) return/);
  assert.match(flow, /cancelClassLockRef\.current = true/);
  assert.match(flow, /cancelClassLockRef\.current = false/);
});

test('delivery history is summarised when no new APNs attempt is needed', () => {
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
  // Class-cancel / targeted notify always call sendMemberAnnouncementPushes so
  // transient `failed` rows and newly registered devices stay retryable; history
  // is only surfaced when that call attempts nothing new.
  assert.match(endpoint, /Number\(push\.attempted\) \|\| 0\) === 0 && previous\.length > 0/);
  assert.match(endpoint, /sendMemberAnnouncementPushes\(\{[\s\S]*targetUserIds: userIds/);
});

test('announcement publishing logs 500s behind a request id for operators', () => {
  assert.match(endpoint, /createRequestTrace\(response\)/);
  assert.match(endpoint, /console\.error\('Announcement publishing failed\.'[\s\S]*requestId: trace\.requestId/);
  assert.match(endpoint, /console\.error\('Class cancellation push delivery failed\.'[\s\S]*requestId: trace\.requestId/);
});

test('class notice endpoint authenticates before revealing server configuration', async () => {
  const response = await adminPublishAnnouncementHandler({
    method: 'POST',
    headers: {},
    body: { action: 'notify_class_cancellation' },
  });
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.error, 'Not authenticated.');
  assert.match(String(body.request_id || ''), /^[0-9a-f-]{36}$/i);
  assert.equal(response.headers.get('x-request-id'), body.request_id);
});

test('class-cancel notice targets page past PostgREST max_rows', async () => {
  const ranges = [];
  const admin = {
    from(table) {
      assert.equal(table, 'member_announcement_targets');
      const query = {
        select() { return query; },
        eq() { return query; },
        order() { return query; },
        async range(from, to) {
          ranges.push([from, to]);
          if (from === 0) {
            return {
              data: Array.from({ length: 500 }, (_, index) => ({ user_id: `member-${index}` })),
              error: null,
            };
          }
          return {
            data: Array.from({ length: 3 }, (_, index) => ({ user_id: `member-${500 + index}` })),
            error: null,
          };
        },
      };
      return query;
    },
  };
  const userIds = await loadAnnouncementTargetUserIds(admin, '11111111-1111-4111-8111-111111111111');
  assert.deepEqual(ranges, [[0, 499], [500, 999]]);
  assert.equal(userIds.length, 503);
  assert.equal(userIds[0], 'member-0');
  assert.equal(userIds[502], 'member-502');
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
