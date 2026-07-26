import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const config = readFileSync(new URL('../tailwind.config.js', import.meta.url), 'utf8');
const source = readFileSync(new URL('../src/pages/SoftLaunchTimetable.jsx', import.meta.url), 'utf8');

function tokenHex(token) {
  const match = config.match(new RegExp(`${token}:\\s*'(#[0-9a-fA-F]{6})'`));
  assert.ok(match, `tailwind token ${token} resolves to a hex value`);
  return match[1];
}

const CONCRETE = tokenHex('concrete');
const INK = tokenHex('ink');
const CHARCOAL = tokenHex('charcoal');
const STEEL = tokenHex('steel');

function rgb(hex) {
  const clean = hex.replace('#', '');
  return [0, 2, 4].map(index => parseInt(clean.slice(index, index + 2), 16));
}
function over(fgHex, bgHex, alpha) {
  const fg = rgb(fgHex);
  const bg = rgb(bgHex);
  return fg.map((channel, index) => channel * alpha + bg[index] * (1 - alpha));
}
function relativeLuminance(channels) {
  const [r, g, b] = channels.map(value => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(fgChannels, bgChannels) {
  const l1 = relativeLuminance(fgChannels);
  const l2 = relativeLuminance(bgChannels);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
// Text at opacity `alpha` composited over an opaque background, then measured
// against that same background.
function textContrast(textHex, alpha, bgHex) {
  return contrast(over(textHex, bgHex, alpha), rgb(bgHex));
}

test('every timetable caption clears 4.5:1 on both the resting and hover card backgrounds', () => {
  for (const label of ['Intensity', 'Date', 'Time', 'Duration', 'Capacity']) {
    const match = source.match(new RegExp(`text-xert-concrete\\/(\\d+)[^"]*"[^>]*>\\s*${label}`));
    assert.ok(match, `caption "${label}" is present with a concrete text opacity`);
    const alpha = Number(match[1]) / 100;

    const resting = textContrast(CONCRETE, alpha, INK);
    const hover = textContrast(CONCRETE, alpha, CHARCOAL);
    assert.ok(resting >= 4.5, `${label} on ink is ${resting.toFixed(2)}:1`);
    assert.ok(hover >= 4.5, `${label} on charcoal is ${hover.toFixed(2)}:1`);
  }
});

test('the Full badge stays legible regardless of the card hover state', () => {
  const badge = source.match(/<span[^>]*>Full<\/span>/);
  assert.ok(badge, 'Full badge is present');
  // A solid (opaque) steel chip with dark ink text is independent of the card
  // background, so it passes on both the resting and hover states.
  assert.match(badge[0], /bg-xert-steel(?![\w/])/);
  assert.match(badge[0], /text-xert-ink/);
  assert.doesNotMatch(badge[0], /text-xert-concrete\/\d+/);

  const ratio = contrast(rgb(INK), rgb(STEEL));
  assert.ok(ratio >= 4.5, `Full badge text is ${ratio.toFixed(2)}:1`);
});

test('no timetable caption is left at the failing 40% opacity', () => {
  assert.doesNotMatch(source, /text-xert-concrete\/40/);
});
