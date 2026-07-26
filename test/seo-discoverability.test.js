import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { metadataForPath, SOCIAL_IMAGE } from '../src/lib/pageMetadata.js';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const ORIGIN = 'https://xert-fitness.vercel.app';

// Minimal JPEG dimension parser: walk markers to the start-of-frame segment.
function jpegDimensions(buf) {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) break;
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

test('the social card ships at exactly the dimensions the metadata declares', () => {
  const cardPath = new URL('../public' + SOCIAL_IMAGE.url, import.meta.url);
  assert.ok(existsSync(cardPath), `${SOCIAL_IMAGE.url} missing from public/`);
  const dims = jpegDimensions(readFileSync(cardPath));
  assert.ok(dims, 'social card is not a parseable JPEG');
  assert.equal(dims.width, SOCIAL_IMAGE.width);
  assert.equal(dims.height, SOCIAL_IMAGE.height);
  // 1200x630 is the 1.91:1 crop every major platform renders without cutting.
  assert.equal(SOCIAL_IMAGE.width, 1200);
  assert.equal(SOCIAL_IMAGE.height, 630);
});

test('static index.html carries the share image for non-JS scrapers', () => {
  const html = read('../index.html');
  // Facebook/WhatsApp/iMessage never execute the SPA, so these must be static
  // and absolute.
  assert.ok(html.includes(`<meta property="og:image" content="${ORIGIN}${SOCIAL_IMAGE.url}"`));
  assert.ok(html.includes(`<meta name="twitter:image" content="${ORIGIN}${SOCIAL_IMAGE.url}"`));
  assert.match(html, /<meta property="og:site_name"/);
  assert.match(html, /<meta property="og:url"/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image"/);
});

test('index.html declares valid HealthClub structured data with real assets', () => {
  const html = read('../index.html');
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match, 'JSON-LD script block missing');
  const data = JSON.parse(match[1]);
  assert.equal(data['@type'], 'HealthClub');
  assert.equal(data.address['@type'], 'PostalAddress');
  assert.equal(data.address.addressLocality, 'Kingaroy');
  assert.equal(data.address.addressRegion, 'QLD');
  assert.equal(data.address.postalCode, '4610');
  assert.equal(data.address.addressCountry, 'AU');
  // Every asset URL the structured data references must actually ship.
  for (const url of [data.logo, data.image]) {
    const rel = url.replace(ORIGIN, '');
    assert.ok(existsSync(new URL('../public' + rel, import.meta.url)), `${rel} missing from public/`);
  }
});

test('sitemap lists exactly the indexable public routes', () => {
  const sitemap = read('../public/sitemap.xml');
  const paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => {
    const url = new URL(m[1]);
    assert.equal(url.origin, ORIGIN, `sitemap entry on wrong origin: ${m[1]}`);
    return url.pathname === '/' ? '/' : url.pathname.replace(/\/+$/, '');
  });
  assert.equal(new Set(paths).size, paths.length, 'sitemap has duplicate entries');
  for (const path of paths) {
    assert.equal(metadataForPath(path).indexable, true,
      `sitemap lists ${path}, which page metadata marks noindex/unknown`);
  }
  // Reverse direction: every indexable route in page metadata must be listed,
  // so adding a public page without updating the sitemap fails loudly.
  const source = read('../src/lib/pageMetadata.js');
  const declared = [...source.matchAll(/^\s*'(\/[^']*)':\s*\{/gm)].map(m => m[1]);
  assert.ok(declared.length >= 10, 'route extraction from pageMetadata looks broken');
  for (const route of declared) {
    assert.ok(paths.includes(route), `indexable route ${route} missing from sitemap.xml`);
  }
});

test('robots.txt guards private areas and advertises the sitemap', () => {
  const robots = read('../public/robots.txt');
  assert.match(robots, /^Disallow: \/admin$/m);
  assert.match(robots, /^Disallow: \/account$/m);
  assert.ok(robots.includes(`Sitemap: ${ORIGIN}/sitemap.xml`));
});
