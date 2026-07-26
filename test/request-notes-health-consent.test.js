import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('PT and booking forms require health consent before notes can be submitted', async () => {
  const [pt, booking, submit, privacy] = await Promise.all([
    read('../src/components/public/PTRequestForm.jsx'),
    read('../src/components/public/BookingRequestForm.jsx'),
    read('../src/lib/submitForms.js'),
    read('../src/pages/Privacy.jsx'),
  ]);

  for (const form of [pt, booking]) {
    assert.match(form, /health_info_consent: false/);
    assert.match(form, /Consent to collect health information is required when you share notes/);
    assert.match(form, /I consent to XERT collecting health information in these notes/);
  }
  assert.match(pt, /REHAB_TRAINING_GOAL/);
  assert.match(pt, /needsHealthConsent/);
  assert.match(pt, /selecting Rehab \/ return to fitness/);
  assert.match(submit, /withRequestHealthConsent/);
  assert.match(submit, /Consent to collect health information is required when sharing notes/);
  assert.match(submit, /Rehab \/ return to fitness/);
  assert.match(privacy, /PT or class booking requests/);
  assert.match(privacy, /Rehab \/ return to fitness/);
  assert.match(privacy, /deliberate reveal/);
});

test('native PT and class-interest requests require health consent for notes and rehab', async () => {
  const [models, booking] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Models.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/BookingView.swift'),
  ]);
  assert.match(models, /health_info_consent: Bool/);
  assert.match(models, /rehabTrainingGoal = "Rehab \/ return to fitness"/);
  assert.match(models, /Consent to collect health information is required when selecting Rehab/);
  assert.match(models, /Consent to collect health information is required when sharing notes/);
  assert.match(booking, /healthInfoConsent/);
  assert.match(booking, /needsHealthConsent/);
  assert.match(booking, /healthInfoConsent: healthInfoConsent/);
});

test('migration and operator mirror install notes health consent and admin reveal', async () => {
  const [migration, upgrade] = await Promise.all([
    read('../supabase/migrations/20260726109000_request_notes_health_consent.sql'),
    read('../src/supabase/request_notes_health_consent.sql'),
  ]);
  assert.equal(upgrade, migration);
  assert.match(migration, /add column if not exists health_info_consent/i);
  assert.match(migration, /private_session_requests/);
  assert.match(migration, /class_bookings/);
  assert.match(migration, /Rehab \/ return to fitness/);
  assert.match(migration, /values \('request_notes_health_consent'\)/i);
  assert.match(migration, /admin_reveal_member_interest_health/);
});

test('rehab-goal health consent migration and mirror stay aligned', async () => {
  const [migration, mirror] = await Promise.all([
    read('../supabase/migrations/20260726111000_pt_rehab_goal_health_consent.sql'),
    read('../src/supabase/pt_rehab_goal_health_consent.sql'),
  ]);
  assert.equal(mirror, migration);
  assert.match(migration, /Rehab \/ return to fitness/);
  assert.match(migration, /values \('pt_rehab_goal_health_consent'\)/i);
});
