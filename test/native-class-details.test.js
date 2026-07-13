import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const bookingView = await readFile(
  new URL('../ios/XertFitnessApp/XertFitnessApp/Views/BookingView.swift', import.meta.url),
  'utf8',
);

test('native booking cards expose complete independently expandable class details', () => {
  assert.match(bookingView, /@State private var expandedSessionIDs: Set<UUID>/);
  assert.match(bookingView, /DisclosureGroup\(isExpanded: expansionBinding\(for: session\.id\)\)/);
  assert.match(bookingView, /session\.description\?\.trimmingCharacters/);
  assert.match(bookingView, /detailRow\("Training style"/);
  assert.match(bookingView, /detailRow\("Intensity"/);
  assert.match(bookingView, /detailRow\("Duration"/);
  assert.match(bookingView, /detailRow\("Finishes"/);
  assert.match(bookingView, /detailRow\("Suitable for", value: "Beginners"/);
  assert.match(bookingView, /\.accessibilityElement\(children: \.contain\)/);
});
