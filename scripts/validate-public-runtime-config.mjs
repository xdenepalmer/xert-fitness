import { pathToFileURL } from 'node:url';

export const XERT_SUPABASE_HOST = 'ugmkwoapjcpiucsrxwzt.supabase.co';
export const XERT_VERCEL_HOST = 'xert-fitness.vercel.app';

export function validateCanonicalServiceURL(value, label, expectedHost) {
  const rawValue = String(value || '');
  if (!rawValue || rawValue !== rawValue.trim() || /\s/.test(rawValue)) {
    throw new Error(`${label} must be one uninterrupted canonical HTTPS origin.`);
  }
  let url;
  try {
    url = new URL(rawValue);
  } catch {
    throw new Error(`${label} must be a valid HTTPS URL.`);
  }
  if (
    url.protocol !== 'https:'
    || url.hostname.toLowerCase() !== expectedHost.toLowerCase()
    || url.port
    || url.username
    || url.password
    || (url.pathname !== '/' && url.pathname !== '')
    || url.search
    || url.hash
  ) {
    throw new Error(`${label} must be the canonical XERT service origin on ${expectedHost}.`);
  }
  return url.origin;
}

function decodeJWTClaims(value) {
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export function validateSupabasePublicKey(value) {
  const rawKey = String(value || '');
  const key = rawKey.trim();
  if (!key || key !== rawKey || /\s/.test(rawKey)) {
    throw new Error('SUPABASE_ANON_KEY must be one uninterrupted public key.');
  }
  if (/^sb_secret_/i.test(key)) {
    throw new Error('SUPABASE_ANON_KEY is a secret key and must never be embedded in the app.');
  }
  if (/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(key)) return 'publishable';

  const claims = decodeJWTClaims(key);
  if (claims?.role !== 'anon') {
    throw new Error('SUPABASE_ANON_KEY must be a publishable key or a legacy JWT with role anon.');
  }
  return 'legacy-anon';
}

export function validatePublicRuntimeConfig({
  supabaseUrl,
  supabaseAnonKey,
  vercelBaseUrl,
  expectedSupabaseHost = XERT_SUPABASE_HOST,
  expectedVercelHost = XERT_VERCEL_HOST,
}) {
  return {
    supabaseOrigin: validateCanonicalServiceURL(
      supabaseUrl,
      'SUPABASE_URL',
      expectedSupabaseHost
    ),
    vercelOrigin: validateCanonicalServiceURL(
      vercelBaseUrl,
      'VERCEL_BASE_URL',
      expectedVercelHost
    ),
    keyFormat: validateSupabasePublicKey(supabaseAnonKey),
  };
}

function runFromEnvironment(environment = process.env) {
  const result = validatePublicRuntimeConfig({
    supabaseUrl: environment.SUPABASE_URL,
    supabaseAnonKey: environment.SUPABASE_ANON_KEY,
    vercelBaseUrl: environment.VERCEL_BASE_URL,
    expectedSupabaseHost: environment.EXPECTED_SUPABASE_HOST || XERT_SUPABASE_HOST,
    expectedVercelHost: environment.EXPECTED_VERCEL_HOST || XERT_VERCEL_HOST,
  });
  console.log(
    `XERT public runtime configuration verified: canonical service origins and ${result.keyFormat} Supabase key.`
  );
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    runFromEnvironment();
  } catch (error) {
    console.error(`::error:: ${error.message}`);
    process.exitCode = 1;
  }
}
