import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { summarizeSchemaCapabilities } from '../src/lib/schemaCapabilities.js';

test('reports the exact missing production database capabilities', () => {
  assert.deepEqual(summarizeSchemaCapabilities([{ capability: 'admin_role_safety' }]), {
    installed: ['admin_role_safety'],
    missing: ['booking_waitlist_withdrawal', 'member_waitlist_join', 'attendance_roll_call', 'member_pt_request_tracking', 'public_form_integrity'],
    ready: false,
    actions: [
      'Reapply src/supabase/booking_modes_upgrade.sql in Supabase.',
      'Apply src/supabase/member_waitlist_upgrade.sql in Supabase.',
      'Apply src/supabase/attendance_roll_call_upgrade.sql in Supabase.',
      'Apply src/supabase/member_pt_request_tracking.sql in Supabase.',
      'Apply src/supabase/public_form_integrity_upgrade.sql in Supabase.',
    ],
  });
  assert.equal(summarizeSchemaCapabilities([
    { capability: 'attendance_roll_call' },
    { capability: 'booking_waitlist_withdrawal' },
    { capability: 'member_waitlist_join' },
    { capability: 'member_pt_request_tracking' },
    { capability: 'public_form_integrity' },
    { capability: 'admin_role_safety' },
  ]).ready, true);
});

test('fresh and upgrade SQL paths register the same capability contract', () => {
  const pairs = [
    ['../src/supabase/booking_schema.sql', 'booking_waitlist_withdrawal'],
    ['../src/supabase/booking_modes_upgrade.sql', 'booking_waitlist_withdrawal'],
    ['../src/supabase/booking_schema.sql', 'member_waitlist_join'],
    ['../src/supabase/member_waitlist_upgrade.sql', 'member_waitlist_join'],
    ['../src/supabase/admin_cms_schema.sql', 'admin_role_safety'],
    ['../src/supabase/admin_role_safety_upgrade.sql', 'admin_role_safety'],
    ['../src/supabase/admin_cms_schema.sql', 'attendance_roll_call'],
    ['../src/supabase/attendance_roll_call_upgrade.sql', 'attendance_roll_call'],
    ['../src/supabase/member_pt_request_tracking.sql', 'member_pt_request_tracking'],
    ['../src/supabase/public_form_integrity_upgrade.sql', 'public_form_integrity'],
  ];
  for (const [path, capability] of pairs) {
    const sql = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(sql, new RegExp(`values \\('${capability}'\\)`, 'i'));
  }

  for (const path of ['../src/supabase/booking_schema.sql', '../src/supabase/admin_cms_schema.sql']) {
    assert.match(readFileSync(new URL(path, import.meta.url), 'utf8'), /xert_public_capabilities/i);
  }
});

test('Codemagic TestFlight preflight enforces every production capability', () => {
  const yaml = readFileSync(new URL('../codemagic.yaml', import.meta.url), 'utf8');
  assert.match(yaml, /Verify production service contract/);
  assert.match(yaml, /admin_role_safety/);
  assert.match(yaml, /booking_waitlist_withdrawal/);
  assert.match(yaml, /member_waitlist_join/);
  assert.match(yaml, /attendance_roll_call/);
  assert.match(yaml, /member_pt_request_tracking/);
  assert.match(yaml, /public_form_integrity/);
});

test('read-only production check reports every release capability and migration', () => {
  const sql = readFileSync(new URL('../src/supabase/release_readiness_check.sql', import.meta.url), 'utf8');
  const capabilities = [
    'admin_role_safety',
    'booking_waitlist_withdrawal',
    'member_waitlist_join',
    'attendance_roll_call',
    'member_pt_request_tracking',
    'public_form_integrity',
  ];

  for (const capability of capabilities) {
    assert.match(sql, new RegExp(`\\('${capability}', 'src/supabase/.+\\.sql'\\)`));
  }
  assert.match(sql, /bool_and\(installed\) over \(\) as release_ready/i);
  assert.doesNotMatch(sql, /\b(?:insert|update|delete|alter|create|drop|grant|revoke)\b/i);
});
