import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../supabase/migrations/20260714019000_shared_admin_optimistic_locking.sql');
const upgrade = read('../src/supabase/shared_admin_optimistic_locking_upgrade.sql');
const adminData = read('../src/lib/adminData.js');
const contentManager = read('../src/components/admin/ContentManager.jsx');
const launchSettings = read('../src/components/admin/SoftLaunchSettings.jsx');
const announcements = read('../src/components/admin/AnnouncementsManager.jsx');
const publishApi = read('../api/admin-publish-announcement.js');

test('shared admin locking migration is canonical and enforces durable row versions', () => {
  assert.equal(migration, upgrade);
  assert.match(migration, /touch_shared_admin_record_updated_at/);
  assert.match(migration, /site_content_touch_updated_at/);
  assert.match(migration, /admin_settings_touch_updated_at/);
  assert.match(migration, /admin_archive_member_announcement\([\s\S]*p_expected_updated_at timestamptz/);
  assert.match(migration, /ANNOUNCEMENT_STALE/);
  assert.match(migration, /revoke execute on function public\.admin_archive_member_announcement\(uuid, boolean\) from public, anon, authenticated/i);
  assert.match(migration, /values \('shared_admin_optimistic_locking'\)/i);
});

test('shared admin mutations compare the version originally loaded by the screen', () => {
  assert.match(adminData, /updateSoftLaunchSettings\(updates, baseline\)[\s\S]*?\.eq\('updated_at', baseline\.updated_at\)/);
  assert.match(adminData, /saveSiteContent\(key, contentData, expectedUpdatedAt\)[\s\S]*?\.eq\('updated_at', expectedUpdatedAt\)/);
  assert.match(adminData, /updateMemberAnnouncement\(id, updates, expectedUpdatedAt\)[\s\S]*?\.eq\('updated_at', expectedUpdatedAt\)/);
  assert.match(adminData, /deleteMemberAnnouncement\(id, expectedUpdatedAt\)[\s\S]*?\.eq\('updated_at', expectedUpdatedAt\)/);
  assert.match(adminData, /p_expected_updated_at: expectedUpdatedAt/);
  assert.match(contentManager, /expectedUpdatedAt=\{content\[s\.key\]\?\.updated_at\}/);
  assert.match(contentManager, /saveSiteContent\(section\.key, clean, expectedUpdatedAt\)/);
  assert.match(launchSettings, /updateSoftLaunchSettings\(normalized, savedSettings\)/);
  assert.match(announcements, /publishMemberAnnouncement\(editing\?\.id, payload, editing\?\.updated_at\)/);
  assert.match(announcements, /deleteMemberAnnouncement\(item\.id, item\.updated_at\)/);
  assert.match(announcements, /setMemberAnnouncementArchived\(item\.id, archived, item\.updated_at\)/);
});

test('announcement publishing atomically rejects a stale server version', () => {
  assert.match(publishApi, /expected_updated_at/);
  assert.match(publishApi, /\.eq\('updated_at', publish\.expectedUpdatedAt\)/);
  assert.match(publishApi, /changed since you opened it[\s\S]*409/);
});
