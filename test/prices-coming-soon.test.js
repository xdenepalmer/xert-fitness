import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { pricesComingSoon, normalizeLaunchSettings, launchSettingsChanged } from '../src/lib/launchSettings.js';

// adminData.js pulls in the Vite "@/" alias chain that node --test can't resolve,
// so its default is asserted from source rather than imported.
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');

test('pricesComingSoon hides prices unless explicitly disabled (fails safe)', () => {
  assert.equal(pricesComingSoon({ prices_coming_soon: false }), false, 'explicit false reveals prices');
  assert.equal(pricesComingSoon({ prices_coming_soon: true }), true);
  // Missing column / unsaved row / undefined settings all keep prices hidden.
  assert.equal(pricesComingSoon({}), true);
  assert.equal(pricesComingSoon(undefined), true);
  assert.equal(pricesComingSoon(null), true);
});

test('the flag defaults to hidden and survives the save whitelist', () => {
  // Fresh settings hide prices (asserted from source; see import note above).
  assert.match(read('../src/lib/adminData.js'), /prices_coming_soon:\s*true/);
  // normalizeLaunchSettings whitelists fields written on save — the flag must be included.
  const saved = normalizeLaunchSettings({ target_launch_date: '2026-08-01', prices_coming_soon: false });
  assert.equal(saved.prices_coming_soon, false);
  const savedDefault = normalizeLaunchSettings({ target_launch_date: '2026-08-01' });
  assert.equal(savedDefault.prices_coming_soon, true, 'omitted flag normalizes to hidden');
});

test('toggling the flag registers as a dirty change in the admin form', () => {
  const base = { target_launch_date: '2026-08-01', prices_coming_soon: true };
  assert.equal(launchSettingsChanged(base, base), false);
  assert.equal(launchSettingsChanged({ ...base, prices_coming_soon: false }, base), true);
});

test('both public pricing surfaces gate the amount behind the flag', () => {
  for (const src of ['../src/components/public/SessionPacks.jsx', '../src/pages/Booking.jsx']) {
    const source = read(src);
    assert.match(source, /pricesComingSoon/, `${src} must read the flag`);
    assert.match(source, /PRICES_COMING_SOON_LABEL/, `${src} must render the coming-soon label`);
    assert.match(source, /comingSoon \?/, `${src} must branch on the flag`);
    // Default state is hidden so prices never flash before settings resolve.
    assert.match(source, /useState\(true\)/, `${src} must default comingSoon to hidden`);
  }
});

test('hidden prices never expose a purchase path', () => {
  const booking = read('../src/pages/Booking.jsx');
  // The card CTA swaps to an interest link while prices are hidden…
  assert.match(booking, /comingSoon \? \(\s*<Link\s*to="\/contact"/);
  assert.match(booking, /Register Your Interest/);
  // …and handleBuy refuses to start checkout even if the UI drifts: the
  // comingSoon guard must appear inside the function before any await.
  assert.match(booking, /const handleBuy = async \(product\) => \{[\s\S]{0,400}?if \(comingSoon\) \{/);
});

test('the admin command centre exposes a prices toggle', () => {
  const settings = read('../src/components/admin/SoftLaunchSettings.jsx');
  assert.match(settings, /field="prices_coming_soon"/);
  assert.match(settings, /Prices coming soon/i);
});

test('desktop payment activation stages every pricing change before guarded cutover', () => {
  const settings = read('../src/components/admin/SoftLaunchSettings.jsx');

  assert.match(settings, /const stagedDraft = \{ \.\.\.normalized, payments_enabled: false \}/);
  assert.match(settings, /updateSoftLaunchSettings\(stagedDraft, savedSettings\)[\s\S]*setSavedSettings\(staged\)/);
  assert.match(settings, /const activationDraft = \{ \.\.\.staged, payments_enabled: true \}/);
  assert.match(settings, /activateSessionPackPayments\(activationDraft, staged\)/);
  assert.match(settings, /catch \(activationError\)[\s\S]*reconcilePaymentActivation\(activationError\)/);
  assert.match(settings, /getSoftLaunchSettings\(\)[\s\S]*setSettings\(liveSettings\)[\s\S]*setSavedSettings\(liveSettings\)/);
  assert.match(settings, /if \(liveSettings\.payments_enabled\) return liveSettings/);
  assert.match(settings, /Refresh Platform Controls before trying again/);
});

test('the native owner controls preserve pricing visibility across every save path', () => {
  const models = read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift');
  const api = read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift');
  const store = read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift');
  const view = read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift');

  assert.match(models, /struct AdminPlatformSettings:[\s\S]*var prices_coming_soon: Bool/);
  assert.match(api, /select[^\n]*prices_coming_soon/);
  assert.match(api, /AdminSettingsUpdate\([\s\S]*prices_coming_soon: settings\.prices_coming_soon/);
  assert.match(api, /private struct AdminSettingsUpdate:[\s\S]*let prices_coming_soon: Bool/);
  assert.match(store, /var stagedDraft = draft[\s\S]*stagedDraft\.payments_enabled = false[\s\S]*adminUpdatePlatformSettings[\s\S]*settings = staged[\s\S]*activationDraft\.payments_enabled = true[\s\S]*adminActivatePlatformPayments/);
  assert.match(store, /catch let activationError[\s\S]*adminPlatformSettings\(session: session\)[\s\S]*settings = reconciled[\s\S]*guard reconciled\.payments_enabled/);
  assert.match(store, /Payment activation could not be verified\. Do not try again until Platform Controls refreshes/);
  assert.match(view, /Toggle\("Show 'Coming soon' instead of prices", isOn: settingBinding\(\\\.prices_coming_soon\)\)/);
});
