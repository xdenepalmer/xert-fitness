import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const associationURL = new URL('../public/.well-known/apple-app-site-association', import.meta.url);
const vercelURL = new URL('../vercel.json', import.meta.url);
const entitlementsURL = new URL('../ios/XertFitnessApp/XertFitnessApp/XertFitnessApp.entitlements', import.meta.url);
const readmeURL = new URL('../ios/XertFitnessApp/README.md', import.meta.url);

test('AASA associates only canonical XERT task links with the signed app identity', async () => {
  const raw = await readFile(associationURL, 'utf8');
  const association = JSON.parse(raw);
  assert.ok(Buffer.byteLength(raw) < 128 * 1024);
  assert.deepEqual(association, {
    applinks: {
      details: [{
        appID: '25R438YK9F.com.xertfitness.app',
        components: [{
          '/': '/open/*',
          comment: 'Opens canonical XERT member tasks in the native app.',
        }],
      }],
    },
  });
});

test('Vercel serves AASA as JSON outside the SPA rewrite while signing stays gated', async () => {
  const [vercelRaw, entitlements, readme] = await Promise.all([
    readFile(vercelURL, 'utf8'),
    readFile(entitlementsURL, 'utf8'),
    readFile(readmeURL, 'utf8'),
  ]);
  const vercel = JSON.parse(vercelRaw);
  const aasaHeaders = vercel.headers.find(({ source }) => source === '/.well-known/apple-app-site-association');
  assert.ok(aasaHeaders);
  assert.deepEqual(aasaHeaders.headers, [
    { key: 'Content-Type', value: 'application/json' },
    { key: 'Cache-Control', value: 'public, max-age=3600' },
  ]);
  assert.match(vercel.rewrites[0].source, /well-known/);
  assert.doesNotMatch(entitlements, /com\.apple\.developer\.associated-domains/);
  assert.match(readme, /confirm the XERT App ID belongs to that same Apple team/);
  assert.match(readme, /enable \*\*Associated Domains\*\*/);
});
