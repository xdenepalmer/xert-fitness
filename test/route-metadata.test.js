import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { metadataForPath } from '../src/lib/pageMetadata.js';

test('public routes have distinct indexable search metadata', () => {
  const home = metadataForPath('/');
  const events = metadataForPath('/events');
  const booking = metadataForPath('/booking/');

  assert.equal(home.indexable, true);
  assert.equal(events.indexable, true);
  assert.equal(booking.indexable, true);
  assert.notEqual(home.title, events.title);
  assert.notEqual(events.title, booking.title);
  assert.match(events.description, /2026/);
});

test('private, transactional and unknown routes are never indexed', () => {
  for (const path of ['/account', '/admin/orders', '/checkout-return', '/reset-password', '/missing']) {
    assert.equal(metadataForPath(path).indexable, false, path);
  }
});

test('unmatched request paths never resolve to a foreign canonical origin', () => {
  // RouteMetadata builds the canonical link and og:url with
  // new URL(metadata.path, window.location.origin). WHATWG parsing treats a
  // scheme-relative or backslash-authority path as a new origin, so the metadata
  // path must never carry one.
  const origin = 'https://xert-fitness.vercel.app';
  for (const hostile of ['//evil.example/x', '/\\evil.example/x', '/\\/evil', 'https://evil.com/x', '/missing']) {
    const meta = metadataForPath(hostile);
    assert.equal(meta.indexable, false, hostile);
    assert.equal(new URL(meta.path || '/', origin).origin, origin, hostile);
  }
});

test('sitemap contains indexable routes and excludes private screens', async () => {
  const sitemap = await readFile(new URL('../public/sitemap.xml', import.meta.url), 'utf8');
  const robots = await readFile(new URL('../public/robots.txt', import.meta.url), 'utf8');

  for (const path of ['/events', '/booking', '/training-guide', '/privacy']) {
    assert.match(sitemap, new RegExp(`<loc>https://xert-fitness\\.vercel\\.app${path}</loc>`));
  }
  assert.doesNotMatch(sitemap, /\/admin|\/account|\/checkout-return/);
  assert.match(robots, /Disallow: \/admin/);
  assert.match(robots, /Disallow: \/open/);
  assert.match(robots, /Sitemap: https:\/\/xert-fitness\.vercel\.app\/sitemap\.xml/);
});
