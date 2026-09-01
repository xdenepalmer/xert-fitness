import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));

function headersFor(source) {
  return Object.fromEntries(
    config.headers.find(rule => rule.source === source)?.headers.map(header => [header.key, header.value]) || []
  );
}

test('Vercel applies a restrictive browser security baseline', () => {
  const headers = headersFor('/(.*)');
  assert.match(headers['Content-Security-Policy'], /default-src 'self'/);
  assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.match(headers['Content-Security-Policy'], /https:\/\/\*\.supabase\.co/);
  assert.match(headers['Content-Security-Policy'], /https:\/\/www\.openstreetmap\.org/);
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.equal(headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.match(headers['Permissions-Policy'], /camera=\(\)/);
  assert.match(headers['Strict-Transport-Security'], /max-age=31536000/);
});

test('Vercel never caches API responses or stale service workers', () => {
  assert.match(headersFor('/api/(.*)')['Cache-Control'], /no-store/);
  assert.match(headersFor('/sw.js')['Cache-Control'], /no-cache/);
  assert.equal(headersFor('/sw.js')['Service-Worker-Allowed'], '/');
});

test('SPA routing excludes serverless APIs and platform association files', () => {
  assert.deepEqual(config.rewrites.at(-1),
    { source: '/((?!api/|\\.well-known/).*)', destination: '/index.html' });
  assert.ok(config.rewrites.slice(0, -1).every(({ source, destination }) =>
    source.startsWith('/api/') && destination.startsWith('/api/')));
});
