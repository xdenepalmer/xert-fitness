import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const nav = readFileSync(new URL('../src/components/public/PublicNav.jsx', import.meta.url), 'utf8');
const memberForm = readFileSync(new URL('../src/components/public/MemberInterestForm.jsx', import.meta.url), 'utf8');
const events = readFileSync(new URL('../src/pages/Events.jsx', import.meta.url), 'utf8');
const formSources = [
  '../src/components/public/TrainerInterestForm.jsx',
  '../src/components/public/PartnerInterestForm.jsx',
  '../src/components/public/BookingRequestForm.jsx',
  '../src/components/public/PTRequestForm.jsx',
].map(path => readFileSync(new URL(path, import.meta.url), 'utf8'));

test('mobile navigation exposes its name, expanded state, controlled menu, and minimum target', () => {
  assert.match(nav, /aria-label=\{menuOpen \? 'Close navigation menu' : 'Open navigation menu'\}/);
  assert.match(nav, /aria-expanded=\{menuOpen\}/);
  assert.match(nav, /aria-controls="mobile-navigation"/);
  assert.match(nav, /min-w-11 min-h-11/);
  assert.match(nav, /id="mobile-navigation"/);
});

test('member contact fields use associated labels, stable names, and required semantics', () => {
  for (const field of ['full-name', 'email', 'phone', 'suburb']) {
    assert.match(memberForm, new RegExp(`htmlFor="member-${field}"`));
    assert.match(memberForm, new RegExp(`id="member-${field}"`));
  }
  assert.match(memberForm, /id="member-email" name="email" required autoComplete="email"/);
  assert.match(memberForm, /id="member-phone" name="phone" required autoComplete="tel"/);
});

test('event filters and actions provide full-size mobile targets', () => {
  assert.ok((events.match(/min-h-11/g) || []).length >= 5);
  assert.match(events, /Add to calendar/);
  assert.match(events, /Train for this/);
});

test('every remaining acquisition form names custom inputs and non-input controls', () => {
  for (const source of formSources) {
    assert.match(source, /<input aria-label=\{props\['aria-label'\] \|\| props\.placeholder\}/);
    for (const tag of source.match(/<(select|textarea)\b[^>]*>/g) || []) {
      assert.match(tag, /aria-label=/);
    }
  }
});
