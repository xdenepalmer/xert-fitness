import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('official XERT logo lockups are used on contrasting dark surfaces', async () => {
  const [nav, hero, footer, admin, overview] = await Promise.all([
    source('../src/components/public/PublicNav.jsx'),
    source('../src/components/public/Hero.jsx'),
    source('../src/components/public/PublicFooter.jsx'),
    source('../src/components/admin/AdminLayout.jsx'),
    source('../src/components/public/WhatXertIs.jsx'),
  ]);

  assert.match(nav, /xert-logo-horizontal-light\.png/);
  assert.match(hero, /xert-logo-horizontal-light\.png/);
  assert.match(admin, /xert-logo-horizontal-light\.png/);
  assert.match(footer, /xert-logo-stacked-light\.png/);
  assert.match(overview, /xert-logo-mark-light\.png/);
  assert.doesNotMatch([nav, hero, footer, admin, overview].join('\n'), /xert-logo-full\.png/);

  await Promise.all([
    access(new URL('../public/assets/xert-logo-horizontal-light.png', import.meta.url)),
    access(new URL('../public/assets/xert-logo-mark-light.png', import.meta.url)),
    access(new URL('../public/assets/xert-logo-stacked-light.png', import.meta.url)),
  ]);
});
