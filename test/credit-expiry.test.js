import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { summarizeExpiringCredits } from '../src/lib/creditExpiry.js';

const NOW = new Date('2026-07-13T00:00:00.000Z');

test('summarizes active credits expiring within seven days', () => {
  const result = summarizeExpiringCredits([
    { remaining: 2, expires_at: '2026-07-15T00:00:00.000Z' },
    { remaining: 3, expires_at: '2026-07-19T00:00:00.000Z' },
    { remaining: 4, expires_at: '2026-07-21T00:00:00.000Z' },
    { remaining: 5, expires_at: null },
    { remaining: 0, expires_at: '2026-07-14T00:00:00.000Z' },
    { remaining: 6, expires_at: '2026-07-12T00:00:00.000Z' },
  ], NOW);

  assert.equal(result.credits, 5);
  assert.equal(result.expiresAt.toISOString(), '2026-07-15T00:00:00.000Z');
  assert.equal(result.daysRemaining, 2);
});

test('returns no warning when active credits are outside the window or never expire', () => {
  assert.equal(summarizeExpiringCredits([
    { remaining: 4, expires_at: '2026-07-21T00:00:00.000Z' },
    { remaining: 2, expires_at: null },
  ], NOW), null);
});

test('web and native member homes expose an actionable expiry warning', () => {
  const account = readFileSync(new URL('../src/pages/Account.jsx', import.meta.url), 'utf8');
  const home = readFileSync(new URL('../ios/XertFitnessApp/XertFitnessApp/Views/HomeView.swift', import.meta.url), 'utf8');
  const models = readFileSync(new URL('../ios/XertFitnessApp/XertFitnessApp/Models.swift', import.meta.url), 'utf8');

  assert.match(account, /summarizeExpiringCredits/);
  assert.match(account, /expiringCredits\.daysRemaining/);
  assert.match(models, /Swift\.max\(1, Int\(ceil\(/);
  assert.doesNotMatch(models, /(?<!Swift\.)\bmax\s*\(/);
  assert.match(account, /Book A Class/);
  assert.match(home, /creditExpirySection/);
  assert.match(home, /Credits Expiring Soon/);
  assert.match(home, /onNavigate\(1\)/);
  assert.match(models, /expirySummary\([\s\S]*windowDays: Int = 7/);
});

test('admin follow-up paths prioritize aggregate expiring-credit data without member leakage', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20260713060000_credit_expiry_follow_up.sql', import.meta.url), 'utf8');
  const manager = readFileSync(new URL('../src/components/admin/MembersManager.jsx', import.meta.url), 'utf8');

  assert.match(migration, /credits_expiring bigint, next_credit_expiry timestamptz/i);
  assert.match(migration, /expires_at > now\(\)[\s\S]*expires_at <= now\(\) \+ interval '7 days'/i);
  assert.match(migration, /credits_expiring > 0 then 'credits_expiring'/i);
  assert.match(migration, /if not public\.is_admin\(\) then raise exception 'ADMIN_ONLY'/i);
  assert.match(migration, /revoke execute on function public\.admin_member_follow_up_queue\(integer\) from public, anon/i);
  assert.match(manager, /Credits expiring/);
  assert.match(manager, /next_credit_expiry/);
});
