import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

test('Command Centre native select menus keep a high-contrast dark palette', () => {
  assert.match(css, /\[data-admin-workspace\] select\s*\{\s*color-scheme: dark;/);
  assert.match(css, /\[data-admin-workspace\] select option,\s*\[data-admin-workspace\] select optgroup\s*\{[\s\S]*background-color: var\(--xert-navy\);[\s\S]*color: var\(--xert-offwhite\);/);
});
