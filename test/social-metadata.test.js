import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { metadataForPath, SITE_NAME, SOCIAL_IMAGE } from '../src/lib/pageMetadata.js';

const routeMetaSource = readFileSync(
  new URL('../src/lib/RouteMetadata.jsx', import.meta.url), 'utf8');

test('SOCIAL_IMAGE points at a real, opaque asset with dimensions', () => {
  assert.equal(typeof SITE_NAME, 'string');
  assert.ok(SITE_NAME.length > 0);
  assert.ok(SOCIAL_IMAGE.url.startsWith('/assets/'), 'must be an absolute site path');
  // A JPEG is opaque; a transparent PNG composites unpredictably on social cards.
  assert.match(SOCIAL_IMAGE.url, /\.jpe?g$/i, 'social image should be an opaque JPEG');
  assert.ok(Number.isInteger(SOCIAL_IMAGE.width) && SOCIAL_IMAGE.width > 0);
  assert.ok(Number.isInteger(SOCIAL_IMAGE.height) && SOCIAL_IMAGE.height > 0);
  assert.ok(SOCIAL_IMAGE.alt && SOCIAL_IMAGE.alt.length > 0);
  // The referenced file must actually ship in public/.
  const publicPath = new URL('../public' + SOCIAL_IMAGE.url, import.meta.url);
  assert.ok(existsSync(publicPath), `${SOCIAL_IMAGE.url} is missing from public/`);
});

test('RouteMetadata emits the full social/Open Graph tag set', () => {
  for (const needle of [
    'og:type', 'og:site_name', 'og:image', 'og:image:width', 'og:image:height',
    'og:image:alt', 'twitter:card', 'twitter:image',
  ]) {
    assert.ok(routeMetaSource.includes(needle), `RouteMetadata must set ${needle}`);
  }
  // twitter:card must be a valid rich-card type.
  assert.match(routeMetaSource, /summary_large_image|summary/);
  // og:image must be resolved to an absolute URL (crawlers can't use a relative path).
  assert.match(routeMetaSource, /new URL\(metadata\.image \|\| SOCIAL_IMAGE\.url, window\.location\.origin\)/);
});

test('metadataForPath keeps its shape and indexability contract', () => {
  const home = metadataForPath('/');
  assert.equal(home.indexable, true);
  assert.equal(home.path, '/');
  assert.ok(home.title && home.description);

  const priv = metadataForPath('/account');
  assert.equal(priv.indexable, false);

  const admin = metadataForPath('/admin/leads');
  assert.equal(admin.indexable, false);
});
