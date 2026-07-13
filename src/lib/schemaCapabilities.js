export const REQUIRED_SCHEMA_CAPABILITIES = Object.freeze({
  admin_role_safety: 'Apply src/supabase/admin_role_safety_upgrade.sql in Supabase.',
  booking_waitlist_withdrawal: 'Reapply src/supabase/booking_modes_upgrade.sql in Supabase.',
  member_waitlist_join: 'Apply src/supabase/member_waitlist_upgrade.sql in Supabase.',
  waitlist_fifo_promotion: 'Apply src/supabase/waitlist_fifo_promotion_upgrade.sql in Supabase.',
  attendance_roll_call: 'Apply src/supabase/attendance_roll_call_upgrade.sql in Supabase.',
  class_session_update_guard: 'Apply supabase/migrations/20260713000000_class_session_update_guard.sql in Supabase.',
  product_update_guard: 'Apply supabase/migrations/20260713010000_product_update_guard.sql in Supabase.',
  stripe_refund_reconciliation: 'Apply supabase/migrations/20260713020000_stripe_refund_reconciliation.sql in Supabase.',
  checkout_reconciliation: 'Apply supabase/migrations/20260713030000_checkout_reconciliation.sql in Supabase.',
  member_announcements: 'Apply supabase/migrations/20260713040000_member_announcements.sql in Supabase.',
  announcement_receipts: 'Apply supabase/migrations/20260713050000_announcement_receipts.sql in Supabase.',
  announcement_actions: 'Apply supabase/migrations/20260714000000_announcement_actions.sql in Supabase.',
  booking_time_conflict_guard: 'Apply supabase/migrations/20260714002000_booking_time_conflicts.sql in Supabase.',
  credit_expiry_follow_up: 'Apply supabase/migrations/20260713060000_credit_expiry_follow_up.sql in Supabase.',
  member_pt_request_tracking: 'Apply src/supabase/member_pt_request_tracking.sql in Supabase.',
  public_form_integrity: 'Apply src/supabase/public_form_integrity_upgrade.sql in Supabase.',
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
