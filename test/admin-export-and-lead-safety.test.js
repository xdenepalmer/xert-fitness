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
  assert.match(campaign, /const exportLockRef = useRef\(false\)/);
  assert.match(campaign, /if \(exportLockRef\.current \|\| exporting \|\| loading \|\| data\.total === 0\) return/);
  assert.match(campaign, /exportLockRef\.current = true/);
  assert.match(campaign, /disabled=\{loading \|\| exporting \|\| data\.total === 0\}/);
  assert.match(campaign, /const loadVersion = useRef\(0\)/);
  assert.match(campaign, /version !== loadVersion\.current/);
  assert.match(audit, /const exportLockRef = useRef\(false\)/);
  assert.match(audit, /if \(exportLockRef\.current \|\| exporting \|\| loading \|\| events\.length === 0\) return/);
  assert.match(audit, /exportLockRef\.current = true/);
  assert.match(audit, /disabled=\{loading \|\| exporting \|\| events\.length === 0\}/);
});

test('Members and PT request CSV exports lock against same-paint double downloads', async () => {
  const [members, pt] = await Promise.all([
    read('../src/components/admin/MembersManager.jsx'),
    read('../src/components/admin/PTRequestsTable.jsx'),
  ]);
  assert.match(members, /const exportLockRef = useRef\(false\)/);
  assert.match(members, /if \(exportLockRef\.current \|\| exporting \|\| loading \|\| searchPending\) return/);
  assert.match(members, /exportLockRef\.current = true/);
  assert.match(members, /disabled=\{total === 0 \|\| exporting \|\| loading \|\| searchPending\}/);
  assert.match(pt, /const exportLockRef = useRef\(false\)/);
  assert.match(pt, /if \(exportLockRef\.current \|\| exporting \|\| loading\) return/);
  assert.match(pt, /exportLockRef\.current = true/);
  assert.match(pt, /disabled=\{total === 0 \|\| exporting \|\| loading\}/);
});

test('Booking ops, class roster and event training-group CSVs lock against same-paint PII downloads', async () => {
  const [bookings, calendar, events] = await Promise.all([
    read('../src/components/admin/BookingRequestsTable.jsx'),
    read('../src/components/admin/ClassCalendarAdmin.jsx'),
    read('../src/components/admin/EventsManager.jsx'),
  ]);
  assert.match(bookings, /const exportLockRef = useRef\(false\)/);
  assert.match(bookings, /if \(exportLockRef\.current \|\| exporting \|\| loading \|\| filteredBookings\.length === 0\) return/);
  assert.match(bookings, /exportLockRef\.current = true/);
  assert.match(bookings, /disabled=\{filteredBookings\.length === 0 \|\| exporting \|\| loading\}/);

  assert.match(calendar, /const rosterExportLockRef = useRef\(false\)/);
  assert.match(calendar, /if \(rosterExportLockRef\.current \|\| exportingRosterSessionId\) return/);
  assert.match(calendar, /rosterExportLockRef\.current = true/);
  assert.match(calendar, /disabled=\{sessionRoster\.length === 0 \|\| Boolean\(exportingRosterSessionId\)\}/);

  const rosterDialog = events.slice(
    events.indexOf('function TrainingRosterDialog'),
    events.indexOf('export default function EventsManager'),
  );
  assert.match(rosterDialog, /const exportLockRef = useRef\(false\)/);
  assert.match(rosterDialog, /if \(exportLockRef\.current \|\| exporting\) return/);
  assert.match(rosterDialog, /exportLockRef\.current = true/);
  assert.match(rosterDialog, /disabled=\{exporting\}/);
});

test('class calendar Dupe refuses same-paint double creates', async () => {
  const calendar = await read('../src/components/admin/ClassCalendarAdmin.jsx');
  assert.match(calendar, /const duplicateLockRef = useRef\(false\)/);
  const dupe = calendar.slice(
    calendar.indexOf('const handleDuplicate'),
    calendar.indexOf('const handleCancel'),
  );
  assert.match(dupe, /if \(duplicateLockRef\.current \|\| duplicatingSessionId\) return/);
  assert.match(dupe, /duplicateLockRef\.current = true/);
});

test('class calendar roster and request status refuse same-paint double updates', async () => {
  const calendar = await read('../src/components/admin/ClassCalendarAdmin.jsx');
  assert.match(calendar, /const bookingStatusLockRef = useRef\(false\)/);
  const roster = calendar.slice(
    calendar.indexOf('const handleRosterStatus'),
    calendar.indexOf('const handlePromoteNext'),
  );
  assert.match(roster, /if \(!sessionId \|\| bookingStatusLockRef\.current \|\| updatingBookingId\) return/);
  assert.match(roster, /bookingStatusLockRef\.current = true/);
  const request = calendar.slice(
    calendar.indexOf('const handleBookingStatus'),
    calendar.indexOf('const scopedRosterFor'),
  );
  assert.match(request, /if \(!sessionId \|\| bookingStatusLockRef\.current \|\| updatingBookingId\) return/);
  assert.match(request, /bookingStatusLockRef\.current = true/);
  assert.match(calendar, /disabled=\{Boolean\(updatingBookingId\) \|\| s\.status !== 'published'\}/);
  assert.match(calendar, /disabled=\{Boolean\(updatingBookingId\)\}/);
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
