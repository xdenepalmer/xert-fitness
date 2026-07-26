import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('native push preference reports real device registration and offers bounded recovery', async () => {
  const [registration, store, account] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Services/MemberPushRegistration.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/XertStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AccountView.swift'),
  ]);

  assert.match(registration, /enum MemberPushDeliveryState: Equatable/);
  for (const state of ['off', 'awaitingDeviceToken', 'registering', 'registered', 'failed']) {
    assert.match(registration, new RegExp(`case ${state}`));
  }

  assert.match(store, /@Published private\(set\) var memberPushDeliveryState/);
  assert.match(store, /func syncMemberPushToken[\s\S]*memberPushDeliveryState = \.registering/);
  assert.match(store, /updatePushSubscription[\s\S]*memberPushDeliveryState = \.registered/);
  assert.match(store, /memberPushDeliveryState = \.failed[\s\S]*present\(error\)/);
  assert.match(store, /func retryMemberPushRegistration\(\) async/);
  assert.match(store, /MemberPushRegistration\.requestAndRegister\(\)/);
  assert.match(store, /memberPushDeliveryState == \.registered \? \.success : \.warning/);
  assert.match(store, /clearLocalMemberState[\s\S]*memberPushDeliveryState = \.off/);

  assert.match(account, /private var memberPushDeliveryStatus/);
  assert.match(account, /This device is registered for private XERT member notices/);
  assert.match(account, /This device is not currently registered for member notices/);
  assert.match(account, /await store\.retryMemberPushRegistration\(\)/);
  assert.match(account, /accessibilityIdentifier\("account\.memberPush\.retry"\)/);
  assert.match(account, /ViewThatFits\(in: \.horizontal\)/);
});
