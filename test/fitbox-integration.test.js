import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  FITBOX_EVENT_TYPES,
  fitboxIntegrationEnvironment,
  fitboxEventEnvironment,
  fitboxGetUserDispatchPayload,
  fitboxGetUserEnvironment,
  fitboxProspectDispatchPayload,
  normalizeFitboxCallback,
  normalizeFitboxEvent,
  normalizeFitboxLeadID,
  prospectForFitbox,
  publicFitboxJob,
  splitFitboxName,
} from '../src/lib/fitboxIntegration.js';

const JOB_ID = 'a9c7bc2e-3fa4-4dcf-8e19-f4defa0ce041';
const TOKEN = 'a'.repeat(43);
const ENV = {
  ZAPIER_FITBOX_REGISTER_HOOK_URL: 'https://hooks.zapier.com/hooks/catch/1/2/',
  ZAPIER_FITBOX_GET_USER_HOOK_URL: 'https://hooks.zapier.com/hooks/catch/1/3/',
  APP_BASE_URL: 'https://xertfitness.com.au/',
  FITBOX_GYM_ID: '545',
};

test('FitBox prospect data is deliberately bounded and requires a usable identity', () => {
  assert.deepEqual(splitFitboxName('  Byron   Palmer  '), { firstname: 'Byron', lastname: 'Palmer' });
  assert.deepEqual(prospectForFitbox({
    full_name: 'Byron Dene Palmer', email: ' BYRON@EXAMPLE.COM ', phone: ' 0400 000 000 ', suburb_town: ' Kingaroy ',
  }), {
    firstname: 'Byron', lastname: 'Dene Palmer', email: 'byron@example.com', contact_phone: '0400 000 000', city: 'Kingaroy',
  });
  assert.throws(() => splitFitboxName('Byron'), /FITBOX_FULL_NAME_REQUIRED/);
  assert.throws(() => prospectForFitbox({ full_name: 'Byron Palmer', email: 'bad', phone: '0400' }), /FITBOX_EMAIL_REQUIRED/);
  assert.throws(() => prospectForFitbox({ full_name: 'Byron Palmer', email: 'b@example.com' }), /FITBOX_PHONE_REQUIRED/);
  assert.equal(normalizeFitboxLeadID(' 12345 '), '12345');
  assert.throws(() => normalizeFitboxLeadID('../123'), /INVALID_FITBOX_LEAD_ID/);
});

test('Get User refresh is a separate fail-closed, read-only Zapier job', () => {
  assert.deepEqual(fitboxGetUserEnvironment(ENV).missing, []);
  assert.deepEqual(
    fitboxGetUserEnvironment({ ...ENV, ZAPIER_FITBOX_GET_USER_HOOK_URL: 'https://example.com/not-zapier' }).missing,
    ['ZAPIER_FITBOX_GET_USER_HOOK_URL']
  );
  assert.deepEqual(fitboxGetUserDispatchPayload({
    jobId: JOB_ID,
    callbackToken: TOKEN,
    fitboxUserId: '90210',
    environment: ENV,
  }), {
    event_type: 'xert_fitbox_get_user',
    job_id: JOB_ID,
    callback_url: 'https://xertfitness.com.au/api/fitbox-prospect-result',
    callback_token: TOKEN,
    fitbox_gym_id: '545',
    fitbox_user_id: '90210',
  });
});

test('FitBox integration fails closed until every server-only setting is valid', () => {
  assert.deepEqual(fitboxIntegrationEnvironment(ENV).missing, []);
  assert.deepEqual(
    fitboxIntegrationEnvironment({ ...ENV, ZAPIER_FITBOX_REGISTER_HOOK_URL: 'http://hooks.zapier.com/secret' }).missing,
    ['ZAPIER_FITBOX_REGISTER_HOOK_URL']
  );
  assert.deepEqual(
    fitboxIntegrationEnvironment({ ...ENV, APP_BASE_URL: 'https://user:pass@example.com', FITBOX_GYM_ID: '' }).missing,
    ['APP_BASE_URL', 'FITBOX_GYM_ID']
  );
});

test('Zapier dispatch is explicit and carries a one-time callback capability', () => {
  assert.deepEqual(fitboxProspectDispatchPayload({
    jobId: JOB_ID,
    callbackToken: TOKEN,
    environment: ENV,
    lead: { full_name: 'Test Prospect', email: 'test@example.com', phone: '0400 000 000' },
  }), {
    event_type: 'xert_fitbox_register_prospect',
    job_id: JOB_ID,
    callback_url: 'https://xertfitness.com.au/api/fitbox-prospect-result',
    callback_token: TOKEN,
    fitbox_gym_id: '545',
    firstname: 'Test',
    lastname: 'Prospect',
    email: 'test@example.com',
    contact_phone: '0400 000 000',
  });
});

test('FitBox callback rejects missing identity and normalizes provider status', () => {
  assert.deepEqual(normalizeFitboxCallback({
    job_id: JOB_ID, callback_token: TOKEN, fitbox_gym_id: '545', fitbox_user_id: '90210', fitbox_status: ' Prospect ', error: false,
  }), {
    jobId: JOB_ID, callbackToken: TOKEN, gymId: '545', userId: '90210', status: 'prospect', failed: false, message: null,
  });
  assert.throws(() => normalizeFitboxCallback({ job_id: JOB_ID, callback_token: TOKEN, fitbox_gym_id: '545' }), /INVALID_FITBOX_CALLBACK/);
  assert.equal(normalizeFitboxCallback({
    job_id: JOB_ID, callback_token: TOKEN, fitbox_gym_id: '545', error: true, message: 'Provider rejected the prospect.',
  }).failed, true);
});

test('FitBox callback accepts modern RFC UUIDv7 job identifiers', () => {
  const callback = normalizeFitboxCallback({
    job_id: '019f8650-5ee0-7ca2-892f-c83961192ef4',
    callback_token: TOKEN,
    fitbox_gym_id: '545',
    fitbox_user_id: '100533',
    fitbox_status: 'prospect',
  });

  assert.equal(callback.jobId, '019f8650-5ee0-7ca2-892f-c83961192ef4');
});

test('Get User callback keeps only the verified read-only profile fields', () => {
  const callback = normalizeFitboxCallback({
    job_id: JOB_ID,
    callback_token: TOKEN,
    fitbox_gym_id: '545',
    fitbox_user_id: '90210',
    fitbox_status: ' Active ',
    fitbox_first_name: ' Test ',
    fitbox_last_name: ' Member ',
    fitbox_email: ' TEST@EXAMPLE.COM ',
    fitbox_phone: ' 0400 000 000 ',
    fitbox_date_of_birth: '2020-01-01',
  });
  assert.deepEqual(callback.profile, {
    firstName: 'Test', lastName: 'Member', email: 'test@example.com', phone: '0400 000 000',
  });
  assert.equal(callback.fitbox_date_of_birth, undefined);
});

test('all verified FitBox triggers normalize into a minimal read-only envelope', () => {
  const eventTypes = [
    'class_session_booked', 'class_session_cancelled', 'user_first_session_booked',
    'user_profile_changed', 'user_status_changed', 'user_subscription_changed',
  ];
  assert.deepEqual(FITBOX_EVENT_TYPES, eventTypes);
  for (const event_type of eventTypes) {
    assert.deepEqual(normalizeFitboxEvent({
      event_type,
      fitbox_gym_id: '545',
      fitbox_user_id: '90210',
      status: ' Active ',
      provider_occurred_at: '2026-09-02T01:02:03Z',
      ignored_contact_data: 'must not be returned',
    }), {
      eventType: event_type,
      gymId: '545',
      userId: '90210',
      bookingId: null,
      sessionId: null,
      subscriptionId: null,
      providerEventId: null,
      deliveryId: null,
      status: 'active',
      providerOccurredAt: '2026-09-02T01:02:03.000Z',
      providerUpdatedAt: null,
    });
  }
  assert.throws(() => normalizeFitboxEvent({ event_type: 'attendance_marked', fitbox_gym_id: '545', fitbox_user_id: '1' }), /INVALID_FITBOX_EVENT/);
  assert.throws(() => normalizeFitboxEvent({ event_type: 'user_status_changed', fitbox_gym_id: '545' }), /INVALID_FITBOX_EVENT/);
  assert.deepEqual(fitboxEventEnvironment({ FITBOX_GYM_ID: '545', FITBOX_ZAPIER_INGRESS_SECRET: 'x'.repeat(32) }).missing, []);
});

test('Admin job summaries never expose callback hashes or lead contact data', () => {
  const safe = publicFitboxJob({ id: JOB_ID, status: 'dispatched', callback_token_hash: 'secret', email: 'private@example.com', created_at: '2026-09-01T00:00:00Z' });
  assert.equal(safe.callback_token_hash, undefined);
  assert.equal(safe.email, undefined);
  assert.equal(safe.status, 'dispatched');
});

test('FitBox server endpoints remain server-only and use the durable callback contract', async () => {
  const admin = await readFile(new URL('../api/admin-fitbox-integration.js', import.meta.url), 'utf8');
  const contract = await readFile(new URL('../src/lib/fitboxIntegration.js', import.meta.url), 'utf8');
  assert.match(admin, /auth\.getUser\(token\)/);
  assert.match(contract, /ZAPIER_FITBOX_REGISTER_HOOK_URL/);
  assert.match(contract, /ZAPIER_FITBOX_GET_USER_HOOK_URL/);
  assert.match(admin, /callback_token_hash/);
  assert.doesNotMatch(admin, /SUPABASE_SERVICE_ROLE_KEY[^\n]*VITE_/);
  assert.match(admin, /complete_fitbox_prospect_job/);
  assert.match(admin, /complete_fitbox_get_user_job/);
  assert.match(admin, /action === 'refresh_user'/);
  assert.match(admin, /fail_fitbox_prospect_job/);
  assert.match(admin, /normalizeFitboxCallback\(zapierDataEnvelope\(body\)\)/);
  assert.match(admin, /normalizeFitboxEvent\(zapierDataEnvelope\(body\)\)/);
  assert.match(admin, /error\?\.code === '23505' && event\.deliveryId/);
  assert.match(admin, /\{ received: true, duplicate: true \}/);
  assert.match(admin, /event_types: eventTypes/);
  assert.match(admin, /launch_validation: \{/);
  assert.match(admin, /read_only_profile_completed: Number\(allTimeProfileRefreshes\.count \|\| 0\)/);
  assert.match(admin, /needs_review: Number\(reviews\.count/);
  assert.match(admin, /last_received_at: latestEvent\.data\?\.received_at/);
  assert.match(admin, /timingSafeEqual/);
  const vercel = await readFile(new URL('../vercel.json', import.meta.url), 'utf8');
  assert.match(vercel, /fitbox-prospect-result/);
  assert.match(vercel, /admin-fitbox-integration\?service=callback/);
  assert.match(vercel, /fitbox-events/);
  assert.match(vercel, /admin-fitbox-integration\?service=event/);
});

test('FitBox migration is fail-closed, admin-readable and service-mutated only', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20260902010000_fitbox_zapier_bridge.sql', import.meta.url), 'utf8');
  const upgrade = await readFile(new URL('../supabase/migrations/20260902020000_fitbox_get_user_refresh.sql', import.meta.url), 'utf8');
  assert.match(sql, /create table if not exists public\.fitbox_integration_jobs/i);
  assert.match(sql, /create table if not exists public\.fitbox_member_links/i);
  assert.match(sql, /create table if not exists public\.fitbox_integration_events/i);
  assert.match(sql, /processing_state text not null default 'needs_review'/i);
  assert.match(sql, /unique index if not exists fitbox_integration_events_delivery_unique[\s\S]*where delivery_id is not null/i);
  assert.match(sql, /unique index if not exists fitbox_integration_jobs_active_lead_unique/i);
  assert.match(sql, /alter table public\.fitbox_integration_jobs enable row level security/i);
  assert.match(sql, /using \(public\.is_admin\(\)\)/i);
  assert.match(sql, /revoke all on table public\.fitbox_integration_jobs from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.complete_fitbox_prospect_job[\s\S]*to service_role/i);
  assert.match(sql, /complete_fitbox_get_user_job/i);
  assert.match(sql, /profile_synced_at/i);
  assert.match(upgrade, /check \(job_type in \('register_prospect', 'get_user'\)\)/i);
  assert.match(upgrade, /XERT identity, membership, booking or billing state/i);
  assert.match(upgrade, /grant execute on function public\.complete_fitbox_get_user_job[\s\S]*to service_role/i);
  assert.match(sql, /FITBOX_IDENTITY_CONFLICT/);
  assert.match(sql, /values \('fitbox_zapier_bridge'\)/i);
});

test('FitBox reconciliation is bounded, admin-only and acknowledges evidence without provider mutation', async () => {
  const admin = await readFile(new URL('../api/admin-fitbox-integration.js', import.meta.url), 'utf8');
  const client = await readFile(new URL('../src/lib/adminData.js', import.meta.url), 'utf8');
  const queue = await readFile(new URL('../src/components/admin/FitboxReconciliation.jsx', import.meta.url), 'utf8');
  const navigation = await readFile(new URL('../src/lib/adminNavigation.js', import.meta.url), 'utf8');

  assert.match(admin, /const EVENT_PAGE_LIMIT = 50/);
  assert.match(admin, /function publicFitboxEvent\(event\)/);
  assert.match(admin, /async function fitboxLinkIntegrity\(admin\)/);
  assert.match(admin, /link_integrity: linkIntegrity/);
  assert.match(admin, /const validLeadIds = leadIds\.filter\(leadId => XERT_LEAD_ID_PATTERN\.test\(leadId\)\)/);
  assert.match(admin, /orphaned: invalidLeadIds\.length \+ validLeadIds\.filter/);
  assert.match(admin, /FitBox admin read failed/);
  assert.match(admin, /errorCode: typeof error\?\.code === 'string'/);
  assert.match(admin, /action === 'review_event'/);
  assert.match(admin, /\.eq\('processing_state', 'needs_review'\)/);
  assert.match(client, /getFitboxReconciliationEvents/);
  assert.match(client, /acknowledgeFitboxReconciliationEvent/);
  assert.match(queue, /protected XERT review ledger/);
  assert.match(queue, /FitBox link needs source review/);
  assert.match(queue, /does not contact FitBox or change any booking, credit, membership, payment or member profile/);
  assert.match(navigation, /'fitbox'/);
});
