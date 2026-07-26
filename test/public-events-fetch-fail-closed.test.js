import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('getEvents fails closed on fetch errors instead of painting the seed calendar', () => {
  const bookingData = read('../src/lib/bookingData.js');
  const block = bookingData.match(
    /export async function getEvents\([\s\S]*?^async function requireCurrentUserId/m,
  )?.[0];
  assert.ok(block, 'getEvents must be present');
  assert.match(block, /if \(error\) throw new Error\(error\.message\)/);
  assert.doesNotMatch(block, /if \(error\) return XERT_2026_EVENTS/);
  // Empty catalogue may still fall back to the seed calendar for soft launch.
  assert.match(block, /data\.length \? sortEvents\(data\) : XERT_2026_EVENTS/);
  // Page past PostgREST max_rows so later published events cannot vanish.
  assert.match(block, /collectAdminBatches/);
});
