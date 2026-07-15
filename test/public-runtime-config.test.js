import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateCanonicalServiceURL,
  validatePublicRuntimeConfig,
  validateSupabasePublicKey,
  XERT_SUPABASE_HOST,
  XERT_VERCEL_HOST,
} from '../scripts/validate-public-runtime-config.mjs';

function legacyJWT(role) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role })}.signature`;
}

test('release runtime accepts only the canonical XERT service origins', () => {
  assert.equal(
    validateCanonicalServiceURL(`https://${XERT_SUPABASE_HOST}/`, 'SUPABASE_URL', XERT_SUPABASE_HOST),
    `https://${XERT_SUPABASE_HOST}`
  );
  assert.equal(
    validateCanonicalServiceURL(`https://${XERT_VERCEL_HOST}`, 'VERCEL_BASE_URL', XERT_VERCEL_HOST),
    `https://${XERT_VERCEL_HOST}`
  );

  for (const unsafe of [
    `http://${XERT_SUPABASE_HOST}`,
    'https://another-project.supabase.co',
    `https://${XERT_SUPABASE_HOST}/rest/v1`,
    `https://${XERT_SUPABASE_HOST}?key=value`,
    `https://user:password@${XERT_SUPABASE_HOST}`,
    `\thttps://${XERT_SUPABASE_HOST}`,
  ]) {
    assert.throws(
      () => validateCanonicalServiceURL(unsafe, 'SUPABASE_URL', XERT_SUPABASE_HOST),
      /canonical (?:XERT service|HTTPS) origin|valid HTTPS URL/i
    );
  }
});

test('release runtime permits public Supabase keys and rejects privileged keys', () => {
  assert.equal(validateSupabasePublicKey(legacyJWT('anon')), 'legacy-anon');
  assert.equal(validateSupabasePublicKey(`sb_publishable_${'a'.repeat(24)}`), 'publishable');
  assert.throws(() => validateSupabasePublicKey(legacyJWT('service_role')), /role anon/i);
  assert.throws(() => validateSupabasePublicKey(`sb_secret_${'a'.repeat(24)}`), /must never be embedded/i);
  assert.throws(() => validateSupabasePublicKey('malformed-public-key'), /publishable key/i);
  assert.throws(() => validateSupabasePublicKey(`\t${legacyJWT('anon')}`), /uninterrupted public key/i);
});

test('combined release validation returns no secret material', () => {
  assert.deepEqual(validatePublicRuntimeConfig({
    supabaseUrl: `https://${XERT_SUPABASE_HOST}`,
    supabaseAnonKey: legacyJWT('anon'),
    vercelBaseUrl: `https://${XERT_VERCEL_HOST}/`,
  }), {
    supabaseOrigin: `https://${XERT_SUPABASE_HOST}`,
    vercelOrigin: `https://${XERT_VERCEL_HOST}`,
    keyFormat: 'legacy-anon',
  });
});
