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
      mustMatch: [/install_delete_member_account/, /redact_audit_subject_pii|member_interest/],
    },
    {
      name: 'audit_subject_pii_redaction_upgrade.sql',
      mustMatch: [/install_delete_member_account/, /member_interest/],
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
});

test('every install_public_form_insert_policies definition gates PT/booking notes on health consent', () => {
  const definers = scripts().filter(({ sql }) => sql.includes('create or replace function public.install_public_form_insert_policies()'));
  assert.ok(definers.length >= 3, 'the public form installer is defined by more than one operator script');

  for (const { name, sql } of definers) {
    assert.match(
      sql,
      /class_bookings',\s*'private_session_requests'/,
      `${name} replaces install_public_form_insert_policies without the PT/booking notes health-consent guard`,
    );
    assert.match(sql, /coalesce\(btrim\(notes\), ''\) = ''/);
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

test('README operator apply order includes the newest Ops Health migrations', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  for (const script of [
    'credit_batch_refund_reactivation.sql',
    'account_deletion_public_lead_cleanup.sql',
    'request_notes_health_consent.sql',
    'waitlist_skip_concurrency_upgrade.sql',
  ]) {
    assert.match(
      readme,
      new RegExp(script.replace(/\./g, '\\.')),
      `README must list ${script} so Ops Health re-runs cannot leave that capability hole`,
    );
  }
  // Fresh + already-deployed apply sequences both end with waitlist skip.
  assert.match(
    readme,
    /request_notes_health_consent\.sql` and\n`waitlist_skip_concurrency_upgrade\.sql`\. This/,
  );
  assert.match(
    readme,
    /request_notes_health_consent\.sql` and\n`waitlist_skip_concurrency_upgrade\.sql`\. The/,
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
