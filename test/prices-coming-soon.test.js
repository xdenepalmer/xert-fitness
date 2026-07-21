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

test('the admin command centre exposes a prices toggle', () => {
  const settings = read('../src/components/admin/SoftLaunchSettings.jsx');
  assert.match(settings, /field="prices_coming_soon"/);
  assert.match(settings, /Prices coming soon/i);
});
