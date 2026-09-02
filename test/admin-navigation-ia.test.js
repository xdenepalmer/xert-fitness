import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Command Centre separates communication from website and form management', () => {
  const web = read('../src/lib/adminWorkspaces.js');
  const native = read('../ios/XertFitnessApp/XertFitnessApp/OwnerNavigation.swift');

  assert.match(web, /key: 'communications',[\s\S]*label: 'Communications',[\s\S]*Texts and app notices/);
  assert.match(web, /key: 'website',[\s\S]*label: 'Website & forms',[\s\S]*Forms, pages, coaches and events/);
  assert.match(web, /key: 'communications',[\s\S]*key: 'sms',[\s\S]*key: 'announcements'/);
  assert.match(web, /key: 'website',[\s\S]*key: 'forms',[\s\S]*key: 'content',[\s\S]*key: 'coaches',[\s\S]*key: 'events'/);
  assert.doesNotMatch(web, /key: 'messages'/);
  assert.match(web, /communications: 'Comms', website: 'Website'/);
  assert.match(native, /case communications = "Communications"/);
  assert.match(native, /case website = "Website & forms"/);
  assert.match(native, /case \.sms, \.notices: return \.communications/);
  assert.match(native, /case \.forms, \.siteContent, \.team, \.events: return \.website/);
});
