import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('class cancel copy does not claim every cancelled place returned a credit', () => {
  const web = read('../src/components/admin/ClassCalendarAdmin.jsx');
  assert.match(
    web,
    /Reserved credits on open credit places were returned when the pack is still live/,
  );
  assert.match(
    web,
    /waitlist and enquiry places never held a credit/,
  );
  assert.doesNotMatch(
    web,
    /Reserved member credits were returned\.|any reserved class credits returned/,
  );

  const ios = read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift');
  assert.match(
    ios,
    /Reserved credits on open credit places are returned when the pack is still live/,
  );
  assert.match(ios, /waitlist places never held a credit/);
  assert.doesNotMatch(ios, /reserved credits are returned, and affected members/);
});
