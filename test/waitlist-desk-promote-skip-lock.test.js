import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('waitlist desk promote/skip refuse same-paint double submits', () => {
  const calendar = read('../src/components/admin/ClassCalendarAdmin.jsx');
  assert.match(calendar, /waitlistDeskLockRef/);
  assert.match(
    calendar,
    /const handlePromoteNext = async candidate => \{\s*if \(waitlistDeskLockRef\.current/,
  );
  assert.match(
    calendar,
    /const handleSkipWaitlistHead = async candidate => \{\s*if \(waitlistDeskLockRef\.current/,
  );
  assert.match(calendar, /waitlistDeskLockRef\.current = true/);
  assert.match(calendar, /waitlistDeskLockRef\.current = false/);
});
