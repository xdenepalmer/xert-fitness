import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tokens = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
const rgb = name => {
  const hex = tokens.match(new RegExp(`--${name}: #(\\w{6});`))?.[1];
  assert.ok(hex, `Missing opaque token ${name}`);
  return [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16));
};
const luminance = color => color.map(value => {
  const s = value / 255;
  return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
}).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
const ratio = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);

test('public navigation text meets 4.5:1 on every bar, sheet, card and action background', () => {
  // White imagery behind the weakest (80%) black hero scrim is the worst case.
  const backgrounds = ['surface-base', 'surface-raised', 'surface-overlay'].map(rgb).concat([[51, 51, 51]]);
  for (const foreground of ['text-primary', 'text-secondary', 'accent-default']) {
    for (const background of backgrounds) assert.ok(ratio(rgb(foreground), background) >= 4.5, `${foreground} on ${background}: ${ratio(rgb(foreground), background)}`);
  }
  assert.ok(ratio(rgb('text-inverse'), rgb('accent-default')) >= 4.5);
});

test('navigation styling resolves semantic color tokens instead of losing borders silently', () => {
  const css = readFileSync(new URL('../src/components/public/nav/public-nav.css', import.meta.url), 'utf8');
  for (const [, name] of css.matchAll(/var\(--((?:surface|text|accent|border)-[\w-]+)\)/g)) {
    assert.ok(tokens.includes(`--${name}:`), `Unresolved semantic token ${name}`);
  }
});
