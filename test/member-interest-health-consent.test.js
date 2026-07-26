import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('web member interest submission refuses injuries text without health consent', async () => {
  const [form, submit] = await Promise.all([
    read('../src/components/public/MemberInterestForm.jsx'),
    read('../src/lib/submitForms.js'),
  ]);

  assert.match(form, /health_info_consent: false/);
  assert.match(form, /Consent to collect health information is required when you share injuries or limitations/);
  assert.match(submit, /Consent to collect health information is required when sharing injuries or limitations/);
  assert.match(submit, /health_info_consent: injuries \? healthInfoConsent : false/);
  assert.match(submit, /injuries_or_limitations_optional: injuries \|\| null/);
});

test('native member interest maps health consent and blocks injuries without it', async () => {
  const [models, explore] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Models.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/ExploreView.swift'),
  ]);

  assert.match(models, /var healthInfoConsent = false/);
  assert.match(models, /let health_info_consent: Bool/);
  assert.match(models, /Consent to collect health information is required when sharing injuries or limitations/);
  assert.match(models, /health_info_consent = injuries == nil \? false : draft\.healthInfoConsent/);
  assert.match(explore, /\$draft\.healthInfoConsent/);
});
