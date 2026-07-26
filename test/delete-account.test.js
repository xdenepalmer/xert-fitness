import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  deleteMemberAccount,
  deleteMemberAccountLegacy,
  hasDeleteAccountConfirmation,
  isMissingAccountDeletionRoutine,
  isMissingClassBookingsTable,
  isMissingPTTrackingColumn,
} from '../api/delete-account.js';

test('requires an explicit destructive account deletion confirmation', () => {
  assert.equal(hasDeleteAccountConfirmation({ confirmation: 'DELETE' }), true);
  assert.equal(hasDeleteAccountConfirmation({ confirmation: 'delete' }), false);
  assert.equal(hasDeleteAccountConfirmation(null), false);
});

test('account deletion returns a fixed error string and logs the real cause behind the trace', async () => {
  // This endpoint was the only one echoing error.message verbatim.
  const source = await readFile(new URL('../api/delete-account.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /error:\s*error\.message/);
  assert.match(source, /createRequestTrace\(response\)/);
  assert.match(source, /console\.error\('Account deletion failed\.'[\s\S]*requestId: trace\.requestId/);
  assert.match(source, /return json\(\{ error: 'Could not delete account\. Please try again\.' \}, 500\)/);
});

test('deletes the member through a single atomic service-role transaction', async () => {
  const calls = [];
  const admin = {
    async rpc(name, params) {
      calls.push(['rpc', name, params]);
      return { error: null };
    },
    from() {
      throw new Error('No table round trips are allowed on the atomic path.');
    },
    auth: { admin: { async deleteUser() { throw new Error('Auth deletion must run inside the transaction.'); } } },
  };

  await deleteMemberAccount(admin, 'member-123', 'Member@Example.com');
  assert.deepEqual(calls, [['rpc', 'delete_member_account', { p_user_id: 'member-123' }]]);
});

test('destroys no member data when the atomic deletion transaction fails', async () => {
  const destructiveCalls = [];
  const admin = {
    async rpc() {
      // A failure inside the transaction (including the auth deletion) rolls
      // everything back, so the caller must surface the error and touch nothing.
      return { error: { code: 'P0001', message: 'auth deletion failed' } };
    },
    from(table) {
      destructiveCalls.push(table);
      throw new Error('The atomic failure path must not fall back to piecemeal deletes.');
    },
    auth: { admin: { async deleteUser() { destructiveCalls.push('deleteUser'); return { error: null }; } } },
  };

  await assert.rejects(
    () => deleteMemberAccount(admin, 'member-123', 'member@example.com'),
    error => error?.code === 'P0001',
  );
  assert.deepEqual(destructiveCalls, []);
});

test('classifies only the missing atomic routine as rollout-compatible', () => {
  assert.equal(isMissingAccountDeletionRoutine({ code: '42883' }), true);
  assert.equal(isMissingAccountDeletionRoutine({ code: 'PGRST202' }), true);
  assert.equal(isMissingAccountDeletionRoutine({ message: 'delete_member_account does not exist' }), true);
  assert.equal(isMissingAccountDeletionRoutine({ code: 'P0001', message: 'auth deletion failed' }), false);
});

test('falls back to ordered piecemeal deletion including legacy class bookings during rollout', async () => {
  const calls = [];
  const admin = {
    async rpc() { return { error: { code: 'PGRST202', message: 'delete_member_account not found in schema cache' } }; },
    from(table) {
      calls.push(['from', table]);
      return {
        update(values) {
          calls.push(['update', values]);
          return { async eq(column, value) { calls.push(['eq', column, value]); return { error: null }; } };
        },
        delete() {
          return {
            async eq(column, value) { calls.push(['eq', column, value]); return { error: null }; },
            async ilike(column, value) { calls.push(['ilike', column, value]); return { error: null }; },
          };
        },
      };
    },
    auth: { admin: { async deleteUser(userId) { calls.push(['deleteUser', userId]); return { error: null }; } } },
  };

  await deleteMemberAccount(admin, 'member-123', ' Member@Example.com ');
  assert.deepEqual(calls, [
    ['from', 'orders'],
    ['update', { email: null }],
    ['eq', 'user_id', 'member-123'],
    ['from', 'private_session_requests'],
    ['eq', 'user_id', 'member-123'],
    ['from', 'class_bookings'],
    ['ilike', 'email', 'member@example.com'],
    ['deleteUser', 'member-123'],
  ]);
});

test('identifies only missing PT ownership columns and class booking tables as rollout-compatible', () => {
  assert.equal(isMissingPTTrackingColumn({ code: '42703' }), true);
  assert.equal(isMissingPTTrackingColumn({ code: 'PGRST204', message: "Could not find the 'user_id' column" }), true);
  assert.equal(isMissingPTTrackingColumn({ code: 'PGRST204', message: 'Could not find another column' }), false);
  assert.equal(isMissingPTTrackingColumn({ code: '42501', message: 'Permission denied' }), false);
  assert.equal(isMissingClassBookingsTable({ code: '42P01' }), true);
  assert.equal(isMissingClassBookingsTable({ code: 'PGRST205', message: 'class_bookings not found' }), true);
  assert.equal(isMissingClassBookingsTable({ code: '42501', message: 'Permission denied' }), false);
});

test('rollout fallback proceeds through PT rollout gaps but rejects unrelated failures', async () => {
  const adminWithPTError = ptError => ({
    async rpc() { return { error: { code: '42883', message: 'function delete_member_account does not exist' } }; },
    from(table) {
      if (table === 'orders') return { update: () => ({ eq: async () => ({ error: null }) }) };
      if (table === 'class_bookings') return { delete: () => ({ ilike: async () => ({ error: null }) }) };
      return { delete: () => ({ eq: async () => ({ error: ptError }) }) };
    },
    auth: { admin: { deleteUser: async () => ({ error: null }) } },
  });

  await assert.doesNotReject(() => deleteMemberAccountLegacy(
    adminWithPTError({ code: '42703', message: 'column user_id does not exist' }),
    'member-123',
    'member@example.com',
  ));
  await assert.rejects(
    () => deleteMemberAccountLegacy(
      adminWithPTError({ code: '42501', message: 'Permission denied' }),
      'member-123',
      'member@example.com',
    ),
    error => error?.code === '42501' && error?.message === 'Permission denied',
  );
});
