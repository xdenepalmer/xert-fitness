import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const PRECACHE_MARKER = 'self.__XERT_BUILD_ASSETS__ = [];';
const PRECACHE_ASSIGNMENT = 'self.__XERT_BUILD_ASSETS__ = ';
const CACHE_MARKER = "const CACHE_NAME = 'xert-build-pending';";
const PRECACHE_EXTENSIONS = new Set(['.css', '.js']);
const REQUIRED_ICON_SIZES = [192, 512];

function releaseShellPaths(workerSource) {
  const declaration = workerSource.match(/const APP_SHELL\s*=\s*\[([\s\S]*?)\];/);
  if (!declaration) throw new Error('PWA app-shell declaration is unreadable.');
  const declaredPaths = [...declaration[1].matchAll(/['"](\/[^'"]+)['"]/g)]
    .map(match => match[1]);
  return [...new Set(['/index.html', ...declaredPaths])].sort();
}

async function readReleaseShell(distRoot, workerSource) {
  const resolvedRoot = path.resolve(distRoot);
  return Promise.all(releaseShellPaths(workerSource).map(async shellPath => {
    const absolute = path.resolve(resolvedRoot, shellPath.replace(/^\/+/, ''));
    if (!absolute.startsWith(`${resolvedRoot}${path.sep}`)) {
      throw new Error(`PWA app-shell file escapes dist: ${shellPath}`);
    }
    return [shellPath, await readFile(absolute)];
  }));
}

async function listBuildAssets(directory, root = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async entry => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return listBuildAssets(absolute, root);
    if (!entry.isFile() || !PRECACHE_EXTENSIONS.has(path.extname(entry.name))) return [];
    return [`/${path.relative(path.dirname(root), absolute).split(path.sep).join('/')}`];
  }));
  return nested.flat();
}

function pngDimensions(buffer, label) {
  const signature = '89504e470d0a1a0a';
  if (buffer.length < 24 || buffer.subarray(0, 8).toString('hex') !== signature) {
    throw new Error(`${label} is not a readable PNG.`);
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function verifyInstallableManifest(distRoot, manifestName) {
  const manifest = JSON.parse(await readFile(path.join(distRoot, manifestName), 'utf8'));
  for (const purpose of ['any', 'maskable']) {
    for (const requiredSize of REQUIRED_ICON_SIZES) {
      const declaredSize = `${requiredSize}x${requiredSize}`;
      const icon = manifest.icons?.find(candidate => {
        const purposes = String(candidate.purpose || 'any').split(/\s+/);
        return purposes.includes(purpose) && String(candidate.sizes || '').split(/\s+/).includes(declaredSize);
      });
      if (!icon) throw new Error(`${manifestName} has no ${purpose} ${declaredSize} icon.`);

      const iconPath = path.resolve(distRoot, String(icon.src).replace(/^\/+/, ''));
      if (!iconPath.startsWith(`${path.resolve(distRoot)}${path.sep}`)) throw new Error(`${manifestName} icon escapes dist: ${icon.src}`);
      const dimensions = pngDimensions(await readFile(iconPath), `${manifestName} ${icon.src}`);
      if (dimensions.width !== requiredSize || dimensions.height !== requiredSize) {
        throw new Error(`${manifestName} declares ${declaredSize} for ${icon.src}, but the PNG is ${dimensions.width}x${dimensions.height}.`);
      }
    }
  }
}

export async function injectPwaPrecache({ distRoot = path.resolve(process.cwd(), 'dist'), verifyManifests = true } = {}) {
  const assetsRoot = path.join(distRoot, 'assets');
  const workerPath = path.join(distRoot, 'sw.js');
  const [workerSource, assets] = await Promise.all([
    readFile(workerPath, 'utf8'),
    listBuildAssets(assetsRoot),
    verifyManifests
      ? Promise.all([
        verifyInstallableManifest(distRoot, 'manifest.json'),
        verifyInstallableManifest(distRoot, 'admin-manifest.json'),
      ])
      : Promise.resolve(),
  ]);

  if (!workerSource.includes(PRECACHE_MARKER)) {
    throw new Error(`PWA precache marker is missing from ${workerPath}`);
  }
  if (!workerSource.includes(CACHE_MARKER)) {
    throw new Error(`PWA cache marker is missing from ${workerPath}`);
  }

  const expectedAssets = [...new Set(assets)].sort();
  if (expectedAssets.length === 0) throw new Error('Vite emitted no JavaScript or CSS assets to precache.');
  const releaseShell = await readReleaseShell(distRoot, workerSource);
  const releaseHash = createHash('sha256')
    .update(workerSource)
    .update('\n')
    .update(expectedAssets.join('\n'));
  for (const [shellPath, content] of releaseShell) {
    releaseHash.update('\n').update(shellPath).update('\0').update(content);
  }
  const buildID = releaseHash.digest('hex').slice(0, 16);

  const injectedSource = workerSource
    .replace(CACHE_MARKER, `const CACHE_NAME = 'xert-build-${buildID}';`)
    .replace(PRECACHE_MARKER, `${PRECACHE_ASSIGNMENT}${JSON.stringify(expectedAssets)};`);
  await writeFile(workerPath, injectedSource, 'utf8');

  // Verify the actual emitted worker rather than trusting the replacement.
  const writtenSource = await readFile(workerPath, 'utf8');
  const assignmentStart = writtenSource.indexOf(PRECACHE_ASSIGNMENT);
  const assignmentEnd = writtenSource.indexOf(';', assignmentStart);
  if (assignmentStart < 0 || assignmentEnd < 0) throw new Error('Built PWA precache assignment is unreadable.');
  const injectedAssets = JSON.parse(writtenSource.slice(assignmentStart + PRECACHE_ASSIGNMENT.length, assignmentEnd));
  const missingAssets = expectedAssets.filter(asset => !injectedAssets.includes(asset));
  if (missingAssets.length > 0) {
    throw new Error(`Built service worker omitted assets: ${missingAssets.join(', ')}`);
  }

  const lazyAdminAssets = expectedAssets.filter(asset => /Admin|admin/i.test(path.basename(asset)) && asset.endsWith('.js'));
  if (lazyAdminAssets.length === 0) {
    throw new Error('Built service worker has no lazy admin JavaScript chunks; refusing an incomplete offline shell.');
  }
  if (!writtenSource.includes(`const CACHE_NAME = 'xert-build-${buildID}';`)) {
    throw new Error('Built service worker did not receive its release-scoped cache name.');
  }

  process.stdout.write(`PWA precache verified: ${expectedAssets.length} JS/CSS assets (${lazyAdminAssets.length} admin chunks).\n`);
  return { assets: expectedAssets, lazyAdminAssets, buildID };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await injectPwaPrecache();
}
