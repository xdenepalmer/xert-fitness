import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('native members can securely update their password while signed in', async () => {
  const [models, api, store, account] = await Promise.all([
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Models.swift', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Store/XertStore.swift', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Views/AccountView.swift', import.meta.url), 'utf8'),
  ]);

  const request = models.slice(models.indexOf('struct PasswordUpdateRequest'), models.indexOf('struct CheckoutResponse'));
  const apiUpdate = api.slice(api.indexOf('func updatePassword'), api.indexOf('func products'));
  const storeUpdate = store.slice(store.indexOf('func updatePassword'), store.indexOf('private func authenticate'));
  const securitySection = account.slice(account.indexOf('private var accountSecuritySection'), account.indexOf('private var signOutSection'));

  assert.match(request, /password\.count >= 8/);
  assert.match(request, /password == confirmation/);

  assert.match(apiUpdate, /path: "\/auth\/v1\/user"/);
  assert.match(apiUpdate, /request\.httpMethod = "PUT"/);
  assert.match(apiUpdate, /forHTTPHeaderField: "apikey"/);
  assert.ok(apiUpdate.includes('"Bearer \\(auth.access_token)"'));

  assert.match(storeUpdate, /let memberVersion = memberStateVersion\.snapshot/);
  assert.match(storeUpdate, /try await validAuthSession\(\)/);
  assert.match(storeUpdate, /guard canApplyMemberState\(memberVersion, session: authSession\)/);

  assert.match(securitySection, /SecureField\("New password"/);
  assert.match(securitySection, /SecureField\("Confirm new password"/);
  assert.match(securitySection, /newPassword = ""/);
  assert.match(securitySection, /Label\("Password updated"/);
});
