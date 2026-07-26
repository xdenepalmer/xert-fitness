import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const WEB_PREFIXES = ['api/', 'public/', 'src/'];
const NON_WEB_ROOT_FILES = new Set([
  '.gitignore',
  'AGENTS.md',
  'CLAUDE.md',
  'README.md',
  'codemagic.yaml',
]);
const WEB_FILES = new Set([
  'index.html',
  'package-lock.json',
  'package.json',
  'postcss.config.js',
  'scripts/vercel-ignore-build.mjs',
  'tailwind.config.js',
  'vercel.json',
  'vite.config.js',
]);

export function shouldBuildWeb(changedFiles) {
  return changedFiles.some((file) => {
    const normalized = String(file).replaceAll('\\', '/').replace(/^\.\//, '');
    if (!normalized.includes('/')) {
      return !NON_WEB_ROOT_FILES.has(normalized);
    }
    return WEB_FILES.has(normalized)
      || WEB_PREFIXES.some((prefix) => normalized.startsWith(prefix));
  });
}

function changedFilesForHead() {
  const result = spawnSync(
    'git',
    ['diff', '--name-only', 'HEAD^', 'HEAD', '--'],
    { encoding: 'utf8' },
  );

  if (result.status !== 0) {
    const detail = result.stderr?.trim() || `git exited with ${result.status ?? 'no status'}`;
    console.log(`Vercel web-impact check unavailable (${detail}); proceeding with the build.`);
    return null;
  }

  return result.stdout
    .split(/\r?\n/)
    .map((file) => file.trim())
    .filter(Boolean);
}

export function run() {
  const changedFiles = changedFilesForHead();
  if (changedFiles === null) return 1;

  if (shouldBuildWeb(changedFiles)) {
    console.log('Web runtime or deployment configuration changed; proceeding with the build.');
    return 1;
  }

  console.log(
    `No web-impacting changes in ${changedFiles.length} changed file`
      + `${changedFiles.length === 1 ? '' : 's'}; skipping this Vercel build.`,
  );
  return 0;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  process.exitCode = run();
}
