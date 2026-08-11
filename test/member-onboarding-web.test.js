import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('web member readiness uses the authenticated server contract without local persistence', async () => {
  const [data, account] = await Promise.all([
    read('../src/lib/bookingData.js'),
    read('../src/pages/Account.jsx'),
  ]);

  assert.match(data, /rpc\('my_member_onboarding'\)/);
  assert.match(data, /rpc\('save_my_member_onboarding'/);
  for (const argument of [
    'p_full_name', 'p_phone', 'p_emergency_contact_name',
    'p_emergency_contact_phone', 'p_emergency_contact_relationship',
    'p_contact_is_aware', 'p_accepted_document_ids',
  ]) {
    assert.match(data, new RegExp(`${argument}:`));
  }
  assert.match(data, /p_source: 'web_app'/);
  assert.doesNotMatch(account, /localStorage|sessionStorage/);
  assert.match(account, /setContactIsAware\(false\)/);
  assert.match(account, /field === 'emergencyContactName'[\s\S]*field === 'emergencyContactPhone'[\s\S]*field === 'emergencyContactRelationship'[\s\S]*setContactIsAware\(false\)/);
  assert.match(account, /data\.required_documents\.map\(document => \[document\.id, false\]\)/);
  assert.doesNotMatch(account, /defaultChecked/);
});

test('adult readiness cannot be submitted by an ineligible member', async () => {
  const account = await read('../src/pages/Account.jsx');

  assert.match(account, /I confirm I am 18 years of age or older and eligible to complete the adult readiness acknowledgement below/);
  assert.match(account, /!adultEligibilityConfirmed \? \(/);
  assert.match(account, /Do not submit this adult form/);
  assert.match(account, /Ask a parent or guardian to contact XERT/);
  assert.match(account, /to="\/contact"/);
  assert.match(account, /if \(!memberReadiness \|\| !adultEligibilityConfirmed \|\| !canSaveReadiness/);
  assert.match(account, /const canSaveReadiness = Boolean\(memberReadiness\)[\s\S]*&& adultEligibilityConfirmed/);
  assert.match(account, /setReadinessFromServer\(saved, \{[\s\S]*confirmedAdultEligibility: true/);
  assert.match(account, /\{ replaceDraft = false, confirmedAdultEligibility = false \}/);
});

test('readiness hydration preserves dirty drafts and ignores stale auth responses', async () => {
  const account = await read('../src/pages/Account.jsx');

  assert.match(account, /const readinessUserID = user\?\.id \|\| ''/);
  assert.match(account, /\}, \[readinessUserID, refreshMemberReadiness\]\);/);
  assert.match(account, /readinessDirtyRef = useRef\(false\)/);
  assert.match(account, /readinessSavingRef = useRef\(false\)/);
  assert.match(account, /if \(!replaceDraft \|\| readinessDirtyRef\.current \|\| readinessSavingRef\.current\) return false/);
  assert.match(account, /requestID !== readinessRequestIDRef\.current[\s\S]*requestedUserID !== readinessUserIDRef\.current/);
  assert.match(account, /Saving this exact draft supersedes any older background hydration/);
  assert.match(account, /readinessRequestIDRef\.current \+= 1/);
});

test('member readiness is advisory, accessible, source-linked and server acknowledged', async () => {
  const account = await read('../src/pages/Account.jsx');

  assert.match(account, /id="member-readiness"/);
  assert.match(account, /not a medical assessment or medical clearance/);
  assert.match(account, /does not change your booking access/);
  assert.match(account, /No health answers or medical outcomes are collected/);
  assert.match(account, /url\.protocol === 'https:'/);
  assert.match(account, /Open official source/);
  assert.match(account, /Your update is complete only after XERT confirms the save/);
  assert.match(account, /Saved and confirmed by XERT/);
  assert.match(account, /role="alert"/);
  assert.match(account, /role="status"/);
});

test('privacy and account deletion copy enumerate the new member-owned data boundary', async () => {
  // Terms copy lives in contentDefaults.js so the admin CMS can edit it; the
  // page itself only renders whatever that (or a saved override) supplies.
  const [privacy, terms, account] = await Promise.all([
    read('../src/pages/Privacy.jsx'),
    read('../src/lib/contentDefaults.js'),
    read('../src/pages/Account.jsx'),
  ]);

  assert.match(privacy, /emergency contact, readiness acknowledgements/);
  assert.match(privacy, /recorded reveal/);
  assert.match(privacy, /not included in member search, bulk member or lead CSV exports/);
  assert.match(privacy, /does not collect screening answers, diagnoses or a medical-clearance outcome/);
  assert.match(privacy, /updated="21 July 2026"/);
  assert.match(terms, /does not mean XERT has medically assessed or cleared you to exercise/);
  assert.doesNotMatch(terms, /Member Readiness[^.]*waiver/i);
  assert.match(account, /emergency contact, readiness acknowledgements, credits, bookings, PT requests and training goals will be removed/);
});
