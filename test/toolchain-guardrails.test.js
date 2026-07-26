import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const rootDir = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(await readFile(path.join(rootDir, 'package.json'), 'utf8'));
const eslint = new ESLint({ cwd: rootDir });

test('eslint resolves a real rule set for serverless, library and entry files', async () => {
  for (const file of ['api/checkout.js', 'src/lib/adminData.js', 'src/App.jsx']) {
    const config = await eslint.calculateConfigForFile(file);
    const ruleCount = Object.keys(config.rules).length;
    assert.ok(ruleCount > 20, `${file} resolved only ${ruleCount} rules; recommended is not applied`);
    assert.ok('no-undef' in config.rules, `${file} is missing eslint:recommended's no-undef`);
  }
});

test('eslint applies react rules to JSX', async () => {
  const config = await eslint.calculateConfigForFile('src/App.jsx');
  assert.ok('react/jsx-uses-vars' in config.rules, 'react rules are not applied to JSX');
});

test('eslint globally ignores build and coverage output', async () => {
  assert.equal(await eslint.isPathIgnored('dist/assets/index.js'), true);
  assert.equal(await eslint.isPathIgnored('dist/sw.js'), true);
  assert.equal(await eslint.isPathIgnored('coverage/lcov-report/index.js'), true);
  assert.equal(await eslint.isPathIgnored('src/App.jsx'), false);
});

function collectFirstPartySource() {
  const scanExts = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx', '.css']);
  const chunks = [];
  for (const dir of ['src', 'api', 'scripts']) {
    const abs = path.join(rootDir, dir);
    if (!existsSync(abs)) continue;
    for (const entry of readdirSync(abs, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !scanExts.has(path.extname(entry.name))) continue;
      chunks.push(readFileSync(path.join(entry.parentPath ?? entry.path, entry.name), 'utf8'));
    }
  }
  for (const file of ['index.html', 'vite.config.js', 'tailwind.config.js', 'postcss.config.js', 'components.json']) {
    const abs = path.join(rootDir, file);
    if (existsSync(abs)) chunks.push(readFileSync(abs, 'utf8'));
  }
  return chunks.join('\n');
}

test('every declared runtime dependency is imported by first-party code', () => {
  const source = collectFirstPartySource();
  const referencesSpecifier = dep =>
    source.includes(`'${dep}'`) ||
    source.includes(`"${dep}"`) ||
    source.includes(`'${dep}/`) ||
    source.includes(`"${dep}/`);

  const unused = Object.keys(pkg.dependencies ?? {}).filter(dep => !referencesSpecifier(dep));
  assert.deepEqual(unused, [], `dependencies declared but never imported: ${unused.join(', ')}`);
});
