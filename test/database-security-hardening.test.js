import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../supabase/migrations/20260714006000_database_security_hardening.sql');

test('production hardening removes anonymous listing and internal RPC grants', () => {
  assert.match(migration, /drop policy if exists "site_images_public_read" on storage\.objects/i);
  for (const fn of ['guard_profile_write', 'handle_new_user', 'rls_auto_enable']) {
    assert.match(migration, new RegExp(`revoke execute on function public\\.${fn}\\(\\).*public, anon, authenticated`, 'i'));
  }
  assert.match(migration, /admin_grant_credits_v2\(uuid,integer,integer,uuid,text\).*is null/i);
  assert.match(migration, /revoke execute on function public\.admin_grant_credits\(uuid, integer, integer\) from public, anon, authenticated/i);
  assert.match(migration, /values \('database_security_hardening'\)/i);
});

test('fresh schemas keep trigger helpers private and the image bucket non-listable', () => {
  for (const path of ['../src/supabase/booking_schema.sql', '../src/supabase/admin_cms_schema.sql']) {
    const sql = read(path);
    assert.match(sql, /revoke execute on function public\.handle_new_user\(\) from public, anon, authenticated/i);
    assert.match(sql, /revoke execute on function public\.guard_profile_write\(\) from public, anon, authenticated/i);
  }
  assert.match(read('../src/supabase/rls_hardening.sql'), /revoke execute on function public\.guard_profile_write\(\) from public, anon, authenticated/i);

  const storage = read('../src/supabase/storage_setup.sql');
  assert.match(storage, /drop policy if exists "site_images_public_read"/i);
  assert.doesNotMatch(storage, /create policy "site_images_public_read"/i);
  assert.match(storage, /site_images_admin_insert/);
});

test('audited credit grants are the only browser-executable grant path', () => {
  const auditUpgrade = read('../src/supabase/credit_grant_audit_upgrade.sql');
  const adminSchema = read('../src/supabase/admin_cms_schema.sql');
  assert.match(auditUpgrade, /grant execute on function public\.admin_grant_credits_v2.*to authenticated/i);
  assert.match(auditUpgrade, /revoke execute on function public\.admin_grant_credits\(uuid, integer, integer\) from public, anon, authenticated/i);
  assert.doesNotMatch(adminSchema, /grant execute on function public\.admin_grant_credits\(uuid, integer, integer\) to authenticated/i);
});

test('native release documentation matches the complete capability gate', () => {
  const nativeReadme = read('../ios/XertFitnessApp/README.md');
  // The gate grows with every capability, so the instruction must not name a
  // count that goes stale the next time one is added.
  assert.match(nativeReadme, /Every row must show `installed = true` and `release_ready = true`/);
  assert.doesNotMatch(nativeReadme, /All \d+ rows must show/);
});
