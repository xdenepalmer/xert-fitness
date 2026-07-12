import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('member directory loads every deterministic bounded RPC batch', async () => {
  const source = await readFile(new URL('../src/lib/adminData.js', import.meta.url), 'utf8');
  const block = source.slice(source.indexOf('export async function adminListMembers'), source.indexOf('export async function adminRecentMembers'));

  assert.match(block, /collectAdminBatches/);
  assert.match(block, /\.order\('joined_at'.*\.order\('id'/s);
  assert.match(block, /\.range\(from, from \+ pageSize - 1\)/);
});

test('dashboard recent activity does not download the full member directory', async () => {
  const source = await readFile(new URL('../src/components/admin/AdminOverview.jsx', import.meta.url), 'utf8');
  assert.match(source, /adminRecentMembers\(6\)/);
  assert.doesNotMatch(source, /adminListMembers\(/);
});
