import test from 'node:test';
import assert from 'node:assert/strict';
import { installMemberData } from './fixtures/admin-member-data.mjs';
import { normalizeMemberDirectoryQuery } from '../src/lib/memberAdmin.js';

const url = path => new URL(`https://invalid.xert.invalid/rest/v1/${path}`);
test('member fixture preserves real server paging, combined filters and valid account IDs', () => {
  const fixture = installMemberData();
  const read = args => fixture.read('admin_list_members_page', args, url('rpc/admin_list_members_page')).rows;
  const first = read({ p_limit: 50, p_offset: 0 });
  const second = read({ p_limit: 50, p_offset: 50 });
  assert.equal(first.length, 50);
  assert.equal(first[0].total_count, 112);
  assert.equal(second[0].full_name, 'Directory Member 051');
  assert.notEqual(first[0].id, second[0].id);
  assert.equal(normalizeMemberDirectoryQuery({ memberId: first[0].id }).memberId, first[0].id);
  const filtered = read({ p_search: 'Member 10', p_role: 'member', p_credit: 'available', p_limit: 100 });
  assert.ok(filtered.length > 0);
  assert.ok(filtered.every(row => row.role === 'member' && row.credits_remaining > 0 && row.full_name.includes('Member 10')));
  assert.equal(read({ p_user_id: second[0].id })[0].full_name, 'Directory Member 051');
  first[0].full_name = 'Changed outside fixture';
  assert.equal(read({ p_limit: 1 })[0].full_name, 'Directory Member 001');
  assert.equal(fixture.read('admin_set_role', {}, url('rpc/admin_set_role')), undefined, 'Read fixture never acknowledges a mutation');
});

test('member detail and activation fixtures preserve identity and actual availability fields', () => {
  const fixture = installMemberData();
  const member = fixture.read('admin_list_members_page', { p_limit: 1 }, url('rpc/admin_list_members_page')).rows[0];
  const overview = fixture.read('admin_member_activation_overview', { p_cohort_days: 30 }, url('rpc/admin_member_activation_overview')).rows[0];
  assert.equal(overview.cohort_days, 30);
  const stages = ['accounts_created', 'readiness_complete', 'training_access', 'first_booking', 'first_attended', 'returned'].map(key => overview[key]);
  assert.ok(stages.every((value, index) => Number.isSafeInteger(value) && value >= 0 && (!index || value <= stages[index - 1])));
  const notes = fixture.read('admin_list_member_notes', { p_user_id: member.id, p_include_archived: true }, url('rpc/admin_list_member_notes')).rows;
  assert.equal(notes.length, 2);
  assert.ok(notes.some(note => note.archived_at));
  const credits = fixture.read('credit_batches', {}, url(`credit_batches?user_id=eq.${member.id}`)).rows;
  assert.equal(credits.length, 1);
  assert.equal(credits[0].user_id, member.id);
  assert.equal(fixture.read('credit_batches', {}, url('credit_batches?user_id=eq.00000000-0000-4000-8000-000000000000')).rows.length, 0);
});
