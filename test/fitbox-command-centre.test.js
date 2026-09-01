import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('web Command Centre gives member leads an explicit, privacy-clear FitBox handoff', async () => {
  const table = await readFile(new URL('../src/components/admin/LeadTable.jsx', import.meta.url), 'utf8');
  const handoff = await readFile(new URL('../src/components/admin/FitboxLeadHandoff.jsx', import.meta.url), 'utf8');
  const data = await readFile(new URL('../src/lib/adminData.js', import.meta.url), 'utf8');
  assert.match(table, /table === 'member_interest' && <FitboxLeadHandoff lead=\{lead\}/);
  assert.match(handoff, /These contact details will be sent through Zapier to FitBox/);
  assert.match(handoff, /not a membership, subscription or charge/i);
  assert.match(handoff, /min-h-11/);
  assert.match(data, /action: 'register_prospect'/);
  assert.match(data, /action: 'refresh_user'/);
  assert.match(handoff, /Refresh read-only profile/);
  assert.match(handoff, /XERT profile, membership, bookings and billing are never changed/);
  assert.match(handoff, /profile_synced_at/);
  assert.match(data, /api\/admin-fitbox-integration/);
  assert.match(data, /healthCheck\('fitbox-integration', 'FitBox prospect handoff'/);
});
