-- Read-only TestFlight release check. Run this in the production Supabase SQL
-- editor after applying upgrades. Every row must show installed = true and
-- release_ready = true before starting the Codemagic ios-testflight workflow.
with required (capability, migration) as (
  values
    ('admin_role_safety', 'src/supabase/admin_role_safety_upgrade.sql'),
    ('audited_credit_grants', 'supabase/migrations/20260714005500_credit_grant_audit.sql'),
    ('booking_waitlist_withdrawal', 'src/supabase/booking_modes_upgrade.sql'),
    ('member_waitlist_join', 'src/supabase/member_waitlist_upgrade.sql'),
    ('waitlist_fifo_promotion', 'supabase/migrations/20260714004100_waitlist_fifo_promotion.sql'),
    ('attendance_roll_call', 'src/supabase/attendance_roll_call_upgrade.sql'),
    ('class_session_update_guard', 'supabase/migrations/20260713000000_class_session_update_guard.sql'),
    ('product_update_guard', 'supabase/migrations/20260713010000_product_update_guard.sql'),
    ('stripe_refund_reconciliation', 'supabase/migrations/20260713020000_stripe_refund_reconciliation.sql'),
    ('checkout_reconciliation', 'supabase/migrations/20260713030000_checkout_reconciliation.sql'),
    ('member_announcements', 'supabase/migrations/20260713040000_member_announcements.sql'),
    ('announcement_receipts', 'supabase/migrations/20260713050000_announcement_receipts.sql'),
    ('announcement_actions', 'supabase/migrations/20260714000000_announcement_actions.sql'),
    ('announcement_archival', 'supabase/migrations/20260714010000_announcement_archival.sql'),
    ('booking_time_conflict_guard', 'supabase/migrations/20260714002000_booking_time_conflicts.sql'),
    ('admin_member_notes', 'supabase/migrations/20260714003000_admin_member_notes.sql'),
    ('schedule_blackout_guard', 'supabase/migrations/20260714004000_schedule_blackout_guard.sql'),
    ('database_security_hardening', 'supabase/migrations/20260714006000_database_security_hardening.sql'),
    ('rls_policy_performance', 'supabase/migrations/20260714007000_rls_policy_performance.sql'),
    ('request_status_audit', 'supabase/migrations/20260714008000_admin_request_status_audit.sql'),
    ('member_push_notifications', 'supabase/migrations/20260714009000_member_push_notifications.sql'),
    ('credit_expiry_follow_up', 'supabase/migrations/20260713060000_credit_expiry_follow_up.sql'),
    ('member_pt_request_tracking', 'supabase/migrations/20260714004200_member_pt_request_tracking.sql'),
    ('public_form_integrity', 'supabase/migrations/20260714004300_public_form_integrity.sql'),
    ('lead_pipeline_audit', 'supabase/migrations/20260714011000_lead_pipeline_audit.sql'),
    ('schedule_change_audit', 'supabase/migrations/20260714012000_schedule_change_audit.sql'),
    ('content_change_audit', 'supabase/migrations/20260714013000_content_change_audit.sql'),
    ('booking_lifecycle_audit', 'supabase/migrations/20260714014000_booking_lifecycle_audit.sql'),
    ('class_cancellation_notifications', 'supabase/migrations/20260714015000_class_cancellation_notifications.sql'),
    ('admin_daily_operations', 'supabase/migrations/20260714016000_admin_daily_operations.sql'),
    ('schedule_optimistic_locking', 'supabase/migrations/20260714018000_schedule_optimistic_locking.sql'),
    ('shared_admin_optimistic_locking', 'supabase/migrations/20260714019000_shared_admin_optimistic_locking.sql'),
    ('catalog_optimistic_locking', 'supabase/migrations/20260714020000_catalog_optimistic_locking.sql'),
    ('targeted_member_notices', 'supabase/migrations/20260714021000_targeted_member_notices.sql')
), readiness as (
  select
    required.capability,
    capabilities.installed_at is not null as installed,
    capabilities.installed_at,
    required.migration
  from required
  left join public.xert_schema_capabilities as capabilities
    on capabilities.capability = required.capability
)
select
  capability,
  installed,
  installed_at,
  migration,
  bool_and(installed) over () as release_ready
from readiness
order by capability;
