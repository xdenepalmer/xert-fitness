import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const adminLayout = readFileSync(new URL('../src/components/admin/AdminLayout.jsx', import.meta.url), 'utf8');
const commandPalette = readFileSync(new URL('../src/components/admin/CommandPalette.jsx', import.meta.url), 'utf8');
const commandCentre = readFileSync(new URL('../src/pages/AdminCommandCentre.jsx', import.meta.url), 'utf8');
const nativeHome = readFileSync(new URL('../ios/XertFitnessApp/XertFitnessApp/Views/HomeView.swift', import.meta.url), 'utf8');

test('mobile admin navigation is hidden from focus until opened', () => {
  assert.match(adminLayout, /id="admin-navigation"/);
  assert.match(adminLayout, /aria-hidden=\{!desktopNavigation && !sidebarOpen/);
  assert.match(adminLayout, /sidebar\.setAttribute\('inert', ''\)/);
  assert.match(adminLayout, /sidebar\.removeAttribute\('inert'\)/);
  assert.match(adminLayout, /aria-expanded=\{sidebarOpen\}/);
  assert.match(adminLayout, /aria-controls="admin-navigation"/);
  assert.match(adminLayout, /aria-current=\{active \? 'page'/);
});

test('mobile admin navigation traps focus, locks scroll and restores the trigger', () => {
  assert.match(adminLayout, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(adminLayout, /event\.key === 'Escape'/);
  assert.match(adminLayout, /event\.key !== 'Tab'/);
  assert.match(adminLayout, /menuButtonRef\.current\?\.focus\(\)/);
  assert.match(adminLayout, /querySelectorAll\('button:not\(\[disabled\]\), a\[href\]'/);
  assert.match(adminLayout, /window\.matchMedia\('\(min-width: 1024px\)'\)/);
});

test('admin navigation stays open when unsaved changes cancel a section change', () => {
  assert.match(adminLayout, /const navigated = onSectionChange\(item\.key\)/);
  assert.match(adminLayout, /if \(navigated !== false\) setSidebarOpen\(false\)/);
  assert.match(commandPalette, /const navigated = onNavigate\(sectionKey, params\)/);
  assert.match(commandPalette, /if \(navigated !== false\) onOpenChange\(false\)/);
  assert.match(adminLayout, /setSidebarOpen\(false\);[\s\S]*setPaletteOpen\(false\);[\s\S]*\}, \[activeSection\]\)/);
  assert.match(commandCentre, /setPendingNavigation\(\{[\s\S]*kind: 'section'/);
  assert.match(commandCentre, /cancelLabel="Keep editing"/);
  assert.match(commandCentre, /confirmLabel="Discard changes"/);
  assert.match(commandCentre, /pending\.action\?\.\(\)/);
  assert.doesNotMatch(commandCentre, /window\.confirm/);
});

test('native home supports the pull-to-retry interaction it advertises', () => {
  assert.match(nativeHome, /\.refreshable \{[\s\S]*await store\.refresh\(\)/);
});
