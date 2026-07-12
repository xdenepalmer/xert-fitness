import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('business totals collect every paid order and active credit page', async () => {
  const source = await readFile(new URL('../src/lib/adminData.js', import.meta.url), 'utf8');
  const block = source.slice(source.indexOf('export async function getBusinessStats'), source.indexOf('// ─── Sidebar badge counts'));

  assert.equal((block.match(/collectAdminPages/g) || []).length, 2);
  assert.match(block, /\.eq\('status', 'paid'\)/);
  assert.match(block, /\.gt\('remaining', 0\)/);
  assert.equal((block.match(/count:\s*'exact'/g) || []).length >= 4, true);
});

test('fresh and upgrade database paths index business metric scans', async () => {
  const files = await Promise.all([
    readFile(new URL('../src/supabase/booking_schema.sql', import.meta.url), 'utf8'),
    readFile(new URL('../src/supabase/business_metrics_upgrade.sql', import.meta.url), 'utf8')
  ]);

  for (const sql of files) {
    assert.match(sql, /orders_status_created_idx/i);
    assert.match(sql, /credit_batches_active_idx/i);
    assert.match(sql, /where remaining > 0/i);
  }
});
