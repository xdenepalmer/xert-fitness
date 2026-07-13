import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('admin command search is debounced, bounded, and race safe', async () => {
  const [palette, data] = await Promise.all([
    readFile(new URL('../src/components/admin/CommandPalette.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/adminData.js', import.meta.url), 'utf8'),
  ]);
  const search = data.slice(data.indexOf('export async function adminSearchMembers'), data.indexOf('export async function adminRecentMembers'));

  assert.doesNotMatch(palette, /adminListMembers/);
  assert.match(palette, /adminSearchMembers\(memberQuery, 12\)/);
  assert.match(palette, /window\.setTimeout\([\s\S]*?, 250\)/);
  assert.match(palette, /let active = true/);
  assert.match(palette, /if \(active\) setMembers\(results\)/);
  assert.match(palette, /active = false/);
  assert.match(palette, /memberQuery\.length < 2/);

  assert.match(search, /rpc\('admin_search_members'/);
  assert.match(search, /Math\.max\(1, Math\.min\(20/);
  assert.match(search, /rpc\('admin_list_members'\)[\s\S]*?\.or\([\s\S]*?\.limit\(normalizedLimit\)/);
});

test('fresh and upgrade schemas keep member search admin-only and bounded', async () => {
  const schemas = await Promise.all([
    readFile(new URL('../src/supabase/admin_cms_schema.sql', import.meta.url), 'utf8'),
    readFile(new URL('../src/supabase/admin_member_search_upgrade.sql', import.meta.url), 'utf8'),
  ]);

  for (const sql of schemas) {
    assert.match(sql, /function public\.admin_search_members/i);
    assert.match(sql, /if not public\.is_admin\(\)/i);
    assert.match(sql, /greatest\(1, least\(coalesce\(p_limit, 12\), 20\)\)/i);
    assert.match(sql, /char_length\(v_search\) < 2/i);
    assert.match(sql, /revoke execute on function public\.admin_search_members\(text, integer\) from public, anon/i);
    assert.match(sql, /grant execute on function public\.admin_search_members\(text, integer\)\s+to authenticated/i);
  }
});
