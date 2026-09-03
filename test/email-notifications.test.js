import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('transactional email is sent by the database through Resend with the key held only in Vault', async () => {
  const sql = await read('../supabase/migrations/20260903010000_email_notifications.sql');
  assert.match(sql, /create extension if not exists pg_net/);
  assert.match(sql, /from vault\.decrypted_secrets where name = 'resend_api_key'/);
  assert.match(sql, /net\.http_post\(\s*url := 'https:\/\/api\.resend\.com\/emails'/);
  assert.doesNotMatch(sql, /re_[A-Za-z0-9]{20,}/, 'no Resend key may be written into the migration');
  assert.match(sql, /enabled boolean not null default false/, 'email stays off until the owner turns it on');
  for (const type of ['booking_decisions', 'booking_cancellations', 'class_cancellations', 'pt_decisions', 'enquiry_acknowledgements', 'welcome', 'owner_alerts', 'campaign']) {
    assert.match(sql, new RegExp(`"${type}": true`));
  }
  assert.match(sql, /status = 'skipped', error = 'EMAIL_DISABLED'/);
  assert.match(sql, /status = 'skipped', error = 'EMAIL_TYPE_DISABLED'/);
  assert.match(sql, /status = 'skipped', error = 'RESEND_API_KEY_MISSING'/);
  for (const table of ['email_settings', 'email_log']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(sql, new RegExp(`create policy "${table}_admin_read" on public\\.${table} for select to authenticated using \\(public\\.is_admin\\(\\)\\)`));
  }
  for (const fn of ['queue_email', 'email_provider_key', 'email_owner_alert']) {
    assert.match(sql, new RegExp(`revoke execute on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated`), `${fn} must not be callable from the browser`);
  }
  for (const trigger of ['email_on_session_booking_change', 'email_on_class_booking_change', 'email_on_class_cancelled', 'email_on_pt_request_change', 'email_on_member_interest', 'email_on_profile_created']) {
    assert.match(sql, new RegExp(`create trigger ${trigger}`));
  }
  assert.match(sql, /values \('email_notifications'\)/);
});

test('the Command Centre email screen only reads settings and the log and asks the database to send', async () => {
  const data = await read('../src/lib/adminData.js');
  assert.match(data, /supabase\.rpc\('admin_get_email_settings'\)/);
  assert.match(data, /supabase\.rpc\('admin_update_email_settings', \{ p_patch: patch \|\| \{\} \}\)/);
  assert.match(data, /supabase\.rpc\('admin_send_test_email', \{ p_to: /);
  assert.match(data, /supabase\.rpc\('admin_reconcile_email_log'\)/);
  assert.doesNotMatch(data, /api\.resend\.com|RESEND_API_KEY/);
  const manager = await read('../src/components/admin/EmailManager.jsx');
  assert.match(manager, /Automatic emails are (on|off)/);
  assert.match(manager, /Send test/);
  assert.match(manager, /EMAIL_TYPE_LABELS/);
  const centre = await read('../src/pages/AdminCommandCentre.jsx');
  assert.match(centre, /case 'emails': return <EmailManager initialTab=/);
  const navigation = await read('../src/lib/adminNavigation.js');
  assert.match(navigation, /'emails',/);
  const workspaces = await read('../src/lib/adminWorkspaces.js');
  assert.match(workspaces, /key: 'emails', label: 'Email members'/);
  const capabilities = await read('../src/lib/schemaCapabilities.js');
  assert.match(capabilities, /email_notifications: 'Apply supabase\/migrations\/20260903010000_email_notifications\.sql/);
  const docs = await read('../docs/EMAIL_RESEND_SETUP.md');
  assert.match(docs, /vault\.create_secret/);
  assert.match(docs, /contact\.xertfitness\.com\.au/);
  assert.doesNotMatch(docs, /re_[A-Za-z0-9]{20,}/);
});
