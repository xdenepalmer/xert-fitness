import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
const body = source => source
  .split('\n')
  .filter(line => !/^\s*--/.test(line))
  .join('\n');

test('class and event editors remount when their subject changes', () => {
  const calendar = read('../src/components/admin/ClassCalendarAdmin.jsx');
  const events = read('../src/components/admin/EventsManager.jsx');
  const command = read('../src/pages/AdminCommandCentre.jsx');

  assert.match(calendar, /<SessionEditor[\s\S]*key=\{editingSession\?\.id \?\? 'new'\}/);
  assert.match(calendar, /if \(initialAction !== 'create' \|\| showEditor\) return/);
  assert.match(events, /<EventEditor[\s\S]*key=\{editing\?\.id \?\? 'new'\}/);
  assert.match(events, /if \(initialAction !== 'create' \|\| showEditor\) return/);
  assert.match(
    command,
    /const setSection = useCallback\(\(nextSection, params\) => \{[\s\S]*if \(hasUnsavedChanges\) \{[\s\S]*if \(nextSection === section\)/,
  );
});

test('member drawer remounts per member and drops stale detail fetches', () => {
  const source = read('../src/components/admin/MembersManager.jsx');
  assert.match(source, /<MemberDrawer[\s\S]*key=\{viewing\.id\}/);
  assert.match(source, /let active = true/);
  assert.match(source, /adminMemberDetail\(member\.id\)[\s\S]*\.then\(result => \{[\s\S]*if \(!active\) return/);
  assert.match(source, /return \(\) => \{ active = false/);
});

test('account profile form does not reset while the member is editing', () => {
  const source = read('../src/pages/Account.jsx');
  assert.match(
    source,
    /useEffect\(\(\) => \{[\s\S]*if \(editingProfile\) return;[\s\S]*setProfileForm\(\{[\s\S]*\}, \[editingProfile, profile\?\.full_name, profile\?\.phone\]\)/,
  );
});

test('lead and PT request pages use a unique tiebreak sort', () => {
  const source = read('../src/lib/adminData.js');
  assert.match(
    source,
    /async function getLeadPage[\s\S]*?\.order\('created_at', \{ ascending: false \}\)\s*\.order\('id', \{ ascending: false \}\)/,
  );
  assert.match(
    source,
    /private_session_requests'\)\.select\('\*', \{ count: 'exact' \}\)[\s\S]*?\.order\('created_at', \{ ascending: false \}\)\s*\.order\('id', \{ ascending: false \}\)/,
  );
});

test('public timetable only loads upcoming published classes', () => {
  const source = read('../src/lib/adminData.js');
  assert.match(
    source,
    /export async function getClassSessions[\s\S]*if \(publicOnly\)[\s\S]*\.gte\('start_time'/,
  );
});

test('standalone SQL trees keep the hardened announcement audience policy', () => {
  for (const relative of [
    '../src/supabase/booking_schema.sql',
    '../src/supabase/announcement_select_policy_audience_guard.sql',
    '../supabase/migrations/20260726006000_announcement_select_policy_audience_guard.sql',
  ]) {
    const sql = body(read(relative));
    assert.match(sql, /member_announcements_select_live_or_admin/);
    assert.match(sql, /audience = 'targeted'/);
    assert.match(sql, /member_announcement_targets/);
    assert.match(sql, /archived_at is null/);
  }
});

test('standalone booking schema keeps profile email immutability', () => {
  const sql = body(read('../src/supabase/booking_schema.sql'));
  assert.match(sql, /PROFILE_EMAIL_MANAGED_BY_AUTH/);
  assert.match(sql, /new\.email is distinct from old\.email/);
});

test('operations health offers mark-handled for every failed Stripe incident', () => {
  const source = read('../src/components/admin/OperationsHealth.jsx');
  assert.match(
    source,
    /incident\.status === 'failed'[\s\S]*Mark handled/,
  );
});
