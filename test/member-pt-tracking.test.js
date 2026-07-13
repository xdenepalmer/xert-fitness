import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [migration, baselineRls, hardenedRls, webData, webAccount, models, api, store, account] = await Promise.all([
  readFile(new URL('../src/supabase/member_pt_request_tracking.sql', import.meta.url), 'utf8'),
  readFile(new URL('../src/supabase/rls_policies.sql', import.meta.url), 'utf8'),
  readFile(new URL('../src/supabase/rls_hardening.sql', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/bookingData.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/Account.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Models.swift', import.meta.url), 'utf8'),
  readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift', import.meta.url), 'utf8'),
  readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Store/XertStore.swift', import.meta.url), 'utf8'),
  readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Views/AccountView.swift', import.meta.url), 'utf8'),
]);

test('PT tracking migration preserves public enquiries and isolates member reads', () => {
  assert.match(migration, /add column if not exists user_id uuid references auth\.users\(id\).*default auth\.uid\(\)/i);
  assert.match(migration, /auth\.uid\(\) is null and user_id is null/i);
  assert.match(migration, /user_id = auth\.uid\(\)/i);
  assert.match(migration, /having count\(\*\) = 1/i);
  assert.match(migration, /values \('member_pt_request_tracking'\)/i);
  assert.match(migration, /xert_public_capabilities/i);
});

test('every PT policy entry point enforces trusted request state, consent, and ownership', () => {
  for (const sql of [migration, baselineRls, hardenedRls]) {
    const policyStart = sql.indexOf('create policy "public_insert_private_session_requests"');
    const policyEnd = sql.indexOf(');', policyStart);
    const policy = sql.slice(policyStart, policyEnd);
    assert.ok(policyStart >= 0 && policyEnd > policyStart);
    assert.match(policy, /status = 'requested'/i);
    assert.match(policy, /consent_to_contact is true/i);
    assert.match(policy, /auth\.uid\(\) is null and user_id is null/i);
    assert.match(policy, /auth\.uid\(\) is not null and user_id = auth\.uid\(\)/i);
  }
});

test('web and native clients expose owned PT request history', () => {
  assert.match(webData, /export async function getMyPrivateSessionRequests/);
  assert.match(webData, /\.eq\('user_id', userId\)/);
  assert.match(webAccount, /getMyPrivateSessionRequests\(\)\.catch\(\(\) => \[\]\)/);
  assert.match(webAccount, /privateSessionRequests\.map/);
  assert.match(webAccount, />\s*PT Requests\s*</);
  assert.match(models, /struct PrivateSessionStatusItem/);
  assert.match(api, /func privateSessionRequests\(session auth: AuthSession\)/);
  assert.match(api, /func requestPrivateSession\(_ requestBody: PrivateSessionRequest, auth: AuthSession\? = nil\)/);
  assert.match(store, /@Published var privateSessionRequests/);
  assert.match(store, /api\.requestPrivateSession\(request, auth: memberSession\)/);
  assert.match(account, /privateSessionHistorySection/);
  assert.match(account, /Text\("PT Requests"\)/);
});
