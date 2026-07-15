import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  INVALID_XERT_SERVICE_ORIGIN,
  resolvePublicSupabaseConfig,
  XERT_SUPABASE_HOST,
} from '../src/lib/publicRuntimeConfig.js';

const publishableKey = `sb_publishable_${'a'.repeat(24)}`;

test('browser runtime resolves only the canonical XERT Supabase project', () => {
  assert.deepEqual(resolvePublicSupabaseConfig({
    supabaseUrl: `https://${XERT_SUPABASE_HOST}/`,
    supabaseAnonKey: publishableKey,
  }), {
    ready: true,
    supabaseUrl: `https://${XERT_SUPABASE_HOST}`,
    supabaseAnonKey: publishableKey,
    keyFormat: 'publishable',
  });
});

test('browser runtime fails closed without retaining an unsafe origin or key', () => {
  const unsafeValues = [
    { supabaseUrl: 'https://attacker.example', supabaseAnonKey: publishableKey },
    { supabaseUrl: `https://${XERT_SUPABASE_HOST}`, supabaseAnonKey: `sb_secret_${'s'.repeat(24)}` },
    { supabaseUrl: '', supabaseAnonKey: '' },
  ];

  for (const unsafe of unsafeValues) {
    const resolved = resolvePublicSupabaseConfig(unsafe);
    assert.deepEqual(resolved, {
      ready: false,
      supabaseUrl: INVALID_XERT_SERVICE_ORIGIN,
      supabaseAnonKey: 'unavailable',
      keyFormat: null,
    });
    assert.doesNotMatch(JSON.stringify(resolved), /attacker|sb_secret_/i);
  }
});

test('web auth refuses untrusted configuration before bootstrap or credential actions', async () => {
  const [client, provider, login, register, forgot, reset] = await Promise.all([
    readFile(new URL('../src/lib/supabase.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/SupabaseAuthContext.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/Login.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/Register.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/ForgotPassword.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/ResetPassword.jsx', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(client, /placeholder\.supabase\.co|['"]placeholder['"]/);
  assert.match(client, /resolvePublicSupabaseConfig/);
  assert.match(client, /requireSupabaseConfiguration/);
  assert.ok(
    provider.indexOf('if (!supabaseConfigurationReady)') < provider.indexOf('supabase.auth.getSession()'),
    'auth readiness must be checked before session bootstrap'
  );
  assert.ok(
    provider.indexOf('requireSupabaseConfiguration();') < provider.indexOf('supabase.auth.signInWithPassword'),
    'auth readiness must be checked before password sign-in'
  );

  for (const source of [login, register, forgot, reset]) {
    assert.match(source, /requireSupabaseConfiguration\(\)/);
    assert.match(source, /supabaseConfigurationReady/);
  }
});
