import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const manager = readFileSync(new URL('../src/components/admin/AnnouncementsManager.jsx', import.meta.url), 'utf8');
const commandCentre = readFileSync(new URL('../src/pages/AdminCommandCentre.jsx', import.meta.url), 'utf8');

test('announcement editor reports exact unsaved form state to the admin workspace', () => {
  assert.match(manager, /onDirtyChange = NOOP/);
  assert.match(manager, /Object\.keys\(EMPTY_FORM\)\.some\(key => form\[key\] !== editorBaseline\[key\]\)/);
  assert.match(manager, /onDirtyChange\(editorDirty\)/);
  assert.match(manager, /onDirtyChange\(false\)/);
  assert.match(commandCentre, /<AnnouncementsManager[\s\S]*onDirtyChange=\{setHasUnsavedChanges\}/);
  assert.match(commandCentre, /window\.addEventListener\('beforeunload'/);
});

test('every announcement editor exit preserves dirty work until explicitly discarded', () => {
  assert.match(manager, /function requestCloseEditor|const requestCloseEditor/);
  assert.match(manager, /if \(editorDirty\)[\s\S]*setConfirmDiscardEditor\(true\)/);
  assert.match(manager, /event\.target === event\.currentTarget\) requestCloseEditor\(\)/);
  assert.match(manager, /onClick=\{requestCloseEditor\}/);
  assert.match(manager, /title="Discard announcement changes\?"/);
  assert.match(manager, /cancelLabel="Keep editing"/);
  assert.match(manager, /confirmLabel="Discard changes"/);
});

test('announcement delete and archive use the shared accessible confirmation dialog', () => {
  assert.match(manager, /import AdminConfirmDialog/);
  assert.ok((manager.match(/<AdminConfirmDialog/g) || []).length >= 3);
  assert.doesNotMatch(manager, /role="alertdialog"/);
  assert.doesNotMatch(manager, /(?:window\.)?confirm\s*\(/);
});
