import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ADMIN_SECTION_KEYS,
  DEFAULT_ADMIN_SECTION,
  getAdminSectionFromPath,
  getAdminSectionPath,
  isAdminSection
} from '../src/lib/adminNavigation.js';

test('recognises every supported admin section', () => {
  assert.equal(DEFAULT_ADMIN_SECTION, 'overview');
  assert.equal(new Set(ADMIN_SECTION_KEYS).size, ADMIN_SECTION_KEYS.length);
  assert.equal(isAdminSection('events'), true);
  assert.equal(isAdminSection('not-a-tool'), false);
});

test('maps durable admin URLs to their operational sections', () => {
  assert.equal(getAdminSectionFromPath('/admin'), 'overview');
  assert.equal(getAdminSectionFromPath('/admin/events'), 'events');
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
