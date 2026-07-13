import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('native launch preserves a saved login across temporary refresh failures', async () => {
  const [api, store] = await Promise.all([
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Store/XertStore.swift', import.meta.url), 'utf8'),
  ]);
  const bootstrap = store.slice(store.indexOf('func bootstrap()'), store.indexOf('func refresh()'));
  const memberRefresh = store.slice(store.indexOf('var memberSession'), store.indexOf('if let authSession = memberSession'));

  assert.doesNotMatch(bootstrap, /api\.refresh/);
  assert.match(memberRefresh, /invalidatesSession == true/);
  assert.match(api, /APIError\(message: message, statusCode: http\.statusCode\)/);
  assert.match(api, /statusCode\.map \{ \[400, 401, 403\]\.contains\(\$0\) \} \?\? false/);
});
