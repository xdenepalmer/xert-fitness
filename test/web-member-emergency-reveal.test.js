import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('web member drawer reveals emergency contacts through the audited RPC only', () => {
  const adminData = read('../src/lib/adminData.js');
  const members = read('../src/components/admin/MembersManager.jsx');
  const privacy = read('../src/pages/Privacy.jsx');

  assert.match(adminData, /export async function adminMemberOnboardingSummary/);
  assert.match(adminData, /rpc\('admin_member_onboarding_summary'/);
  assert.match(adminData, /export async function revealMemberEmergencyContact/);
  assert.match(adminData, /rpc\('admin_reveal_member_emergency_contact'/);
  assert.match(adminData, /adminMemberOnboardingSummary\(\[userId\]\)/);

  assert.match(members, /revealMemberEmergencyContact/);
  assert.match(members, /Reveal emergency contact/);
  assert.match(members, /emergencyRevealRequestRef/);
  assert.match(members, /Member readiness/);
  assert.match(members, /Every reveal is recorded/);
  assert.match(members, /stay out of lists and CSV exports/);
  // Switching members / reloading must drop a prior reveal (iOS parity).
  assert.match(members, /setEmergencyReveal\(null\)/);
  assert.doesNotMatch(members, /from\('member_emergency_contacts'\)/);

  assert.match(privacy, /recorded reveal/);
  assert.match(privacy, /not included in member search, bulk member or lead CSV exports/);
});
