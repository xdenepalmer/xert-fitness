import test from 'node:test';
import assert from 'node:assert/strict';
import { installLeadData } from './fixtures/admin-lead-data.mjs';

test('lead fixture has truthful server totals, distinct pages and filtered projection', () => {
  const fixture = installLeadData();
  const query = suffix => new URL(`https://example.invalid/rest/v1/member_interest?${suffix}`);
  const first = fixture.read('member_interest', query('select=id,full_name,email,status&order=created_at.desc&offset=0&limit=50'));
  const second = fixture.read('member_interest', query('select=id,full_name,email,status&order=created_at.desc&offset=50&limit=50'));
  assert.equal(first.total, 112);
  assert.equal(first.rows.length, 50);
  assert.equal(second.rows.length, 50);
  assert.equal(new Set([...first.rows, ...second.rows].map(row => row.id)).size, 100);
  assert.deepEqual(Object.keys(first.rows[0]), ['id', 'full_name', 'email', 'status']);
  const filtered = fixture.read('member_interest', query('status=eq.contacted&or=(full_name.ilike.%Lead Member%,email.ilike.%Lead Member%)&limit=50'));
  assert.equal(filtered.total, 28);
  assert.ok(filtered.rows.every(row => row.status === 'contacted' && row.email.endsWith('@example.invalid')));
  const last = fixture.read('member_interest', query('offset=100&limit=50'));
  assert.equal(last.rows.length, 12);
  first.rows[0].full_name = 'Modified';
  assert.notEqual(fixture.read('member_interest', query('limit=1')).rows[0].full_name, 'Modified');
  assert.equal(fixture.read('unconfigured_table', query('')), undefined);
});

test('lead fixture keeps trainer/partner fields and safe provider states separate', () => {
  const fixture = installLeadData();
  const url = new URL('https://example.invalid/rest/v1/?limit=50');
  const trainers = fixture.read('trainer_interest', url);
  const partners = fixture.read('partner_interest', url);
  assert.equal(trainers.total, 6);
  assert.equal(partners.total, 5);
  assert.ok(trainers.rows.every(row => row.qualifications && !row.business_name));
  assert.ok(partners.rows.every(row => row.profession && row.business_name && !row.qualifications));
  assert.equal(fixture.leadState('unknown'), undefined);
  const member = fixture.read('member_interest', url).rows[0];
  const state = fixture.leadState(member.id);
  assert.equal(state.ready, false);
  assert.equal(state.current_job, null);
  assert.equal(state.link, null);
});
