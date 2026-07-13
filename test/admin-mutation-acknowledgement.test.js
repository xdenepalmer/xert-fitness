import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../src/lib/adminData.js', import.meta.url), 'utf8');

function functionBody(name) {
  const start = source.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const next = source.indexOf('\nexport async function ', start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

test('direct admin updates and deletes verify that the expected record still exists', () => {
  const mutations = [
    'updateClassSession',
    'updateAvailabilityBlock',
    'deleteAvailabilityBlock',
    'updateBlackoutPeriod',
    'deleteBlackoutPeriod',
    'updateSoftLaunchSettings',
    'updateCoach',
    'deleteCoach',
    'updateEvent',
    'deleteEvent',
    'updateProduct',
  ];

  for (const name of mutations) {
    const body = functionBody(name);
    assert.match(body, /\.select\('id'\)/, `${name} must request affected IDs`);
    assert.match(body, /assertAdminMutation(?:Version)?\(/, `${name} must verify affected rows`);
  }
});

test('lead operations use audited RPCs and verify exact mutation counts', () => {
  for (const name of ['updateLeadStatus', 'updateLead', 'updateLeadStatuses']) {
    const body = functionBody(name);
    assert.match(body, /\.rpc\('admin_update_lead/, `${name} must use an audited lead RPC`);
    assert.match(body, /Number\(data\) !==/, `${name} must verify the mutation count`);
    assert.doesNotMatch(body, /supabase\.from\(mutation\.table\)\.update/, `${name} must not write directly`);
  }
  assert.match(functionBody('updateLeadStatuses'), /mutation\.ids\.length/);
});

test('request operations use the atomic audited RPC instead of direct writes', () => {
  for (const name of ['updateLegacyBookingNotes', 'updateBookingStatus', 'updatePTRequestStatus']) {
    const body = functionBody(name);
    assert.match(body, /\.rpc\('admin_update_request'/, `${name} must use the audited RPC`);
    assert.doesNotMatch(body, /\.from\((?:'class_bookings'|'private_session_requests')\)/, `${name} must not write directly`);
  }
});
