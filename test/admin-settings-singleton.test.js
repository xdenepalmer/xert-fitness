import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { adminSettingsContractIsReady } from '../api/checkout.js';

const sqlURLs = [
  new URL('../src/supabase/admin_settings_singleton_upgrade.sql', import.meta.url),
  new URL('../supabase/migrations/20260716020000_admin_settings_singleton.sql', import.meta.url),
];

test('fresh and upgrade SQL enforce one versioned platform settings record', async () => {
  for (const sql of await Promise.all(sqlURLs.map(url => readFile(url, 'utf8')))) {
    assert.match(sql, /^--[^]*?\nbegin;/i);
    assert.match(sql, /commit;\s*$/i);
    assert.match(sql, /lock table public\.admin_settings in share row exclusive mode/i);
    assert.match(sql, /count\(\*\) from public\.admin_settings\) > 1/i);
    assert.match(sql, /ADMIN_SETTINGS_SINGLETON_VIOLATION/i);
    assert.match(sql, /update public\.admin_settings[\s\S]*where updated_at is null/i);
    assert.match(sql, /alter column updated_at set default now\(\)/i);
    assert.match(sql, /alter column updated_at set not null/i);
    assert.match(sql, /unique index if not exists admin_settings_singleton_idx[\s\S]*\(\(true\)\)/i);
    assert.match(sql, /values \('admin_settings_singleton'\)/i);
    assert.doesNotMatch(sql, /delete from public\.admin_settings/i);
  }
});

test('checkout requires the installed singleton settings contract', async () => {
  let result = { data: { capability: 'admin_settings_singleton' }, error: null };
  const query = {
    select() { return query; },
    eq() { return query; },
    async maybeSingle() { return result; },
  };
  const admin = { from(table) { assert.equal(table, 'xert_schema_capabilities'); return query; } };
  assert.equal(await adminSettingsContractIsReady(admin), true);
  result = { data: null, error: null };
  assert.equal(await adminSettingsContractIsReady(admin), false);
  result = { data: null, error: new Error('schema unavailable') };
  assert.equal(await adminSettingsContractIsReady(admin), false);

  const checkout = await readFile(new URL('../api/checkout.js', import.meta.url), 'utf8');
  assert.match(checkout, /adminSettingsContractIsReady\(admin\)/);
  assert.match(checkout, /platform settings are being upgraded[\s\S]*503/);
});

test('web and native settings readers reject ambiguous rows', async () => {
  const [webAdmin, webMember, nativeAPI] = await Promise.all([
    readFile(new URL('../src/lib/adminData.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/bookingData.js', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift', import.meta.url), 'utf8'),
  ]);
  assert.match(webAdmin, /admin_settings[\s\S]*limit\(2\)[\s\S]*data \|\| \[\]\)\.length > 1/);
  assert.match(webMember, /admin_settings[\s\S]*limit\(2\)[\s\S]*data\?\.length === 1/);
  assert.match(nativeAPI, /func publicPlatformSettings[\s\S]*limit", value: "2"[\s\S]*settings\.count == 1/);
  assert.match(nativeAPI, /func adminPlatformSettings[\s\S]*limit", value: "2"[\s\S]*settings\.count > 1/);
});
