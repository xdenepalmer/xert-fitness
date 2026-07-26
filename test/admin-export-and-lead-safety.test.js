import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('LeadTable status save and bulk update refuse same-paint double submits', async () => {
  const source = await read('../src/components/admin/LeadTable.jsx');
  const drawer = source.slice(
    source.indexOf('function LeadDetailDrawer'),
    source.indexOf('export default function LeadTable'),
  );
  assert.match(drawer, /const saveLockRef = useRef\(false\)/);
  assert.match(drawer, /if \(saveLockRef\.current \|\| saving\) return/);
  assert.match(drawer, /saveLockRef\.current = true/);

  const table = source.slice(source.indexOf('export default function LeadTable'));
  assert.match(table, /const bulkLockRef = useRef\(false\)/);
  assert.match(table, /if \(!bulkStatus \|\| selectedIds\.size === 0 \|\| bulkLockRef\.current \|\| bulkSaving\) return/);
  assert.match(table, /bulkLockRef\.current = true/);
  assert.match(table, /if \(exportLockRef\.current \|\| exporting \|\| loading\) return/);
});

test('CampaignStats and AdminAuditLog refuse CSV export while a load is in flight', async () => {
  const [campaign, audit] = await Promise.all([
    read('../src/components/admin/CampaignStats.jsx'),
    read('../src/components/admin/AdminAuditLog.jsx'),
  ]);
  assert.match(campaign, /disabled=\{loading \|\| data\.total === 0\}/);
  assert.match(campaign, /const loadVersion = useRef\(0\)/);
  assert.match(campaign, /version !== loadVersion\.current/);
  assert.match(audit, /disabled=\{loading \|\| events\.length === 0\}/);
});

test('native platform settings freeze edits while payment-activation confirm is open', async () => {
  const view = await read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift');
  const platform = view.slice(
    view.indexOf('private struct AdminPlatformView'),
    view.indexOf('private struct AdminCommunicationsView'),
  );
  assert.match(platform, /&& !confirmingPaymentActivation/);
  // Confirm stays mounted through persist — clearing it before save re-enabled
  // Save and let a second activation dialog open on the same paint.
  assert.doesNotMatch(platform, /confirmingPaymentActivation = false\s*\n\s*save\(draft\)/);
  assert.match(platform, /guard !admin\.isSavingSettings, !isExitSaving else \{ return \}\s*\n\s*save\(draft\)/);
  assert.match(
    platform,
    /saved = await admin\.saveSettings\(session: session, draft: settings\)[\s\S]*?confirmingPaymentActivation = false/,
  );
  assert.match(platform, /private var canSavePlatformSettings: Bool \{[\s\S]*!confirmingPaymentActivation/);
  assert.match(platform, /guard canSavePlatformSettings else \{ return \}/);
  assert.match(platform, /guard platformDataIsCurrent, !admin\.isLoading, !admin\.isSavingSettings, !isExitSaving else \{ return \}/);
});

test('public acquisition forms lock submit and harden the honeypot against autofill', async () => {
  const forms = [
    '../src/components/public/MemberInterestForm.jsx',
    '../src/components/public/TrainerInterestForm.jsx',
    '../src/components/public/PartnerInterestForm.jsx',
    '../src/components/public/PTRequestForm.jsx',
    '../src/components/public/BookingRequestForm.jsx',
  ];
  for (const path of forms) {
    const source = await read(path);
    assert.match(source, /const submitLockRef = useRef\(false\)/, path);
    assert.match(source, /if \(submitLockRef\.current \|\| loading\) return/, path);
    assert.match(source, /submitLockRef\.current = true/, path);
    assert.match(source, /autoComplete="new-password"/, path);
    assert.match(source, /name="company_website"/, path);
  }
});
