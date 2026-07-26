import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const layout = readFileSync(new URL('../src/components/admin/AdminLayout.jsx', import.meta.url), 'utf8');

test('badge-count effect mounts once and is not keyed on activeSection', () => {
  const badgeEffectStart = layout.indexOf('Keep attention counts current');
  assert.ok(badgeEffectStart > 0, 'badge effect comment should exist');
  const badgeEffectEnd = layout.indexOf('const activeLabel', badgeEffectStart);
  const badgeEffect = layout.slice(badgeEffectStart, badgeEffectEnd);

  assert.match(badgeEffect, /getAdminBadgeCounts\(\)/);
  assert.match(badgeEffect, /shouldRefreshAdminData/);
  assert.match(badgeEffect, /ADMIN_BADGE_REFRESH_INTERVAL_MS/);
  assert.match(badgeEffect, /\}, \[\]\);/);
  assert.doesNotMatch(badgeEffect, /\}, \[activeSection\]\);/);
  assert.doesNotMatch(badgeEffect, /activeSection/);
});
