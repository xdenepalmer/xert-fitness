import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSiteContent } from '../src/lib/siteContentAdmin.js';

test('normalizes CMS content to the selected public section schema', () => {
  assert.deepEqual(normalizeSiteContent('contact', {
    email: ' hello@xertfitness.com.au ',
    phone: ' 0400 000 000 ',
    instagram_url: 'https://instagram.com/xert_fit',
    admin_only: 'must not leak',
  }), {
    email: 'hello@xertfitness.com.au',
    phone: '0400 000 000',
    instagram_url: 'https://instagram.com/xert_fit',
  });
});

test('omits empty lists so public defaults remain visible', () => {
  assert.deepEqual(normalizeSiteContent('about', { paragraphs: [' ', ''] }), {});
  assert.deepEqual(normalizeSiteContent('faq', { items: [{ q: '', a: '' }] }), {});
});

test('rejects incomplete FAQs and unsafe public links', () => {
  assert.throws(() => normalizeSiteContent('faq', { items: [{ q: 'When?', a: '' }] }), /question and an answer/);
  assert.throws(() => normalizeSiteContent('hero', { photos: ['javascript:alert(1)'] }), /HTTPS or HTTP/);
  assert.throws(() => normalizeSiteContent('contact', { email: 'not-an-email' }), /valid public contact email/);
});

test('bounds launch-facing copy, collections, and media URLs', () => {
  assert.throws(
    () => normalizeSiteContent('hero', { headline: 'x'.repeat(161) }),
    /Headline must be 160 characters or fewer/,
  );
  assert.throws(
    () => normalizeSiteContent('hero', { photos: Array(13).fill('/assets/hero.jpg') }),
    /limited to 12 images/,
  );
  assert.throws(
    () => normalizeSiteContent('about', { paragraphs: Array(13).fill('Train with purpose.') }),
    /limited to 12 paragraphs/,
  );
  assert.throws(
    () => normalizeSiteContent('faq', { items: Array(21).fill({ q: 'When?', a: 'Now.' }) }),
    /limited to 20 FAQ items/,
  );
  assert.throws(
    () => normalizeSiteContent('hero', { photos: [`https://example.com/${'x'.repeat(2050)}`] }),
    /2,048 characters or fewer/,
  );
});
