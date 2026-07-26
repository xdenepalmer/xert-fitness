import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { authPathWithNext, safeAuthReturnPath } from '../src/lib/authRedirect.js';

test('auth return paths preserve internal destinations and reject redirects', () => {
  assert.equal(safeAuthReturnPath('/account?purchase=success#notices'), '/account?purchase=success#notices');
  assert.equal(safeAuthReturnPath('/booking'), '/booking');
  assert.equal(safeAuthReturnPath('https://evil.example/account'), '/');
  assert.equal(safeAuthReturnPath('//evil.example/account'), '/');
  assert.equal(safeAuthReturnPath('/\\evil.example/account'), '/');
  assert.equal(safeAuthReturnPath('/..//evil.example/account'), '/');
  assert.equal(safeAuthReturnPath('/account/..//evil.example/account'), '/');
  assert.equal(safeAuthReturnPath('/%2e%2e//evil.example/account'), '/');
  assert.equal(safeAuthReturnPath('/login?next=/account'), '/');
  assert.equal(safeAuthReturnPath(null), '/');
});

test('auth links safely encode the exact member destination', () => {
  assert.equal(
    authPathWithNext('/login', '/account?purchase=success#notices'),
    '/login?next=%2Faccount%3Fpurchase%3Dsuccess%23notices',
  );
});

test('account, login, and registration retain the destination through every auth method', async () => {
  const [account, login, register] = await Promise.all([
    readFile(new URL('../src/pages/Account.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/Login.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/Register.jsx', import.meta.url), 'utf8'),
  ]);

  assert.match(account, /authPathWithNext\('\/login', accountReturnPath\)/);
  assert.match(account, /authPathWithNext\('\/register', accountReturnPath\)/);
  assert.match(login, /window\.location\.replace\(returnPath\)/);
  assert.match(login, /redirectTo: `\$\{window\.location\.origin\}\$\{authPathWithNext\('\/login', returnPath\)\}`/);
  assert.match(register, /emailRedirectTo: `\$\{window\.location\.origin\}\$\{authPathWithNext\('\/login', returnPath\)\}`/);
  assert.match(register, /redirectTo: `\$\{window\.location\.origin\}\$\{authPathWithNext\('\/login', returnPath\)\}`/);
});
