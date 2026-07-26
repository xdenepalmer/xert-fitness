import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('admin member detail pages credits, orders and grant audit past max_rows', () => {
  const adminData = read('../src/lib/adminData.js');
  const block = adminData.match(
    /export async function adminMemberDetail\([\s\S]*?^export async function getAllSiteContent/m,
  )?.[0];
  assert.ok(block, 'adminMemberDetail must be present');
  assert.match(block, /loadMemberBatches\('credit_batches'/);
  assert.match(block, /loadMemberBatches\('orders'/);
  assert.match(block, /loadMemberBatches\('admin_credit_grants'/);
  assert.match(block, /collectAdminBatches/);
  assert.match(block, /\.range\(from, from \+ pageSize - 1\)/);
  // Direct uncapped selects for money history must not remain.
  assert.doesNotMatch(
    block,
    /from\('credit_batches'\)\.select\('\*'\)\.eq\('user_id', userId\)\.order\('created_at'/,
  );
  assert.doesNotMatch(
    block,
    /from\('orders'\)\.select\('\*, products\(name\)'\)\.eq\('user_id', userId\)\.order\('created_at'/,
  );
});
