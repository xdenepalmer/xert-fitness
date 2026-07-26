import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const accountURL = new URL('../src/pages/Account.jsx', import.meta.url);

test('member account refresh preserves successful sources and labels partial failures', async () => {
  const account = await readFile(accountURL, 'utf8');
  const refreshStart = account.indexOf('const refresh = useCallback');
  const refresh = account.slice(
    refreshStart,
    account.indexOf('useEffect(() => {', refreshStart),
  );

  assert.match(refresh, /Promise\.allSettled\(\[/);
  assert.doesNotMatch(refresh, /getMyEventGoals\(\)\.catch\(\(\) => \[\]\)/);
  assert.match(refresh, /if \(result\.status === 'fulfilled'\) \{[\s\S]*apply\(result\.value\)/);
  assert.match(refresh, /nextErrors\[source\]/);
  assert.match(refresh, /accountRequestID !== accountRefreshRequestIDRef\.current/);
  assert.match(refresh, /setLoadedAccountUserId\(requestedUserID\)/);
  assert.match(account, /creditsUnavailable && !credits/);
  assert.match(account, /firstLoadFailed \|\| bookingsUnavailable/);
  assert.match(account, /firstLoadFailed \|\| ordersUnavailable/);
  assert.match(account, /accountSourceErrors\.eventGoals/);
  assert.match(account, /accountSourceErrors\.privateSessions/);
});

test('purchase reconciliation cannot invalidate the full account refresh lifecycle', async () => {
  const account = await readFile(accountURL, 'utf8');
  const refreshStart = account.indexOf('const refresh = useCallback');
  const refreshEnd = account.indexOf('useEffect(() => {', refreshStart);
  const refresh = account.slice(refreshStart, refreshEnd);
  const reconciliationStart = account.indexOf('const reconcile = async');
  const reconciliation = account.slice(reconciliationStart, account.indexOf('return () => {', reconciliationStart));

  assert.match(account, /const accountRefreshRequestIDRef = useRef\(0\)/);
  assert.match(account, /const commerceRequestIDRef = useRef\(0\)/);
  assert.match(refresh, /accountRefreshRequestIDRef/);
  assert.doesNotMatch(refresh, /commerceRequestIDRef/);
  assert.match(reconciliation, /commerceRequestIDRef/);
  assert.doesNotMatch(reconciliation, /accountRefreshRequestIDRef/);
});

test('changing member identity invalidates requests and clears every user-scoped source', async () => {
  const account = await readFile(accountURL, 'utf8');
  const resetStart = account.indexOf('const accountUserID =');
  const resetEnd = account.indexOf('useEffect(() => {', account.indexOf('}, [accountUserID]);', resetStart) + 1);
  const reset = account.slice(resetStart, resetEnd);

  assert.match(reset, /accountDataOwnerIDRef\.current === accountUserID/);
  assert.match(reset, /accountRefreshRequestIDRef\.current \+= 1/);
  assert.match(reset, /commerceRequestIDRef\.current \+= 1/);
  for (const setter of [
    'setCredits(null)',
    'setBookings([])',
    'setOrders([])',
    'setEventGoals([])',
    'setPrivateSessionRequests([])',
    'setAnnouncements([])',
    "setLoadedAccountUserId('')",
    'setHasLoadedAccount(false)',
  ]) {
    assert.ok(reset.includes(setter), `identity reset must include ${setter}`);
  }
});
