import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { summarizeSchemaCapabilities } from '../src/lib/schemaCapabilities.js';

test('reports the exact missing production database capabilities', () => {
  assert.deepEqual(summarizeSchemaCapabilities([{ capability: 'admin_role_safety' }]), {
    installed: ['admin_role_safety'],
    missing: ['audited_credit_grants', 'booking_waitlist_withdrawal', 'member_waitlist_join', 'waitlist_fifo_promotion', 'attendance_roll_call', 'class_session_update_guard', 'product_update_guard', 'stripe_refund_reconciliation', 'checkout_reconciliation', 'member_announcements', 'announcement_receipts', 'announcement_actions', 'booking_time_conflict_guard', 'admin_member_notes', 'schedule_blackout_guard', 'database_security_hardening', 'rls_policy_performance', 'credit_expiry_follow_up', 'member_pt_request_tracking', 'public_form_integrity'],
    ready: false,
    actions: [
      'Apply supabase/migrations/20260714005500_credit_grant_audit.sql in Supabase.',
      'Reapply src/supabase/booking_modes_upgrade.sql in Supabase.',
      'Apply src/supabase/member_waitlist_upgrade.sql in Supabase.',
      'Apply supabase/migrations/20260714004100_waitlist_fifo_promotion.sql in Supabase.',
      'Apply src/supabase/attendance_roll_call_upgrade.sql in Supabase.',
      'Apply supabase/migrations/20260713000000_class_session_update_guard.sql in Supabase.',
      'Apply supabase/migrations/20260713010000_product_update_guard.sql in Supabase.',
      'Apply supabase/migrations/20260713020000_stripe_refund_reconciliation.sql in Supabase.',
      'Apply supabase/migrations/20260713030000_checkout_reconciliation.sql in Supabase.',
      'Apply supabase/migrations/20260713040000_member_announcements.sql in Supabase.',
      'Apply supabase/migrations/20260713050000_announcement_receipts.sql in Supabase.',
      'Apply supabase/migrations/20260714000000_announcement_actions.sql in Supabase.',
      'Apply supabase/migrations/20260714002000_booking_time_conflicts.sql in Supabase.',
      'Apply supabase/migrations/20260714003000_admin_member_notes.sql in Supabase.',
      'Apply supabase/migrations/20260714004000_schedule_blackout_guard.sql in Supabase.',
      'Apply supabase/migrations/20260714006000_database_security_hardening.sql in Supabase.',
      'Apply supabase/migrations/20260714007000_rls_policy_performance.sql in Supabase.',
      'Apply supabase/migrations/20260713060000_credit_expiry_follow_up.sql in Supabase.',
      'Apply supabase/migrations/20260714004200_member_pt_request_tracking.sql in Supabase.',
      'Apply supabase/migrations/20260714004300_public_form_integrity.sql in Supabase.',
    ],
  });
  assert.equal(summarizeSchemaCapabilities([
    { capability: 'audited_credit_grants' },
    { capability: 'attendance_roll_call' },
    { capability: 'class_session_update_guard' },
    { capability: 'product_update_guard' },
    { capability: 'stripe_refund_reconciliation' },
    { capability: 'checkout_reconciliation' },
    { capability: 'member_announcements' },
    { capability: 'announcement_receipts' },
    { capability: 'announcement_actions' },
    { capability: 'booking_time_conflict_guard' },
    { capability: 'admin_member_notes' },
    { capability: 'schedule_blackout_guard' },
    { capability: 'database_security_hardening' },
    { capability: 'rls_policy_performance' },
    { capability: 'credit_expiry_follow_up' },
    { capability: 'booking_waitlist_withdrawal' },
    { capability: 'member_waitlist_join' },
    { capability: 'waitlist_fifo_promotion' },
    { capability: 'member_pt_request_tracking' },
    { capability: 'public_form_integrity' },
    { capability: 'admin_role_safety' },
  ]).ready, true);
});

test('fresh and upgrade SQL paths register the same capability contract', () => {
  const pairs = [
    ['../src/supabase/credit_grant_audit_upgrade.sql', 'audited_credit_grants'],
    ['../supabase/migrations/20260714005500_credit_grant_audit.sql', 'audited_credit_grants'],
    ['../src/supabase/booking_schema.sql', 'booking_waitlist_withdrawal'],
    ['../src/supabase/booking_modes_upgrade.sql', 'booking_waitlist_withdrawal'],
    ['../src/supabase/booking_schema.sql', 'member_waitlist_join'],
    ['../src/supabase/member_waitlist_upgrade.sql', 'member_waitlist_join'],
    ['../src/supabase/admin_cms_schema.sql', 'waitlist_fifo_promotion'],
    ['../src/supabase/waitlist_fifo_promotion_upgrade.sql', 'waitlist_fifo_promotion'],
    ['../supabase/migrations/20260714004100_waitlist_fifo_promotion.sql', 'waitlist_fifo_promotion'],
    ['../src/supabase/admin_cms_schema.sql', 'admin_role_safety'],
    ['../src/supabase/admin_role_safety_upgrade.sql', 'admin_role_safety'],
    ['../src/supabase/admin_cms_schema.sql', 'attendance_roll_call'],
    ['../src/supabase/attendance_roll_call_upgrade.sql', 'attendance_roll_call'],
    ['../src/supabase/admin_cms_schema.sql', 'class_session_update_guard'],
    ['../supabase/migrations/20260713000000_class_session_update_guard.sql', 'class_session_update_guard'],
    ['../src/supabase/admin_cms_schema.sql', 'product_update_guard'],
    ['../supabase/migrations/20260713010000_product_update_guard.sql', 'product_update_guard'],
    ['../src/supabase/admin_cms_schema.sql', 'stripe_refund_reconciliation'],
    ['../supabase/migrations/20260713020000_stripe_refund_reconciliation.sql', 'stripe_refund_reconciliation'],
    ['../src/supabase/booking_schema.sql', 'checkout_reconciliation'],
    ['../supabase/migrations/20260713030000_checkout_reconciliation.sql', 'checkout_reconciliation'],
    ['../src/supabase/booking_schema.sql', 'member_announcements'],
    ['../supabase/migrations/20260713040000_member_announcements.sql', 'member_announcements'],
    ['../src/supabase/booking_schema.sql', 'announcement_receipts'],
    ['../supabase/migrations/20260713050000_announcement_receipts.sql', 'announcement_receipts'],
    ['../src/supabase/booking_schema.sql', 'announcement_actions'],
    ['../supabase/migrations/20260714000000_announcement_actions.sql', 'announcement_actions'],
    ['../src/supabase/booking_schema.sql', 'booking_time_conflict_guard'],
    ['../supabase/migrations/20260714002000_booking_time_conflicts.sql', 'booking_time_conflict_guard'],
    ['../src/supabase/admin_cms_schema.sql', 'admin_member_notes'],
    ['../supabase/migrations/20260714003000_admin_member_notes.sql', 'admin_member_notes'],
    ['../src/supabase/availability_schema.sql', 'schedule_blackout_guard'],
    ['../supabase/migrations/20260714004000_schedule_blackout_guard.sql', 'schedule_blackout_guard'],
    ['../supabase/migrations/20260714006000_database_security_hardening.sql', 'database_security_hardening'],
    ['../supabase/migrations/20260714007000_rls_policy_performance.sql', 'rls_policy_performance'],
    ['../src/supabase/admin_cms_schema.sql', 'credit_expiry_follow_up'],
    ['../supabase/migrations/20260713060000_credit_expiry_follow_up.sql', 'credit_expiry_follow_up'],
    ['../src/supabase/member_pt_request_tracking.sql', 'member_pt_request_tracking'],
    ['../supabase/migrations/20260714004200_member_pt_request_tracking.sql', 'member_pt_request_tracking'],
    ['../src/supabase/public_form_integrity_upgrade.sql', 'public_form_integrity'],
    ['../supabase/migrations/20260714004300_public_form_integrity.sql', 'public_form_integrity'],
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
  assert.match(yaml, /audited_credit_grants/);
  assert.match(yaml, /booking_waitlist_withdrawal/);
  assert.match(yaml, /member_waitlist_join/);
  assert.match(yaml, /waitlist_fifo_promotion/);
  assert.match(yaml, /attendance_roll_call/);
  assert.match(yaml, /class_session_update_guard/);
  assert.match(yaml, /product_update_guard/);
  assert.match(yaml, /stripe_refund_reconciliation/);
  assert.match(yaml, /checkout_reconciliation/);
  assert.match(yaml, /member_announcements/);
  assert.match(yaml, /announcement_receipts/);
  assert.match(yaml, /announcement_actions/);
  assert.match(yaml, /booking_time_conflict_guard/);
  assert.match(yaml, /admin_member_notes/);
  assert.match(yaml, /schedule_blackout_guard/);
  assert.match(yaml, /database_security_hardening/);
  assert.match(yaml, /rls_policy_performance/);
  assert.match(yaml, /credit_expiry_follow_up/);
  assert.match(yaml, /member_pt_request_tracking/);
  assert.match(yaml, /public_form_integrity/);
  assert.match(yaml, /\/api\/checkout/);
  assert.match(yaml, /expected HTTP 401/);
  assert.match(yaml, /STRIPE_SECRET_KEY, SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(yaml, /\/api\/stripe-webhook/);
  assert.match(yaml, /\/api\/admin-refund-order/);
  assert.match(yaml, /\/api\/admin-reconcile-order/);
  assert.match(yaml, /expected HTTP 400/);
  assert.match(yaml, /STRIPE_WEBHOOK_SECRET/);
});

test('read-only production check reports every release capability and migration', () => {
  const sql = readFileSync(new URL('../src/supabase/release_readiness_check.sql', import.meta.url), 'utf8');
  const capabilities = [
    'admin_role_safety',
    'audited_credit_grants',
    'booking_waitlist_withdrawal',
    'member_waitlist_join',
    'waitlist_fifo_promotion',
    'attendance_roll_call',
    'class_session_update_guard',
    'product_update_guard',
    'stripe_refund_reconciliation',
    'checkout_reconciliation',
    'member_announcements',
    'announcement_receipts',
    'announcement_actions',
    'booking_time_conflict_guard',
    'admin_member_notes',
    'schedule_blackout_guard',
    'database_security_hardening',
    'rls_policy_performance',
    'credit_expiry_follow_up',
    'member_pt_request_tracking',
    'public_form_integrity',
  ];

  for (const capability of capabilities) {
    assert.match(sql, new RegExp(`\\('${capability}', '(?:src/supabase|supabase/migrations)/.+\\.sql'\\)`));
  }
  assert.match(sql, /bool_and\(installed\) over \(\) as release_ready/i);
  assert.doesNotMatch(sql, /\b(?:insert|update|delete|alter|create|drop|grant|revoke)\b/i);
});
