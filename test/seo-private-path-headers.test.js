import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('vercel serves X-Robots-Tag noindex for admin and other private SPA paths', () => {
  const vercel = JSON.parse(read('../vercel.json'));
  const robotHeaders = (vercel.headers || []).filter(entry =>
    (entry.headers || []).some(header => header.key === 'X-Robots-Tag'),
  );
  const sources = new Set(robotHeaders.map(entry => entry.source));
  for (const source of [
    '/admin',
    '/admin/(.*)',
    '/account',
    '/open/(.*)',
    '/checkout-return',
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
    '/thank-you',
  ]) {
    assert.ok(sources.has(source), `missing X-Robots-Tag source ${source}`);
  }
  for (const entry of robotHeaders) {
    const tag = entry.headers.find(header => header.key === 'X-Robots-Tag');
    assert.equal(tag.value, 'noindex, nofollow', entry.source);
  }
});

test('robots.txt disallows admin deep-link bridges and auth screens', () => {
  const robots = read('../public/robots.txt');
  for (const path of [
    '/account',
    '/admin',
    '/open',
    '/checkout-return',
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
    '/thank-you',
  ]) {
    assert.match(robots, new RegExp(`^Disallow: ${path.replace(/\//g, '\\/')}$`, 'm'));
  }
});
