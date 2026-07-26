import assert from 'node:assert/strict';
import test from 'node:test';
import {
  notifyClassCancellation,
  notifyTargetedAnnouncement,
} from '../api/admin-publish-announcement.js';

const NOTICE_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';

function announcementAdmin(row) {
  return {
    from(table) {
      assert.equal(table, 'member_announcements');
      const query = {
        select() { return query; },
        eq() { return query; },
        in() { return query; },
        async maybeSingle() {
          return { data: row, error: null };
        },
      };
      return query;
    },
  };
}

test('notifyTargetedAnnouncement refuses archived private notices', async () => {
  await assert.rejects(
    () => notifyTargetedAnnouncement(
      announcementAdmin({
        id: NOTICE_ID,
        title: 'Private',
        body: 'Body',
        archived_at: '2026-07-26T10:00:00.000Z',
      }),
      NOTICE_ID,
    ),
    /TARGETED_NOTICE_ARCHIVED/,
  );
});

test('notifyClassCancellation refuses archived class notices', async () => {
  await assert.rejects(
    () => notifyClassCancellation(
      announcementAdmin({
        id: NOTICE_ID,
        title: 'Cancelled',
        body: 'Body',
        archived_at: '2026-07-26T10:00:00.000Z',
      }),
      SESSION_ID,
    ),
    /CLASS_NOTICE_ARCHIVED/,
  );
});
