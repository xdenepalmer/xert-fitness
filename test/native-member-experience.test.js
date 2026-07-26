import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readView = name => readFile(
  new URL(`../ios/XertFitnessApp/XertFitnessApp/Views/${name}.swift`, import.meta.url),
  'utf8',
);

test('native booking keeps discovery fast, honest and operable at large text sizes', async () => {
  const source = await readView('BookingView');
  const body = source.slice(source.indexOf('var body: some View'), source.indexOf('// MARK: Sections'));

  assert.match(body, /let visibleSessions = ClassSessionDiscovery\.sessions/);
  assert.match(body, /let activeBookings = BookingItem\.activeBySession\(store\.bookings\)/);
  assert.doesNotMatch(source, /private var visibleSessions/);
  assert.doesNotMatch(source, /private var activeBookings/);
  assert.match(source, /Checking secure checkout availability/);
  assert.match(source, /Checkout status is unavailable/);
  assert.match(source, /Loading session packs/);
  assert.match(source, /Loading upcoming classes/);
  assert.ok((source.match(/ViewThatFits\(in: \.horizontal\)/g) || []).length >= 3);
  assert.match(source, /hasBookingMutation = store\.bookingSessionID != nil \|\| store\.cancellingBookingID != nil/);
  assert.ok((source.match(/scrollDismissesKeyboard\(\.interactively\)/g) || []).length >= 2);
  assert.ok((source.match(/interactiveDismissDisabled\(store\.isRequesting/g) || []).length >= 2);
});

test('native account Book CTAs fail closed to Register interest while bookings are paused', async () => {
  const source = await readView('AccountView');
  const progress = source.slice(
    source.indexOf('private func trainingProgressCard'),
    source.indexOf('private func trainingProgressMetric'),
  );
  assert.match(progress, /store\.memberBookingsEnabled/);
  assert.match(progress, /Register interest/);
  assert.match(progress, /xertfitness:\/\/explore/);

  const membership = source.slice(
    source.indexOf('private var membershipSection'),
    source.indexOf('private var creditSummary'),
  );
  assert.match(membership, /store\.memberBookingsEnabled/);
  assert.match(membership, /Buy session packs/);
  assert.match(membership, /Register interest/);
  assert.match(membership, /xertfitness:\/\/explore/);
});

test('native account prioritizes member activity and fully supports keyboard and haptic preferences', async () => {
  const source = await readView('AccountView');
  const signedIn = source.slice(
    source.indexOf('private func signedInSections'),
    source.indexOf('private var membershipSection'),
  );

  const bookingIndex = signedIn.indexOf('activeBookingSections(timeline: timeline)');
  const detailsIndex = signedIn.indexOf('accountDetailsSection');
  const signOutIndex = signedIn.indexOf('signOutSection');
  assert.ok(bookingIndex >= 0 && bookingIndex < detailsIndex);
  assert.ok(detailsIndex < signOutIndex);

  const signOutSection = source.slice(
    source.indexOf('private var signOutSection'),
    source.indexOf('private var accountControlSection'),
  );
  assert.match(signOutSection, /\.disabled\(store\.isSigningOut \|\| store\.isDeletingAccount\)/);

  assert.match(source, /@AppStorage\(XertHapticPreference\.preferenceKey\)/);
  assert.match(source, /Toggle\("Haptic feedback"/);
  assert.match(source, /if enabled \{ XertHaptics\.play\(\.lightImpact\) \}/);
  assert.match(source, /ToolbarItemGroup\(placement: \.keyboard\)/);
  assert.match(source, /@FocusState private var focusedAuthField/);
  assert.match(source, /@FocusState private var focusedSecurityField/);
  assert.match(source, /frame\(maxWidth: \.infinity, minHeight: 44, alignment: \.leading\)/);
  assert.match(source, /hasBookingMutation = store\.bookingSessionID != nil \|\| store\.cancellingBookingID != nil/);
});

test('native events avoids repeated formatter work and exposes precise action state', async () => {
  const [source, store] = await Promise.all([
    readView('EventsView'),
    readFile(
      new URL('../ios/XertFitnessApp/XertFitnessApp/Store/XertStore.swift', import.meta.url),
      'utf8',
    ),
  ]);
  const displayDate = source.slice(source.indexOf('private func displayDate'), source.indexOf('private var trainingGoals'));
  const toggleGoal = store.slice(store.indexOf('func toggleEventGoal'), store.indexOf('func refreshAnnouncements'));

  assert.match(source, /let visibleTrainingGoals = trainingGoals/);
  assert.match(source, /let visibleMonthSections = monthSections/);
  assert.match(source, /Loading the XERT event calendar/);
  assert.match(source, /Remove training goal/);
  assert.match(source, /private static let inputDateFormatter: DateFormatter/);
  assert.match(displayDate, /Self\.inputDateFormatter\.date/);
  assert.doesNotMatch(displayDate, /DateFormatter\(\)/);
  assert.match(source, /addingToCalendarID == event\.stableID \? "In progress"/);
  assert.match(source, /disabled\(store\.updatingEventGoalID != nil\)/);
  assert.match(toggleGoal, /guard updatingEventGoalID == nil else \{ return \}/);
});
