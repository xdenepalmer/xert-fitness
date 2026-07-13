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
    'updateLeadStatus',
    'updateLead',
    'updateLeadStatuses',
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
    assert.match(body, /assertAdminMutation\(/, `${name} must verify affected rows`);
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
