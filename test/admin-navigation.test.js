import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ADMIN_SECTION_KEYS,
  DEFAULT_ADMIN_SECTION,
  getAdminSectionFromPath,
  getAdminSectionPath,
  isAdminSection
} from '../src/lib/adminNavigation.js';
import { readFile } from 'node:fs/promises';

test('recognises every supported admin section', () => {
  assert.equal(DEFAULT_ADMIN_SECTION, 'overview');
  assert.equal(new Set(ADMIN_SECTION_KEYS).size, ADMIN_SECTION_KEYS.length);
  assert.equal(isAdminSection('events'), true);
  assert.equal(isAdminSection('announcements'), true);
  assert.equal(isAdminSection('not-a-tool'), false);
});

test('maps durable admin URLs to their operational sections', () => {
  assert.equal(getAdminSectionFromPath('/admin'), 'overview');
  assert.equal(getAdminSectionFromPath('/admin/audit'), 'audit');
  assert.equal(getAdminSectionFromPath('/admin/events'), 'events');
  assert.equal(getAdminSectionFromPath('/admin/announcements'), 'announcements');
  assert.equal(getAdminSectionFromPath('/admin/gym-members/'), 'gym-members');
  assert.equal(getAdminSectionFromPath('/admin/bookings?status=requested'), 'bookings');
});

test('canonicalises unknown sections without exposing arbitrary paths', () => {
  assert.equal(getAdminSectionFromPath('/admin/not-a-tool'), 'overview');
  assert.equal(getAdminSectionFromPath('/elsewhere/events'), 'overview');
  assert.equal(getAdminSectionPath('overview'), '/admin');
  assert.equal(getAdminSectionPath('events'), '/admin/events');
  assert.equal(getAdminSectionPath('not-a-tool'), '/admin');
});

test('builds encoded deep-action paths and omits empty values', () => {
  assert.equal(
    getAdminSectionPath('gym-members', { member: 'member/id 42', ignored: '' }),
    '/admin/gym-members?member=member%2Fid+42'
  );
  assert.equal(getAdminSectionPath('events', { action: 'create' }), '/admin/events?action=create');
});

test('dirty same-section actions require confirmation before replacing an editor', async () => {
  const [commandCentre, calendar] = await Promise.all([
    readFile(new URL('../src/pages/AdminCommandCentre.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/admin/ClassCalendarAdmin.jsx', import.meta.url), 'utf8'),
  ]);
  const sameSection = commandCentre.slice(
    commandCentre.indexOf('const setSection = useCallback'),
    commandCentre.indexOf('const confirmLeaveAdmin'),
  );
  const editor = calendar.slice(
    calendar.indexOf('function SessionEditor'),
    calendar.indexOf('function RepeatModal'),
  );

  assert.match(sameSection, /nextSection === section[\s\S]*hasUnsavedChanges && nextPath !== currentPath[\s\S]*setPendingNavigation/);
  assert.match(commandCentre, /ClassCalendarAdmin[\s\S]*onDirtyChange=\{setHasUnsavedChanges\}/);
  assert.match(editor, /classSessionEditorIsDirty\(form, session\)/);
  assert.match(editor, /Discard unsaved class changes\?/);
  assert.match(editor, /max-h-\[100dvh\]/);
  assert.match(editor, /min-h-0 flex-1 space-y-4 overflow-y-auto/);
  assert.match(editor, /safe-area-inset-bottom/);
  assert.match(editor, /sm:max-h-\[90vh\]/);
  assert.match(calendar, /key=\{editingSession\?\.id \|\| 'new-class'\}/);
});
