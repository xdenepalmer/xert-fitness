export const XERT_SUPABASE_HOST = 'ugmkwoapjcpiucsrxwzt.supabase.co';
export const XERT_VERCEL_HOST = 'xert-fitness.vercel.app';
export const INVALID_XERT_SERVICE_ORIGIN = 'https://invalid.xert.invalid';
export const PUBLIC_SERVICE_UNAVAILABLE_MESSAGE = 'XERT services are temporarily unavailable.';

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

function decodeBase64URL(value) {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const binary = globalThis.atob(padded);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function decodeJWTClaims(value) {
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = decodeBase64URL(parts[1]);
    return payload ? JSON.parse(payload) : null;
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

/**
 * Explains why the public Supabase configuration was rejected, so a
 * misconfigured deployment is diagnosable from the browser console instead of
 * presenting only the generic unavailable notice. Never reports key material —
 * only whether a value was absent and, if present, why it failed validation.
 */
export function describePublicConfigFailure({
  supabaseUrl,
  supabaseAnonKey,
  expectedSupabaseHost = XERT_SUPABASE_HOST,
}) {
  const problems = [];
  if (!String(supabaseUrl || '')) {
    problems.push('VITE_SUPABASE_URL is not set in this build.');
  } else {
    try {
      validateCanonicalServiceURL(supabaseUrl, 'SUPABASE_URL', expectedSupabaseHost);
    } catch (error) {
      problems.push(error.message);
    }
  }

  if (!String(supabaseAnonKey || '')) {
    problems.push('VITE_SUPABASE_ANON_KEY is not set in this build.');
  } else {
    try {
      validateSupabasePublicKey(supabaseAnonKey);
    } catch (error) {
      problems.push(error.message);
    }
  }

  if (!problems.length) return '';
  return `${problems.join(' ')} Set both variables for the Production environment in Vercel, then redeploy — they are embedded at build time.`;
}

export function resolvePublicSupabaseConfig({
  supabaseUrl,
  supabaseAnonKey,
  expectedSupabaseHost = XERT_SUPABASE_HOST,
}) {
  try {
    return {
      ready: true,
      supabaseUrl: validateCanonicalServiceURL(
        supabaseUrl,
        'SUPABASE_URL',
        expectedSupabaseHost
      ),
      supabaseAnonKey,
      keyFormat: validateSupabasePublicKey(supabaseAnonKey),
    };
  } catch {
    return {
      ready: false,
      supabaseUrl: INVALID_XERT_SERVICE_ORIGIN,
      supabaseAnonKey: 'unavailable',
      keyFormat: null,
    };
  }
}
