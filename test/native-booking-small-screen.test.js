import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('native Book keeps search and final actions usable on short iPhones', async () => {
  const booking = await read('../ios/XertFitnessApp/XertFitnessApp/Views/BookingView.swift');
  const mainList = booking.slice(
    booking.indexOf('NavigationStack {'),
    booking.indexOf('.sheet(item: $activeSheet)'),
  );

  assert.match(mainList, /List \{[\s\S]*XertScrollEndSpacer\(\)/);
  assert.match(mainList, /\.scrollDismissesKeyboard\(\.interactively\)[\s\S]*\.modifier\(BookingSearchModifier/);
  assert.match(booking, /private struct BookingSearchModifier:[\s\S]*if isEnabled[\s\S]*content\.searchable\(/);
  assert.match(booking, /ViewThatFits\(in: \.horizontal\)[\s\S]*Request PT Session/);
});
