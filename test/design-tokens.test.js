import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolveTokens, generateTokens } from '../scripts/build-tokens.mjs';
import { resolveSemanticColor } from '../src/lib/designTokens.js';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const source = JSON.parse(read('design/tokens.json'));
const primitiveUtilityPattern = /(?:bg|text|border(?:-[trblxy])?|divide|ring(?:-offset)?|outline|shadow|from|via|to|fill|stroke|accent|caret|decoration|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;

test('tokens resolve semantic references, elevation, opacity, and component knobs', () => {
  const values = resolveTokens(source);
  assert.equal(values['semantics.surface.base'], '#101820');
  assert.equal(values['semantics.surface.raised'], '#141D25');
  assert.equal(values['semantics.surface.overlay'], '#17222B');
  assert.equal(values['semantics.surface.sunken'], '#0F171F');
  assert.equal(values['semantics.border.hairline'], '#7BA7BC1F');
  assert.equal(values['semantics.border.strong'], '#7BA7BC3D');
  assert.equal(values['semantics.surface.paper'], '#FFFFFF', 'printed records retain a white paper background');
  assert.equal(values['components.nav.height.compact'], '56px');
  assert.equal(values['components.nav.height.expanded'], '76px');
  assert.equal(values['components.card.radius'], '1rem');
});
test('tokens reject invalid references, cycles, and invalid transforms', () => {
  assert.throws(() => resolveTokens({ semantics: { a: '{primitives.missing}' } }), /Invalid token reference/);
  assert.throws(() => resolveTokens({ semantics: { a: '{semantics.b}', b: '{semantics.a}' } }), /Token cycle/);
  assert.throws(() => resolveTokens({ semantics: { a: { alpha: ['#FFFFFF', 2] } } }), /between zero and one/);
  assert.throws(() => resolveTokens({ semantics: { a: { mix: ['12px', '#FFFFFF', 0.5] } } }), /Expected resolved color/);
  assert.throws(() => resolveTokens({ primitives: { a: '12px' }, components: { a: '{primitives.a}' } }), /must reference semantics/);
  assert.throws(() => resolveTokens({ semantics: { a: '{components.a}' }, components: { a: '12px' } }), /cannot reference component/);
  assert.throws(() => generateTokens({ semantics: { 'a.b': '#FFFFFF', 'a-b': '#000000' } }), /Colliding/);
});
test('all checked-in outputs are byte-identical to deterministic generation', () => {
  const generated = generateTokens(source);
  assert.deepEqual(generated, generateTokens(JSON.parse(JSON.stringify(source))));
  for (const [path, content] of Object.entries(generated)) assert.equal(read(path), content, path);
});

test('calendar container queries follow changed shared breakpoints without private literals', () => {
  const changed = structuredClone(source);
  changed.components['admin.kit.breakpoint.columns'] = '41rem';
  changed.components['admin.kit.breakpoint.table'] = '53rem';
  const css = generateTokens(changed)['src/styles/admin-calendar-queries.css'];
  assert.equal(typeof css, 'string', 'calendar queries are a generated artifact');
  assert.match(css, /@container admin-kit \(min-width: 41rem\)/);
  assert.match(css, /@container admin-kit \(min-width: 53rem\)/);
  assert.match(css, /@container calendar-board \(min-width: 53rem\)/);
  assert.match(css, /@container calendar-attendance \(min-width: 41rem\)/);
  assert.doesNotMatch(css, /36rem|48rem/);
  const calendarStyles = read('src/components/admin/calendar.css');
  assert.match(calendarStyles, /@import '\.\.\/\.\.\/styles\/admin-calendar-queries\.css'/);
  assert.doesNotMatch(calendarStyles, /@container[^\n]*\d+(?:px|rem)/);
});
test('CSS and Swift expose exactly the same semantic color names', () => {
  const values = resolveTokens(source);
  const expected = Object.entries(values).filter(([key, value]) => key.startsWith('semantics.') && /^#[\da-f]{6,8}$/i.test(value)).map(([key]) => key.slice(10)).sort();
  const swift = read('ios/XertFitnessApp/XertFitnessApp/Generated/XertTokens.swift');
  const names = swift.match(/semanticColorNames: \[String\] = \[([\s\S]*?)\]/)[1];
  assert.deepEqual([...names.matchAll(/"([^"]+)"/g)].map(match => match[1]).sort(), expected);
  const css = read('src/styles/tokens.css');
  const cssColors = [...css.matchAll(/--([\w-]+)-rgb:/g)].map(match => match[1]).sort();
  assert.deepEqual(cssColors, expected.map(key => key.replaceAll('.', '-')).sort());
});
test('components and pages consume semantics, never raw colors or primitives', () => {
  for (const dir of ['src/components', 'src/pages']) {
    for (const path of readdirSync(new URL(`../${dir}`, import.meta.url), { recursive: true }).filter(path => /\.[jt]sx?$/.test(path))) {
      const content = read(`${dir}/${path}`);
      assert.doesNotMatch(content, /(?<!&)#[\da-fA-F]{3,8}\b|rgba?\(\s*\d/, `${dir}/${path} contains a raw color`);
      assert.doesNotMatch(content, /var\(--(?:primitive|navy-900|steel-400|space-4|dur-quick)|\{primitives\.|(?:bg|text|border)-primitive/, `${dir}/${path} consumes primitives`);
      for (const key of Object.keys(source.primitives)) {
        if (Object.keys(source.semantics).some(semantic => semantic.replaceAll('.', '-') === key)) continue;
        assert.ok(!content.includes(`var(--${key})`), `${dir}/${path} consumes primitive ${key}`);
      }
      assert.doesNotMatch(content, /(?:import|require)[^\n]*design\/tokens\.json/, 'components must not import the primitive source');
      assert.doesNotMatch(content, primitiveUtilityPattern, `${dir}/${path} uses a default palette utility (including modifiers)`);
    }
  }
});
test('all consumers are wired to generation and native aliases have one definition', () => {
  assert.match(read('src/index.css'), /@import '\.\/styles\/tokens\.css'/);
  assert.match(read('tailwind.config.js'), /require\('\.\/tailwind\.config\.tokens\.cjs'\)/);
  for (const path of ['Theme.swift', 'Views/RootView.swift']) {
    assert.doesNotMatch(read(`ios/XertFitnessApp/XertFitnessApp/${path}`), /(?:UI)?Color\(red:/);
    assert.doesNotMatch(read(`ios/XertFitnessApp/XertFitnessApp/${path}`), /static let xert(?:Navy|Ink|Steel|OffWhite|Deep|Pale|Card|Muted) =/);
  }
  assert.match(read('ios/XertFitnessApp/project.yml'), /sources:\s*- path: XertFitnessApp/);
  assert.match(read('.gitattributes'), /XertTokens\.swift text eol=lf/);
  assert.doesNotMatch(read('src/index.css'), /#[\da-fA-F]{3,8}\b|rgba?\(\s*\d/, 'shared CSS must use semantic colors');
});
test('motion, transparency, and density preferences are centralized', () => {
  const css = read('src/styles/tokens.css');
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /--duration-quick: 0ms/);
  assert.match(css, /prefers-reduced-transparency: reduce/);
  assert.match(css, /--dock-blur: 0px/);
  assert.match(css, /data-density="comfortable"/);
  assert.match(css, /data-density="compact"/);
});
test('canvas color resolution returns encoder-compatible hex and fails on missing tokens', () => {
  const original = globalThis.getComputedStyle;
  const values = resolveTokens(source);
  const properties = { '--qr-background': values['semantics.qr.background'], '--qr-foreground': values['semantics.qr.foreground'], '--signature-ink': values['semantics.signature.ink'], '--chart-primary': 'rgb(12 34 56 / 50%)', '--chart-primary-rgb': '123 167 188' };
  globalThis.getComputedStyle = () => ({ getPropertyValue: name => properties[name] || '' });
  try {
    assert.equal(resolveSemanticColor('qr.background', {}), '#FFFFFF');
    assert.equal(resolveSemanticColor('qr.foreground', {}), '#101820');
    assert.equal(resolveSemanticColor('signature.ink', {}), '#000000');
    assert.equal(resolveSemanticColor('chart.primary', {}), '#0c223880', 'actual override wins over stale generated channels, with alpha preserved');
    properties['--chart-primary'] = 'rgba(100%, 0%, 50%, 0.25)';
    assert.equal(resolveSemanticColor('chart.primary', {}), '#ff008040');
    properties['--chart-primary'] = '#abcd';
    assert.equal(resolveSemanticColor('chart.primary', {}), '#aabbccdd');
    properties['--chart-primary'] = 'rgb(999 0 0)';
    assert.throws(() => resolveSemanticColor('chart.primary', {}), /Missing resolved/);
    assert.throws(() => resolveSemanticColor('missing', {}), /Missing resolved/);
    assert.throws(() => resolveSemanticColor('bad;name', {}), /Invalid semantic/);
  } finally {
    if (original) globalThis.getComputedStyle = original;
    else delete globalThis.getComputedStyle;
  }
});
test('default Tailwind palettes are unavailable and compatibility colors resolve to semantics', () => {
  for (const fixture of ['hover:border-red-300/40', 'lg:dark:focus-visible:ring-offset-amber-300', '[&>svg]:fill-blue-500', 'peer-checked:bg-green-500', 'placeholder:text-slate-400']) assert.match(fixture, primitiveUtilityPattern);
  assert.doesNotMatch('hover:border-status-danger-300/40 text-document-neutral-600', primitiveUtilityPattern);
  const resolveConfig = require('tailwindcss/resolveConfig');
  const config = require('tailwindcss/loadConfig')(fileURLToPath(new URL('../tailwind.config.js', import.meta.url)));
  const palette = resolveConfig(config).theme.colors;
  for (const key of ['red', 'amber', 'green', 'slate', 'blue', 'purple', 'emerald', 'gray']) assert.equal(palette[key], undefined, `${key} must not silently expose primitive utilities`);
  assert.match(palette['status-danger-200'], /var\(--status-danger-200-rgb\)/);
  assert.match(palette.black, /var\(--surface-scrim-rgb\)/);
  assert.match(palette.white, /var\(--surface-paper-rgb\)/);
  const values = resolveTokens(source);
  assert.equal(values['semantics.status.danger-200'], '#fecaca');
  assert.equal(values['semantics.status.warning-300'], '#fcd34d');
  // Verify every former palette shade against the installed, unchanged Tailwind palette.
  const legacy = require('tailwindcss/colors');
  for (const [key, value] of Object.entries(source.semantics)) {
    const reference = typeof value === 'string' && value.match(/^\{primitives\.(\w+)-(\d{2,3})\}$/);
    if (reference && legacy[reference[1]]?.[reference[2]]) assert.equal(values[`semantics.${key}`].toLowerCase(), legacy[reference[1]][reference[2]].toLowerCase());
  }
});
