import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('native booking cards tolerate duplicate active rows for one class', async () => {
  const [models, bookingView, swiftTests] = await Promise.all([
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Models.swift', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Views/BookingView.swift', import.meta.url), 'utf8'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessAppTests/ModelsTests.swift', import.meta.url), 'utf8'),
  ]);

  assert.match(models, /static func activeBySession/);
  assert.match(models, /case "confirmed": return 3/);
  assert.match(models, /candidate\.booked_at \?\? \.distantPast/);
  assert.match(bookingView, /BookingItem\.activeBySession\(store\.bookings\)/);
  assert.doesNotMatch(bookingView, /Dictionary\(\s*uniqueKeysWithValues:/);
  assert.match(swiftTests, /testActiveBookingIndexSurvivesDuplicateSessionRows/);
  assert.match(swiftTests, /testActiveBookingIndexKeepsNewestRowWithinTheSameState/);
});
