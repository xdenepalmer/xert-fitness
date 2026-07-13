import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { normalizeMemberDirectoryQuery } from '../src/lib/memberAdmin.js';

test('member directory queries normalize bounded server paging filters', () => {
  assert.deepEqual(normalizeMemberDirectoryQuery({
    search: '  Alex   Runner  ', role: 'admin', credit: 'available', page: '3', pageSize: '500'
  }), {
    search: 'Alex Runner', role: 'admin', credit: 'available', page: 3,
    pageSize: 100, offset: 200, memberId: null
  });

  assert.deepEqual(normalizeMemberDirectoryQuery({ role: 'owner', credit: 'expired', page: 0, pageSize: 0 }), {
    search: '', role: 'all', credit: 'all', page: 1,
    pageSize: 50, offset: 0, memberId: null
  });
  assert.throws(() => normalizeMemberDirectoryQuery({ memberId: 'not-a-member-id' }), /valid member account/i);
});

test('member directory UI requests only one race-safe server page and exports every match', async () => {
  const [component, data] = await Promise.all([
    readFile(new URL('../src/components/admin/MembersManager.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/adminData.js', import.meta.url), 'utf8'),
  ]);
  const pageHelper = data.slice(data.indexOf('export async function adminListMembersPage'), data.indexOf('export async function adminRecentMembers'));

  assert.doesNotMatch(component, /adminListMembers\b/);
  assert.match(component, /window\.setTimeout\(\(\) => setDebouncedSearch\(search\.trim\(\)\), 250\)/);
  assert.match(component, /let active = true[\s\S]*if \(!active\) return/);
  assert.match(component, /adminListMembersPage\(\{[\s\S]*pageSize: PAGE_SIZE/);
  assert.match(component, /adminExportMembers\(\{ search: debouncedSearch, role: roleFilter, credit: creditFilter \}\)/);
  assert.match(pageHelper, /rpc\('admin_list_members_page'/);
  assert.match(pageHelper, /p_limit: query\.pageSize[\s\S]*p_offset: query\.offset[\s\S]*p_user_id: query\.memberId/);
  assert.match(pageHelper, /serverPaged: false/);
  assert.match(pageHelper, /collectAdminPages\(page =>/);
  assert.match(pageHelper, /filterMembers\(await adminListMembers\(\), query\)/);
});

test('fresh and upgrade SQL install an admin-only bounded member directory RPC', async () => {
  const schemas = await Promise.all([
    readFile(new URL('../src/supabase/admin_cms_schema.sql', import.meta.url), 'utf8'),
    readFile(new URL('../src/supabase/admin_member_directory_upgrade.sql', import.meta.url), 'utf8'),
  ]);

  for (const sql of schemas) {
    assert.match(sql, /function public\.admin_list_members_page/i);
    assert.match(sql, /if not public\.is_admin\(\)/i);
    assert.match(sql, /greatest\(1, least\(coalesce\(p_limit, 50\), 100\)\)/i);
    assert.match(sql, /greatest\(0, coalesce\(p_offset, 0\)\)/i);
    assert.match(sql, /count\(\*\) over\(\) as total_count/i);
    assert.match(sql, /p_user_id is null or p\.id = p_user_id/i);
    assert.match(sql, /revoke execute on function public\.admin_list_members_page[\s\S]*from public, anon/i);
    assert.match(sql, /grant execute on function public\.admin_list_members_page[\s\S]*to authenticated/i);
  }
});
