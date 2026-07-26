import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { REQUIRED_SCHEMA_CAPABILITIES, summarizeSchemaCapabilities } from '../src/lib/schemaCapabilities.js';

const ALL_CAPABILITIES = Object.keys(REQUIRED_SCHEMA_CAPABILITIES);

test('reports the exact missing production database capabilities', () => {
  const [first, second, ...rest] = ALL_CAPABILITIES;
  const partial = summarizeSchemaCapabilities([{ capability: first }, { capability: second }]);

  assert.deepEqual(partial.installed, [first, second].sort());
  assert.deepEqual(partial.missing, rest);
  assert.equal(partial.ready, false);
  assert.deepEqual(partial.actions, rest.map(capability => REQUIRED_SCHEMA_CAPABILITIES[capability]));
  for (const action of partial.actions) {
    assert.match(action, /^(Apply|Reapply) (src\/supabase|supabase\/migrations)\/[\w./-]+\.sql in Supabase\.$/);
  }

  assert.equal(summarizeSchemaCapabilities(ALL_CAPABILITIES.map(capability => ({ capability }))).ready, true);
  assert.equal(summarizeSchemaCapabilities([]).ready, false);
  assert.deepEqual(summarizeSchemaCapabilities([]).missing, ALL_CAPABILITIES);

  // Extra DB rows must not inflate the Ops Health count past the release contract.
  const withUnknown = summarizeSchemaCapabilities([
    ...ALL_CAPABILITIES.map(capability => ({ capability })),
    { capability: 'legacy_experimental_capability' },
  ]);
  assert.equal(withUnknown.ready, true);
  assert.equal(withUnknown.installed.length, ALL_CAPABILITIES.length);
  assert.ok(!withUnknown.installed.includes('legacy_experimental_capability'));
});

// The release check is the operator's copy of the same contract. Listing them
// separately is what lets a new capability ship without the gate that verifies
// it, so the two lists must name exactly the same set.
test('the release readiness check gates on every required capability', () => {
  const sql = readFileSync(new URL('../src/supabase/release_readiness_check.sql', import.meta.url), 'utf8');
  const listed = [...sql.matchAll(/^\s+\('([a-z0-9_]+)', '([^']+)'\)/gm)].map(match => match[1]);

  assert.deepEqual([...listed].sort(), [...ALL_CAPABILITIES].sort());
  assert.equal(new Set(listed).size, listed.length, 'no capability may be gated twice');
});

test('fresh and upgrade SQL paths register the same capability contract', () => {
  const pairs = [
    ['../src/supabase/credit_grant_audit_upgrade.sql', 'audited_credit_grants'],
    ['../supabase/migrations/20260714005500_credit_grant_audit.sql', 'audited_credit_grants'],
    ['../src/supabase/booking_schema.sql', 'booking_waitlist_withdrawal'],
    ['../src/supabase/booking_modes_upgrade.sql', 'booking_waitlist_withdrawal'],
    ['../src/supabase/member_booking_switch_guard_upgrade.sql', 'member_booking_switch_guard'],
    ['../supabase/migrations/20260721000000_member_booking_switch_guard.sql', 'member_booking_switch_guard'],
    ['../src/supabase/member_onboarding_upgrade.sql', 'member_onboarding_foundation'],
    ['../supabase/migrations/20260721010000_member_onboarding_foundation.sql', 'member_onboarding_foundation'],
    ['../src/supabase/member_activation_cockpit_upgrade.sql', 'member_activation_cockpit'],
    ['../supabase/migrations/20260721020000_member_activation_cockpit.sql', 'member_activation_cockpit'],
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
    ['../src/supabase/admin_cms_schema.sql', 'class_session_optimistic_locking'],
    ['../src/supabase/class_session_optimistic_locking_upgrade.sql', 'class_session_optimistic_locking'],
    ['../supabase/migrations/20260726104000_class_session_optimistic_locking.sql', 'class_session_optimistic_locking'],
    ['../src/supabase/audit_subject_pii_redaction_upgrade.sql', 'audit_subject_pii_redaction'],
    ['../supabase/migrations/20260726105000_audit_subject_pii_redaction.sql', 'audit_subject_pii_redaction'],
    ['../src/supabase/admin_cms_schema.sql', 'product_update_guard'],
    ['../supabase/migrations/20260713010000_product_update_guard.sql', 'product_update_guard'],
    ['../src/supabase/admin_cms_schema.sql', 'stripe_refund_reconciliation'],
    ['../supabase/migrations/20260713020000_stripe_refund_reconciliation.sql', 'stripe_refund_reconciliation'],
    ['../src/supabase/booking_schema.sql', 'checkout_reconciliation'],
    ['../supabase/migrations/20260713030000_checkout_reconciliation.sql', 'checkout_reconciliation'],
    ['../src/supabase/booking_schema.sql', 'stripe_payment_fulfillment'],
    ['../src/supabase/stripe_payment_fulfillment_upgrade.sql', 'stripe_payment_fulfillment'],
    ['../supabase/migrations/20260715010000_stripe_payment_fulfillment.sql', 'stripe_payment_fulfillment'],
    ['../src/supabase/guarded_payment_activation_upgrade.sql', 'guarded_payment_activation'],
    ['../supabase/migrations/20260716010000_guarded_payment_activation.sql', 'guarded_payment_activation'],
    ['../src/supabase/payment_activation_drift_guard_upgrade.sql', 'payment_activation_drift_guard'],
    ['../supabase/migrations/20260716060000_payment_activation_drift_guard.sql', 'payment_activation_drift_guard'],
    ['../src/supabase/admin_settings_singleton_upgrade.sql', 'admin_settings_singleton'],
    ['../supabase/migrations/20260716020000_admin_settings_singleton.sql', 'admin_settings_singleton'],
    ['../src/supabase/booking_schema.sql', 'stripe_pending_order_guard'],
    ['../src/supabase/stripe_payment_fulfillment_upgrade.sql', 'stripe_pending_order_guard'],
    ['../supabase/migrations/20260716030000_stripe_pending_order_guard.sql', 'stripe_pending_order_guard'],
    ['../src/supabase/booking_schema.sql', 'stripe_order_terms_snapshot'],
    ['../src/supabase/stripe_payment_fulfillment_upgrade.sql', 'stripe_order_terms_snapshot'],
    ['../supabase/migrations/20260716040000_stripe_order_terms_snapshot.sql', 'stripe_order_terms_snapshot'],
    ['../src/supabase/booking_schema.sql', 'stripe_fulfillment_deleted_member'],
    ['../src/supabase/stripe_payment_fulfillment_upgrade.sql', 'stripe_fulfillment_deleted_member'],
    ['../src/supabase/stripe_fulfillment_deleted_member_fix.sql', 'stripe_fulfillment_deleted_member'],
    ['../supabase/migrations/20260726107000_stripe_fulfillment_deleted_member_overload_fix.sql', 'stripe_fulfillment_deleted_member'],
    ['../src/supabase/booking_schema.sql', 'stripe_webhook_ledger'],
    ['../src/supabase/stripe_webhook_ledger_upgrade.sql', 'stripe_webhook_ledger'],
    ['../supabase/migrations/20260716050000_stripe_webhook_ledger.sql', 'stripe_webhook_ledger'],
    ['../src/supabase/booking_schema.sql', 'member_announcements'],
    ['../supabase/migrations/20260713040000_member_announcements.sql', 'member_announcements'],
    ['../src/supabase/booking_schema.sql', 'announcement_receipts'],
    ['../supabase/migrations/20260713050000_announcement_receipts.sql', 'announcement_receipts'],
    ['../src/supabase/booking_schema.sql', 'announcement_actions'],
    ['../supabase/migrations/20260714000000_announcement_actions.sql', 'announcement_actions'],
    ['../src/supabase/booking_schema.sql', 'announcement_archival'],
    ['../src/supabase/announcement_archival_upgrade.sql', 'announcement_archival'],
    ['../supabase/migrations/20260714010000_announcement_archival.sql', 'announcement_archival'],
    ['../src/supabase/booking_schema.sql', 'booking_time_conflict_guard'],
    ['../supabase/migrations/20260714002000_booking_time_conflicts.sql', 'booking_time_conflict_guard'],
    ['../src/supabase/admin_cms_schema.sql', 'admin_member_notes'],
    ['../supabase/migrations/20260714003000_admin_member_notes.sql', 'admin_member_notes'],
    ['../src/supabase/availability_schema.sql', 'schedule_blackout_guard'],
    ['../supabase/migrations/20260714004000_schedule_blackout_guard.sql', 'schedule_blackout_guard'],
    ['../supabase/migrations/20260714006000_database_security_hardening.sql', 'database_security_hardening'],
    ['../supabase/migrations/20260714007000_rls_policy_performance.sql', 'rls_policy_performance'],
    ['../src/supabase/admin_request_status_audit_upgrade.sql', 'request_status_audit'],
    ['../supabase/migrations/20260714008000_admin_request_status_audit.sql', 'request_status_audit'],
    ['../src/supabase/member_push_notifications_upgrade.sql', 'member_push_notifications'],
    ['../supabase/migrations/20260714009000_member_push_notifications.sql', 'member_push_notifications'],
    ['../src/supabase/admin_cms_schema.sql', 'credit_expiry_follow_up'],
    ['../supabase/migrations/20260713060000_credit_expiry_follow_up.sql', 'credit_expiry_follow_up'],
    ['../src/supabase/member_pt_request_tracking.sql', 'member_pt_request_tracking'],
    ['../supabase/migrations/20260714004200_member_pt_request_tracking.sql', 'member_pt_request_tracking'],
    ['../src/supabase/public_form_integrity_upgrade.sql', 'public_form_integrity'],
    ['../supabase/migrations/20260714004300_public_form_integrity.sql', 'public_form_integrity'],
    ['../src/supabase/lead_pipeline_audit_upgrade.sql', 'lead_pipeline_audit'],
    ['../supabase/migrations/20260714011000_lead_pipeline_audit.sql', 'lead_pipeline_audit'],
    ['../src/supabase/schedule_change_audit_upgrade.sql', 'schedule_change_audit'],
    ['../supabase/migrations/20260714012000_schedule_change_audit.sql', 'schedule_change_audit'],
    ['../src/supabase/content_change_audit_upgrade.sql', 'content_change_audit'],
    ['../supabase/migrations/20260714013000_content_change_audit.sql', 'content_change_audit'],
    ['../src/supabase/booking_lifecycle_audit_upgrade.sql', 'booking_lifecycle_audit'],
    ['../supabase/migrations/20260714014000_booking_lifecycle_audit.sql', 'booking_lifecycle_audit'],
    ['../src/supabase/class_cancellation_notifications_upgrade.sql', 'class_cancellation_notifications'],
    ['../supabase/migrations/20260714015000_class_cancellation_notifications.sql', 'class_cancellation_notifications'],
    ['../src/supabase/admin_cms_schema.sql', 'admin_daily_operations'],
    ['../src/supabase/admin_daily_operations_upgrade.sql', 'admin_daily_operations'],
    ['../supabase/migrations/20260714016000_admin_daily_operations.sql', 'admin_daily_operations'],
    ['../src/supabase/availability_schema.sql', 'schedule_optimistic_locking'],
    ['../src/supabase/schedule_optimistic_locking_upgrade.sql', 'schedule_optimistic_locking'],
    ['../supabase/migrations/20260714018000_schedule_optimistic_locking.sql', 'schedule_optimistic_locking'],
    ['../src/supabase/shared_admin_optimistic_locking_upgrade.sql', 'shared_admin_optimistic_locking'],
    ['../supabase/migrations/20260714019000_shared_admin_optimistic_locking.sql', 'shared_admin_optimistic_locking'],
    ['../src/supabase/catalog_optimistic_locking_upgrade.sql', 'catalog_optimistic_locking'],
    ['../supabase/migrations/20260714020000_catalog_optimistic_locking.sql', 'catalog_optimistic_locking'],
    ['../src/supabase/product_commercial_terms_guard_upgrade.sql', 'product_commercial_terms_guard'],
    ['../supabase/migrations/20260720000000_product_commercial_terms_guard.sql', 'product_commercial_terms_guard'],
    ['../src/supabase/targeted_member_notices_upgrade.sql', 'targeted_member_notices'],
    ['../supabase/migrations/20260714021000_targeted_member_notices.sql', 'targeted_member_notices'],
    ['../src/supabase/waitlist_promotion_notifications_upgrade.sql', 'waitlist_promotion_notifications'],
    ['../supabase/migrations/20260721030000_waitlist_promotion_notifications.sql', 'waitlist_promotion_notifications'],
    ['../src/supabase/waitlist_skip_concurrency_upgrade.sql', 'waitlist_skip_concurrency'],
    ['../supabase/migrations/20260726110000_waitlist_skip_concurrency.sql', 'waitlist_skip_concurrency'],
    ['../src/supabase/pt_rehab_goal_health_consent.sql', 'pt_rehab_goal_health_consent'],
    ['../supabase/migrations/20260726111000_pt_rehab_goal_health_consent.sql', 'pt_rehab_goal_health_consent'],
    ['../src/supabase/booking_decision_notifications_upgrade.sql', 'booking_decision_notifications'],
    ['../supabase/migrations/20260722000000_booking_decision_notifications.sql', 'booking_decision_notifications'],
    ['../supabase/migrations/20260722010000_owner_stripe_price_provisioning.sql', 'owner_stripe_price_provisioning'],
    ['../src/supabase/credit_batch_refund_reactivation.sql', 'credit_batch_refund_reactivation'],
    ['../supabase/migrations/20260726106000_credit_batch_refund_reactivation.sql', 'credit_batch_refund_reactivation'],
    ['../src/supabase/fulfillment_erasure_and_refunded_pack_guard.sql', 'stripe_fulfillment_deleted_email_erasure'],
    ['../supabase/migrations/20260726112000_fulfillment_erasure_and_refunded_pack_guard.sql', 'stripe_fulfillment_deleted_email_erasure'],
    ['../src/supabase/fulfillment_erasure_and_refunded_pack_guard.sql', 'refund_skips_stripe_refunded_batches'],
    ['../supabase/migrations/20260726112000_fulfillment_erasure_and_refunded_pack_guard.sql', 'refund_skips_stripe_refunded_batches'],
    ['../src/supabase/public_booking_switch_gate.sql', 'public_booking_switch_gate'],
    ['../supabase/migrations/20260726113000_public_booking_switch_gate.sql', 'public_booking_switch_gate'],
    ['../src/supabase/member_onboarding_booking_gate.sql', 'member_onboarding_booking_gate'],
    ['../supabase/migrations/20260726114000_member_onboarding_booking_gate.sql', 'member_onboarding_booking_gate'],
    ['../src/supabase/waitlist_skip_notice_accuracy.sql', 'waitlist_skip_notice_accuracy'],
    ['../supabase/migrations/20260726115000_waitlist_skip_notice_accuracy.sql', 'waitlist_skip_notice_accuracy'],
    ['../src/supabase/member_interest_health_reveal_authz.sql', 'member_interest_health_reveal_authz'],
    ['../supabase/migrations/20260726116000_member_interest_health_reveal_authz.sql', 'member_interest_health_reveal_authz'],
    ['../src/supabase/session_capacity_concurrency_guard.sql', 'session_capacity_concurrency_guard'],
    ['../supabase/migrations/20260726117000_session_capacity_concurrency_guard.sql', 'session_capacity_concurrency_guard'],
    ['../src/supabase/soft_launch_switch_authz.sql', 'soft_launch_switch_authz'],
    ['../supabase/migrations/20260726118000_soft_launch_switch_authz.sql', 'soft_launch_switch_authz'],
    ['../src/supabase/booking_credit_release_clears_batch.sql', 'booking_credit_release_clears_batch'],
    ['../supabase/migrations/20260726119000_booking_credit_release_clears_batch.sql', 'booking_credit_release_clears_batch'],
    ['../src/supabase/roll_call_stripe_refund_clears_credit_batch.sql', 'roll_call_stripe_refund_clears_credit_batch'],
    ['../supabase/migrations/20260726120000_roll_call_stripe_refund_clears_credit_batch.sql', 'roll_call_stripe_refund_clears_credit_batch'],
    ['../src/supabase/terminal_booking_clears_stale_credit_batch.sql', 'terminal_booking_clears_stale_credit_batch'],
    ['../supabase/migrations/20260726121000_terminal_booking_clears_stale_credit_batch.sql', 'terminal_booking_clears_stale_credit_batch'],
    ['../src/supabase/class_cancel_notice_credit_honesty.sql', 'class_cancel_notice_credit_honesty'],
    ['../supabase/migrations/20260726122000_class_cancel_notice_credit_honesty.sql', 'class_cancel_notice_credit_honesty'],
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
  // Codemagic must import the JS release contract — a hardcoded list drifted
  // 25 capabilities behind schemaCapabilities.js / release_readiness_check.sql.
  assert.match(yaml, /REQUIRED_SCHEMA_CAPABILITIES/);
  assert.match(yaml, /from ["']\.\/src\/lib\/schemaCapabilities\.js["']/);
  assert.match(yaml, /Object\.keys\(REQUIRED_SCHEMA_CAPABILITIES\)/);
  assert.match(yaml, /\/api\/checkout/);
  assert.match(yaml, /expected HTTP 401/);
  assert.match(yaml, /STRIPE_SECRET_KEY, SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(yaml, /\/api\/stripe-webhook/);
  assert.match(yaml, /\/api\/admin-refund-order/);
  assert.match(yaml, /\/api\/admin-reconcile-order/);
  assert.match(yaml, /\/api\/admin-publish-announcement[\s\S]*notify_class_cancellation/);
  assert.match(yaml, /expected HTTP 400/);
  assert.match(yaml, /STRIPE_WEBHOOK_SECRET/);
  assert.match(yaml, /Report production push delivery readiness/);
  assert.match(yaml, /\/api\/push-health/);
  assert.match(yaml, /REQUIRE_PRODUCTION_SERVICES/);
  assert.match(yaml, /TestFlight upload will continue/);
});

test('native AdminSchemaReadiness matches the web release contract', () => {
  const models = readFileSync(
    new URL('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift', import.meta.url),
    'utf8',
  );
  const block = models.slice(
    models.indexOf('enum AdminSchemaReadiness'),
    models.indexOf('static func missing(from rows'),
  );
  const native = [...block.matchAll(/"([a-z0-9_]+)"/g)].map(match => match[1]);
  assert.deepEqual([...new Set(native)].sort(), [...ALL_CAPABILITIES].sort());
  assert.equal(new Set(native).size, native.length, 'no capability may be listed twice on iOS');
});

test('read-only production check reports every release capability and migration', () => {
  const sql = readFileSync(new URL('../src/supabase/release_readiness_check.sql', import.meta.url), 'utf8');
  const capabilities = [
    'admin_role_safety',
    'audited_credit_grants',
    'booking_waitlist_withdrawal',
    'member_booking_switch_guard',
    'member_onboarding_foundation',
    'member_activation_cockpit',
    'member_waitlist_join',
    'waitlist_fifo_promotion',
    'attendance_roll_call',
    'class_session_update_guard',
    'class_session_optimistic_locking',
    'audit_subject_pii_redaction',
    'product_update_guard',
    'stripe_refund_reconciliation',
    'checkout_reconciliation',
    'stripe_payment_fulfillment',
    'guarded_payment_activation',
    'payment_activation_drift_guard',
    'admin_settings_singleton',
    'stripe_pending_order_guard',
    'stripe_order_terms_snapshot',
    'stripe_webhook_ledger',
    'member_announcements',
    'announcement_receipts',
    'announcement_actions',
    'announcement_archival',
    'booking_time_conflict_guard',
    'admin_member_notes',
    'schedule_blackout_guard',
    'database_security_hardening',
    'rls_policy_performance',
    'request_status_audit',
    'member_push_notifications',
    'credit_expiry_follow_up',
    'member_pt_request_tracking',
    'public_form_integrity',
    'lead_pipeline_audit',
    'schedule_change_audit',
    'content_change_audit',
    'booking_lifecycle_audit',
    'class_cancellation_notifications',
    'admin_daily_operations',
    'schedule_optimistic_locking',
    'shared_admin_optimistic_locking',
    'catalog_optimistic_locking',
    'product_commercial_terms_guard',
    'targeted_member_notices',
    'waitlist_promotion_notifications',
    'booking_decision_notifications',
    'owner_stripe_price_provisioning',
    'public_form_staff_column_guard',
    'schedule_blackout_historic_edit_fix',
    'public_enquiry_time_guard',
    'my_bookings_duration',
    'product_currency_aud_only',
    'stripe_signature_failure_ledger',
    'stripe_fulfillment_deleted_member',
    'atomic_account_deletion',
    'roll_call_releases_pending_requests',
    'admin_policy_scalar_subquery',
    'member_history_index',
    'cancel_booking_expired_batch_refund',
    'credit_batch_refund_reactivation',
    'member_interest_health_consent',
    'account_deletion_public_lead_cleanup',
    'request_notes_health_consent',
    'waitlist_skip_concurrency',
    'pt_rehab_goal_health_consent',
    'stripe_fulfillment_deleted_email_erasure',
    'refund_skips_stripe_refunded_batches',
    'public_booking_switch_gate',
    'member_onboarding_booking_gate',
    'waitlist_skip_notice_accuracy',
    'member_interest_health_reveal_authz',
    'session_capacity_concurrency_guard',
    'soft_launch_switch_authz',
    'booking_credit_release_clears_batch',
    'roll_call_stripe_refund_clears_credit_batch',
    'terminal_booking_clears_stale_credit_batch',
    'class_cancel_notice_credit_honesty',
  ];

  for (const capability of capabilities) {
    assert.match(sql, new RegExp(`\\('${capability}', '(?:src/supabase|supabase/migrations)/.+\\.sql'\\)`));
  }
  assert.match(sql, /bool_and\(installed\) over \(\) as release_ready/i);
  assert.doesNotMatch(sql, /\b(?:insert|update|delete|alter|create|drop|grant|revoke)\b/i);
});
