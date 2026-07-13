import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('native session refresh replaces Keychain data without deleting the valid session first', async () => {
  const source = await readFile(
    new URL('../ios/XertFitnessApp/XertFitnessApp/Services/KeychainStore.swift', import.meta.url),
    'utf8',
  );
  const saveBlock = source.slice(source.indexOf('static func saveSession'), source.indexOf('static func loadSession'));

  assert.match(saveBlock, /SecItemUpdate/);
  assert.match(saveBlock, /updateStatus == errSecItemNotFound/);
  assert.match(saveBlock, /kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly/);
  assert.doesNotMatch(saveBlock, /SecItemDelete/);
});
