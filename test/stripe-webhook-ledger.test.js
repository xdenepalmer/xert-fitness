import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const paths = [
  '../src/supabase/booking_schema.sql',
  '../src/supabase/stripe_webhook_ledger_upgrade.sql',
  '../supabase/migrations/20260716050000_stripe_webhook_ledger.sql',
];

test('every schema path installs an admin-readable service-only Stripe delivery ledger', async () => {
  for (const path of paths) {
    const sql = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.match(sql, /create table if not exists public\.stripe_webhook_events/i);
    assert.match(sql, /status in \('processing', 'processed', 'ignored', 'failed'\)/i);
    assert.match(sql, /attempts integer not null default 1 check \(attempts > 0\)/i);
    assert.match(sql, /enable row level security/i);
    assert.match(sql, /stripe_webhook_events_admin_read[\s\S]*public\.is_admin\(\)/i);
    assert.match(sql, /begin_stripe_webhook_event/i);
    assert.match(sql, /finish_stripe_webhook_event/i);
    assert.match(sql, /auth\.role\(\) is distinct from 'service_role'/i);
    assert.match(sql, /revoke execute[\s\S]*from public, anon, authenticated/i);
    assert.match(sql, /values \('stripe_webhook_ledger'\)/i);
  }
});

test('delivery retries are atomic and completed events cannot regress to failed', async () => {
  for (const path of paths) {
    const sql = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.match(sql, /on conflict \(event_id\) do update[\s\S]*attempts = public\.stripe_webhook_events\.attempts \+ 1/i);
    assert.match(sql, /status in \('processed', 'ignored'\)[\s\S]*then public\.stripe_webhook_events\.status/i);
    assert.match(sql, /for update/i);
    assert.match(sql, /v_event\.status in \('processed', 'ignored'\) and p_status = 'failed'[\s\S]*return/i);
    assert.match(sql, /order_id = coalesce\(events\.order_id, p_order_id\)/i);
  }
});

test('ledger stores bounded error codes but never raw provider error messages', async () => {
  for (const path of paths) {
    const sql = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.match(sql, /char_length\(last_error_code\) between 1 and 120/i);
    assert.match(sql, /last_error_code ~ '\^\[A-Za-z0-9_\.:\-\]\+\$'/i);
    assert.doesNotMatch(sql, /error_message|stack_trace|request_body/i);
  }
});
