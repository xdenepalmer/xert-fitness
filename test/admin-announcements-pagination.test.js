import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('web getAllMemberAnnouncements pages broadcast notices past max_rows', () => {
  const adminData = read('../src/lib/adminData.js');
  const block = adminData.match(
    /export async function getAllMemberAnnouncements\(\) \{[\s\S]*?\n\}/,
  )?.[0];
  assert.ok(block, 'getAllMemberAnnouncements must be present');
  assert.match(block, /collectAdminBatches/);
  assert.match(block, /member_announcements/);
  assert.match(block, /eq\('audience', 'all'\)/);
  assert.match(block, /\.range\(from, from \+ pageSize - 1\)/);
  // Single uncapped select would silently hide later broadcast notices.
  assert.doesNotMatch(
    block,
    /from\('member_announcements'\)\.select\('\*'\)\.eq\('audience', 'all'\)\.order\('created_at'/,
  );
});
