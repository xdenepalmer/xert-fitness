import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('reusable archive setup retains targeted notice access protection', () => {
  const source = read('../src/supabase/announcement_archival_upgrade.sql').replace(/\r\n/g, '\n');
  const migration = read('../supabase/migrations/20260714010000_announcement_archival.sql').replace(/\r\n/g, '\n');
  assert.notEqual(migration, source);
  assert.match(source, /do \$announcement_policy\$/i);
  assert.match(source, /audience = 'targeted'[\s\S]*target\.user_id = \(select auth\.uid\(\)\)/i);
});

for (const path of [
  '../src/supabase/booking_schema.sql',
  '../src/supabase/announcement_archival_upgrade.sql',
  '../supabase/migrations/20260714010000_announcement_archival.sql',
]) {
  test(`${path} preserves published notice history and audits lifecycle changes`, () => {
    const sql = read(path);
    assert.match(sql, /first_published_at timestamptz/i);
    assert.match(sql, /archived_at timestamptz/i);
    assert.match(sql, /member_announcement_admin_events/i);
    assert.match(sql, /ANNOUNCEMENT_ARCHIVE_REQUIRED/i);
    assert.match(sql, /ARCHIVED_ANNOUNCEMENT_CANNOT_PUBLISH/i);
    assert.match(sql, /RESTORE_ANNOUNCEMENT_BEFORE_PUBLISHING/i);
    assert.match(sql, /admin_archive_member_announcement\(p_announcement_id uuid, p_archived boolean\)/i);
    assert.match(sql, /action in \('created', 'updated', 'published', 'unpublished', 'archived', 'restored', 'deleted'\)/i);
    assert.match(sql, /announcement\.archived_at is null[\s\S]*announcement\.published_at is not null/i);
    assert.match(sql, /member_announcement_admin_events_admin_read/i);
    assert.match(sql, /revoke execute on function public\.audit_member_announcement_lifecycle\(\) from public, anon, authenticated/i);
    assert.match(sql, /values \('announcement_archival'\)/i);
  });
}

test('admin clients archive published notices and reserve permanent deletion for drafts', () => {
  const data = read('../src/lib/adminData.js');
  const manager = read('../src/components/admin/AnnouncementsManager.jsx');
  const publisher = read('../api/admin-publish-announcement.js');
  assert.match(data, /setMemberAnnouncementArchived[\s\S]*admin_archive_member_announcement/);
  assert.match(data, /ANNOUNCEMENT_ARCHIVE_REQUIRED/);
  assert.match(manager, /item\.first_published_at[\s\S]*setPendingArchive/);
  assert.match(manager, /Restore announcement as draft/);
  assert.match(manager, /delivery history remains available/);
  assert.match(publisher, /archived_at/);
  assert.match(publisher, /Restore this announcement before publishing it/);
  assert.match(publisher, /last_changed_by: user\.id/);
});

test('announcement lifecycle events appear in the immutable Admin Audit ledger', () => {
  const data = read('../src/lib/adminData.js');
  const audit = read('../src/lib/adminAudit.js');
  const view = read('../src/components/admin/AdminAuditLog.jsx');
  assert.match(data, /loadTable\('member_announcement_admin_events'/);
  assert.match(audit, /type: 'announcement'/);
  assert.match(audit, /announcementChanges/);
  assert.match(view, /Member notice changes/);
  assert.match(view, /summary\.announcementChanges/);
  assert.match(view, /label: 'Subject ID'/);
  assert.match(view, /Search admin, .* reason/);
});
