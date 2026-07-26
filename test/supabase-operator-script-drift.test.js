import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

// src/supabase/*.sql is the operator apply path: README documents every script
// as idempotent and safe to re-run, and Operations Health tells the owner to
// re-run individual files by name. That only holds if no script can recreate a
// policy, function or grant in a weaker form than a later script installs.
// Two of them could, and re-running booking_schema.sql on the live database
// would have exposed every member's targeted notices to every other member.
//
// These assertions are on source text, so comments are stripped first —
// a header that quotes the superseded code must not satisfy or trip a check.
const OPERATOR_DIR = fileURLToPath(new URL('../src/supabase/', import.meta.url));

function scripts() {
  return readdirSync(OPERATOR_DIR)
    .filter(name => name.endsWith('.sql'))
    .map(name => ({
      name,
      sql: readFileSync(path.join(OPERATOR_DIR, name), 'utf8')
        .split('\n')
        .filter(line => !line.trimStart().startsWith('--'))
        .join('\n'),
    }));
}

// Every statement that creates `name`, with enough following text to see the
// predicate it installs and enough preceding text to see the branch it sits in.
function statementsCreating(sql, name) {
  const marker = `create policy "${name}"`;
  const found = [];
  for (let at = sql.indexOf(marker); at !== -1; at = sql.indexOf(marker, at + 1)) {
    const rest = sql.slice(at);
    const end = rest.search(/\$policy\$|;\s*\n/);
    found.push({ before: sql.slice(0, at), text: rest.slice(0, end === -1 ? rest.length : end) });
  }
  return found;
}

test('no operator script recreates the announcement read policy without the audience predicate', () => {
  const bootstrapGuard = "to_regclass('public.member_announcement_targets') is null";
  let checked = 0;

  for (const { name, sql } of scripts()) {
    for (const statement of statementsCreating(sql, 'member_announcements_select_live_or_admin')) {
      checked += 1;
      if (statement.text.includes('member_announcement_targets')) continue;

      // Fail-closed broadcast-only (audience = 'all', no targeted branch) is
      // safe when the targets table is missing — it cannot expose private
      // notices. Accept that shape without requiring the bootstrap guard.
      const failClosedBroadcast = /\baudience\s*=\s*'all'/.test(statement.text)
        && !/\baudience\s*=\s*'targeted'/.test(statement.text);
      if (failClosedBroadcast) continue;

      // An audience-blind policy is only ever correct while the targeting
      // schema does not exist yet, so it must sit in that bootstrap branch.
      assert.ok(
        statement.before.slice(-800).includes(bootstrapGuard),
        `${name} recreates member_announcements_select_live_or_admin without the audience `
          + 'predicate and outside the bootstrap branch, so re-running it would let every '
          + "member read every other member's targeted notices",
      );
    }
  }

  assert.ok(checked >= 3, 'the announcement read policy is created by more than one script');
});

test('every operator script that defines guard_profile_write keeps email immutable', () => {
  const definers = scripts().filter(({ sql }) => sql.includes('create or replace function public.guard_profile_write()'));
  assert.ok(definers.length >= 3, 'guard_profile_write is defined by more than one script');

  for (const { name, sql } of definers) {
    assert.ok(
      sql.includes("raise exception 'PROFILE_EMAIL_MANAGED_BY_AUTH'"),
      `${name} replaces guard_profile_write without the email-immutability branch, so re-running `
        + 'it would let a member rewrite the contact address staff identify their account by',
    );
  }
});

test('every operator script that defines handle_new_user records the signup email', () => {
  const definers = scripts().filter(({ sql }) => sql.includes('create or replace function public.handle_new_user()'));
  assert.ok(definers.length >= 2, 'handle_new_user is defined by more than one script');

  for (const { name, sql } of definers) {
    assert.match(
      sql,
      /insert into public\.profiles \(id, full_name, phone, email\)/,
      `${name} replaces handle_new_user without writing profiles.email, so re-running it would `
        + 'leave new members unidentifiable in the admin directory',
    );
  }
});

test('no operator script writes its own public form insert policy', () => {
  const installer = 'install_public_form_insert_policies';
  const bootstrapGuard = `to_regprocedure('public.${installer}()') is not null`;
  let checked = 0;

  for (const { name, sql } of scripts()) {
    // The installer's own definition is the one place the policy text lives.
    if (sql.includes(`create or replace function public.${installer}`)) continue;

    for (const at of [...sql.matchAll(/create policy "public_insert_\w+"/g)].map(match => match.index)) {
      checked += 1;
      assert.ok(
        sql.slice(0, at).includes(bootstrapGuard),
        `${name} writes a public form insert policy outside the branch that runs only when `
          + `${installer}() is absent, so re-running it would drop whichever guards the `
          + 'installer adds — today the staff-note clause and the finished-class check',
      );
    }
  }

  assert.ok(checked >= 5, 'the public form insert policies are still bootstrapped somewhere');
});

test('every install_public_form_insert_policies definition keeps the health-consent guard', () => {
  const definers = scripts().filter(({ sql }) => sql.includes('create or replace function public.install_public_form_insert_policies()'));
  assert.ok(definers.length >= 3, 'the public form installer is defined by more than one operator script');

  for (const { name, sql } of definers) {
    assert.match(
      sql,
      /health_info_consent is true/,
      `${name} replaces install_public_form_insert_policies without the member-interest `
        + 'health-consent guard, so re-running it would accept injuries text without APP 3.3 consent',
    );
    assert.match(sql, /injuries_or_limitations_optional/);
  }
});

test('no operator script recreates admin_cancel_class_session without the credit-safe refund', () => {
  let checked = 0;
  for (const { name, sql } of scripts()) {
    if (!sql.includes('create or replace function public.admin_cancel_class_session')) continue;
    checked += 1;
    assert.match(
      sql,
      /status as previous_status/,
      `${name} recreates admin_cancel_class_session without a pre-update status snapshot, `
        + 'so re-running it would silently refund nothing again',
    );
    assert.match(
      sql,
      /previous_status in \('requested', 'confirmed', 'attended', 'no_show'\)/,
      `${name} recreates admin_cancel_class_session without attended/no_show refunds`,
    );
  }
  assert.ok(checked >= 3, 'bootstrap and fix scripts still define admin_cancel_class_session');
});

test('older audit/deletion operator scripts cannot downgrade redaction-aware guards or delete_member_account', () => {
  const guarded = [
    {
      name: 'audit_immutability_account_deletion_fix.sql',
      mustMatch: [/install_guard_admin_request_status_change/, /subject_label/, /install_guard_admin_lead_change/],
    },
    {
      name: 'atomic_account_deletion.sql',
      mustMatch: [/install_delete_member_account/, /keeping newer delete_member_account/, /redact_audit_subject_pii|member_interest/],
    },
    {
      name: 'audit_subject_pii_redaction_upgrade.sql',
      mustMatch: [/install_delete_member_account/, /keeping newer delete_member_account/, /member_interest/],
    },
    {
      name: 'admin_request_status_audit_upgrade.sql',
      mustMatch: [/install_guard_admin_request_status_change/, /subject_label|changed_by/],
    },
    {
      name: 'lead_pipeline_audit_upgrade.sql',
      mustMatch: [/install_guard_admin_lead_change/, /subject_label|changed_by/],
    },
  ];

  for (const { name, mustMatch } of guarded) {
    const script = scripts().find(entry => entry.name === name);
    assert.ok(script, `missing operator script ${name}`);
    for (const pattern of mustMatch) {
      assert.match(
        script.sql,
        pattern,
        `${name} is not re-run safe against a newer deletion/redaction shape (${pattern})`,
      );
    }
    // Unconditional CREATE OR REPLACE of the weaker body must not remain outside the skip branch.
    if (name.includes('audit_upgrade') || name === 'admin_request_status_audit_upgrade.sql' || name === 'lead_pipeline_audit_upgrade.sql') {
      assert.match(script.sql, /keeping newer|keeping redaction-aware/);
    }
  }

  const currentDeletion = scripts().find(entry => entry.name === 'account_deletion_public_lead_cleanup.sql');
  assert.ok(currentDeletion, 'missing current account deletion cleanup script');
  assert.match(currentDeletion.sql, /member_interest/);
  assert.match(currentDeletion.sql, /trainer_interest/);
  assert.match(currentDeletion.sql, /partner_interest/);
  assert.match(currentDeletion.sql, /private_session_requests/);
  assert.match(currentDeletion.sql, /redact_audit_subject_pii/);
});

test('every install_public_form_insert_policies definition gates PT/booking notes on health consent', () => {
  const definers = scripts().filter(({ sql }) => sql.includes('create or replace function public.install_public_form_insert_policies()'));
  assert.ok(definers.length >= 3, 'the public form installer is defined by more than one operator script');

  for (const { name, sql } of definers) {
    assert.match(
      sql,
      /private_session_requests/,
      `${name} replaces install_public_form_insert_policies without the PT notes health-consent guard`,
    );
    assert.match(
      sql,
      /class_bookings/,
      `${name} replaces install_public_form_insert_policies without the booking notes health-consent guard`,
    );
    assert.match(sql, /coalesce\(btrim\(notes\), ''\) = ''/);
    assert.match(
      sql,
      /Rehab \/ return to fitness/,
      `${name} replaces install_public_form_insert_policies without the PT rehab-goal health-consent guard, `
        + 'so re-running it would accept that goal without APP 3.3 consent',
    );
    assert.match(
      sql,
      /bookings_enabled is true/,
      `${name} replaces install_public_form_insert_policies without the soft-launch `
        + 'bookings_enabled gate on class_bookings, so re-running it would accept '
        + 'public Request spot inserts while bookings are paused',
    );
  }
});

test('operator RLS scripts keep admin policy quals as InitPlan-safe scalar subqueries', () => {
  // 20260726018000 wraps admin_all_* / admin_settings / availability / blackout
  // policies as `(select public.is_admin())` so Postgres evaluates them once per
  // statement. rls_policies.sql, rls_hardening.sql and availability_schema.sql
  // recreate those same policies; a bare `public.is_admin()` here reintroduces
  // per-row profile lookups on every badge count and lead scan when any file is
  // re-run.
  const barePolicyQual = /(?:using|with check)\s*\(\s*public\.is_admin\s*\(\s*\)\s*\)/i;
  const wrappedPolicyQual = /(?:using|with check)\s*\(\s*\(\s*select\s+public\.is_admin\s*\(\s*\)\s*\)\s*\)/i;
  const initPlanPolicyNames = [
    'admin_all_member_interest',
    'admin_all_trainer_interest',
    'admin_all_partner_interest',
    'admin_all_class_bookings',
    'admin_all_private_session_requests',
    'admin_all_class_sessions',
    'admin_update_admin_settings',
    'admin_insert_admin_settings',
    'admins_manage_availability_blocks',
    'admins_manage_blackout_periods',
  ];
  let checked = 0;

  for (const name of ['rls_policies.sql', 'rls_hardening.sql', 'availability_schema.sql']) {
    const script = scripts().find(entry => entry.name === name);
    assert.ok(script, `missing operator script ${name}`);
    assert.match(
      script.sql,
      wrappedPolicyQual,
      `${name} must recreate admin policies with (select public.is_admin())`,
    );
    assert.doesNotMatch(
      script.sql,
      barePolicyQual,
      `${name} still installs a bare public.is_admin() policy qual, so re-running `
        + 'it undoes admin_policy_scalar_subquery InitPlan caching',
    );
    checked += 1;
  }

  for (const { name, sql } of scripts()) {
    for (const policyName of initPlanPolicyNames) {
      for (const statement of statementsCreating(sql, policyName)) {
        const cleaned = statement.text.replace(/\(\s*select\s+public\.is_admin\s*\(\s*\)\s*\)/gi, 'WRAPPED');
        assert.doesNotMatch(
          cleaned,
          /public\.is_admin\s*\(\s*\)/i,
          `${name} recreates ${policyName} with a bare public.is_admin() qual`,
        );
      }
    }
  }

  assert.equal(checked, 3);
});

test('older operator scripts cannot downgrade audited health reveal or waitlist skip notices', () => {
  const requestNotes = scripts().find(entry => entry.name === 'request_notes_health_consent.sql');
  assert.ok(requestNotes, 'missing request_notes_health_consent.sql');
  assert.match(
    requestNotes.sql,
    /keeping audited admin_reveal_member_interest_health/,
    'request_notes_health_consent.sql must skip replacing the audited health-reveal RPC',
  );
  assert.match(requestNotes.sql, /member_interest_health_reveals/);
  assert.match(requestNotes.sql, /audit_event_id/);
  // Authz table present + missing/weak RPC must reinstall the audited body, not
  // the unaudited bootstrap (and must not treat table-exists as keep-unaudited).
  assert.match(
    requestNotes.sql,
    /elsif to_regclass\('public\.member_interest_health_reveals'\) is not null then[\s\S]*insert into public\.member_interest_health_reveals/i,
  );
  assert.doesNotMatch(
    requestNotes.sql,
    /v_def is not null\s+and\s*\([\s\S]*to_regclass\('public\.member_interest_health_reveals'\) is not null\s*\)/i,
  );

  const bookingDecision = scripts().find(entry => entry.name === 'booking_decision_notifications_upgrade.sql');
  assert.ok(bookingDecision, 'missing booking_decision_notifications_upgrade.sql');
  assert.match(
    bookingDecision.sql,
    /keeping newer admin_set_booking_status_with_notice/,
    'booking_decision_notifications_upgrade.sql must skip replacing the waitlist-accurate notice RPC',
  );
  assert.match(bookingDecision.sql, /Waitlist place removed/);
  // InitPlan-safe admin qual on the decision receipt policy (same class as
  // admin_policy_scalar_subquery).
  assert.match(
    bookingDecision.sql,
    /booking_decision_receipts_admin_read[\s\S]*using\s*\(\s*\(\s*select\s+public\.is_admin\s*\(\s*\)\s*\)\s*\)/i,
  );

  const accurate = scripts().find(entry => entry.name === 'waitlist_skip_notice_accuracy.sql');
  assert.ok(accurate, 'missing waitlist_skip_notice_accuracy.sql');
  assert.match(accurate.sql, /Waitlist place removed/);
  assert.match(accurate.sql, /No class credit was charged/);

  const authz = scripts().find(entry => entry.name === 'member_interest_health_reveal_authz.sql');
  assert.ok(authz, 'missing member_interest_health_reveal_authz.sql');
  assert.match(authz.sql, /insert into public\.member_interest_health_reveals/);
  assert.match(authz.sql, /'audit_event_id'/);
});

test('older money/privacy operator scripts skip-if-newer for cancel/refund/fulfill/class-cancel', () => {
  // Ops Health used to point at historical migrations whose bodies omit helper
  // refunds, Stripe-refunded pack skips, or deleted-buyer email erasure.
  // These operator mirrors must not unconditionally replace a newer live body.
  const guarded = [
    {
      name: 'cancel_booking_expired_batch_refund.sql',
      notice: /keeping newer cancel_booking/,
      mustMatch: [/refund_credits_to_batch/, /install_cancel_booking/],
    },
    {
      name: 'credit_batch_refund_reactivation.sql',
      notice: /keeping newer refund_credits_to_batch/,
      mustMatch: [
        /keeping newer cancel_booking/,
        /keeping newer admin_set_booking_status/,
        /keeping newer admin_record_session_attendance/,
        /keeping newer admin_cancel_class_session/,
        /o\.status = 'refunded'/,
        /attended/,
        /no_show/,
      ],
    },
    {
      name: 'class_cancellation_credit_refund_fix.sql',
      notice: /keeping newer admin_cancel_class_session/,
      mustMatch: [/keeping newer refund_credits_to_batch/, /o\.status = 'refunded'/, /attended/, /no_show/],
    },
    {
      name: 'stripe_fulfillment_deleted_member_fix.sql',
      notice: /keeping newer fulfill_stripe_checkout/,
      mustMatch: [/user_id is null then null/, /install_fulfill_stripe_checkout/],
    },
    {
      name: 'stripe_payment_fulfillment_upgrade.sql',
      notice: /keeping newer fulfill_stripe_checkout/,
      mustMatch: [/user_id is null then null/, /install_fulfill_stripe_checkout/],
    },
    {
      name: 'booking_modes_upgrade.sql',
      notice: /keeping newer cancel_booking/,
      mustMatch: [
        /keeping newer refund_credits_to_batch/,
        /keeping newer admin_cancel_class_session/,
        /keeping newer admin_set_booking_status/,
        /o\.status = 'refunded'/,
        /p_anchor timestamp with time zone/,
      ],
    },
    {
      name: 'admin_cms_schema.sql',
      notice: /keeping newer admin_cancel_class_session/,
      mustMatch: [
        /keeping newer refund_credits_to_batch/,
        /keeping newer admin_set_booking_status/,
        /keeping newer admin_record_session_attendance/,
        /o\.status = 'refunded'/,
        /status = 'requested'/,
        /p_anchor timestamp with time zone/,
      ],
    },
    {
      name: 'attendance_roll_call_upgrade.sql',
      notice: /keeping newer admin_record_session_attendance/,
      mustMatch: [/status = 'requested'/, /o\.status = 'refunded'/],
    },
    {
      name: 'roll_call_correction_double_credit_fix.sql',
      notice: /keeping newer admin_set_booking_status/,
      mustMatch: [
        /keeping newer refund_credits_to_batch/,
        /keeping newer cancel_booking/,
        /o\.status = 'refunded'/,
        /p_anchor timestamp with time zone/,
      ],
    },
  ];

  for (const { name, notice, mustMatch } of guarded) {
    const script = scripts().find(entry => entry.name === name);
    assert.ok(script, `missing operator script ${name}`);
    assert.match(script.sql, notice, `${name} must skip-if-newer`);
    for (const pattern of mustMatch) {
      assert.match(
        script.sql,
        pattern,
        `${name} is not re-run safe against a newer money/privacy shape (${pattern})`,
      );
    }
  }
});

test('historical money migrations skip-if-newer so re-runs cannot strip refunded-pack guards', () => {
  const migrationDir = fileURLToPath(new URL('../supabase/migrations/', import.meta.url));
  const guarded = [
    {
      name: '20260726003000_roll_call_correction_double_credit_fix.sql',
      notice: /keeping newer admin_set_booking_status/,
      // Bootstrap still documents the original inline remaining+1 path.
      bootstrapWeak: /remaining = remaining \+ 1/,
    },
    {
      name: '20260726017000_roll_call_releases_pending_requests.sql',
      notice: /keeping newer admin_record_session_attendance/,
      bootstrapWeak: /status = 'requested'/,
    },
    {
      name: '20260726106000_credit_batch_refund_reactivation.sql',
      notice: /keeping newer refund_credits_to_batch/,
      mustMatch: [
        /keeping newer admin_record_session_attendance/,
        /keeping newer admin_cancel_class_session/,
        /p_anchor timestamp with time zone/,
      ],
    },
  ];

  for (const { name, notice, bootstrapWeak, mustMatch = [] } of guarded) {
    const sql = readFileSync(path.join(migrationDir, name), 'utf8')
      .split('\n')
      .filter(line => !line.trimStart().startsWith('--'))
      .join('\n');
    assert.match(sql, notice, `${name} must skip-if-newer`);
    if (bootstrapWeak) assert.match(sql, bootstrapWeak, `${name} must retain historical bootstrap body`);
    for (const pattern of mustMatch) {
      assert.match(sql, pattern, `${name} missing ${pattern}`);
    }
  }
});

test('Ops Health / release readiness remediations never point at weak fulfill or delete migrations', async () => {
  const { REQUIRED_SCHEMA_CAPABILITIES } = await import('../src/lib/schemaCapabilities.js');
  const readiness = readFileSync(new URL('../src/supabase/release_readiness_check.sql', import.meta.url), 'utf8');
  const weakFulfill = [
    '20260715010000_stripe_payment_fulfillment.sql',
    '20260716030000_stripe_pending_order_guard.sql',
    '20260716040000_stripe_order_terms_snapshot.sql',
  ];
  const weakDelete = [
    '20260726016000_atomic_account_deletion.sql',
    '20260726105000_audit_subject_pii_redaction.sql',
  ];
  for (const file of [...weakFulfill, ...weakDelete]) {
    assert.doesNotMatch(
      readiness,
      new RegExp(file.replace(/\./g, '\\.')),
      `release_readiness_check.sql must not remediate via weak ${file}`,
    );
  }
  for (const capability of [
    'stripe_payment_fulfillment',
    'stripe_pending_order_guard',
    'stripe_order_terms_snapshot',
    'atomic_account_deletion',
    'audit_subject_pii_redaction',
    'account_deletion_public_lead_cleanup',
  ]) {
    const action = REQUIRED_SCHEMA_CAPABILITIES[capability];
    assert.match(action, /src\/supabase\//, `${capability} Ops Health action must use a src/supabase mirror`);
    for (const file of [...weakFulfill, ...weakDelete]) {
      assert.doesNotMatch(action, new RegExp(file.replace(/\./g, '\\.')), capability);
    }
    const sqlPath = (readiness.match(new RegExp(`\\('${capability}', '([^']+)'\\)`)) || [])[1];
    const actionPath = (action.match(/(src\/supabase\/[\w.-]+\.sql)/) || [])[1];
    assert.equal(sqlPath, actionPath, `${capability} release_readiness path must match Ops Health`);
  }
});

test('Ops Health / release readiness remediations never point at weak public-form or waitlist migrations', async () => {
  // Historical public-form migrations used to recreate install_public_form_insert_
  // policies without bookings_enabled / notes health-consent WITH CHECK. Waitlist
  // FIFO / booking-decision migrations still carry weaker skip/refund/notice bodies
  // behind skip-if-newer; Ops Health must remediate via the strong src/supabase mirrors.
  const { REQUIRED_SCHEMA_CAPABILITIES } = await import('../src/lib/schemaCapabilities.js');
  const readiness = readFileSync(new URL('../src/supabase/release_readiness_check.sql', import.meta.url), 'utf8');
  const weakPublicForm = [
    '20260726010000_public_form_staff_column_guard.sql',
    '20260726012000_public_enquiry_time_guard.sql',
    '20260726103000_member_interest_health_consent.sql',
    '20260726109000_request_notes_health_consent.sql',
    '20260726113000_public_booking_switch_gate.sql',
  ];
  const weakWaitlist = [
    '20260714004100_waitlist_fifo_promotion.sql',
    '20260722000000_booking_decision_notifications.sql',
    '20260726110000_waitlist_skip_concurrency.sql',
    '20260726115000_waitlist_skip_notice_accuracy.sql',
  ];
  for (const file of [...weakPublicForm, ...weakWaitlist, '20260726114000_member_onboarding_booking_gate.sql']) {
    assert.doesNotMatch(
      readiness,
      new RegExp(file.replace(/\./g, '\\.')),
      `release_readiness_check.sql must not remediate via ${file}`,
    );
  }
  for (const capability of [
    'public_form_staff_column_guard',
    'public_enquiry_time_guard',
    'member_interest_health_consent',
    'request_notes_health_consent',
    'pt_rehab_goal_health_consent',
    'public_booking_switch_gate',
    'waitlist_fifo_promotion',
    'booking_decision_notifications',
    'waitlist_skip_concurrency',
    'waitlist_skip_notice_accuracy',
    'member_onboarding_booking_gate',
    'member_interest_health_reveal_authz',
  ]) {
    const action = REQUIRED_SCHEMA_CAPABILITIES[capability];
    assert.match(action, /src\/supabase\//, `${capability} Ops Health action must use a src/supabase mirror`);
    const sqlPath = (readiness.match(new RegExp(`\\('${capability}', '([^']+)'\\)`)) || [])[1];
    const actionPath = (action.match(/(src\/supabase\/[\w.-]+\.sql)/) || [])[1];
    assert.equal(sqlPath, actionPath, `${capability} release_readiness path must match Ops Health`);
  }

  // Migration copies that still redefine the installer must keep the soft-launch
  // bookings gate and notes health-consent WITH CHECK (re-run safe).
  const migrationDir = fileURLToPath(new URL('../supabase/migrations/', import.meta.url));
  for (const name of [
    '20260726010000_public_form_staff_column_guard.sql',
    '20260726012000_public_enquiry_time_guard.sql',
    '20260726103000_member_interest_health_consent.sql',
    '20260726109000_request_notes_health_consent.sql',
  ]) {
    const sql = readFileSync(path.join(migrationDir, name), 'utf8')
      .split('\n')
      .filter(line => !line.trimStart().startsWith('--'))
      .join('\n');
    assert.match(sql, /bookings_enabled is true/, `${name} must keep public_booking_switch_gate`);
    assert.match(sql, /coalesce\(btrim\(notes\), ''\) = ''/, `${name} must keep request_notes notes WITH CHECK`);
    assert.match(sql, /Rehab \/ return to fitness/, `${name} must keep PT rehab-goal health consent`);
  }
  const requestNotesMig = readFileSync(
    path.join(migrationDir, '20260726109000_request_notes_health_consent.sql'),
    'utf8',
  );
  assert.match(requestNotesMig, /keeping audited admin_reveal_member_interest_health/);
  const bookingDecisionMig = readFileSync(
    path.join(migrationDir, '20260722000000_booking_decision_notifications.sql'),
    'utf8',
  );
  assert.match(bookingDecisionMig, /keeping newer admin_set_booking_status_with_notice/);
  const fifoMig = readFileSync(
    path.join(migrationDir, '20260714004100_waitlist_fifo_promotion.sql'),
    'utf8',
  );
  assert.match(fifoMig, /keeping newer admin_set_booking_status/);
});

test('waitlist_fifo operator script cannot recreate admin_set_booking_status with an inline refund', () => {
  // credit_batch_refund_reactivation / fulfillment_erasure put refunds through
  // refund_credits_to_batch (skips Stripe-refunded packs). Re-running the older
  // waitlist FIFO upgrade used to restore an inline remaining+1 path.
  const fifo = scripts().find(entry => entry.name === 'waitlist_fifo_promotion_upgrade.sql');
  assert.ok(fifo, 'missing waitlist_fifo_promotion_upgrade.sql');
  assert.match(
    fifo.sql,
    /keeping newer admin_set_booking_status/,
    'waitlist_fifo_promotion_upgrade.sql must skip replacing a helper-backed status RPC',
  );
  assert.match(fifo.sql, /perform public\.refund_credits_to_batch\(v_batch, 1, v_start\)/);
  assert.doesNotMatch(
    fifo.sql,
    /update public\.credit_batches\s+set remaining = remaining \+ 1/,
    'waitlist_fifo_promotion_upgrade.sql must not inline credit refunds',
  );

  const statusDefiners = scripts().filter(({ sql }) => (
    /create or replace function public\.admin_set_booking_status\s*\(/.test(sql)
  ));
  assert.ok(statusDefiners.length >= 3, 'admin_set_booking_status is defined by more than one operator script');
  for (const { name, sql } of statusDefiners) {
    // Skip-guarded weak bodies are allowed only when they cannot install.
    if (/keeping newer admin_set_booking_status/.test(sql) && !/perform public\.refund_credits_to_batch/.test(sql)) {
      continue;
    }
    assert.match(
      sql,
      /perform public\.refund_credits_to_batch/,
      `${name} recreates admin_set_booking_status without refund_credits_to_batch`,
    );
    assert.doesNotMatch(
      sql,
      /update public\.credit_batches\s+set remaining = remaining \+ 1/,
      `${name} still inlines credit refunds inside admin_set_booking_status`,
    );
  }
});

test('README operator apply order includes the newest Ops Health migrations', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  for (const script of [
    'credit_batch_refund_reactivation.sql',
    'account_deletion_public_lead_cleanup.sql',
    'request_notes_health_consent.sql',
    'waitlist_skip_concurrency_upgrade.sql',
    'pt_rehab_goal_health_consent.sql',
    'fulfillment_erasure_and_refunded_pack_guard.sql',
    'public_booking_switch_gate.sql',
    'member_onboarding_booking_gate.sql',
    'waitlist_skip_notice_accuracy.sql',
    'member_interest_health_reveal_authz.sql',
  ]) {
    assert.match(
      readme,
      new RegExp(script.replace(/\./g, '\\.')),
      `README must list ${script} so Ops Health re-runs cannot leave that capability hole`,
    );
  }
  // Fresh + already-deployed apply sequences both provision Stripe prices before the
  // July 2026 audit fixes, and both end with the health-reveal authz fix.
  assert.match(
    readme,
    /member_activation_cockpit\.sql`, then\n`supabase\/migrations\/20260722010000_owner_stripe_price_provisioning\.sql`\. Finally apply the July 2026 audit/,
  );
  assert.equal(
    (readme.match(/20260722010000_owner_stripe_price_provisioning\.sql`\. Finally apply the July 2026 audit/g) || []).length,
    2,
    'fresh and already-deployed apply sequences must both include owner_stripe_price_provisioning',
  );
  assert.match(
    readme,
    /waitlist_skip_notice_accuracy\.sql` and\n`member_interest_health_reveal_authz\.sql`\. This/,
  );
  assert.match(
    readme,
    /waitlist_skip_notice_accuracy\.sql` and\n`member_interest_health_reveal_authz\.sql`\. The/,
  );
});

test('no operator script re-grants an overload a later script revoked for optimistic locking', () => {
  const superseded = [
    {
      grant: 'grant execute on function public.admin_update_product(uuid, jsonb) to authenticated',
      guard: "to_regprocedure('public.admin_update_product(uuid, jsonb, timestamptz)') is null",
      why: 'a product edit that omits p_expected_updated_at would resolve to the overload that '
        + 'never raises PRODUCT_STALE',
    },
    {
      grant: 'grant execute on function public.admin_archive_member_announcement(uuid, boolean) to authenticated',
      guard: "to_regprocedure('public.admin_archive_member_announcement(uuid, boolean, timestamptz)') is null",
      why: 'an archive action that omits the expected version would resolve to the unguarded overload',
    },
    {
      grant: 'grant execute on function public.admin_update_class_session(uuid, jsonb) to authenticated',
      guard: "to_regprocedure('public.admin_update_class_session(uuid, jsonb, timestamptz)') is null",
      why: 'a class edit that omits p_expected_updated_at would resolve to the overload that '
        + 'never raises SESSION_STALE',
    },
  ];

  for (const { grant, guard, why } of superseded) {
    let granters = 0;
    for (const { name, sql } of scripts()) {
      const at = sql.indexOf(grant);
      if (at === -1) continue;
      granters += 1;
      assert.ok(
        sql.slice(Math.max(0, at - 400), at).includes(guard),
        `${name} grants the superseded overload unconditionally, so re-running it re-arms the `
          + `unguarded path: ${why}`,
      );
    }
    assert.ok(granters > 0, `expected an operator script to still bootstrap ${grant}`);
  }
});
