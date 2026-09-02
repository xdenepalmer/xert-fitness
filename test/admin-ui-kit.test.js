import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const dir = new URL('../src/components/admin/', import.meta.url);
const sourceDir = new URL('../src/', import.meta.url);
const read = name => readFile(new URL(name, dir), 'utf8');
const managers = async () => (await readdir(dir)).filter(name => name.endsWith('.jsx') && name !== 'ui.jsx');
const sourceFiles = async () => (await readdir(sourceDir, { recursive: true }))
  .filter(name => /\.(?:[cm]?[jt]sx?|css)$/.test(name));

test('the kit is the single source for buttons, inputs, titles and gutters', async () => {
  const kit = await read('ui.jsx');
  for (const symbol of ['ADMIN_PAGE', 'ADMIN_TEXT', 'ADMIN_INPUT', 'ADMIN_INPUT_BARE', 'ADMIN_LABEL', 'ADMIN_BUTTON', 'ADMIN_PANEL']) {
    assert.match(kit, new RegExp(`export const ${symbol}`), `${symbol} is exported`);
  }
  assert.match(kit, /ADMIN_INPUT_BARE = 'min-h-11[^']*text-base[^']*sm:text-sm/, 'inputs are 16px on phones so iOS does not zoom');
  assert.match(kit, /primary: `\$\{BUTTON_BASE\} bg-xert-steel text-xert-navy shadow-lg shadow-xert-steel\/20 hover:bg-xert-pale`/);
  assert.match(kit, /pageTitle: 'font-display text-3xl tracking-wide text-xert-offwhite sm:text-4xl'/);
  assert.equal(ADMIN_PAGE_IS_PHONE_FIRST(kit), true, 'gutters are px-4 on phones and wider, centred on desktop');
});

function ADMIN_PAGE_IS_PHONE_FIRST(kit) {
  return /ADMIN_PAGE = 'px-4 py-5 sm:px-8 sm:py-7 mx-auto w-full max-w-6xl'/.test(kit);
}

test('no workspace hand-rolls a primary button, an input class or a page title', async () => {
  for (const name of await managers()) {
    const source = await read(name);
    assert.doesNotMatch(source, /className="[^"]*bg-xert-steel text-xert-navy[^"]*"/, `${name} uses ADMIN_BUTTON.primary`);
    assert.doesNotMatch(source, /^const (inputCls|inputClass|labelCls) = '/m, `${name} imports its input and label classes from the kit`);
    assert.doesNotMatch(source, /className="font-display text-lg text-xert-offwhite uppercase"/, `${name} uses ADMIN_TEXT.pageTitle`);
    assert.doesNotMatch(source, /className="p-6( [^"]*)?"/, `${name} uses ADMIN_PAGE gutters`);
  }
});

test('brand colours are tokens, never inline hex or rgba literals', async () => {
  const offenders = [];
  for (const name of await managers()) {
    const source = await read(name);
    for (const match of source.matchAll(/style=\{\{ color: '(#[0-9a-fA-F]{6}|rgba\([^)]*\))' \}\}/g)) offenders.push(`${name}: ${match[1]}`);
    for (const match of source.matchAll(/style=\{\{ backgroundColor: '(#[0-9a-fA-F]{6}|rgba\([^)]*\))' \}\}/g)) offenders.push(`${name}: bg ${match[1]}`);
  }
  assert.deepEqual(offenders, [], 'inline colour literals cannot be themed or searched; use text-xert-*/bg-xert-* tokens');
});

test('colour opacity modifiers stay on the Tailwind scale so they never silently render nothing', async () => {
  // Tailwind 3 only generates /N for multiples of five; bg-xert-steel/12 emits no CSS at all.
  const tokenPattern = /(text|bg|border|from|to|ring|divide|outline)-(xert-[a-z]+|green-[0-9]+|amber-[0-9]+|red-[0-9]+)\/[0-9]+/g;
  const hits = [];
  for (const name of await sourceFiles()) {
    const source = await readFile(new URL(name.replaceAll('\\', '/'), sourceDir), 'utf8');
    hits.push(...[...source.matchAll(tokenPattern)].map(match => match[0]));
  }
  const offGrid = [...new Set(hits.filter(token => Number(token.split('/')[1]) % 5 !== 0))];
  assert.deepEqual(offGrid, [], 'use a multiple of five (or an arbitrary [0.12] value)');
});
