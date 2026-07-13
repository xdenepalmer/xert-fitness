import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [form, booking] = await Promise.all([
  readFile(new URL('../src/components/public/PTRequestForm.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Views/BookingView.swift', import.meta.url), 'utf8'),
]);

test('signed-in PT forms prefill known contact details without overwriting edits', () => {
  assert.match(form, /const \{ user, profile \} = useSupabaseAuth\(\)/);
  assert.match(form, /full_name: current\.full_name \|\| profile\?\.full_name/);
  assert.match(form, /email: current\.email \|\| user\?\.email/);
  assert.match(form, /phone: current\.phone \|\| profile\?\.phone/);
  assert.match(booking, /PrivateSessionRequestView\([\s\S]*initialName: initialName[\s\S]*initialEmail: initialEmail[\s\S]*initialPhone: initialPhone/);
});
