import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/20260714005000_release_capability_reconciliation.sql', import.meta.url), 'utf8');

test('legacy capability reconciliation certifies database objects before markers', () => {
  const markerStart = migration.indexOf('insert into public.xert_schema_capabilities');
  assert.ok(markerStart > 0);
  const audit = migration.slice(0, markerStart);

  for (const contract of [
    'enforce_session_waitlist_fifo',
    'join_session_waitlist',
    'admin_promote_next_waitlisted',
    'admin_waitlist_overview',
    'session_bookings_waitlist_fifo_guard',
    'private_session_requests_user_created_idx',
    'members_read_own_private_session_requests',
    'public_insert_member_interest',
    'public_insert_trainer_interest',
    'public_insert_partner_interest',
    'public_insert_class_bookings',
    'public_insert_private_session_requests',
  ]) {
    assert.match(audit, new RegExp(contract));
  }
  assert.match(audit, /consent_to_contact/i);
  assert.match(audit, /user_id%auth\.uid/i);
  assert.match(migration, /\('waitlist_fifo_promotion'\)/);
  assert.match(migration, /\('member_pt_request_tracking'\)/);
  assert.match(migration, /\('public_form_integrity'\)/);
});

test('linked migrations install the canonical manually-authored upgrades', () => {
  const pairs = [
    ['../src/supabase/credit_grant_audit_upgrade.sql', '../supabase/migrations/20260714005500_credit_grant_audit.sql'],
    ['../src/supabase/waitlist_fifo_promotion_upgrade.sql', '../supabase/migrations/20260714004100_waitlist_fifo_promotion.sql'],
    ['../src/supabase/member_pt_request_tracking.sql', '../supabase/migrations/20260714004200_member_pt_request_tracking.sql'],
    ['../src/supabase/public_form_integrity_upgrade.sql', '../supabase/migrations/20260714004300_public_form_integrity.sql'],
    ['../src/supabase/member_push_notifications_upgrade.sql', '../supabase/migrations/20260714009000_member_push_notifications.sql'],
    ['../src/supabase/announcement_archival_upgrade.sql', '../supabase/migrations/20260714010000_announcement_archival.sql'],
    ['../src/supabase/lead_pipeline_audit_upgrade.sql', '../supabase/migrations/20260714011000_lead_pipeline_audit.sql'],
    ['../src/supabase/schedule_change_audit_upgrade.sql', '../supabase/migrations/20260714012000_schedule_change_audit.sql'],
    ['../src/supabase/content_change_audit_upgrade.sql', '../supabase/migrations/20260714013000_content_change_audit.sql'],
    ['../src/supabase/booking_lifecycle_audit_upgrade.sql', '../supabase/migrations/20260714014000_booking_lifecycle_audit.sql'],
    ['../src/supabase/class_cancellation_notifications_upgrade.sql', '../supabase/migrations/20260714015000_class_cancellation_notifications.sql'],
    ['../src/supabase/catalog_optimistic_locking_upgrade.sql', '../supabase/migrations/20260714020000_catalog_optimistic_locking.sql'],
    ['../src/supabase/product_commercial_terms_guard_upgrade.sql', '../supabase/migrations/20260720000000_product_commercial_terms_guard.sql'],
    ['../src/supabase/member_onboarding_upgrade.sql', '../supabase/migrations/20260721010000_member_onboarding_foundation.sql'],
    ['../src/supabase/member_activation_cockpit_upgrade.sql', '../supabase/migrations/20260721020000_member_activation_cockpit.sql'],
    ['../src/supabase/targeted_member_notices_upgrade.sql', '../supabase/migrations/20260714021000_targeted_member_notices.sql'],
  ];
  for (const [sourcePath, migrationPath] of pairs) {
    const normalize = (sql) => sql
      .replace(/\r\n/g, '\n')
      // A later linked migration optimizes these equivalent policy expressions.
      .replace(/\(select auth\.uid\(\)\)/gi, 'auth.uid()')
      .trim();
    const source = normalize(readFileSync(new URL(sourcePath, import.meta.url), 'utf8'));
    const linkedMigration = normalize(readFileSync(new URL(migrationPath, import.meta.url), 'utf8'));
    assert.equal(linkedMigration, source);
  }
});
