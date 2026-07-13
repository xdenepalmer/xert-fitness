import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deleteMemberAccount,
  hasDeleteAccountConfirmation,
  isMissingPTTrackingColumn,
} from '../api/delete-account.js';

test('requires an explicit destructive account deletion confirmation', () => {
  assert.equal(hasDeleteAccountConfirmation({ confirmation: 'DELETE' }), true);
  assert.equal(hasDeleteAccountConfirmation({ confirmation: 'delete' }), false);
  assert.equal(hasDeleteAccountConfirmation(null), false);
});

test('anonymizes retained orders and removes linked PT requests before deleting auth', async () => {
  const calls = [];
  const admin = {
    from(table) {
      calls.push(['from', table]);
      return {
        update(values) {
          calls.push(['update', values]);
          return {
            async eq(column, value) {
              calls.push(['eq', column, value]);
              return { error: null };
            }
          };
        },
        delete() {
          calls.push(['delete']);
          return {
            async eq(column, value) {
              calls.push(['eq', column, value]);
              return { error: null };
            }
          };
        }
      };
    },
    auth: {
      admin: {
        async deleteUser(userId) {
          calls.push(['deleteUser', userId]);
          return { error: null };
        }
      }
    }
  };

  await deleteMemberAccount(admin, 'member-123');

  assert.deepEqual(calls, [
    ['from', 'orders'],
    ['update', { email: null }],
    ['eq', 'user_id', 'member-123'],
    ['from', 'private_session_requests'],
    ['delete'],
    ['eq', 'user_id', 'member-123'],
    ['deleteUser', 'member-123']
  ]);
});

test('identifies only missing PT ownership columns as rollout-compatible', () => {
  assert.equal(isMissingPTTrackingColumn({ code: '42703' }), true);
  assert.equal(isMissingPTTrackingColumn({ code: 'PGRST204', message: "Could not find the 'user_id' column" }), true);
  assert.equal(isMissingPTTrackingColumn({ code: 'PGRST204', message: 'Could not find another column' }), false);
  assert.equal(isMissingPTTrackingColumn({ code: '42501', message: 'Permission denied' }), false);
});

test('allows account deletion during PT rollout but rejects unrelated database failures', async () => {
  const adminWithPTError = ptError => ({
    from(table) {
      if (table === 'orders') {
        return { update: () => ({ eq: async () => ({ error: null }) }) };
      }
      return { delete: () => ({ eq: async () => ({ error: ptError }) }) };
    },
    auth: { admin: { deleteUser: async () => ({ error: null }) } },
  });

  await assert.doesNotReject(() => deleteMemberAccount(
    adminWithPTError({ code: '42703', message: 'column user_id does not exist' }),
    'member-123'
  ));
  await assert.rejects(
    () => deleteMemberAccount(
      adminWithPTError({ code: '42501', message: 'Permission denied' }),
      'member-123'
    ),
    error => error?.code === '42501' && error?.message === 'Permission denied'
  );
});
