import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  adminLeadSelect,
  leadExportColumns,
  leadExportRows,
} from '../src/lib/adminLeads.js';

const forbidden = [
  'injuries_or_limitations_optional',
  'health_info_consent',
  'consent_to_contact',
  'mailing_list_consent',
  'company_website',
  'biggest_reason_for_joining',
];

test('lead operations fetch explicit UI fields without sensitive intake answers or consent metadata', () => {
  for (const table of ['member_interest', 'trainer_interest', 'partner_interest']) {
    const selection = adminLeadSelect(table);
    assert.doesNotMatch(selection, /\*/);
    for (const field of forbidden) assert.doesNotMatch(selection, new RegExp(field));
  }
  assert.match(adminLeadSelect('member_interest'), /main_training_goals/);
  assert.throws(() => adminLeadSelect('profiles'), /Unsupported lead type/);
});

test('lead CSVs are purpose-limited even when source rows contain sensitive fields', () => {
  const [row] = leadExportRows('member_interest', [{
    id: 'lead-a', full_name: 'Alex', email: 'alex@example.com', phone: '0400',
    status: 'new', created_at: '2026-07-21T00:00:00Z', suburb_town: 'Kingaroy',
    injuries_or_limitations_optional: 'private injury',
    health_info_consent: true,
    consent_to_contact: true,
    mailing_list_consent: true,
    admin_notes: 'private staff note',
    main_training_goals: ['General health'],
  }]);

  assert.deepEqual(Object.keys(row), leadExportColumns('member_interest').map(column => column.key));
  assert.equal(row.full_name, 'Alex');
  assert.equal(row.suburb_town, 'Kingaroy');
  for (const field of [...forbidden, 'admin_notes', 'main_training_goals']) {
    assert.equal(Object.hasOwn(row, field), false);
  }
});

test('admin intake queues no longer use wildcard reads', async () => {
  const source = await readFile(new URL('../src/lib/adminData.js', import.meta.url), 'utf8');
  const leadBlock = source.slice(source.indexOf('async function getLeadPage'), source.indexOf('export async function getCampaignAttributionRows'));
  const bookingBlock = source.slice(source.indexOf('export async function getClassBookings'), source.indexOf('export async function updateBookingStatus'));
  const ptBlock = source.slice(source.indexOf('export async function getPTRequests'), source.indexOf('export async function updatePTRequestStatus'));

  assert.match(leadBlock, /select\(adminLeadSelect\(table\)/);
  assert.doesNotMatch(leadBlock, /select\('\*'/);
  assert.doesNotMatch(bookingBlock, /select\('\*'/);
  assert.doesNotMatch(ptBlock, /select\('\*'/);
});

test('member-interest injuries stay out of list selects and reach admins only via deliberate reveal', async () => {
  const [adminData, leadTable, migration] = await Promise.all([
    readFile(new URL('../src/lib/adminData.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/admin/LeadTable.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260726109000_request_notes_health_consent.sql', import.meta.url), 'utf8'),
  ]);

  assert.match(adminData, /admin_reveal_member_interest_health/);
  assert.doesNotMatch(adminLeadSelect('member_interest'), /injuries_or_limitations_optional|health_info_consent/);
  assert.match(leadTable, /revealMemberInterestHealth/);
  assert.match(leadTable, /Reveal consented health notes/);
  assert.match(leadTable, /healthRevealRequestRef/);
  assert.match(leadTable, /No consented injury notes on this lead/);
  assert.match(leadTable, /key=\{selectedLead\.id\}/);
  assert.match(migration, /create or replace function public\.admin_reveal_member_interest_health\(p_lead_id uuid\)/i);
  assert.match(migration, /v_consent is not true/);
});
