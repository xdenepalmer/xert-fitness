import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('native API calls fail promptly with safe member-facing network errors', async () => {
  const [config, api] = await Promise.all([
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/AppConfig.swift', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift', import.meta.url), 'utf8'),
  ]);

  assert.match(config, /apiRequestTimeout:\s*TimeInterval\s*=\s*20/);
  assert.match(api, /URLRequest\(url:\s*url,\s*timeoutInterval:\s*AppConfig\.apiRequestTimeout\)/);
  assert.match(api, /catch let error as URLError/);
  assert.match(api, /\.notConnectedToInternet[\s\S]*XERT is offline/);
  assert.match(api, /\.timedOut[\s\S]*too long to respond/);
  assert.doesNotMatch(api, /throw error\s*$/m);
});
