import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearSiteContentDraft,
  readSiteContentDraft,
  SITE_CONTENT_DRAFT_PREFIX,
  writeSiteContentDraft,
} from '../src/lib/siteContentDraft.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
    values,
  };
}

test('persists and restores a versioned CMS section draft', () => {
  const storage = memoryStorage();
  const data = { headline: 'Train together', photos: ['https://example.com/hero.jpg'] };

  assert.equal(writeSiteContentDraft(storage, 'hero', data, 1234), true);
  assert.deepEqual(readSiteContentDraft(storage, 'hero'), { data, updatedAt: 1234 });
  assert.ok(storage.values.has(`${SITE_CONTENT_DRAFT_PREFIX}hero`));
});

test('clears drafts after save or explicit discard', () => {
  const storage = memoryStorage();
  writeSiteContentDraft(storage, 'contact', { email: 'team@xert.com.au' }, 4567);

  assert.equal(clearSiteContentDraft(storage, 'contact'), true);
  assert.equal(readSiteContentDraft(storage, 'contact'), null);
});

test('ignores corrupt, outdated, and unavailable browser storage', () => {
  const storage = memoryStorage();
  storage.setItem(`${SITE_CONTENT_DRAFT_PREFIX}faq`, '{not-json');
  storage.setItem(`${SITE_CONTENT_DRAFT_PREFIX}about`, JSON.stringify({ version: 0, data: {}, updatedAt: 1 }));

  assert.equal(readSiteContentDraft(storage, 'faq'), null);
  assert.equal(readSiteContentDraft(storage, 'about'), null);
  assert.equal(readSiteContentDraft(null, 'hero'), null);
  assert.equal(writeSiteContentDraft(null, 'hero', {}), false);
  assert.equal(clearSiteContentDraft(null, 'hero'), false);
});
