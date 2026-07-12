import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('both admin booking sources load deterministic complete server pages', async () => {
  const source = await readFile(new URL('../src/lib/adminData.js', import.meta.url), 'utf8');
  const block = source.slice(source.indexOf('export async function getClassBookings'), source.indexOf('// ─── PT Requests'));

  assert.equal((block.match(/collectAdminPages/g) || []).length, 2);
  assert.equal((block.match(/count:\s*'exact'/g) || []).length, 2);
  assert.equal((block.match(/\.range\(from, from \+ pageSize - 1\)/g) || []).length, 2);
  assert.equal((block.match(/\.order\('created_at'.*?\.order\('id'/gs) || []).length, 2);
});

test('member booking profile hydration uses bounded ID chunks', async () => {
  const source = await readFile(new URL('../src/lib/adminData.js', import.meta.url), 'utf8');
  const block = source.slice(source.indexOf('export async function getMemberBookingRequests'), source.indexOf('export async function updateMemberBookingStatus'));

  assert.match(block, /index \+= 100/);
  assert.match(block, /memberIds\.slice\(index, index \+ 100\)/);
  assert.match(block, /\.in\('id', ids\)/);
});
