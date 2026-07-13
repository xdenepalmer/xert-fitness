import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const adminSources = [
  '../src/components/admin/AnnouncementsManager.jsx',
  '../src/components/admin/AvailabilityManager.jsx',
  '../src/components/admin/CoachesManager.jsx',
  '../src/components/admin/EventsManager.jsx',
  '../src/components/admin/MembersManager.jsx',
].map(path => ({ path, source: readFileSync(new URL(path, import.meta.url), 'utf8') }));

test('destructive admin actions use the shared accessible confirmation dialog', () => {
  for (const { path, source } of adminSources) {
    assert.match(source, /<AdminConfirmDialog/, `${path} must render the shared confirmation dialog`);
    assert.match(source, /pending(?:Delete|Removal|RoleChange)/, `${path} must retain the selected target until confirmation`);
    assert.doesNotMatch(source, /(?:window\.)?confirm\s*\(/, `${path} must not use a browser-native confirmation prompt`);
  }
});

test('destructive confirmation copy names the operational consequence', () => {
  const combined = adminSources.map(item => item.source).join('\n');
  assert.match(combined, /no longer appear as available for scheduling/);
  assert.match(combined, /unpublished notice will be permanently removed/);
  assert.match(combined, /push-delivery history will be preserved/);
  assert.match(combined, /removed from the public Coaches page/);
  assert.match(combined, /member training goal/);
  assert.match(combined, /grants access to member data, bookings, sales, content, and staff controls/);
  assert.match(combined, /removes access to all administrative tools/);
});
