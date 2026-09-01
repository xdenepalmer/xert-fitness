import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('owner booking controls govern the native member experience and fail closed', async () => {
  const [models, api, store, adminStore, booking, ownerNavigation, commandCentre] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Models.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/XertStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/BookingView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/OwnerNavigation.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
  ]);

  assert.match(models, /struct PublicPlatformSettings:[\s\S]*let bookings_enabled: Bool[\s\S]*let payments_enabled: Bool/);
  assert.match(api, /select", value: "bookings_enabled,payments_enabled,prices_coming_soon,fitbox_enabled,fitbox_booking_url"/);
  assert.match(store, /@Published private\(set\) var memberBookingsEnabled = false/);
  assert.match(store, /@Published private\(set\) var creditBalanceLoaded = false/);
  assert.ok((store.match(/creditBalanceLoaded = true/g) || []).length >= 3);
  assert.match(store, /private func clearMemberData\(\)[\s\S]*creditBalanceLoaded = false/);
  assert.match(store, /@Published private\(set\) var bookingAvailabilityLoaded = false/);
  const refreshSetup = store.slice(
    store.indexOf('private func performRefresh'),
    store.indexOf('async let productRequest'),
  );
  assert.doesNotMatch(refreshSetup, /(?:booking|payment)AvailabilityLoaded = false/);
  assert.match(store, /memberBookingsEnabled = provider\.provider == \.native[\s\S]*loadedSettings\?\.bookings_enabled == true/);
  assert.match(store, /private func memberBookingControlError\(\) -> String\?/);
  assert.ok((store.match(/if let message = memberBookingControlError\(\)/g) || []).length >= 2);
  assert.match(adminStore, /if draft\.bookings_enabled \{[\s\S]*member_booking_switch_guard[\s\S]*Bookings stay paused until Operations Health verifies/);

  assert.match(booking, /Online bookings are paused/);
  assert.match(booking, /!store\.memberBookingsEnabled \|\| session\.booking_mode == "interest_only"/);
  assert.match(booking, /store\.unavailableDataSources\.contains\(\.platformSettings\)[\s\S]*Booking status unavailable/);
  assert.match(booking, /private var memberBookingContextIsLoading: Bool \{[\s\S]*store\.isSignedIn[\s\S]*unavailableDataSources\.contains\(\.bookings\)[\s\S]*store\.hasBootstrapped \|\| store\.isLoading/);
  assert.match(booking, /private var memberBookingContextUnavailable: Bool \{[\s\S]*store\.isSignedIn[\s\S]*store\.isUsingStaleMemberData \|\| store\.unavailableDataSources\.contains\(\.bookings\)/);
  const sessionAction = booking.slice(
    booking.indexOf('private func sessionAction'),
    booking.indexOf('private func bookingActionLabel'),
  );
  assert.ok(sessionAction.indexOf('Manage booking') < sessionAction.indexOf('memberBookingContextIsLoading'));
  assert.ok(sessionAction.indexOf('memberBookingContextIsLoading') < sessionAction.indexOf('memberBookingContextUnavailable'));
  assert.ok(sessionAction.indexOf('memberBookingContextUnavailable') < sessionAction.indexOf('firstClassActivation'));
  assert.match(sessionAction, /memberBookingContextIsLoading[\s\S]*Checking your booking status/);
  assert.match(sessionAction, /memberBookingContextUnavailable[\s\S]*await store\.refresh\(\)[\s\S]*Retry booking status/);
  assert.match(booking, /DataAvailabilityNotice\(sources: \[\.products, \.sessions, \.platformSettings, \.credits, \.bookings\]\)/);

  assert.match(ownerNavigation, /case \.controls: return "Member App Controls"/);
  assert.match(commandCentre, /Section\("Member app experience"\)/);
  assert.match(commandCentre, /private var bookingGuardReady: Bool\?/);
  assert.match(commandCentre, /title: "Booking protection"[\s\S]*Migration required/);
  assert.match(commandCentre, /Members can browse published content and manage only their own credits, bookings, purchases, PT requests, goals and notification preferences/);
  assert.match(commandCentre, /Controls both website and iOS class actions/);
  assert.match(commandCentre, /onOpenNotices: \{ openWorkspace\(\.notices\) \}/);
});

test('database rejects new member places while bookings are paused without blocking owner operations', async () => {
  const [migration, capabilities, readiness, nativeReadiness] = await Promise.all([
    read('../supabase/migrations/20260721000000_member_booking_switch_guard.sql'),
    read('../src/lib/schemaCapabilities.js'),
    read('../src/supabase/release_readiness_check.sql'),
    read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
  ]);

  assert.match(migration, /create or replace function public\.enforce_member_booking_switch\(\)/i);
  assert.match(migration, /auth\.role\(\) = 'service_role'[\s\S]*public\.is_admin\(\)/i);
  assert.doesNotMatch(migration, /v_actor is null/i);
  assert.match(migration, /coalesce\(bool_or\(settings\.bookings_enabled\), false\)/i);
  assert.match(migration, /raise exception 'BOOKINGS_PAUSED'/i);
  assert.match(migration, /before insert on public\.session_bookings/i);
  assert.doesNotMatch(migration, /before (?:update|delete)/i);
  assert.match(migration, /revoke all on function public\.enforce_member_booking_switch\(\)[\s\S]*public, anon, authenticated/i);
  assert.match(migration, /values \('member_booking_switch_guard'\)/i);

  assert.match(capabilities, /member_booking_switch_guard/);
  assert.match(readiness, /member_booking_switch_guard/);
  assert.match(nativeReadiness, /"member_booking_switch_guard"/);
});

test('booking credits distinguish unknown, loading, unavailable, stale and genuine zero balances', async () => {
  const booking = await read('../ios/XertFitnessApp/XertFitnessApp/Views/BookingView.swift');

  assert.match(booking, /badge: bookingHeroBadge/);
  assert.match(booking, /private var hasKnownCreditBalance: Bool \{[\s\S]*store\.creditBalanceLoaded/);
  assert.match(booking, /private var bookingCreditValue: String \{[\s\S]*hasKnownCreditBalance \? "\\\(store\.creditTotal\)" : "—"/);
  assert.match(booking, /Credit balance unavailable/);
  assert.match(booking, /Checking credit balance/);
  assert.match(booking, /Last known balance — pull to refresh/);
  assert.match(booking, /Last synced balance/);
  assert.match(booking, /Text\(bookingCreditValue\)/);
});
