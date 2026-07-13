export const REQUIRED_SCHEMA_CAPABILITIES = Object.freeze({
  admin_role_safety: 'Apply src/supabase/admin_role_safety_upgrade.sql in Supabase.',
  audited_credit_grants: 'Apply supabase/migrations/20260714005500_credit_grant_audit.sql in Supabase.',
  booking_waitlist_withdrawal: 'Reapply src/supabase/booking_modes_upgrade.sql in Supabase.',
  member_waitlist_join: 'Apply src/supabase/member_waitlist_upgrade.sql in Supabase.',
  waitlist_fifo_promotion: 'Apply supabase/migrations/20260714004100_waitlist_fifo_promotion.sql in Supabase.',
  attendance_roll_call: 'Apply src/supabase/attendance_roll_call_upgrade.sql in Supabase.',
  class_session_update_guard: 'Apply supabase/migrations/20260713000000_class_session_update_guard.sql in Supabase.',
  product_update_guard: 'Apply supabase/migrations/20260713010000_product_update_guard.sql in Supabase.',
  stripe_refund_reconciliation: 'Apply supabase/migrations/20260713020000_stripe_refund_reconciliation.sql in Supabase.',
  checkout_reconciliation: 'Apply supabase/migrations/20260713030000_checkout_reconciliation.sql in Supabase.',
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
});

export function summarizeSchemaCapabilities(rows) {
  const installed = new Set((rows || []).map(row => row?.capability).filter(Boolean));
  const missing = Object.keys(REQUIRED_SCHEMA_CAPABILITIES).filter(capability => !installed.has(capability));
  return {
    installed: [...installed].sort(),
    missing,
    ready: missing.length === 0,
    actions: missing.map(capability => REQUIRED_SCHEMA_CAPABILITIES[capability]),
  };
}
