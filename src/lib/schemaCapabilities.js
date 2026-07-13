export const REQUIRED_SCHEMA_CAPABILITIES = Object.freeze({
  admin_role_safety: 'Apply src/supabase/admin_role_safety_upgrade.sql in Supabase.',
  booking_waitlist_withdrawal: 'Reapply src/supabase/booking_modes_upgrade.sql in Supabase.',
  member_waitlist_join: 'Apply src/supabase/member_waitlist_upgrade.sql in Supabase.',
  attendance_roll_call: 'Apply src/supabase/attendance_roll_call_upgrade.sql in Supabase.',
  member_pt_request_tracking: 'Apply src/supabase/member_pt_request_tracking.sql in Supabase.',
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
