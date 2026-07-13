-- Read-only TestFlight release check. Run this in the production Supabase SQL
-- editor after applying upgrades. Every row must show installed = true and
-- release_ready = true before starting the Codemagic ios-testflight workflow.
with required (capability, migration) as (
  values
    ('admin_role_safety', 'src/supabase/admin_role_safety_upgrade.sql'),
    ('booking_waitlist_withdrawal', 'src/supabase/booking_modes_upgrade.sql'),
    ('member_waitlist_join', 'src/supabase/member_waitlist_upgrade.sql'),
    ('waitlist_fifo_promotion', 'src/supabase/waitlist_fifo_promotion_upgrade.sql'),
    ('attendance_roll_call', 'src/supabase/attendance_roll_call_upgrade.sql'),
    ('class_session_update_guard', 'supabase/migrations/20260713000000_class_session_update_guard.sql'),
    ('product_update_guard', 'supabase/migrations/20260713010000_product_update_guard.sql'),
    ('stripe_refund_reconciliation', 'supabase/migrations/20260713020000_stripe_refund_reconciliation.sql'),
    ('checkout_reconciliation', 'supabase/migrations/20260713030000_checkout_reconciliation.sql'),
    ('member_announcements', 'supabase/migrations/20260713040000_member_announcements.sql'),
    ('member_pt_request_tracking', 'src/supabase/member_pt_request_tracking.sql'),
    ('public_form_integrity', 'src/supabase/public_form_integrity_upgrade.sql')
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
