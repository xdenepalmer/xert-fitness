export const REQUIRED_SCHEMA_CAPABILITIES = Object.freeze({
  admin_role_safety: 'Apply src/supabase/admin_role_safety_upgrade.sql in Supabase.',
  audited_credit_grants: 'Apply supabase/migrations/20260714005500_credit_grant_audit.sql in Supabase.',
  booking_waitlist_withdrawal: 'Reapply src/supabase/booking_modes_upgrade.sql in Supabase.',
  member_booking_switch_guard: 'Apply supabase/migrations/20260721000000_member_booking_switch_guard.sql in Supabase.',
  member_onboarding_foundation: 'Apply supabase/migrations/20260721010000_member_onboarding_foundation.sql in Supabase.',
  member_onboarding_booking_gate: 'Apply src/supabase/member_onboarding_booking_gate.sql in Supabase.',
  member_activation_cockpit: 'Apply supabase/migrations/20260721020000_member_activation_cockpit.sql in Supabase.',
  member_waitlist_join: 'Apply src/supabase/member_waitlist_upgrade.sql in Supabase.',
  // Historical 20260714004100 still inlines remaining+1; operator skips-if-newer.
  waitlist_fifo_promotion: 'Apply src/supabase/waitlist_fifo_promotion_upgrade.sql in Supabase.',
  // Bootstrap attendance_roll_call_upgrade skips-if-newer; prefer the release
  // path that also returns unactioned request credits.
  attendance_roll_call: 'Apply src/supabase/roll_call_releases_pending_requests.sql in Supabase.',
  class_session_update_guard: 'Apply supabase/migrations/20260713000000_class_session_update_guard.sql in Supabase.',
  class_session_optimistic_locking: 'Apply supabase/migrations/20260726104000_class_session_optimistic_locking.sql in Supabase.',
  audit_subject_pii_redaction: 'Apply src/supabase/audit_subject_pii_redaction_upgrade.sql in Supabase.',
  product_update_guard: 'Apply supabase/migrations/20260713010000_product_update_guard.sql in Supabase.',
  stripe_refund_reconciliation: 'Apply supabase/migrations/20260713020000_stripe_refund_reconciliation.sql in Supabase.',
  checkout_reconciliation: 'Apply supabase/migrations/20260713030000_checkout_reconciliation.sql in Supabase.',
  // Historical 20260715010000 / 16030000 recreate the retired p_expires_at
  // fulfill overload; 16040000 recreates live fulfill without email erasure.
  stripe_payment_fulfillment: 'Apply src/supabase/stripe_payment_fulfillment_upgrade.sql in Supabase.',
  guarded_payment_activation: 'Apply supabase/migrations/20260716010000_guarded_payment_activation.sql in Supabase.',
  payment_activation_drift_guard: 'Apply supabase/migrations/20260716060000_payment_activation_drift_guard.sql in Supabase.',
  admin_settings_singleton: 'Apply supabase/migrations/20260716020000_admin_settings_singleton.sql in Supabase.',
  stripe_pending_order_guard: 'Apply src/supabase/stripe_payment_fulfillment_upgrade.sql in Supabase.',
  stripe_order_terms_snapshot: 'Apply src/supabase/stripe_payment_fulfillment_upgrade.sql in Supabase.',
  stripe_webhook_ledger: 'Apply supabase/migrations/20260716050000_stripe_webhook_ledger.sql in Supabase.',
  member_announcements: 'Apply supabase/migrations/20260713040000_member_announcements.sql in Supabase.',
  announcement_receipts: 'Apply supabase/migrations/20260713050000_announcement_receipts.sql in Supabase.',
  announcement_actions: 'Apply supabase/migrations/20260714000000_announcement_actions.sql in Supabase.',
  announcement_archival: 'Apply supabase/migrations/20260714010000_announcement_archival.sql in Supabase.',
  booking_time_conflict_guard: 'Apply supabase/migrations/20260714002000_booking_time_conflicts.sql in Supabase.',
  admin_member_notes: 'Apply supabase/migrations/20260714003000_admin_member_notes.sql in Supabase.',
  schedule_blackout_guard: 'Apply supabase/migrations/20260714004000_schedule_blackout_guard.sql in Supabase.',
  database_security_hardening: 'Apply supabase/migrations/20260714006000_database_security_hardening.sql in Supabase.',
  rls_policy_performance: 'Apply supabase/migrations/20260714007000_rls_policy_performance.sql in Supabase.',
  request_status_audit: 'Apply supabase/migrations/20260714008000_admin_request_status_audit.sql in Supabase.',
  member_push_notifications: 'Apply supabase/migrations/20260714009000_member_push_notifications.sql in Supabase.',
  credit_expiry_follow_up: 'Apply supabase/migrations/20260713060000_credit_expiry_follow_up.sql in Supabase.',
  member_pt_request_tracking: 'Apply supabase/migrations/20260714004200_member_pt_request_tracking.sql in Supabase.',
  public_form_integrity: 'Apply supabase/migrations/20260714004300_public_form_integrity.sql in Supabase.',
  lead_pipeline_audit: 'Apply supabase/migrations/20260714011000_lead_pipeline_audit.sql in Supabase.',
  schedule_change_audit: 'Apply supabase/migrations/20260714012000_schedule_change_audit.sql in Supabase.',
  content_change_audit: 'Apply supabase/migrations/20260714013000_content_change_audit.sql in Supabase.',
  booking_lifecycle_audit: 'Apply supabase/migrations/20260714014000_booking_lifecycle_audit.sql in Supabase.',
  class_cancellation_notifications: 'Apply supabase/migrations/20260714015000_class_cancellation_notifications.sql in Supabase.',
  admin_daily_operations: 'Apply supabase/migrations/20260714016000_admin_daily_operations.sql in Supabase.',
  schedule_optimistic_locking: 'Apply supabase/migrations/20260714018000_schedule_optimistic_locking.sql in Supabase.',
  shared_admin_optimistic_locking: 'Apply supabase/migrations/20260714019000_shared_admin_optimistic_locking.sql in Supabase.',
  catalog_optimistic_locking: 'Apply supabase/migrations/20260714020000_catalog_optimistic_locking.sql in Supabase.',
  product_commercial_terms_guard: 'Apply supabase/migrations/20260720000000_product_commercial_terms_guard.sql in Supabase.',
  targeted_member_notices: 'Apply supabase/migrations/20260714021000_targeted_member_notices.sql in Supabase.',
  waitlist_promotion_notifications: 'Apply supabase/migrations/20260721030000_waitlist_promotion_notifications.sql in Supabase.',
  // Operator skips-if-newer so waitlist Skip notice accuracy is not stripped.
  booking_decision_notifications: 'Apply src/supabase/booking_decision_notifications_upgrade.sql in Supabase.',
  owner_stripe_price_provisioning: 'Apply supabase/migrations/20260722010000_owner_stripe_price_provisioning.sql in Supabase.',
  // Prefer src/supabase mirrors: historical public-form migrations used to
  // recreate install_public_form_insert_policies without bookings_enabled /
  // notes health-consent WITH CHECK (public_booking_switch_gate + request_notes).
  public_form_staff_column_guard: 'Apply src/supabase/public_form_staff_column_guard.sql in Supabase.',
  schedule_blackout_historic_edit_fix: 'Apply supabase/migrations/20260726011000_schedule_blackout_historic_edit_fix.sql in Supabase.',
  public_enquiry_time_guard: 'Apply src/supabase/public_enquiry_time_guard.sql in Supabase.',
  my_bookings_duration: 'Apply supabase/migrations/20260726013000_my_bookings_duration.sql in Supabase.',
  product_currency_aud_only: 'Apply supabase/migrations/20260726014000_product_currency_aud_only.sql in Supabase.',
  stripe_signature_failure_ledger: 'Apply supabase/migrations/20260726015000_stripe_signature_failure_ledger.sql in Supabase.',
  // Prefer re-runnable src/supabase mirrors for money/privacy RPCs: several
  // historical migrations still carry weaker cancel/refund/fulfill/delete bodies.
  stripe_fulfillment_deleted_member: 'Apply src/supabase/stripe_fulfillment_deleted_member_fix.sql in Supabase.',
  atomic_account_deletion: 'Apply src/supabase/atomic_account_deletion.sql in Supabase.',
  roll_call_releases_pending_requests: 'Apply src/supabase/roll_call_releases_pending_requests.sql in Supabase.',
  admin_policy_scalar_subquery: 'Apply supabase/migrations/20260726018000_admin_policy_scalar_subquery.sql in Supabase.',
  member_history_index: 'Apply supabase/migrations/20260726019000_member_history_index.sql in Supabase.',
  cancel_booking_expired_batch_refund: 'Apply src/supabase/cancel_booking_expired_batch_refund.sql in Supabase.',
  credit_batch_refund_reactivation: 'Apply src/supabase/credit_batch_refund_reactivation.sql in Supabase.',
  member_interest_health_consent: 'Apply src/supabase/member_interest_health_consent.sql in Supabase.',
  account_deletion_public_lead_cleanup: 'Apply src/supabase/account_deletion_public_lead_cleanup.sql in Supabase.',
  // Operator keeps notes WITH CHECK + audited reveal; historical migration used
  // to install the ledger-skipping reveal bootstrap on re-run.
  request_notes_health_consent: 'Apply src/supabase/request_notes_health_consent.sql in Supabase.',
  waitlist_skip_concurrency: 'Apply src/supabase/waitlist_skip_concurrency_upgrade.sql in Supabase.',
  pt_rehab_goal_health_consent: 'Apply src/supabase/pt_rehab_goal_health_consent.sql in Supabase.',
  stripe_fulfillment_deleted_email_erasure: 'Apply src/supabase/fulfillment_erasure_and_refunded_pack_guard.sql in Supabase.',
  refund_skips_stripe_refunded_batches: 'Apply src/supabase/fulfillment_erasure_and_refunded_pack_guard.sql in Supabase.',
  public_booking_switch_gate: 'Apply src/supabase/public_booking_switch_gate.sql in Supabase.',
  waitlist_skip_notice_accuracy: 'Apply src/supabase/waitlist_skip_notice_accuracy.sql in Supabase.',
  member_interest_health_reveal_authz: 'Apply src/supabase/member_interest_health_reveal_authz.sql in Supabase.',
  session_capacity_concurrency_guard: 'Apply src/supabase/session_capacity_concurrency_guard.sql in Supabase.',
  soft_launch_switch_authz: 'Apply src/supabase/soft_launch_switch_authz.sql in Supabase.',
  booking_credit_release_clears_batch: 'Apply src/supabase/booking_credit_release_clears_batch.sql in Supabase.',
  roll_call_stripe_refund_clears_credit_batch: 'Apply src/supabase/roll_call_stripe_refund_clears_credit_batch.sql in Supabase.',
  terminal_booking_clears_stale_credit_batch: 'Apply src/supabase/terminal_booking_clears_stale_credit_batch.sql in Supabase.',
});

export function summarizeSchemaCapabilities(rows) {
  // Count only the release-contract capabilities. Extra rows in
  // xert_schema_capabilities (legacy experiments, retired gates) must not
  // inflate Ops Health / readiness counts past release_readiness_check.sql.
  const present = new Set((rows || []).map(row => row?.capability).filter(Boolean));
  const required = Object.keys(REQUIRED_SCHEMA_CAPABILITIES);
  const installed = required.filter(capability => present.has(capability)).sort();
  const missing = required.filter(capability => !present.has(capability));
  return {
    installed,
    missing,
    ready: missing.length === 0,
    actions: missing.map(capability => REQUIRED_SCHEMA_CAPABILITIES[capability]),
  };
}
