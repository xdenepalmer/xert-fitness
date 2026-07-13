import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const layer = readFileSync(new URL('../src/lib/adminDialogLayer.js', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../src/components/admin/AdminLayout.jsx', import.meta.url), 'utf8');
const adminFiles = [
  'AnnouncementsManager.jsx',
  'AvailabilityManager.jsx',
  'BookingRequestsTable.jsx',
  'ClassCalendarAdmin.jsx',
  'CoachesManager.jsx',
  'EventsManager.jsx',
  'LeadTable.jsx',
  'MembersManager.jsx',
  'OrdersManager.jsx',
  'ProductsManager.jsx',
  'PTRequestsTable.jsx',
].map(file => readFileSync(new URL(`../src/components/admin/${file}`, import.meta.url), 'utf8'));

test('the admin workspace centrally observes every custom modal dialog', () => {
  assert.match(layout, /ref=\{workspaceRef\} data-admin-workspace/);
  assert.match(layout, /useAdminDialogLayer\(workspaceRef\)/);
  assert.match(layer, /workspace\.querySelectorAll\(DIALOG_SELECTOR\)/);
  assert.match(layer, /new MutationObserver\(syncDialog\)/);
  assert.ok(adminFiles.reduce((count, source) => count + (source.match(/aria-modal="true"/g) || []).length, 0) >= 17);
});

test('custom admin dialogs lock background scroll and restore their trigger', () => {
  assert.match(layer, /restoreFocus = document\.activeElement/);
  assert.match(layer, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(layer, /document\.body\.style\.overflow = previousOverflow/);
  assert.match(layer, /target\?\.isConnected/);
  assert.match(layer, /target\.focus\(\)/);
});

test('custom admin dialogs receive initial focus and a complete tab boundary', () => {
  assert.match(layer, /dialog\.contains\(document\.activeElement\)/);
  assert.match(layer, /event\.key !== 'Tab'/);
  assert.match(layer, /event\.shiftKey/);
  assert.match(layer, /last\.focus\(\)/);
  assert.match(layer, /first\.focus\(\)/);
  assert.match(layer, /activeDialog\.focus\(\)/);
});
