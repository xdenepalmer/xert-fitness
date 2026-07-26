import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('booking desk cancel copy matches Stripe-refunded pack honesty', () => {
  const web = read('../src/components/admin/BookingRequestsTable.jsx');
  const ios = read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift');

  assert.match(
    web,
    /Reserved credits on open credit places are returned when the pack is still live/,
  );
  assert.doesNotMatch(web, /server cancellation credit policy/);

  assert.match(
    ios,
    /Reserved credits on open credit places are returned when the pack is still live/,
  );
  assert.match(ios, /Reserved credit is returned when the pack is still live/);
  assert.doesNotMatch(ios, /server credit-return policy/);
  assert.doesNotMatch(ios, /according to the cancellation policy/);
});
