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

test('web announcement Seen/Push metrics page past max_rows', () => {
  const adminData = read('../src/lib/adminData.js');
  const block = adminData.match(
    /export async function getAllMemberAnnouncements\(\) \{[\s\S]*?\n\}/,
  )?.[0];
  assert.ok(block, 'getAllMemberAnnouncements must be present');
  assert.match(block, /loadMetricBatches\('admin_announcement_metrics'\)/);
  assert.match(block, /loadMetricBatches\('admin_announcement_push_metrics'\)/);
  assert.match(block, /rpc\(rpcName\)[\s\S]*\.range\(from, from \+ pageSize - 1\)/);
  // Uncapped metric RPCs painted Seen/Push as 0 after PostgREST max_rows.
  assert.doesNotMatch(block, /supabase\.rpc\('admin_announcement_metrics'\)\s*,/);

  const tip = read('../supabase/migrations/20260726125000_admin_ops_desk_and_notice_metrics.sql');
  assert.match(tip, /admin_announcement_metrics_paging/);
  assert.match(tip, /group by announcement\.id\s+order by announcement\.id/i);
  assert.match(tip, /group by delivery\.announcement_id\s+order by delivery\.announcement_id/i);
});
