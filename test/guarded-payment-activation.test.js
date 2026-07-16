import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sqlURLs = [
  new URL('../src/supabase/guarded_payment_activation_upgrade.sql', import.meta.url),
  new URL('../supabase/migrations/20260716010000_guarded_payment_activation.sql', import.meta.url),
];

test('fresh and upgrade SQL force payment activation through the trusted server', async () => {
  for (const sql of await Promise.all(sqlURLs.map(url => readFile(url, 'utf8')))) {
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
});

test('release gates require guarded payment activation everywhere', async () => {
  const [capabilities, readiness, codemagic, runbook, nativeModels] = await Promise.all([
    readFile(new URL('../src/lib/schemaCapabilities.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/supabase/release_readiness_check.sql', import.meta.url), 'utf8'),
    readFile(new URL('../codemagic.yaml', import.meta.url), 'utf8'),
    readFile(new URL('../docs/STRIPE_LAUNCH_RUNBOOK.md', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift', import.meta.url), 'utf8'),
  ]);
  for (const source of [capabilities, readiness, codemagic, nativeModels]) {
    assert.match(source, /guarded_payment_activation/);
  }
  assert.match(runbook, /20260716010000_guarded_payment_activation\.sql/);
  assert.match(runbook, /seven `PASS` results/);
});
