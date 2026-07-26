import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const calendar = read('../src/components/admin/ClassCalendarAdmin.jsx');
const commandCentre = read('../src/pages/AdminCommandCentre.jsx');

test('class editor identity follows the class being edited', () => {
  assert.match(calendar, /<SessionEditor[\s\S]*key=\{editingSession\?\.id \?\? 'new'\}/);
});

test('class drafts are protected locally and through admin navigation', () => {
  assert.match(calendar, /onDirtyChange = NOOP/);
  assert.match(calendar, /onDirtyChange\(dirty\)/);
  assert.match(calendar, /Unsaved changes/);
  assert.match(calendar, /Discard class changes\?/);
  assert.match(calendar, /AdminConfirmDialog/);
  assert.match(calendar, /Keep editing/);
  assert.match(commandCentre, /<ClassCalendarAdmin[^>]+onDirtyChange=\{setHasUnsavedChanges\}/);
});

test('same-section quick actions cannot bypass the unsaved-change guard', () => {
  const start = commandCentre.indexOf('const setSection = useCallback');
  const end = commandCentre.indexOf('const confirmLeaveAdmin', start);
  const setSection = commandCentre.slice(start, end);

  assert.ok(setSection.indexOf('if (hasUnsavedChanges)') < setSection.indexOf('if (nextSection === section)'));
});
