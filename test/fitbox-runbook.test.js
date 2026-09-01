import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const runbookUrl = new URL('../docs/FITBOX_ZAPIER_PRODUCTION_RUNBOOK.md', import.meta.url);

test('FitBox production runbook enumerates the complete connector surface and its authority', async () => {
  const runbook = await readFile(runbookUrl, 'utf8');
  const surfaces = [
    'Register User',
    'Update User',
    'Get User',
    'Get Users Next Session',
    'Class Session Booked',
    'Class Session Cancelled',
    'User First Session Booked',
    'User Profile Changed',
    'User Status Changed',
    'User Subscription Changed',
  ];

  for (const surface of surfaces) assert.ok(runbook.includes(`| \`${surface}\` |`));
  assert.match(runbook, /\| `Register User` \| XERT to FitBox \| \*\*LIVE\*\*/);
  assert.match(runbook, /\| `Update User` \| XERT to FitBox \| \*\*DISABLED\*\*/);
  assert.match(runbook, /\| `Get User` \| XERT query \/ FitBox result \| \*\*READ-ONLY\*\*/);
  assert.match(runbook, /\| `Get Users Next Session` \| XERT query \/ FitBox result \| \*\*DISABLED\*\*/);
  assert.equal((runbook.match(/\| \*\*READ-ONLY\*\* \|/g) || []).length, 7);
});

test('FitBox production runbook fixes exact Zap names and server-only settings without values', async () => {
  const runbook = await readFile(runbookUrl, 'utf8');
  const zapNames = [
    'XERT → FitBox — Register Approved Prospect',
    'XERT → FitBox — Get User — Read Only',
    'FitBox → XERT — Class Session Booked (Review Only)',
    'FitBox → XERT — Class Session Cancelled (Review Only)',
    'FitBox → XERT — User First Session Booked (Review Only)',
    'FitBox → XERT — User Profile Changed (Review Only)',
    'FitBox → XERT — User Status Changed (Review Only)',
    'FitBox → XERT — User Subscription Changed (Review Only)',
  ];
  const environmentNames = [
    'APP_BASE_URL',
    'FITBOX_GYM_ID',
    'FITBOX_ZAPIER_INGRESS_SECRET',
    'ZAPIER_FITBOX_REGISTER_HOOK_URL',
    'ZAPIER_FITBOX_GET_USER_HOOK_URL',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];

  for (const name of zapNames) assert.match(runbook, new RegExp(name));
  for (const name of environmentNames) assert.match(runbook, new RegExp(`^${name}$`, 'm'));
  assert.doesNotMatch(runbook, /hooks\.zapier\.com\/hooks\/catch\/\d+\/\d+/);
  assert.doesNotMatch(runbook, /FITBOX_ZAPIER_INGRESS_SECRET\s*=\s*\S+/);
  assert.doesNotMatch(runbook, /SUPABASE_SERVICE_ROLE_KEY\s*=\s*\S+/);
});

test('FitBox production runbook preserves minimization, review and rollback boundaries', async () => {
  const runbook = await readFile(runbookUrl, 'utf8');
  const prose = runbook.replace(/\s+/g, ' ');

  assert.match(prose, /Do not map names, email, phone, DOB, address, gender, weight, height/);
  assert.match(prose, /stores every accepted trigger as `needs_review`/);
  assert.match(prose, /Never link by name/);
  assert.match(prose, /Do not deduplicate logical provider events by payload hash/);
  assert.match(prose, /No failed prospect handoffs in the last 24 hours/);
  assert.match(prose, /older than 15 minutes/);
  assert.match(prose, /Preserve integration jobs, member links, event evidence and Zap History/);
  assert.match(prose, /never silently fall back/);
});
