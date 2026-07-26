import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const accountURL = new URL(
  '../ios/XertFitnessApp/XertFitnessApp/Views/AccountView.swift',
  import.meta.url,
);

test('native account presents one-off credits as an honest, accessible member wallet', async () => {
  const source = await readFile(accountURL, 'utf8');
  const wallet = source.slice(
    source.indexOf('private var membershipSection'),
    source.indexOf('private var reminderSettingsSection'),
  );

  assert.match(wallet, /Text\("Session credits & packs"\)/);
  assert.doesNotMatch(wallet, /Text\("Membership"\)/);
  assert.match(wallet, /Text\("Available balance"\)/);
  assert.match(wallet, /store\.creditTotal/);
  assert.match(wallet, /Text\("Next expiry"\)/);
  assert.match(wallet, /Active credit batches/);
  assert.match(wallet, /\\\(batch\.remaining\) of \\\(batch\.total\) remaining/);
  assert.match(wallet, /batch\.remaining > 0/);
  assert.match(wallet, /batch\.expires_at\.map \{ \$0 > now \} \?\? true/);
  assert.match(wallet, /store\.orders\.first\(where: \{ \$0\.id == orderID \}\)\?\.products\?\.name/);

  assert.match(wallet, /Loading your credit wallet/);
  assert.match(wallet, /store\.isLoading && !store\.creditBalanceLoaded/);
  assert.match(wallet, /Credit wallet unavailable/);
  assert.match(wallet, /unavailableDataSources\.contains\(\.credits\) && !store\.creditBalanceLoaded/);
  assert.match(wallet, /Showing your last saved wallet/);
  assert.match(wallet, /No active session credits/);
  assert.match(source, /private var creditsUnavailableOrLoading: Bool \{[\s\S]*!store\.creditBalanceLoaded/);

  assert.match(wallet, /ViewThatFits\(in: \.horizontal\)/);
  assert.match(wallet, /dynamicTypeSize\.isAccessibilitySize/);
  assert.match(wallet, /minHeight: 44/);
  assert.match(wallet, /xertfitness:\/\/booking\/packs/);
  assert.match(wallet, /Label\("Buy session packs"/);
});
