import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('web account edit shows email as read-only and never patches email/role', () => {
  const account = read('../src/pages/Account.jsx');
  const bookingData = read('../src/lib/bookingData.js');
  const update = bookingData.slice(
    bookingData.indexOf('export async function updateMyProfile'),
    bookingData.indexOf('const MEMBER_ONBOARDING_ERRORS'),
  );

  assert.match(account, /Email is managed by your sign-in and cannot be changed here/);
  assert.match(account, /\{user\?\.email \|\| 'Unavailable'\}/);
  assert.doesNotMatch(account, /profileForm\.email/);
  assert.match(update, /if \('full_name' in updates\) payload\.full_name = updates\.full_name/);
  assert.match(update, /if \('phone' in updates\) payload\.phone = updates\.phone/);
  assert.doesNotMatch(update, /\.\.\.updates/);
  assert.doesNotMatch(update, /payload\.email|updates\.email|payload\.role|updates\.role/);
});

test('native account details show the signed-in email as non-editable', () => {
  const account = read('../ios/XertFitnessApp/XertFitnessApp/Views/AccountView.swift');
  const details = account.slice(
    account.indexOf('private var accountDetailsSection'),
    account.indexOf('private var accountSecuritySection'),
  );
  assert.match(details, /Email is managed by your sign-in and cannot be changed here/);
  assert.match(details, /store\.authSession\?\.user\?\.email/);
  assert.doesNotMatch(details, /TextField\("Email"/);
});
