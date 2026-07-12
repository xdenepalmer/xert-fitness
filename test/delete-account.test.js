import assert from 'node:assert/strict';
import test from 'node:test';

import { deleteMemberAccount, hasDeleteAccountConfirmation } from '../api/delete-account.js';

test('requires an explicit destructive account deletion confirmation', () => {
  assert.equal(hasDeleteAccountConfirmation({ confirmation: 'DELETE' }), true);
  assert.equal(hasDeleteAccountConfirmation({ confirmation: 'delete' }), false);
  assert.equal(hasDeleteAccountConfirmation(null), false);
});

test('anonymizes retained orders before deleting the auth user', async () => {
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
    ['deleteUser', 'member-123']
  ]);
});
