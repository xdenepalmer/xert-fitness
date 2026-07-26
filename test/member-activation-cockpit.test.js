import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationURL = new URL('../supabase/migrations/20260721020000_member_activation_cockpit.sql', import.meta.url);
const mirrorURL = new URL('../src/supabase/member_activation_cockpit_upgrade.sql', import.meta.url);
const adminDataURL = new URL('../src/lib/adminData.js', import.meta.url);

test('activation cockpit is an admin-only bounded read contract', async () => {
  const sql = await readFile(migrationURL, 'utf8');

  assert.match(sql, /admin_member_activation_overview\(p_cohort_days integer default 30\)/i);
  assert.match(sql, /admin_member_activation_queue\(p_limit integer default 12\)/i);
  assert.ok(sql.indexOf('drop function if exists public.admin_member_activation_overview(integer)')
    < sql.indexOf('create or replace function public.admin_member_activation_overview'));
  assert.ok(sql.indexOf('drop function if exists public.admin_member_activation_queue(integer)')
    < sql.indexOf('create or replace function public.admin_member_activation_queue'));
  assert.match(sql, /security definer[\s\S]*set search_path = ''/i);
  assert.equal((sql.match(/if not public\.is_admin\(\) then raise exception 'ADMIN_ONLY'/gi) || []).length, 2);
  assert.match(sql, /greatest\(1,[\s\S]*least\([\s\S]*p_cohort_days[\s\S]*3650/i);
  assert.match(sql, /greatest\(1,[\s\S]*least\([\s\S]*p_limit[\s\S]*100/i);
  assert.match(sql, /revoke all on function public\.admin_member_activation_overview\(integer\) from public, anon, authenticated/i);
  assert.match(sql, /revoke all on function public\.admin_member_activation_queue\(integer\) from public, anon, authenticated/i);
  assert.doesNotMatch(sql, /auth\.users|emergency_contact\.phone|document\.body/i);
});

test('activation milestones are derived from current state and presented as a monotonic journey', async () => {
  const sql = await readFile(migrationURL, 'utf8');

  assert.match(sql, /profile\.created_at >= v_as_of - pg_catalog\.make_interval/i);
  assert.match(sql, /document\.required is true[\s\S]*document\.retired_at is null/i);
  assert.match(sql, /booking\.status in \('confirmed', 'attended', 'no_show'\)/i);
  assert.match(sql, /count\(distinct booking\.class_session_id\)[\s\S]*booking\.status = 'attended'/i);
  assert.match(sql, /attended_count >= 2/i);
  for (const reason of ['setup_incomplete', 'readiness_incomplete', 'no_training_access', 'no_first_booking', 'no_first_attendance']) {
    assert.match(sql, new RegExp(`'${reason}'`));
  }
  assert.match(sql, /Readiness is deliberately a current, non-linear state/i);
  assert.match(sql, /note\.created_at > v_as_of - interval '7 days'/i);
  assert.match(sql, /joined_at <= v_as_of - interval '48 hours'/i);
  assert.doesNotMatch(sql, /insert into public\.(?:profiles|orders|session_bookings|member_emergency_contacts|member_onboarding_receipts)/i);
});

test('activation migration mirror and capability marker stay exact', async () => {
  const [migration, mirror] = await Promise.all([
    readFile(migrationURL, 'utf8'),
    readFile(mirrorURL, 'utf8'),
  ]);
  assert.equal(mirror.replace(/\r\n/g, '\n').trim(), migration.replace(/\r\n/g, '\n').trim());
  assert.match(migration, /values \('member_activation_cockpit'\)/i);
});

test('admin loaders expose the activation UX contract and never fake zero availability', async () => {
  const source = await readFile(adminDataURL, 'utf8');
  const overview = source.slice(
    source.indexOf('export async function adminMemberActivationOverview'),
    source.indexOf('export async function adminListMemberActivationQueue'),
  );
  const queue = source.slice(
    source.indexOf('export async function adminListMemberActivationQueue'),
    source.indexOf('//', source.indexOf('export async function adminListMemberActivationQueue')),
  );

  assert.match(overview, /cohortDays = 30/);
  for (const field of ['available', 'as_of', 'cohort_days', 'accounts_created', 'readiness_complete', 'training_access', 'first_booking', 'first_attended', 'returned']) {
    assert.match(overview, new RegExp(`${field}:`));
  }
  assert.match(overview, /available: false[\s\S]*accounts_created: null/);
  assert.match(overview, /countsAreValid/);
  assert.doesNotMatch(overview, /available: false[\s\S]*accounts_created: 0/);
  assert.match(queue, /limit = 12/);
  assert.match(queue, /return \{ rows: \[\], available: false \}/);
  assert.match(queue, /typeof row\.has_training_access !== 'boolean'/);
});
