import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { injectPwaPrecache } from '../scripts/inject-pwa-precache.mjs';

const source = relativePath => readFile(new URL(relativePath, import.meta.url), 'utf8');
const pngSize = buffer => ({ width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) });

test('mobile command centre has a safe-area owner dock and thumb-reachable workspace sheet', async () => {
  const [layout, workspaces, styles, availability] = await Promise.all([
    source('../src/components/admin/AdminLayout.jsx'),
    source('../src/lib/adminWorkspaces.js'),
    source('../src/index.css'),
    source('../src/components/admin/AvailabilityManager.jsx'),
  ]);

  assert.match(workspaces, /ADMIN_MOBILE_WORKSPACES/);
  assert.match(layout, /data-admin-mobile-dock/);
  assert.match(layout, /aria-label="Owner shortcuts"/);
  assert.match(layout, /grid grid-cols-4/);
  assert.match(layout, /pb-\[max\(0\.35rem,env\(safe-area-inset-bottom\)\)\]/);
  assert.match(layout, /pt-\[max\(0\.625rem,env\(safe-area-inset-top\)\)\]/);
  assert.match(layout, /translate-y-full/);
  assert.match(layout, /max-h-\[min\(88dvh,48rem\)\]/);
  assert.match(layout, /data-admin-scroll-region/);
  assert.match(layout, /mainRef\.current\.scrollTop = 0/);
  assert.match(layout, /if \(!desktopNavigation\) window\.requestAnimationFrame\(\(\) => menuButtonRef\.current\?\.focus\(\)\)/);

  assert.match(styles, /@media \(max-width: 767px\), \(hover: none\) and \(pointer: coarse\)/);
  assert.match(styles, /\[data-admin-workspace\] :where\(input, select, textarea\)/);
  assert.match(styles, /font-size: 16px !important/);
  assert.match(availability, /max-h-\[100dvh\]/);
  assert.match(availability, /overflow-y-auto overscroll-contain/);
  assert.match(availability, /safe-area-inset-bottom/);
});

test('badge polling survives workspace switches without launching five new count queries', async () => {
  const layout = await source('../src/components/admin/AdminLayout.jsx');
  const badgeEffect = layout.slice(
    layout.indexOf('// Keep attention counts current'),
    layout.indexOf('const activeItem ='),
  );

  assert.match(badgeEffect, /void refreshBadges\(\)/);
  assert.match(badgeEffect, /ADMIN_BADGE_REFRESH_INTERVAL_MS/);
  assert.match(badgeEffect, /visibilitychange/);
  assert.match(badgeEffect, /\}, \[\]\);/);
  assert.doesNotMatch(badgeEffect, /\[activeSection\]/);
});

test('collapsed overview bundles load only when the owner opens their disclosure', async () => {
  const overview = await source('../src/components/admin/AdminOverview.jsx');
  const criticalLoad = overview.slice(
    overview.indexOf('const load = useCallback'),
    overview.indexOf('const loadActivity = useCallback'),
  );
  const activityLoad = overview.slice(
    overview.indexOf('const loadActivity = useCallback'),
    overview.indexOf('const loadReadiness = useCallback'),
  );
  const readinessLoad = overview.slice(
    overview.indexOf('const loadReadiness = useCallback'),
    overview.indexOf('useEffect(() => {'),
  );

  assert.doesNotMatch(criticalLoad, /getRecentOrders|adminRecentMembers|getAllCoaches|getAllEvents|getAllSiteContent|getAvailableSessions/);
  assert.match(activityLoad, /getRecentOrders\(6\)/);
  assert.match(activityLoad, /adminRecentMembers\(6\)/);
  assert.match(readinessLoad, /getAllCoaches\(\)/);
  assert.match(readinessLoad, /getAvailableSessions\(\)/);
  assert.match(overview, /if \(event\.currentTarget\.open\) void loadActivity\(\)/);
  assert.match(overview, /if \(event\.currentTarget\.open\) void loadReadiness\(\)/);
  assert.match(overview, /loadActivity\(\{ force: true \}\)/);
  assert.match(overview, /loadReadiness\(\{ force: true \}\)/);
  assert.match(activityLoad, /Date\.now\(\) - activityLoadedAtRef\.current < ADMIN_OVERVIEW_REFRESH_INTERVAL_MS/);
  assert.match(readinessLoad, /Date\.now\(\) - readinessLoadedAtRef\.current < ADMIN_OVERVIEW_REFRESH_INTERVAL_MS/);
  assert.match(overview, /Refresh planning/);
});

test('command search does not query the member directory for ordinary task searches', async () => {
  const palette = await source('../src/components/admin/CommandPalette.jsx');
  assert.match(palette, /const isMemberSearch = \/\^member\\s\+\/i\.test\(query\)/);
  assert.match(palette, /if \(!isMemberSearch \|\| memberQuery\.length < 2\)/);
  assert.match(palette, /type member \+ name/);
});

test('owner installs use route-owned admin metadata and installable intrinsic icon sizes', async () => {
  const [memberManifestSource, ownerManifestSource, prompt, routeMetadata, app] = await Promise.all([
    source('../public/manifest.json'),
    source('../public/admin-manifest.json'),
    source('../src/components/public/PWAInstallPrompt.jsx'),
    source('../src/lib/RouteMetadata.jsx'),
    source('../src/App.jsx'),
  ]);
  const memberManifest = JSON.parse(memberManifestSource);
  const ownerManifest = JSON.parse(ownerManifestSource);

  assert.equal(ownerManifest.id, '/admin');
  assert.equal(ownerManifest.start_url, '/admin');
  assert.equal(ownerManifest.display, 'standalone');
  assert.ok(ownerManifest.shortcuts.some(shortcut => shortcut.url === '/admin/gym-members'));
  assert.ok(memberManifest.shortcuts.some(shortcut => shortcut.url === '/admin'));
  for (const manifest of [memberManifest, ownerManifest]) {
    for (const purpose of ['any', 'maskable']) {
      for (const requiredSize of [192, 512]) {
        const declaredSize = `${requiredSize}x${requiredSize}`;
        const icon = manifest.icons.find(candidate => candidate.purpose === purpose && candidate.sizes === declaredSize);
        assert.ok(icon, `${manifest.name} needs a ${purpose} ${declaredSize} icon`);
        const buffer = await readFile(new URL(`../public${icon.src}`, import.meta.url));
        assert.deepEqual(pngSize(buffer), { width: requiredSize, height: requiredSize });
      }
    }
  }
  assert.match(routeMetadata, /useLayoutEffect/);
  assert.match(routeMetadata, /pathname === '\/admin' \|\| pathname\.startsWith\('\/admin\/'\)/);
  assert.match(routeMetadata, /adminRoute \? '\/admin-manifest\.json' : '\/manifest\.json'/);
  assert.match(routeMetadata, /adminRoute \? 'XERT Owner' : 'XERT'/);
  assert.ok(app.indexOf('<RouteMetadata />') < app.indexOf('<AppRoutes />'));
  assert.doesNotMatch(prompt, /setAttribute\('href', '\/admin-manifest\.json'\)/);
  assert.match(prompt, /Tap Share, then Add to Home Screen/);
});

test('PWA build injection precaches every emitted JS and CSS chunk, including lazy admin', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'xert-pwa-test-'));
  const assetsRoot = path.join(tempRoot, 'assets');
  const workerFixture = [
    "const CACHE_NAME = 'xert-build-pending';",
    "const APP_SHELL = ['/manifest.json'];",
    'self.__XERT_BUILD_ASSETS__ = [];',
    '',
  ].join('\n');
  try {
    await mkdir(assetsRoot, { recursive: true });
    await Promise.all([
      writeFile(path.join(tempRoot, 'sw.js'), workerFixture, 'utf8'),
      writeFile(path.join(tempRoot, 'index.html'), '<main>release one</main>', 'utf8'),
      writeFile(path.join(tempRoot, 'manifest.json'), '{"name":"Release one"}', 'utf8'),
      writeFile(path.join(assetsRoot, 'index-a1.js'), 'export {};', 'utf8'),
      writeFile(path.join(assetsRoot, 'AdminCommandCentre-b2.js'), 'export {};', 'utf8'),
      writeFile(path.join(assetsRoot, 'index-c3.css'), 'body{}', 'utf8'),
      writeFile(path.join(assetsRoot, 'ignored.png'), 'not-an-app-chunk', 'utf8'),
    ]);

    const result = await injectPwaPrecache({ distRoot: tempRoot, verifyManifests: false });
    const worker = await readFile(path.join(tempRoot, 'sw.js'), 'utf8');
    assert.deepEqual(result.assets, [
      '/assets/AdminCommandCentre-b2.js',
      '/assets/index-a1.js',
      '/assets/index-c3.css',
    ]);
    assert.deepEqual(result.lazyAdminAssets, ['/assets/AdminCommandCentre-b2.js']);
    assert.match(result.buildID, /^[a-f0-9]{16}$/);
    assert.match(worker, /AdminCommandCentre-b2\.js/);
    assert.match(worker, new RegExp(`const CACHE_NAME = 'xert-build-${result.buildID}'`));
    assert.doesNotMatch(worker, /xert-build-pending/);
    assert.doesNotMatch(worker, /ignored\.png/);

    await Promise.all([
      writeFile(path.join(tempRoot, 'sw.js'), workerFixture, 'utf8'),
      writeFile(path.join(tempRoot, 'index.html'), '<main>release two</main>', 'utf8'),
    ]);
    const htmlRelease = await injectPwaPrecache({ distRoot: tempRoot, verifyManifests: false });
    assert.notEqual(htmlRelease.buildID, result.buildID, 'index-only releases need a new worker cache');

    await Promise.all([
      writeFile(path.join(tempRoot, 'sw.js'), workerFixture, 'utf8'),
      writeFile(path.join(tempRoot, 'manifest.json'), '{"name":"Release two"}', 'utf8'),
    ]);
    const manifestRelease = await injectPwaPrecache({ distRoot: tempRoot, verifyManifests: false });
    assert.notEqual(
      manifestRelease.buildID,
      htmlRelease.buildID,
      'manifest-only releases need a new worker cache',
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('production build is wired to inject and verify the full offline asset list', async () => {
  const [packageSource, worker, injector] = await Promise.all([
    source('../package.json'),
    source('../public/sw.js'),
    source('../scripts/inject-pwa-precache.mjs'),
  ]);
  const packageJson = JSON.parse(packageSource);

  assert.match(packageJson.scripts.build, /inject-pwa-precache\.mjs/);
  assert.match(worker, /self\.__XERT_BUILD_ASSETS__ = \[\]/);
  assert.match(worker, /const CACHE_NAME = 'xert-build-pending'/);
  assert.match(worker, /\.\.\.BUILD_ASSETS/);
  assert.match(worker, /admin-manifest\.json/);
  assert.match(worker, /navigationPreload\?\.enable\(\)/);
  assert.match(worker, /Upgrades wait for existing tabs to close/);
  assert.doesNotMatch(worker, /skipWaiting/);
  assert.match(worker, /install step owns this release's cached HTML/);
  assert.match(
    worker,
    /const response = [\s\S]*if \(response\.ok\) return response;[\s\S]*return \(await cachedIndex\(\)\) \|\| response/,
  );
  assert.doesNotMatch(
    worker.match(/async function networkFirstNavigation[\s\S]*?\n\}/)?.[0] ?? '',
    /cache\.put\(['"]\/index\.html/,
  );
  assert.match(injector, /PRECACHE_EXTENSIONS = new Set\(\['\.css', '\.js'\]\)/);
  assert.match(injector, /createHash\('sha256'\)/);
  assert.match(injector, /readReleaseShell/);
  assert.match(injector, /xert-build-\$\{buildID\}/);
  assert.match(injector, /lazyAdminAssets\.length === 0/);
  assert.match(injector, /verifyInstallableManifest/);
  assert.match(injector, /PNG is \$\{dimensions\.width\}x\$\{dimensions\.height\}/);
});
