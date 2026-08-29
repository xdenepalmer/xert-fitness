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

test('the request queue survives a phone screen and says where each request came from', async () => {
  const source = await readFile(new URL('../src/components/admin/BookingRequestsTable.jsx', import.meta.url), 'utf8');

  // The status chip used to collide with the action buttons on a narrow
  // screen: the row only became a single line at sm and above, and the name
  // block could not wrap.
  assert.match(source, /className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"/);
  assert.match(source, /className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1"/);
  assert.match(source, /shrink-0 font-body text-xs px-2 py-0\.5/);
  assert.match(source, /className="flex flex-wrap gap-2 sm:justify-end sm:shrink-0"/);
  assert.doesNotMatch(source, /flex gap-2 flex-wrap justify-end shrink-0/);

  // Staff kept asking whether these came from the website interest form.
  assert.match(source, /'Timetable class request'/);
  assert.match(source, /Website expression-of-interest enquiries are not shown here/);
  assert.match(source, /they live under Member Leads/);
  assert.doesNotMatch(source, /\? 'Member credit booking' : 'Enquiry form'/);
});
