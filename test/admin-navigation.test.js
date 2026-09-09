import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ADMIN_SECTION_KEYS,
  DEFAULT_ADMIN_SECTION,
  getAdminSectionFromPath,
  getAdminSectionPath,
  adminSearchAfterIntent,
  isAdminSection
} from '../src/lib/adminNavigation.js';
import { readFile } from 'node:fs/promises';

test('consuming a calendar intent preserves filters and unknown workspace parameters', () => {
  const result = new URLSearchParams(adminSearchAfterIntent('?action=attendance&session=class-1&calendarSearch=engine&calendarType=XERT+Engine&workspace=owner&source=today&member=untouched', 'calendar'));
  assert.equal(result.has('action'), false);
  assert.equal(result.has('session'), false);
  assert.equal(result.get('calendarSearch'), 'engine');
  assert.equal(result.get('calendarType'), 'XERT Engine');
  assert.equal(result.get('workspace'), 'owner');
  assert.equal(result.get('source'), 'today');
  assert.equal(result.get('member'), 'untouched');
  assert.equal(adminSearchAfterIntent('?member=1&source=today', 'gym-members'), 'source=today');
});

test('recognises every supported admin section', () => {
  assert.equal(DEFAULT_ADMIN_SECTION, 'overview');
  assert.equal(new Set(ADMIN_SECTION_KEYS).size, ADMIN_SECTION_KEYS.length);
  assert.equal(isAdminSection('events'), true);
  assert.equal(isAdminSection('announcements'), true);
  assert.equal(isAdminSection('forms'), true);
  assert.equal(isAdminSection('not-a-tool'), false);
});

test('maps durable admin URLs to their operational sections', () => {
  assert.equal(getAdminSectionFromPath('/admin'), 'overview');
  assert.equal(getAdminSectionFromPath('/admin/audit'), 'audit');
  assert.equal(getAdminSectionFromPath('/admin/events'), 'events');
  assert.equal(getAdminSectionFromPath('/admin/announcements'), 'announcements');
  assert.equal(getAdminSectionFromPath('/admin/forms'), 'forms');
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
  const [commandCentre, calendar, editors, drawer, kitStyles] = await Promise.all([
    readFile(new URL('../src/pages/AdminCommandCentre.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/admin/ClassCalendarAdmin.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/admin/ClassCalendarEditors.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/admin/ui/AdminDrawer.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/admin/ui/kit.css', import.meta.url), 'utf8'),
  ]);
  const sameSection = commandCentre.slice(
    commandCentre.indexOf('const setSection = useCallback'),
    commandCentre.indexOf('const confirmLeaveAdmin'),
  );
  const editor = editors.slice(
    editors.indexOf('function SessionEditor'),
    editors.indexOf('function RepeatModal'),
  );

  assert.match(sameSection, /nextSection === section[\s\S]*hasUnsavedChanges && nextPath !== currentPath[\s\S]*setPendingNavigation/);
  assert.match(commandCentre, /ClassCalendarAdmin[\s\S]*onDirtyChange=\{setHasUnsavedChanges\}/);
  assert.match(editor, /classSessionEditorIsDirty\(form, session\)/);
  assert.match(editor, /Discard unsaved class changes\?/);
  assert.match(editor, /<AdminDrawer open onOpenChange=\{open => \{ if \(!open\) requestCancel\(\); \}\}/);
  assert.match(editor, /if \(saving\) return/);
  assert.match(editor, /<AdminDrawer role="alertdialog"/);
  assert.match(drawer, /node\.showModal\(\)/);
  assert.match(drawer, /onCancel=\{event => \{event.preventDefault\(\); onOpenChange\(false\);\}\}/);
  assert.match(kitStyles, /height: 100dvh; max-height: 100dvh/);
  assert.match(kitStyles, /\.admin-drawer-content \{ min-height: 0; flex: 1; overflow-y: auto/);
  assert.match(kitStyles, /safe-area-inset-bottom/);
  assert.match(calendar, /key=\{editingSession\?\.id \|\| 'new-class'\}/);
});
