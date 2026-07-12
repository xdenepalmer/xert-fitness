import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeCoachInput } from '../src/lib/coachAdmin.js';

test('normalizes an explicit safe coach payload without carrying database fields', () => {
  const result = normalizeCoachInput({
    id: 'must-not-be-sent',
    created_at: 'must-not-be-sent',
    name: '  Byron Hawley ',
    role: ' Head Coach ',
    category: 'coach',
    bio: ' ',
    social_url: 'https://instagram.com/xert_fit',
    sort_order: '2',
    published: true,
  });

  assert.equal(result.name, 'Byron Hawley');
  assert.equal(result.role, 'Head Coach');
  assert.equal(result.bio, null);
  assert.equal(result.sort_order, 2);
  assert.equal(result.social_url, 'https://instagram.com/xert_fit');
  assert.equal(result.published, true);
  assert.equal('id' in result, false);
  assert.equal('created_at' in result, false);
});

test('rejects invalid categories, sort order, and unsafe links', () => {
  assert.throws(() => normalizeCoachInput({ name: 'Coach', category: 'unknown' }), /valid team category/);
  assert.throws(() => normalizeCoachInput({ name: 'Coach', category: 'coach', sort_order: -1 }), /Sort order/);
  assert.throws(() => normalizeCoachInput({ name: 'Coach', category: 'coach', social_url: 'javascript:alert(1)' }), /Social link/);
});
