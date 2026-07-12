import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { summarizeSchemaCapabilities } from '../src/lib/schemaCapabilities.js';

test('reports the exact missing production database capabilities', () => {
  assert.deepEqual(summarizeSchemaCapabilities([{ capability: 'admin_role_safety' }]), {
    installed: ['admin_role_safety'],
    missing: ['booking_waitlist_withdrawal'],
    ready: false,
    actions: ['Reapply src/supabase/booking_modes_upgrade.sql in Supabase.'],
  });
  assert.equal(summarizeSchemaCapabilities([
    { capability: 'booking_waitlist_withdrawal' }, { capability: 'admin_role_safety' },
  ]).ready, true);
});

test('fresh and upgrade SQL paths register the same capability contract', () => {
  const pairs = [
    ['../src/supabase/booking_schema.sql', 'booking_waitlist_withdrawal'],
    ['../src/supabase/booking_modes_upgrade.sql', 'booking_waitlist_withdrawal'],
    ['../src/supabase/admin_cms_schema.sql', 'admin_role_safety'],
    ['../src/supabase/admin_role_safety_upgrade.sql', 'admin_role_safety'],
  ];
  for (const [path, capability] of pairs) {
    const sql = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(sql, new RegExp(`values \\('${capability}'\\)`, 'i'));
    assert.match(sql, /xert_public_capabilities/i);
  }
});

test('Codemagic TestFlight preflight enforces both production capabilities', () => {
  const yaml = readFileSync(new URL('../codemagic.yaml', import.meta.url), 'utf8');
  assert.match(yaml, /Verify production service contract/);
  assert.match(yaml, /admin_role_safety/);
  assert.match(yaml, /booking_waitlist_withdrawal/);
});
