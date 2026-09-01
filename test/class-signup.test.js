import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  BOOKING_MODE_LABELS,
  classSignupState,
  friendlySignupError,
  normalizeBookingMode,
  signupOutcomeMessage,
  spotsLabel,
  spotsRemaining,
} from '../src/lib/classSignup.js';

const FUTURE = new Date('2026-09-01T06:00:00Z').toISOString();
const NOW = new Date('2026-08-20T00:00:00Z');
const session = over => ({ id: 'c1', title: 'Foundation', status: 'published', start_time: FUTURE, capacity: 8, ...over });

test('each booking mode offers the matching public action', () => {
  const interest = classSignupState({ session: session({ booking_mode: 'interest_only' }), now: NOW });
  assert.equal(interest.kind, 'interest');
  assert.equal(interest.label, 'Register interest');
  assert.equal(interest.takesSpot, false);

  const request = classSignupState({ session: session({ booking_mode: 'request_to_book' }), now: NOW });
  assert.equal(request.kind, 'request');
  assert.equal(request.label, 'Request spot');
  assert.equal(request.takesSpot, false);

  const signup = classSignupState({
    session: session({ booking_mode: 'instant_book' }),
    availability: { spots_left: 3 },
    now: NOW,
  });
  assert.equal(signup.kind, 'signup');
  assert.equal(signup.label, 'Sign up');
  assert.equal(signup.takesSpot, true);
  assert.equal(signup.detail, '3 spots left');
});

test('sign-ups close once the last spot is taken', () => {
  const full = classSignupState({
    session: session({ booking_mode: 'instant_book' }),
    availability: { spots_left: 0 },
    now: NOW,
  });
  assert.equal(full.kind, 'full');
  assert.equal(full.actionable, false);
  assert.equal(full.takesSpot, false);

  // An admin-flagged full class closes even when a count is unavailable.
  const flagged = classSignupState({ session: session({ booking_mode: 'instant_book', status: 'full' }), now: NOW });
  assert.equal(flagged.kind, 'full');
});

test('an unknown remaining count never blocks a sign-up the database would allow', () => {
  const unlimited = classSignupState({
    session: session({ booking_mode: 'instant_book', capacity: null }),
    availability: { spots_left: null },
    now: NOW,
  });
  assert.equal(unlimited.kind, 'signup');
  assert.equal(unlimited.spotsLeft, null);
  assert.equal(unlimited.detail, null);
});

test('site-wide pause, Fitbox handoff and past classes take precedence', () => {
  const paused = classSignupState({
    session: session({ booking_mode: 'instant_book' }),
    bookingsEnabled: false,
    now: NOW,
  });
  assert.equal(paused.kind, 'interest');
  assert.equal(paused.takesSpot, false);

  const handed = classSignupState({
    session: session({ booking_mode: 'instant_book' }),
    fitbox: { active: true, url: 'https://portal.fitboxcorp.com/xert' },
    now: NOW,
  });
  assert.equal(handed.kind, 'fitbox');

  const blockedProvider = classSignupState({
    session: session({ booking_mode: 'instant_book' }),
    fitbox: { blocked: true, blockedReason: 'FitBox configuration is incomplete.' },
    now: NOW,
  });
  assert.equal(blockedProvider.kind, 'provider-unavailable');
  assert.equal(blockedProvider.actionable, false);
  assert.equal(blockedProvider.takesSpot, false);

  const past = classSignupState({
    session: session({ booking_mode: 'instant_book', start_time: '2026-08-19T06:00:00Z' }),
    now: NOW,
  });
  assert.equal(past.kind, 'past');
  assert.equal(past.actionable, false);
});

test('remaining places are clamped and labelled for members', () => {
  assert.equal(spotsRemaining({ spots_left: 4 }), 4);
  assert.equal(spotsRemaining({ spots_left: -2 }), 0);
  assert.equal(spotsRemaining({ spots_left: null }), null);
  assert.equal(spotsRemaining(null), null);
  assert.equal(spotsLabel({ spots_left: 1 }), '1 spot left');
  assert.equal(spotsLabel({ spots_left: 0 }), 'No spots left');
  assert.equal(spotsLabel({ spots_left: null }), null);
});

test('an unrecognised booking mode falls back to a staff-confirmed request', () => {
  assert.equal(normalizeBookingMode('nonsense'), 'request_to_book');
  assert.equal(normalizeBookingMode(undefined), 'request_to_book');
  assert.equal(normalizeBookingMode('instant_book'), 'instant_book');
  assert.equal(BOOKING_MODE_LABELS.instant_book, 'Sign-ups accepted (takes a spot)');
});

test('confirmation copy distinguishes a held spot from an enquiry', () => {
  const taken = signupOutcomeMessage({ took_spot: true, spots_left: 2 });
  assert.equal(taken.title, "You're in");
  assert.match(taken.body, /2 spots remaining/);

  assert.equal(signupOutcomeMessage({ took_spot: false, booking_mode: 'interest_only' }).title, 'Interest registered');
  assert.equal(signupOutcomeMessage({ took_spot: false, booking_mode: 'request_to_book' }).title, 'Request received');
});

test('database rejections become copy a member can act on', () => {
  assert.match(friendlySignupError(new Error('CLASS_FULL')), /just filled up/i);
  assert.match(friendlySignupError(new Error('ALREADY_SIGNED_UP')), /already signed up/i);
  assert.match(friendlySignupError(new Error('CONSENT_REQUIRED')), /consent/i);
  assert.match(friendlySignupError(new Error('boom')), /try again/i);
});

test('the sign-up RPC holds spots atomically and demands contact details', async () => {
  const sql = await readFile(
    new URL('../supabase/migrations/20260819000000_public_class_signups.sql', import.meta.url),
    'utf8'
  );

  // The class row is locked so two people cannot take the same last place.
  assert.match(sql, /from public\.class_sessions[\s\S]*for update/);
  assert.match(sql, /raise exception 'CLASS_FULL'/);
  // Only instant_book consumes capacity; the other modes record intent.
  assert.match(sql, /if v_mode = 'instant_book' then[\s\S]*v_row_status := 'confirmed';[\s\S]*else[\s\S]*v_row_status := 'requested';/);
  // Held places count member bookings and confirmed public sign-ups together.
  assert.match(sql, /session_bookings[\s\S]*status in \('requested', 'confirmed'\)[\s\S]*union all[\s\S]*class_bookings[\s\S]*status = 'confirmed'/);
  // Details are mandatory before a place is held.
  for (const guard of ['CONSENT_REQUIRED', 'NAME_REQUIRED', 'EMAIL_REQUIRED', 'PHONE_REQUIRED']) {
    assert.match(sql, new RegExp(`raise exception '${guard}'`));
  }
  // Duplicate and stale sign-ups are refused.
  assert.match(sql, /raise exception 'ALREADY_SIGNED_UP'/);
  assert.match(sql, /raise exception 'CLASS_STARTED'/);
  assert.match(sql, /raise exception 'CLASS_NOT_OPEN'/);
  // Anonymous visitors may sign up, but only through the guarded function.
  assert.match(sql, /grant execute on function public\.submit_class_signup[\s\S]*to anon, authenticated/);
  assert.match(sql, /grant execute on function public\.public_class_availability\(\) to anon, authenticated/);
  assert.match(sql, /security definer/);
});
