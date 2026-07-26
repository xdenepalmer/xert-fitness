import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearSiteContentDraft,
  clearSiteContentDrafts,
  readSiteContentDraft,
  SITE_CONTENT_DRAFT_PREFIX,
  writeSiteContentDraft,
} from '../src/lib/siteContentDraft.js';

function memoryStorage() {
  const values = new Map();
  return {
    get length() {
      return values.size;
    },
    key: index => Array.from(values.keys())[index] ?? null,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
    values,
  };
}

test('persists and restores a versioned CMS section draft', () => {
  const storage = memoryStorage();
  const data = { headline: 'Train together', photos: ['https://example.com/hero.jpg'] };

  assert.equal(writeSiteContentDraft(storage, 'admin-a', 'hero', data, 1234), true);
  assert.deepEqual(readSiteContentDraft(storage, 'admin-a', 'hero'), { data, updatedAt: 1234 });
  assert.ok(storage.values.has(`${SITE_CONTENT_DRAFT_PREFIX}admin-a:hero`));
});

test('clears drafts after save or explicit discard', () => {
  const storage = memoryStorage();
  writeSiteContentDraft(storage, 'admin-a', 'contact', { email: 'team@xert.com.au' }, 4567);

  assert.equal(clearSiteContentDraft(storage, 'admin-a', 'contact'), true);
  assert.equal(readSiteContentDraft(storage, 'admin-a', 'contact'), null);
});

test('ignores corrupt, outdated, and unavailable browser storage', () => {
  const storage = memoryStorage();
  storage.setItem(`${SITE_CONTENT_DRAFT_PREFIX}admin-a:faq`, '{not-json');
  storage.setItem(`${SITE_CONTENT_DRAFT_PREFIX}admin-a:about`, JSON.stringify({ version: 0, data: {}, updatedAt: 1 }));

  assert.equal(readSiteContentDraft(storage, 'admin-a', 'faq'), null);
  assert.equal(readSiteContentDraft(storage, 'admin-a', 'about'), null);
  assert.equal(readSiteContentDraft(null, 'admin-a', 'hero'), null);
  assert.equal(writeSiteContentDraft(null, 'admin-a', 'hero', {}), false);
  assert.equal(clearSiteContentDraft(null, 'admin-a', 'hero'), false);
});

test('scopes the draft key to the signed-in admin so drafts never leak between users', () => {
  const storage = memoryStorage();
  const draft = { headline: 'Only admin A typed this' };

  writeSiteContentDraft(storage, 'admin-a', 'hero', draft, 111);

  // Admin B on the same shared browser must not recover admin A's draft.
  assert.equal(readSiteContentDraft(storage, 'admin-b', 'hero'), null);
  assert.deepEqual(readSiteContentDraft(storage, 'admin-a', 'hero'), { data: draft, updatedAt: 111 });
});

test('a missing user id neither persists nor recovers a draft', () => {
  const storage = memoryStorage();
  assert.equal(writeSiteContentDraft(storage, null, 'hero', { headline: 'x' }), false);
  assert.equal(storage.length, 0);
  assert.equal(readSiteContentDraft(storage, null, 'hero'), null);
});

test('sweeps every admin CMS draft on sign-out but leaves unrelated keys', () => {
  const storage = memoryStorage();
  writeSiteContentDraft(storage, 'admin-a', 'hero', { headline: 'a' }, 1);
  writeSiteContentDraft(storage, 'admin-b', 'contact', { email: 'b@xert.com.au' }, 2);
  storage.setItem('unrelated-key', 'keep-me');

  assert.equal(clearSiteContentDrafts(storage), true);
  assert.equal(readSiteContentDraft(storage, 'admin-a', 'hero'), null);
  assert.equal(readSiteContentDraft(storage, 'admin-b', 'contact'), null);
  assert.equal(storage.getItem('unrelated-key'), 'keep-me');
  assert.equal(clearSiteContentDrafts(null), false);
});
