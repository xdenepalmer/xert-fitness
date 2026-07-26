import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sqlURLs = [
  new URL('../src/supabase/guarded_payment_activation_upgrade.sql', import.meta.url),
  new URL('../supabase/migrations/20260716010000_guarded_payment_activation.sql', import.meta.url),
];
const driftSQLURLs = [
  new URL('../src/supabase/payment_activation_drift_guard_upgrade.sql', import.meta.url),
  new URL('../supabase/migrations/20260716060000_payment_activation_drift_guard.sql', import.meta.url),
];
const settingsVersionSQLURL = new URL('../supabase/migrations/20260714019000_shared_admin_optimistic_locking.sql', import.meta.url);

test('fresh and upgrade SQL force payment activation through the trusted server', async () => {
  const [operator, migration] = await Promise.all(sqlURLs.map(url => readFile(url, 'utf8')));
  for (const sql of [operator, migration]) {
    assert.match(sql, /guard_session_pack_payment_activation/i);
    assert.match(sql, /if tg_op = 'INSERT'/i);
    assert.match(sql, /new\.payments_enabled is true and old\.payments_enabled is not true/i);
    assert.match(sql, /current_setting\('xert\.payment_activation_preflight', true\) = 'passed'/i);
    assert.match(sql, /current_user in \('postgres', 'supabase_admin'\)/i);
    assert.match(sql, /PAYMENT_ACTIVATION_REQUIRES_SERVER_PREFLIGHT/i);
    assert.match(sql, /before insert or update of payments_enabled on public\.admin_settings/i);
    assert.match(sql, /admin_activate_session_pack_payments[\s\S]*security definer/i);
    assert.match(sql, /auth\.role\(\) is distinct from 'service_role'/i);
    assert.match(sql, /profiles where id = p_actor_id and role = 'admin'/i);
    assert.match(sql, /for update;[\s\S]*updated_at is distinct from p_expected_updated_at/i);
    assert.match(sql, /set_config\('xert\.payment_activation_preflight', 'passed', true\)/i);
    assert.match(sql, /set_config\('request\.jwt\.claim\.sub', p_actor_id::text, true\)/i);
    assert.match(sql, /grant execute on function public\.admin_activate_session_pack_payments[\s\S]*to service_role/i);
    assert.doesNotMatch(sql, /grant execute on function public\.admin_activate_session_pack_payments[\s\S]*to authenticated/i);
    assert.match(sql, /values \('guarded_payment_activation'\)/i);
    assert.doesNotMatch(sql, /new\.payments_enabled is false[\s\S]*raise exception/i);
  }
  // Operator mirror keeps soft_launch_switch_authz so re-runs cannot restore
  // activate_payments with bookings_enabled:false. Historical migration body
  // stays as originally applied; 261180 replaces the live RPC.
  assert.match(operator, /PAYMENTS_REQUIRE_BOOKINGS/);
  assert.match(operator, /bookings_enabled = true/);
});

test('live platform settings require an explicit payment pause before mutation', async () => {
  const [driftSQLSources, settingsVersionSQL] = await Promise.all([
    Promise.all(driftSQLURLs.map(url => readFile(url, 'utf8'))),
    readFile(settingsVersionSQLURL, 'utf8'),
  ]);
  assert.match(settingsVersionSQL, /create trigger admin_settings_touch_updated_at/i);
  assert.ok('admin_settings_z_guard_payment_activation' > 'admin_settings_touch_updated_at');
  for (const sql of driftSQLSources) {
    assert.match(sql, /old\.payments_enabled is true[\s\S]*new\.payments_enabled is true/i);
    assert.match(sql, /to_jsonb\(new\) is distinct from to_jsonb\(old\)/i);
    assert.match(sql, /PAYMENT_SETTINGS_CHANGE_REQUIRES_PAUSE/i);
    assert.match(sql, /drop trigger if exists admin_settings_guard_payment_activation/i);
    assert.match(sql, /create trigger admin_settings_z_guard_payment_activation/i);
    assert.match(sql, /before insert or update on public\.admin_settings/i);
    assert.doesNotMatch(sql, /update of payments_enabled on public\.admin_settings/i);
    assert.doesNotMatch(sql, /to_jsonb\(new\) - 'updated_at'/i);
    assert.match(sql, /values \('payment_activation_drift_guard'\)/i);
    assert.doesNotMatch(sql, /new\.payments_enabled is false[\s\S]*PAYMENT_SETTINGS_CHANGE_REQUIRES_PAUSE/i);
  }
});

test('release gates require guarded payment activation everywhere', async () => {
  const [capabilities, readiness, codemagic, runbook, nativeModels, packageSource, preflight, checkout, activation] = await Promise.all([
    readFile(new URL('../src/lib/schemaCapabilities.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/supabase/release_readiness_check.sql', import.meta.url), 'utf8'),
    readFile(new URL('../codemagic.yaml', import.meta.url), 'utf8'),
    readFile(new URL('../docs/STRIPE_LAUNCH_RUNBOOK.md', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift', import.meta.url), 'utf8'),
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/stripe-launch-preflight.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../api/checkout.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/paymentActivation.js', import.meta.url), 'utf8'),
  ]);
  for (const source of [capabilities, readiness, nativeModels]) {
    assert.match(source, /guarded_payment_activation/);
  }
  // Codemagic imports the JS release contract instead of hardcoding capability
  // names (a stale list previously skipped 25 production gates including this one).
  assert.match(codemagic, /REQUIRED_SCHEMA_CAPABILITIES/);
  assert.match(codemagic, /schemaCapabilities\.js/);
  assert.match(runbook, /20260716010000_guarded_payment_activation\.sql/);
  assert.match(runbook, /fifteen `PASS` results/);
  assert.match(runbook, /20260716060000_payment_activation_drift_guard\.sql/);
  assert.match(runbook, /stripe:launch:check[\s\S]*payment switch is still \*\*PAUSED\*\*/);
  assert.match(runbook, /stripe:launch:verify[\s\S]*payment switch to be \*\*ENABLED\*\*/);
  assert.match(runbook, /Do not run a real card[\s\S]*until this command passes/);
  const scripts = JSON.parse(packageSource).scripts;
  assert.match(scripts['stripe:launch:check'], /--mode=live --expect-payments=paused$/);
  assert.match(scripts['stripe:launch:verify'], /--mode=live --expect-payments=enabled$/);
  assert.match(scripts['stripe:test:check'], /--mode=test --expect-payments=paused$/);
  assert.match(scripts['stripe:test:verify'], /--mode=test --expect-payments=enabled$/);
  assert.match(preflight, /loadPaymentActivationHealth\(supabase\)/);
  assert.match(preflight, /Immutable activation receipt/);
  assert.match(preflight, /boundary\.ready && catalogReady && webhook\.ready && paymentSwitch\.ready/);
  assert.match(preflight, /const \[boundary, catalog, webhook\] = await Promise\.all[\s\S]*const paymentSwitch = await inspectSwitch/);
  assert.match(checkout, /loadPaymentActivationHealth\(admin\)/);
  assert.match(checkout, /paymentActivationAllowsCheckout\(activation\)/);
  assert.match(checkout, /payment activation could not be verified/);
  assert.match(activation, /previous_snapshot\?\.payments_enabled === false/);
  assert.match(activation, /new_snapshot\?\.payments_enabled === true/);
  assert.match(activation, /activation\.payment_switch\.state === 'enabled'/);
  assert.match(activation, /activation\.activation_receipt\.actor_recorded === true/);
});
