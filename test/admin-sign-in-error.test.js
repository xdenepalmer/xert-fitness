import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  ADMIN_SIGN_IN_RATE_LIMIT_COOLDOWN_MS,
  describeAdminSignInError,
  isAdminSignInRateLimited,
} from '../src/lib/adminSignInError.js';

const adminLogin = readFileSync(new URL('../src/pages/AdminLogin.jsx', import.meta.url), 'utf8');
const authContext = readFileSync(new URL('../src/lib/SupabaseAuthContext.jsx', import.meta.url), 'utf8');

test('GoTrue rate-limit statuses and codes map to a cooldown, not a password lie', () => {
  assert.equal(isAdminSignInRateLimited({ status: 429, message: 'Request rate limit reached' }), true);
  assert.equal(isAdminSignInRateLimited({ code: 'over_request_rate_limit' }), true);
  assert.equal(isAdminSignInRateLimited({ code: 'over_email_send_rate_limit' }), true);
  assert.equal(isAdminSignInRateLimited({ message: 'For security purposes, you can only request this after 60 seconds.' }), true);
  assert.equal(isAdminSignInRateLimited({ status: 400, message: 'Invalid login credentials' }), false);

  const described = describeAdminSignInError({ status: 429, code: 'over_request_rate_limit', message: 'Request rate limit reached' });
  assert.match(described.message, /Too many sign-in attempts/i);
  assert.equal(described.cooldownMs, ADMIN_SIGN_IN_RATE_LIMIT_COOLDOWN_MS);
  assert.equal(describeAdminSignInError({ message: 'Invalid login credentials' }).cooldownMs, 0);
});

test('AdminLogin disables submit during the rate-limit cooldown and preserves auth status metadata', () => {
  assert.match(adminLogin, /describeAdminSignInError/);
  assert.match(adminLogin, /Try again in \$\{cooldownRemainingSec\}s/);
  assert.match(adminLogin, /disabled=\{submitting \|\| coolingDown \|\| !serviceReady\}/);
  assert.match(authContext, /wrapped\.status = error\.status/);
  assert.match(authContext, /wrapped\.code = error\.code/);
});
