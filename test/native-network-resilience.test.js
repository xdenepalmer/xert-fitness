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

test('native networking refuses cross-project configuration before creating a request', async () => {
  const [config, api, example] = await Promise.all([
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/AppConfig.swift', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/Config.example.xcconfig', import.meta.url), 'utf8'),
  ]);
  assert.match(config, /supabaseHost = "ugmkwoapjcpiucsrxwzt\.supabase\.co"/);
  assert.match(config, /vercelHost = "xert-fitness\.vercel\.app"/);
  assert.match(config, /func canonicalServiceURL/);
  assert.match(config, /func isPublicSupabaseKey/);
  assert.match(config, /claims\["role"\] as\? String == "anon"/);
  assert.match(config, /if rawValue\.hasPrefix\("sb_secret_"\) \{ return false \}/);
  assert.match(api, /guard AppConfig\.isTrustedServiceBaseURL\(baseURL\)[\s\S]*XERT services are temporarily unavailable/);
  const trustGate = api.indexOf('guard AppConfig.isTrustedServiceBaseURL(baseURL)');
  const requestCreation = api.indexOf('return URLRequest(url: url', trustGate);
  assert.ok(trustGate >= 0 && requestCreation > trustGate);
  assert.match(example, /ugmkwoapjcpiucsrxwzt\.supabase\.co/);
  assert.match(example, /sb_publishable_replace_with_xert_publishable_key/);
  assert.match(example, /xert-fitness\.vercel\.app/);
});
