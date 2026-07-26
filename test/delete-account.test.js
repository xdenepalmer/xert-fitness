import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  deleteByNormalizedEmail,
  deleteMemberAccount,
  deleteMemberAccountLegacy,
  hasDeleteAccountConfirmation,
  isMissingAccountDeletionRoutine,
  isMissingAuditSubjectRedactionRoutine,
  isMissingClassBookingsTable,
  isMissingPTTrackingColumn,
  normalizeAccountEmail,
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
    async rpc(name, params) {
      calls.push(['rpc', name, params]);
      if (name === 'delete_member_account') {
        return { error: { code: 'PGRST202', message: 'delete_member_account not found in schema cache' } };
      }
      return { error: null };
    },
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
            async ilike() { throw new Error('ilike must not be used for account email deletes'); },
          };
        },
      };
    },
    auth: { admin: { async deleteUser(userId) { calls.push(['deleteUser', userId]); return { error: null }; } } },
  };

  await deleteMemberAccount(admin, 'member-123', ' Member@Example.com ');
  assert.deepEqual(calls, [
    ['rpc', 'delete_member_account', { p_user_id: 'member-123' }],
    ['from', 'orders'],
    ['update', { email: null }],
    ['eq', 'user_id', 'member-123'],
    ['from', 'private_session_requests'],
    ['eq', 'user_id', 'member-123'],
    ['from', 'class_bookings'],
    ['eq', 'email', 'member@example.com'],
    ['from', 'private_session_requests'],
    ['eq', 'email', 'member@example.com'],
    ['from', 'member_interest'],
    ['eq', 'email', 'member@example.com'],
    ['from', 'trainer_interest'],
    ['eq', 'email', 'member@example.com'],
    ['from', 'partner_interest'],
    ['eq', 'email', 'member@example.com'],
    ['rpc', 'redact_audit_subject_pii', { p_subject_email: 'member@example.com' }],
    ['deleteUser', 'member-123'],
  ]);
});

test('legacy email deletes use exact equality so LIKE wildcards cannot match strangers', async () => {
  assert.equal(normalizeAccountEmail(' A_b%C@Example.com '), 'a_b%c@example.com');

  const filters = [];
  const query = {
    eq(column, value) {
      filters.push(['eq', column, value]);
      return Promise.resolve({ error: null });
    },
    ilike() {
      throw new Error('ilike would treat _ and % as wildcards and match strangers');
    },
  };
  assert.deepEqual(await deleteByNormalizedEmail(query, 'a_b%c@example.com'), { error: null });
  assert.deepEqual(filters, [['eq', 'email', 'a_b%c@example.com']]);

  const emailDeletes = [];
  const rpcs = [];
  const admin = {
    async rpc(name, params) {
      rpcs.push([name, params]);
      return { error: null };
    },
    from(table) {
      return {
        delete() {
          return {
            async eq(column, value) {
              if (column === 'email') emailDeletes.push([table, value]);
              return { error: null };
            },
            async ilike() {
              throw new Error(`ilike on ${table} would match strangers via _/%`);
            },
          };
        },
        update() {
          return { async eq() { return { error: null }; } };
        },
      };
    },
    auth: { admin: { async deleteUser() { return { error: null }; } } },
  };

  await deleteMemberAccountLegacy(admin, 'member-123', 'a_b%c@Example.com');
  assert.deepEqual(emailDeletes, [
    ['class_bookings', 'a_b%c@example.com'],
    ['private_session_requests', 'a_b%c@example.com'],
    ['member_interest', 'a_b%c@example.com'],
    ['trainer_interest', 'a_b%c@example.com'],
    ['partner_interest', 'a_b%c@example.com'],
  ]);
  assert.deepEqual(rpcs, [
    ['redact_audit_subject_pii', { p_subject_email: 'a_b%c@example.com' }],
  ]);

  const source = await readFile(new URL('../api/delete-account.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\.ilike\(/);
  assert.match(source, /deleteByNormalizedEmail\(/);
  assert.match(source, /redact_audit_subject_pii/);
});

test('legacy deletion tolerates a missing audit redaction routine during rollout', () => {
  assert.equal(isMissingAuditSubjectRedactionRoutine({ code: '42883' }), true);
  assert.equal(isMissingAuditSubjectRedactionRoutine({ code: 'PGRST202' }), true);
  assert.equal(
    isMissingAuditSubjectRedactionRoutine({ message: 'redact_audit_subject_pii does not exist' }),
    true,
  );
  assert.equal(isMissingAuditSubjectRedactionRoutine({ code: 'P0001', message: 'EMAIL_REQUIRED' }), false);
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
    async rpc(name) {
      if (name === 'delete_member_account') {
        return { error: { code: '42883', message: 'function delete_member_account does not exist' } };
      }
      return { error: null };
    },
    from(table) {
      if (table === 'orders') return { update: () => ({ eq: async () => ({ error: null }) }) };
      if (table === 'class_bookings'
        || table === 'member_interest'
        || table === 'trainer_interest'
        || table === 'partner_interest') {
        return { delete: () => ({ eq: async () => ({ error: null }) }) };
      }
      return {
        delete: () => ({
          eq: async (column, _value) => (
            column === 'user_id' ? { error: ptError } : { error: null }
          ),
        }),
      };
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
