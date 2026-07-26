-- Read-only TestFlight release check. Run this in the production Supabase SQL
-- editor after applying upgrades. Every row must show installed = true and
-- release_ready = true before starting the Codemagic ios-testflight workflow.
with required (capability, migration) as (
  values
    ('admin_role_safety', 'src/supabase/admin_role_safety_upgrade.sql'),
    ('audited_credit_grants', 'supabase/migrations/20260714005500_credit_grant_audit.sql'),
    ('booking_waitlist_withdrawal', 'src/supabase/booking_modes_upgrade.sql'),
    ('member_booking_switch_guard', 'supabase/migrations/20260721000000_member_booking_switch_guard.sql'),
    ('member_onboarding_foundation', 'supabase/migrations/20260721010000_member_onboarding_foundation.sql'),
    ('member_onboarding_booking_gate', 'src/supabase/member_onboarding_booking_gate.sql'),
    ('member_activation_cockpit', 'supabase/migrations/20260721020000_member_activation_cockpit.sql'),
    ('member_waitlist_join', 'src/supabase/member_waitlist_upgrade.sql'),
    ('waitlist_fifo_promotion', 'src/supabase/waitlist_fifo_promotion_upgrade.sql'),
    ('attendance_roll_call', 'src/supabase/roll_call_releases_pending_requests.sql'),
    ('class_session_update_guard', 'supabase/migrations/20260713000000_class_session_update_guard.sql'),
    ('class_session_optimistic_locking', 'supabase/migrations/20260726104000_class_session_optimistic_locking.sql'),
    ('product_update_guard', 'supabase/migrations/20260713010000_product_update_guard.sql'),
    ('stripe_refund_reconciliation', 'supabase/migrations/20260713020000_stripe_refund_reconciliation.sql'),
    ('checkout_reconciliation', 'supabase/migrations/20260713030000_checkout_reconciliation.sql'),
    ('stripe_payment_fulfillment', 'src/supabase/stripe_payment_fulfillment_upgrade.sql'),
    ('guarded_payment_activation', 'supabase/migrations/20260716010000_guarded_payment_activation.sql'),
    ('payment_activation_drift_guard', 'supabase/migrations/20260716060000_payment_activation_drift_guard.sql'),
    ('admin_settings_singleton', 'supabase/migrations/20260716020000_admin_settings_singleton.sql'),
    ('stripe_pending_order_guard', 'src/supabase/stripe_payment_fulfillment_upgrade.sql'),
    ('stripe_order_terms_snapshot', 'src/supabase/stripe_payment_fulfillment_upgrade.sql'),
    ('stripe_webhook_ledger', 'supabase/migrations/20260716050000_stripe_webhook_ledger.sql'),
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
    ('targeted_member_notices', 'supabase/migrations/20260714021000_targeted_member_notices.sql'),
    ('product_commercial_terms_guard', 'supabase/migrations/20260720000000_product_commercial_terms_guard.sql'),
    ('waitlist_promotion_notifications', 'supabase/migrations/20260721030000_waitlist_promotion_notifications.sql'),
    ('booking_decision_notifications', 'src/supabase/booking_decision_notifications_upgrade.sql'),
    ('owner_stripe_price_provisioning', 'supabase/migrations/20260722010000_owner_stripe_price_provisioning.sql'),
    -- Prefer src/supabase mirrors for public-form installer remediations: older
    -- migrations used to strip bookings_enabled / notes health-consent WITH CHECK.
    ('public_form_staff_column_guard', 'src/supabase/public_form_staff_column_guard.sql'),
    ('schedule_blackout_historic_edit_fix', 'supabase/migrations/20260726011000_schedule_blackout_historic_edit_fix.sql'),
    ('public_enquiry_time_guard', 'src/supabase/public_enquiry_time_guard.sql'),
    ('my_bookings_duration', 'supabase/migrations/20260726013000_my_bookings_duration.sql'),
    ('product_currency_aud_only', 'supabase/migrations/20260726014000_product_currency_aud_only.sql'),
    ('stripe_signature_failure_ledger', 'supabase/migrations/20260726015000_stripe_signature_failure_ledger.sql'),
    -- Prefer re-runnable src/supabase mirrors for money/privacy RPCs: several
    -- historical migrations still carry weaker cancel/refund/fulfill/erasure bodies.
    ('stripe_fulfillment_deleted_member', 'src/supabase/stripe_fulfillment_deleted_member_fix.sql'),
    ('atomic_account_deletion', 'src/supabase/atomic_account_deletion.sql'),
    ('roll_call_releases_pending_requests', 'src/supabase/roll_call_releases_pending_requests.sql'),
    ('admin_policy_scalar_subquery', 'supabase/migrations/20260726018000_admin_policy_scalar_subquery.sql'),
    ('member_history_index', 'supabase/migrations/20260726019000_member_history_index.sql'),
    ('cancel_booking_expired_batch_refund', 'src/supabase/cancel_booking_expired_batch_refund.sql'),
    ('credit_batch_refund_reactivation', 'src/supabase/credit_batch_refund_reactivation.sql'),
    ('member_interest_health_consent', 'src/supabase/member_interest_health_consent.sql'),
    ('audit_subject_pii_redaction', 'src/supabase/audit_subject_pii_redaction_upgrade.sql'),
    ('account_deletion_public_lead_cleanup', 'src/supabase/account_deletion_public_lead_cleanup.sql'),
    ('request_notes_health_consent', 'src/supabase/request_notes_health_consent.sql'),
    ('waitlist_skip_concurrency', 'src/supabase/waitlist_skip_concurrency_upgrade.sql'),
    ('pt_rehab_goal_health_consent', 'src/supabase/pt_rehab_goal_health_consent.sql'),
    ('stripe_fulfillment_deleted_email_erasure', 'src/supabase/fulfillment_erasure_and_refunded_pack_guard.sql'),
    ('refund_skips_stripe_refunded_batches', 'src/supabase/fulfillment_erasure_and_refunded_pack_guard.sql'),
    ('public_booking_switch_gate', 'src/supabase/public_booking_switch_gate.sql'),
    ('waitlist_skip_notice_accuracy', 'src/supabase/waitlist_skip_notice_accuracy.sql'),
    ('member_interest_health_reveal_authz', 'src/supabase/member_interest_health_reveal_authz.sql')
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
