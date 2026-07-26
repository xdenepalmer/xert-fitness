import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../src/lib/adminData.js', import.meta.url), 'utf8');

function slice(fromMarker, toMarker) {
  const start = source.indexOf(fromMarker);
  assert.notEqual(start, -1, `marker present: ${fromMarker}`);
  const end = source.indexOf(toMarker, start + fromMarker.length);
  assert.notEqual(end, -1, `end marker present: ${toMarker}`);
  return source.slice(start, end);
}

test('paginated lead pages break created_at ties with a unique id sort key', () => {
  const block = slice('async function getLeadPage', 'export async function getMemberLeads');
  assert.match(block, /\.range\(pagination\.from, pagination\.to\)/);
  assert.match(block, /\.order\('created_at', \{ ascending: false \}\)[\s\S]*?\.order\('id', \{ ascending: false \}\)/);
});

test('PT request page query breaks created_at ties with a unique id sort key', () => {
  const block = slice('export async function getPTRequests', 'const statusCount');
  assert.match(block, /\.order\('created_at', \{ ascending: false \}\)[\s\S]*?\.order\('id', \{ ascending: false \}\)/);
});

test('class session loads page past PostgREST max_rows instead of silently truncating', () => {
  const block = slice('export async function getClassSessions', 'export async function createClassSession');
  assert.match(block, /collectAdminBatches/);
  assert.match(block, /if \(publicOnly\)/);
  assert.match(block, /\.gte\('start_time', nowIso\)/);
  assert.match(block, /\.range\(from, from \+ pageSize - 1\)/);
  assert.doesNotMatch(block, /PUBLIC_TIMETABLE_LIMIT|\.limit\(/);
});

test('admin booking queues filter the date window server-side', () => {
  const classBlock = slice('export async function getClassBookings', 'export async function updateBookingStatus');
  assert.match(classBlock, /const cutoff = filters\.days \? adminAuditRangeStart\(filters\.days\) : null;/);
  assert.match(classBlock, /if \(cutoff\) query = query\.gte\('created_at', cutoff\);/);

  const memberBlock = slice('export async function getMemberBookingRequests', 'export async function updateMemberBookingStatus');
  assert.match(memberBlock, /const cutoff = filters\.days \? adminAuditRangeStart\(filters\.days\) : null;/);
  assert.match(memberBlock, /if \(cutoff\) query = query\.gte\('created_at', cutoff\);/);
});

test('member booking profile hydration is fetched in parallel bounded chunks', () => {
  const memberBlock = slice('export async function getMemberBookingRequests', 'export async function updateMemberBookingStatus');
  assert.match(memberBlock, /index \+= 100/);
  assert.match(memberBlock, /memberIds\.slice\(index, index \+ 100\)/);
  assert.match(memberBlock, /await Promise\.all\(\s*idChunks\.map\(ids => supabase\.from\('profiles'\)[\s\S]*?\.in\('id', ids\)\)\s*\)/);
});

test('the booking admin table drives the server-side date and status filters', async () => {
  const table = await readFile(new URL('../src/components/admin/BookingRequestsTable.jsx', import.meta.url), 'utf8');
  assert.match(table, /days: daysFilter/);
  assert.match(table, /status: statusFilter === 'all' \? undefined : statusFilter/);
  assert.match(table, /getClassBookings\(serverFilters\)/);
  assert.match(table, /getMemberBookingRequests\(serverFilters\)/);
  assert.match(table, /\}, \[daysFilter, statusFilter\]\);/);
});
