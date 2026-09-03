import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  EMAIL_CHUNK_SIZE, EMAIL_MAX_RECIPIENTS, chunkRecipients, emailCampaignPayload, emailCampaignValidationError,
  emailRecipientsFromRows, mergeCampaignResults, normalizeEmailAddress,
} from '../src/lib/emailCampaigns.js';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('audience rows become unique, emailable recipients', () => {
  const pool = emailRecipientsFromRows([
    { full_name: 'Ada Lovelace', email: ' Ada@Example.com ', detail: 'Member' },
    { full_name: 'Ada again', email: 'ada@example.com' },
    { full_name: 'No address', email: '' },
    { full_name: 'Broken', email: 'not-an-email' },
    { name: 'Lead', email: 'lead@example.com', detail: 'Lead · new' },
  ]);
  assert.deepEqual(pool.recipients.map(recipient => recipient.email), ['ada@example.com', 'lead@example.com']);
  assert.equal(pool.recipients[0].name, 'Ada Lovelace');
  assert.equal(pool.recipients[0].key, 'ada@example.com');
  assert.equal(pool.duplicates, 1);
  assert.equal(pool.missingEmail, 1);
  assert.equal(pool.invalidEmail, 1);
  assert.equal(normalizeEmailAddress('Owner@XERT.com.au'), 'owner@xert.com.au');
  assert.equal(normalizeEmailAddress('nope'), null);
});

test('validation refuses empty, oversized and half-finished emails', () => {
  const recipients = [{ email: 'a@example.com', name: 'A' }];
  assert.equal(emailCampaignValidationError({ subject: '', body: 'x', recipients }), 'Write a subject line.');
  assert.equal(emailCampaignValidationError({ subject: 'Hi', body: ' ', recipients }), 'Write the message to send.');
  assert.match(emailCampaignValidationError({ subject: 'Hi', body: 'x', recipients: [] }), /at least one recipient/);
  assert.match(emailCampaignValidationError({ subject: 'Hi', body: 'x', recipients: Array.from({ length: EMAIL_MAX_RECIPIENTS + 1 }, (_, i) => ({ email: `p${i}@example.com` })) }), /at most 500/);
  assert.match(emailCampaignValidationError({ subject: 'Hi', body: 'x', recipients, ctaLabel: 'Go' }), /both a label and a link/);
  assert.match(emailCampaignValidationError({ subject: 'Hi', body: 'x', recipients, ctaLabel: 'Go', ctaUrl: 'http://x' }), /https:\/\//);
  assert.equal(emailCampaignValidationError({ subject: 'Hi', body: 'x', recipients, ctaLabel: 'Go', ctaUrl: 'https://xertfitness.com.au' }), null);
});

test('the RPC payload carries only addresses, names and the message', () => {
  const payload = emailCampaignPayload({
    subject: ' Open day ', body: ' Come along ', audience: 'members', greeting: false,
    recipients: [{ email: 'a@example.com', name: 'Ada' }, { email: 'b@example.com', name: 'b@example.com', detail: 'secret' }],
    ctaLabel: 'Go', ctaUrl: '',
  });
  assert.deepEqual(payload, {
    p_subject: 'Open day', p_body: 'Come along',
    p_recipients: [{ email: 'a@example.com', name: 'Ada' }, { email: 'b@example.com', name: null }],
    p_audience: 'members', p_greeting: false, p_cta_label: null, p_cta_url: null, p_campaign_id: null,
  });
});

test('big lists go over in paced chunks that share one campaign', () => {
  const recipients = Array.from({ length: 95 }, (_, i) => ({ email: `p${i}@example.com`, name: `P${i}` }));
  const chunks = chunkRecipients(recipients);
  assert.deepEqual(chunks.map(chunk => chunk.length), [EMAIL_CHUNK_SIZE, EMAIL_CHUNK_SIZE, 15]);
  assert.equal(emailCampaignPayload({ subject: 's', body: 'b', recipients: chunks[1], campaignId: 'abc' }).p_campaign_id, 'abc');
  const merged = mergeCampaignResults([
    { campaign_id: 'abc', recipients: 40, queued: 39, skipped: 1, failed: 0, invalid: 0, results: [{ email: 'a' }] },
    { campaign_id: 'abc', recipients: 15, queued: 15, skipped: 0, failed: 0, invalid: 2, results: [{ email: 'b' }] },
  ]);
  assert.deepEqual(merged, { campaign_id: 'abc', recipients: 55, queued: 54, skipped: 1, failed: 0, invalid: 2, results: [{ email: 'a' }, { email: 'b' }] });
});

test('the database builds and sends group emails; the browser only picks people', async () => {
  const sql = await read('../supabase/migrations/20260903010000_email_notifications.sql');
  assert.match(sql, /"campaign": true/);
  assert.match(sql, /create table if not exists public\.email_campaigns/);
  assert.match(sql, /create policy "email_campaigns_admin_read" on public\.email_campaigns for select to authenticated using \(public\.is_admin\(\)\)/);
  assert.match(sql, /create or replace function public\.email_body_html\(p_text text\)/);
  assert.match(sql, /'&', '&amp;'\), '<', '&lt;'\), '>', '&gt;'/, 'owner text is escaped before it enters the layout');
  assert.match(sql, /create or replace function public\.admin_send_bulk_email\(/);
  assert.match(sql, /raise exception 'EMAIL_RECIPIENTS_TOO_MANY'/);
  assert.match(sql, /v_cta_url !~ '\^https:\/\/'/);
  assert.match(sql, /queue_email\('campaign', v_email, v_subject, v_html, v_body, 'email_campaigns', v_campaign_id::text\)/);
  assert.match(sql, /grant execute on function public\.admin_send_bulk_email\(text, text, jsonb, text, boolean, text, text, uuid\) to authenticated/);
  assert.match(sql, /perform pg_sleep\(0\.12\)/, 'bulk loops pace themselves');
  assert.match(sql, /'html', public\.email_ascii_html\(p_html\)/, 'non-ASCII characters are sent as entities so no client shows mojibake');
  assert.match(sql, /xert-email-header\.png/, 'the branded layout carries the baked navy logo header');
  assert.match(sql, /background-color:#ffffff/, 'light body so dark-mode inboxes cannot invert it');
  assert.match(sql, /create or replace function public\.admin_email_confirmed_bookings\(p_session_id uuid default null, p_limit integer default 40\)/);
  assert.match(sql, /l\.subject like 'You are booked in%'/, 'the catch-up never emails a confirmation twice');
  assert.match(sql, /s\.status = 'published' and s\.start_time > now\(\)/);
  assert.match(sql, /create or replace function public\.admin_retry_failed_emails\(p_limit integer default 8\)/);
  assert.match(sql, /error like 'HTTP 429%'/, 'rate-limited sends are retried from the stored payload');
  assert.match(sql, /update public\.email_log set request_id = v_request_id, payload = v_body/);

  const data = await read('../src/lib/adminData.js');
  assert.match(data, /supabase\.rpc\('admin_send_bulk_email', \{ p_campaign_id: null, \.\.\.payload \}\)/);
  assert.match(data, /from\('email_campaigns'\)/);
  assert.match(data, /campaign: 'Emails you write and send to a group'/);

  const composer = await read('../src/components/admin/EmailCampaignComposer.jsx');
  assert.match(composer, /emailRecipientsFromRows\(rows\)/);
  assert.match(composer, /emailCampaignPayload\(/);
  assert.match(composer, /for \(const chunk of chunkRecipients\(selected\)\)/);
  assert.match(composer, /<AdminConfirmDialog/);
  assert.doesNotMatch(composer, /window\.confirm|api\.resend\.com/);
  const manager = await read('../src/components/admin/EmailManager.jsx');
  assert.match(manager, /<EmailCampaignComposer/);
  assert.match(manager, /emailConfirmedBookings\(\)/);
  assert.match(manager, /Email everyone already confirmed/);
  assert.match(manager, /retryFailedEmails\(\)/);
  assert.match(manager, /\['send', 'Send an email'\], \['automatic', 'Automatic emails'\]/);

  // Text members and Email members share one audience loader.
  const audiences = await read('../src/lib/adminAudiences.js');
  assert.match(audiences, /export async function loadAudienceRows\(audience, sessionId\)/);
  const sms = await read('../src/components/admin/SmsManager.jsx');
  assert.match(sms, /from '@\/lib\/adminAudiences'/);
  assert.doesNotMatch(sms, /async function loadAudienceRows/);
});

test('roll-call and decision mistakes can be undone from the request queue', async () => {
  const table = await read('../src/components/admin/BookingRequestsTable.jsx');
  assert.match(table, /\(b\.status === 'attended' \|\| b\.status === 'no_show'\) && \(/);
  assert.match(table, /handleStatusUpdate\(b, 'confirmed'\)\}[\s\S]*?Undo \{b\.status === 'no_show' \? 'no show' : 'attended'\}/);
  assert.match(table, /\(b\.status === 'declined' \|\| b\.status === 'cancelled'\) && \(/);
  assert.match(table, /handleStatusUpdate\(b, 'requested'\)\}[\s\S]*?Reopen/);
  assert.match(table, /b\.status === 'waitlisted' && \(/);
});
