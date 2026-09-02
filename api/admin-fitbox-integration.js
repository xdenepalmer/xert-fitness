import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createRequestTrace, requestHeader, requestJson } from '../src/lib/serverHttp.js';
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
} from '../src/lib/fitboxIntegration.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAX_REQUEST_BYTES = 8_192;
const DISPATCH_TIMEOUT_MS = 12_000;
const EVENT_REQUEST_BYTES = 16_384;
const EVENT_PAGE_LIMIT = 50;
const FITBOX_EVENT_STATES = new Set(['needs_review', 'reviewed', 'ignored']);
const FITBOX_EVENT_SELECT = 'id, event_type, fitbox_gym_id, fitbox_user_id, fitbox_booking_id, fitbox_session_id, fitbox_subscription_id, provider_event_id, delivery_id, provider_status, provider_occurred_at, provider_updated_at, processing_state, review_reason, reviewed_at, received_at';

function callbackTokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

function safeHashMatch(receivedHash, expectedHash) {
  const received = Buffer.from(String(receivedHash || ''), 'utf8');
  const expected = Buffer.from(String(expectedHash || ''), 'utf8');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function callbackErrorCode(message, jobType = 'register_prospect') {
  const normalized = String(message || '').toUpperCase();
  if (jobType === 'get_user') {
    if (/NOT FOUND|NOTHING COULD BE FOUND|NO USER/.test(normalized)) return 'FITBOX_USER_NOT_FOUND';
    if (/INVALID|REQUIRED|MISSING/.test(normalized)) return 'FITBOX_PROFILE_REFRESH_INVALID';
    return 'FITBOX_PROFILE_REFRESH_REJECTED';
  }
  if (/DUPLICATE/.test(normalized)) return 'FITBOX_DUPLICATE_REVIEW';
  if (/INVALID|REQUIRED|MISSING/.test(normalized)) return 'FITBOX_PROSPECT_INVALID';
  return 'FITBOX_PROVIDER_REJECTED';
}

function requestService(request) {
  return request.query?.service ?? new URL(request.url || '', 'https://xert.invalid').searchParams.get('service');
}

function zapierDataEnvelope(body) {
  if (body?.data && typeof body.data === 'object' && !Array.isArray(body.data)) return body.data;
  return body;
}

async function handleFitboxCallback(request, admin, trace) {
  const { json } = trace;
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  let callback;
  try {
    const body = await requestJson(request);
    if (Buffer.byteLength(JSON.stringify(body || {}), 'utf8') > 16_384) throw new Error('REQUEST_TOO_LARGE');
    callback = normalizeFitboxCallback(zapierDataEnvelope(body));
  } catch {
    return json({ error: 'Invalid callback.' }, 400);
  }

  try {
    const { data: job, error: jobError } = await admin.from('fitbox_integration_jobs')
      .select('id, job_type, callback_token_hash, fitbox_gym_id, fitbox_user_id, status, expires_at')
      .eq('id', callback.jobId).maybeSingle();
    if (jobError) throw jobError;
    const receivedHash = callbackTokenHash(callback.callbackToken);
    if (!job || !safeHashMatch(receivedHash, job.callback_token_hash) || job.fitbox_gym_id !== callback.gymId) {
      return json({ error: 'Callback was not accepted.' }, 401);
    }
    if (new Date(job.expires_at).getTime() <= Date.now() && job.status !== 'completed') {
      await admin.rpc('fail_fitbox_prospect_job', {
        p_job_id: callback.jobId,
        p_callback_token_hash: receivedHash,
        p_error_code: 'FITBOX_CALLBACK_EXPIRED',
      });
      return json({ error: 'Callback expired.' }, 410);
    }
    if (callback.failed) {
      const { data, error } = await admin.rpc('fail_fitbox_prospect_job', {
        p_job_id: callback.jobId,
        p_callback_token_hash: receivedHash,
        p_error_code: callbackErrorCode(callback.message, job.job_type),
      });
      if (error) throw error;
      console.warn('FitBox Zapier job returned a provider failure.', { requestId: trace.requestId, jobId: callback.jobId, jobType: job.job_type, errorCode: data?.last_error_code });
      return json({ received: true, status: 'failed' });
    }
    if (job.job_type === 'get_user') {
      if (!callback.status || !callback.profile?.email) {
        await admin.rpc('fail_fitbox_prospect_job', {
          p_job_id: callback.jobId,
          p_callback_token_hash: receivedHash,
          p_error_code: 'FITBOX_PROFILE_REFRESH_INVALID',
        });
        return json({ error: 'FitBox returned an incomplete profile result.' }, 422);
      }
      const { data, error } = await admin.rpc('complete_fitbox_get_user_job', {
        p_job_id: callback.jobId,
        p_callback_token_hash: receivedHash,
        p_fitbox_gym_id: callback.gymId,
        p_fitbox_user_id: callback.userId,
        p_fitbox_status: callback.status,
        p_profile_first_name: callback.profile?.firstName || null,
        p_profile_last_name: callback.profile?.lastName || null,
        p_profile_email: callback.profile?.email || null,
        p_profile_phone: callback.profile?.phone || null,
      });
      if (error) {
        if (/FITBOX_LOOKUP_IDENTITY_MISMATCH/.test(error.message || '')) {
          await admin.rpc('fail_fitbox_prospect_job', {
            p_job_id: callback.jobId,
            p_callback_token_hash: receivedHash,
            p_error_code: 'FITBOX_LOOKUP_IDENTITY_MISMATCH',
          });
          return json({ error: 'FitBox profile identity requires operator review.' }, 409);
        }
        throw error;
      }
      console.info('FitBox read-only profile refresh completed.', { requestId: trace.requestId, jobId: callback.jobId });
      return json({ received: true, status: data?.status || 'completed' });
    }
    const { data, error } = await admin.rpc('complete_fitbox_prospect_job', {
      p_job_id: callback.jobId,
      p_callback_token_hash: receivedHash,
      p_fitbox_gym_id: callback.gymId,
      p_fitbox_user_id: callback.userId,
      p_fitbox_status: callback.status,
    });
    if (error) {
      if (/FITBOX_IDENTITY_CONFLICT/.test(error.message || '')) {
        await admin.rpc('fail_fitbox_prospect_job', {
          p_job_id: callback.jobId,
          p_callback_token_hash: receivedHash,
          p_error_code: 'FITBOX_IDENTITY_CONFLICT',
        });
        return json({ error: 'FitBox identity requires operator review.' }, 409);
      }
      throw error;
    }
    console.info('FitBox prospect handoff completed.', { requestId: trace.requestId, jobId: callback.jobId });
    return json({ received: true, status: data?.status || 'completed' });
  } catch (error) {
    if (['42P01', 'PGRST205'].includes(error.code)) return json({ error: 'FitBox callback storage is unavailable.' }, 503);
    if (/FITBOX_CALLBACK_(?:REJECTED|CONFLICT)|FITBOX_JOB_NOT_ACTIVE|FITBOX_JOB_TYPE_MISMATCH|FITBOX_GYM_MISMATCH/.test(error.message || '')) {
      return json({ error: 'Callback was not accepted.' }, 409);
    }
    return json({ error: 'Callback could not be processed.' }, 500);
  }
}

async function handleFitboxEvent(request, admin, trace) {
  const { json } = trace;
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const config = fitboxEventEnvironment(process.env);
  if (!config.ready) return json({ error: 'FitBox event ingress is unavailable.' }, 503);
  const receivedSecret = requestHeader(request, 'x-xert-fitbox-secret');
  if (!safeHashMatch(callbackTokenHash(receivedSecret), callbackTokenHash(config.secret))) {
    return json({ error: 'Event was not accepted.' }, 401);
  }

  let event;
  try {
    const body = await requestJson(request);
    if (Buffer.byteLength(JSON.stringify(body || {}), 'utf8') > EVENT_REQUEST_BYTES) throw new Error('REQUEST_TOO_LARGE');
    event = normalizeFitboxEvent(zapierDataEnvelope(body));
  } catch {
    return json({ error: 'Invalid FitBox event.' }, 400);
  }
  if (event.gymId !== config.gymId) return json({ error: 'Event was not accepted.' }, 401);

  try {
    const { data, error } = await admin.from('fitbox_integration_events').insert({
      event_type: event.eventType,
      fitbox_gym_id: event.gymId,
      fitbox_user_id: event.userId,
      fitbox_booking_id: event.bookingId,
      fitbox_session_id: event.sessionId,
      fitbox_subscription_id: event.subscriptionId,
      provider_event_id: event.providerEventId,
      delivery_id: event.deliveryId,
      provider_status: event.status,
      provider_occurred_at: event.providerOccurredAt,
      provider_updated_at: event.providerUpdatedAt,
      processing_state: 'needs_review',
      review_reason: event.providerEventId && (event.providerOccurredAt || event.providerUpdatedAt)
        ? 'PROVIDER_CONTRACT_UNVERIFIED'
        : 'MISSING_STABLE_EVENT_IDENTITY',
    }).select('id, processing_state, received_at').single();
    if (error?.code === '23505' && event.deliveryId) return json({ received: true, duplicate: true }, 200);
    if (error) throw error;
    console.info('FitBox event stored for read-only reconciliation.', {
      requestId: trace.requestId,
      eventId: data.id,
      eventType: event.eventType,
    });
    return json({ received: true, event_id: data.id, processing_state: data.processing_state }, 202);
  } catch (error) {
    if (['42P01', 'PGRST205'].includes(error.code)) return json({ error: 'FitBox event storage is unavailable.' }, 503);
    return json({ error: 'FitBox event could not be stored.' }, 500);
  }
}

async function requireAdmin(request, admin) {
  const authHeader = requestHeader(request, 'authorization');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return { error: 'Not authenticated.', status: 401 };
  const { data: { user }, error: userError } = await admin.auth.getUser(token);
  if (userError || !user) return { error: 'Invalid or expired session.', status: 401 };
  const { data: profile, error: profileError } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profileError) return { error: 'Could not verify admin access.', status: 500 };
  if (profile?.role !== 'admin') return { error: 'Admin access required.', status: 403 };
  return { user };
}

function requestLeadID(request) {
  const value = request.query?.lead_id ?? new URL(request.url, 'https://xert.invalid').searchParams.get('lead_id');
  return normalizeFitboxLeadID(value);
}

function requestQuery(request, key) {
  return request.query?.[key] ?? new URL(request.url, 'https://xert.invalid').searchParams.get(key);
}

function normalizeFitboxEventID(value) {
  const id = String(value || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('INVALID_FITBOX_EVENT_ID');
  }
  return id;
}

function fitboxEventState(value) {
  const state = String(value || 'needs_review').trim().toLowerCase();
  if (!FITBOX_EVENT_STATES.has(state)) throw new Error('INVALID_FITBOX_EVENT_STATE');
  return state;
}

function publicFitboxEvent(event) {
  if (!event) return null;
  return {
    id: event.id,
    event_type: event.event_type,
    fitbox_gym_id: event.fitbox_gym_id,
    fitbox_user_id: event.fitbox_user_id,
    fitbox_booking_id: event.fitbox_booking_id,
    fitbox_session_id: event.fitbox_session_id,
    fitbox_subscription_id: event.fitbox_subscription_id,
    provider_event_id: event.provider_event_id,
    delivery_id: event.delivery_id,
    provider_status: event.provider_status,
    provider_occurred_at: event.provider_occurred_at,
    provider_updated_at: event.provider_updated_at,
    processing_state: event.processing_state,
    review_reason: event.review_reason,
    reviewed_at: event.reviewed_at,
    received_at: event.received_at,
  };
}

async function fitboxReconciliationEvents(admin, state) {
  const [{ data, error }, linkIntegrity] = await Promise.all([
    admin.from('fitbox_integration_events')
    .select(FITBOX_EVENT_SELECT)
    .eq('processing_state', state)
    .order('received_at', { ascending: false })
    .limit(EVENT_PAGE_LIMIT),
    fitboxLinkIntegrity(admin),
  ]);
  if (error) throw error;
  return { events: (data || []).map(publicFitboxEvent), state, limit: EVENT_PAGE_LIMIT, link_integrity: linkIntegrity };
}

async function reviewFitboxEvent(admin, eventId, reviewerId) {
  const reviewedAt = new Date().toISOString();
  const { data, error } = await admin.from('fitbox_integration_events')
    .update({ processing_state: 'reviewed', reviewed_by: reviewerId, reviewed_at: reviewedAt })
    .eq('id', eventId)
    .eq('processing_state', 'needs_review')
    .select(FITBOX_EVENT_SELECT)
    .maybeSingle();
  if (error) throw error;
  if (data) return { event: publicFitboxEvent(data), already_reviewed: false };

  const { data: existing, error: existingError } = await admin.from('fitbox_integration_events')
    .select(FITBOX_EVENT_SELECT).eq('id', eventId).maybeSingle();
  if (existingError) throw existingError;
  if (!existing) throw new Error('FITBOX_EVENT_NOT_FOUND');
  if (existing.processing_state !== 'reviewed') throw new Error('FITBOX_EVENT_NOT_REVIEWABLE');
  return { event: publicFitboxEvent(existing), already_reviewed: true };
}

async function leadIntegrationState(admin, leadId) {
  const { error: expiryError } = await admin.from('fitbox_integration_jobs').update({
    status: 'expired',
    last_error_code: 'FITBOX_PROFILE_REFRESH_EXPIRED',
    updated_at: new Date().toISOString(),
  }).eq('job_type', 'get_user')
    .eq('lead_type', 'member_interest')
    .eq('lead_id', leadId)
    .in('status', ['queued', 'dispatched', 'dispatch_unknown'])
    .lt('expires_at', new Date().toISOString());
  if (expiryError) throw expiryError;
  const [linkResult, jobsResult] = await Promise.all([
    admin.from('fitbox_member_links')
      .select('id, fitbox_gym_id, fitbox_user_id, fitbox_status, profile_first_name, profile_last_name, profile_email, profile_phone, profile_synced_at, linked_at, last_verified_at')
      .eq('lead_type', 'member_interest').eq('lead_id', leadId).maybeSingle(),
    admin.from('fitbox_integration_jobs')
      .select('id, job_type, status, fitbox_user_id, fitbox_status, last_error_code, dispatched_at, completed_at, created_at')
      .eq('lead_type', 'member_interest').eq('lead_id', leadId)
      .order('created_at', { ascending: false }).limit(5),
  ]);
  if (linkResult.error) throw linkResult.error;
  if (jobsResult.error) throw jobsResult.error;
  return {
    link: linkResult.data || null,
    current_job: publicFitboxJob(jobsResult.data?.[0]),
    recent_jobs: (jobsResult.data || []).map(publicFitboxJob),
  };
}

async function fitboxLinkIntegrity(admin) {
  const { data: links, error: linkError } = await admin.from('fitbox_member_links')
    .select('lead_id')
    .eq('lead_type', 'member_interest')
    .limit(200);
  if (linkError) throw linkError;
  const leadIds = [...new Set((links || []).map(link => link.lead_id).filter(Boolean))];
  if (!leadIds.length) return { checked: 0, orphaned: 0 };
  const { data: leads, error: leadError } = await admin.from('member_interest').select('id').in('id', leadIds);
  if (leadError) throw leadError;
  const found = new Set((leads || []).map(lead => lead.id));
  return { checked: leadIds.length, orphaned: leadIds.filter(id => !found.has(id)).length };
}

async function integrationHealth(admin) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString();
  const staleBefore = new Date(Date.now() - 15 * 60 * 1_000).toISOString();
  const [completed, failed, profileRefreshes, profileRefreshFailures, profileRefreshReviews, active, stale, latest, eventTypes, linkIntegrity] = await Promise.all([
    admin.from('fitbox_integration_jobs').select('id', { count: 'exact', head: true }).eq('status', 'completed').gte('updated_at', since),
    admin.from('fitbox_integration_jobs').select('id', { count: 'exact', head: true }).eq('status', 'failed').gte('updated_at', since),
    admin.from('fitbox_integration_jobs').select('id', { count: 'exact', head: true }).eq('job_type', 'get_user').eq('status', 'completed').gte('updated_at', since),
    admin.from('fitbox_integration_jobs').select('id', { count: 'exact', head: true }).eq('job_type', 'get_user').eq('status', 'failed').gte('updated_at', since),
    admin.from('fitbox_integration_jobs').select('id', { count: 'exact', head: true }).eq('job_type', 'get_user').eq('status', 'failed')
      .in('last_error_code', ['FITBOX_USER_NOT_FOUND', 'FITBOX_LOOKUP_IDENTITY_MISMATCH']),
    admin.from('fitbox_integration_jobs').select('id', { count: 'exact', head: true }).in('status', ['queued', 'dispatched', 'dispatch_unknown']),
    admin.from('fitbox_integration_jobs').select('id', { count: 'exact', head: true }).in('status', ['queued', 'dispatched', 'dispatch_unknown']).lt('updated_at', staleBefore),
    admin.from('fitbox_integration_jobs').select('status, fitbox_user_id, last_error_code, updated_at').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    Promise.all(FITBOX_EVENT_TYPES.map(async eventType => {
      const [recent, reviews, latestEvent] = await Promise.all([
        admin.from('fitbox_integration_events').select('id', { count: 'exact', head: true })
          .eq('event_type', eventType).gte('received_at', since),
        admin.from('fitbox_integration_events').select('id', { count: 'exact', head: true })
          .eq('event_type', eventType).eq('processing_state', 'needs_review'),
        admin.from('fitbox_integration_events')
          .select('processing_state, review_reason, received_at')
          .eq('event_type', eventType).order('received_at', { ascending: false }).limit(1).maybeSingle(),
      ]);
      for (const result of [recent, reviews, latestEvent]) if (result.error) throw result.error;
      return {
        event_type: eventType,
        events_24h: Number(recent.count || 0),
        needs_review: Number(reviews.count || 0),
        last_received_at: latestEvent.data?.received_at || null,
        latest_processing_state: latestEvent.data?.processing_state || null,
        latest_review_reason: latestEvent.data?.review_reason || null,
      };
    })),
    fitboxLinkIntegrity(admin),
  ]);
  for (const result of [completed, failed, profileRefreshes, profileRefreshFailures, profileRefreshReviews, active, stale, latest]) if (result.error) throw result.error;
  const events = eventTypes.reduce((sum, event) => sum + event.events_24h, 0);
  const reviews = eventTypes.reduce((sum, event) => sum + event.needs_review, 0);
  const lastEvent = eventTypes
    .filter(event => event.last_received_at)
    .sort((left, right) => Date.parse(right.last_received_at) - Date.parse(left.last_received_at))[0] || null;
  const environment = fitboxIntegrationEnvironment(process.env);
  const getUserEnvironment = fitboxGetUserEnvironment(process.env);
  const eventEnvironment = fitboxEventEnvironment(process.env);
  const reconciliation = reviews + Number(profileRefreshReviews.count || 0);
  return {
    ready: environment.ready && getUserEnvironment.ready && eventEnvironment.ready && Number(failed.count || 0) === 0 && Number(stale.count || 0) === 0 && linkIntegrity.orphaned === 0,
    environment: {
      ready: environment.ready && getUserEnvironment.ready && eventEnvironment.ready,
      missing: [...new Set([...environment.missing, ...getUserEnvironment.missing, ...eventEnvironment.missing])],
    },
    jobs_24h: { completed: Number(completed.count || 0), failed: Number(failed.count || 0) },
    profile_refreshes_24h: { completed: Number(profileRefreshes.count || 0), failed: Number(profileRefreshFailures.count || 0) },
    active: Number(active.count || 0),
    stale: Number(stale.count || 0),
    last_job: latest.data || null,
    events_24h: events,
    reconciliation,
    link_integrity: linkIntegrity,
    event_types: eventTypes,
    last_event: lastEvent ? {
      event_type: lastEvent.event_type,
      processing_state: lastEvent.latest_processing_state,
      review_reason: lastEvent.latest_review_reason,
      received_at: lastEvent.last_received_at,
    } : null,
  };
}

async function dispatchProspect(config, payload, fetchImpl = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISPATCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(config.hookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'XERT-FitBox-Bridge/1.0' },
      body: JSON.stringify(payload),
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('ZAPIER_DISPATCH_REJECTED');
  } finally {
    clearTimeout(timeout);
  }
}

async function startGetUserRefresh({ admin, access, leadId }) {
  const config = fitboxGetUserEnvironment(process.env);
  if (!config.ready) throw new Error('FITBOX_GET_USER_NOT_CONFIGURED');
  const existing = await leadIntegrationState(admin, leadId);
  if (!existing.link) throw new Error('FITBOX_LINK_REQUIRED');
  if (['queued', 'dispatched', 'dispatch_unknown'].includes(existing.current_job?.status)) {
    throw new Error('FITBOX_JOB_IN_PROGRESS');
  }

  const callbackToken = randomBytes(32).toString('base64url');
  const { data: job, error: jobError } = await admin.from('fitbox_integration_jobs').insert({
    job_type: 'get_user',
    lead_type: 'member_interest',
    lead_id: leadId,
    status: 'queued',
    callback_token_hash: callbackTokenHash(callbackToken),
    fitbox_gym_id: existing.link.fitbox_gym_id,
    fitbox_user_id: existing.link.fitbox_user_id,
    created_by: access.user.id,
  }).select('id, job_type, status, fitbox_user_id, fitbox_status, last_error_code, dispatched_at, completed_at, created_at').single();
  if (jobError) {
    if (jobError.code === '23505') throw new Error('FITBOX_JOB_IN_PROGRESS');
    throw jobError;
  }

  const payload = fitboxGetUserDispatchPayload({
    jobId: job.id,
    callbackToken,
    fitboxUserId: existing.link.fitbox_user_id,
    environment: process.env,
  });
  try {
    await dispatchProspect(config, payload);
  } catch {
    // Get User is read-only, so a dispatch failure is safe to retry and cannot
    // create a second member or mutate provider state.
    await admin.from('fitbox_integration_jobs').update({
      status: 'failed',
      last_error_code: 'ZAPIER_PROFILE_REFRESH_FAILED',
      attempt_count: 1,
      updated_at: new Date().toISOString(),
    }).eq('id', job.id).eq('status', 'queued');
    throw new Error('FITBOX_PROFILE_REFRESH_DISPATCH_FAILED');
  }

  const { data: dispatched, error: dispatchError } = await admin.from('fitbox_integration_jobs').update({
    status: 'dispatched',
    dispatched_at: new Date().toISOString(),
    attempt_count: 1,
    updated_at: new Date().toISOString(),
  }).eq('id', job.id).eq('status', 'queued')
    .select('id, job_type, status, fitbox_user_id, fitbox_status, last_error_code, dispatched_at, completed_at, created_at').maybeSingle();
  if (dispatchError) throw dispatchError;
  if (dispatched) return { job: publicFitboxJob(dispatched), link: existing.link };
  return leadIntegrationState(admin, leadId);
}

export default async function handler(request, response) {
  const trace = createRequestTrace(response);
  const { json } = trace;
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: 'FitBox integration service is unavailable.' }, 503);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  if (requestService(request) === 'callback') return handleFitboxCallback(request, admin, trace);
  if (requestService(request) === 'event') return handleFitboxEvent(request, admin, trace);
  if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, 405);
  const access = await requireAdmin(request, admin);
  if (access.error) return json({ error: access.error }, access.status);

  if (request.method === 'GET') {
    try {
      const wantsHealth = requestQuery(request, 'health') === '1';
      const wantsEvents = requestQuery(request, 'events') === '1';
      if (wantsHealth) return json(await integrationHealth(admin));
      if (wantsEvents) return json(await fitboxReconciliationEvents(admin, fitboxEventState(requestQuery(request, 'state'))));
      const leadId = requestLeadID(request);
      const state = await leadIntegrationState(admin, leadId);
      const environment = fitboxIntegrationEnvironment(process.env);
      const getUserEnvironment = fitboxGetUserEnvironment(process.env);
      return json({
        ...state,
        ready: environment.ready,
        configuration_issue: environment.ready ? null : 'FitBox Zapier handoff is not configured.',
        profile_refresh_ready: getUserEnvironment.ready,
        profile_refresh_issue: getUserEnvironment.ready ? null : 'FitBox read-only profile refresh is not configured.',
      });
    } catch (error) {
      if (error.message === 'INVALID_FITBOX_EVENT_STATE') return json({ error: 'FitBox event state is invalid.' }, 400);
      if (error.message === 'INVALID_FITBOX_LEAD_ID') return json({ error: 'Lead selection is invalid.' }, 400);
      if (['42P01', 'PGRST205'].includes(error.code)) return json({ error: 'FitBox integration storage is not installed.' }, 503);
      return json({ error: 'FitBox status could not be loaded.' }, 500);
    }
  }

  let body;
  try {
    body = await requestJson(request);
    if (Buffer.byteLength(JSON.stringify(body || {}), 'utf8') > MAX_REQUEST_BYTES) throw new Error('REQUEST_TOO_LARGE');
  } catch {
    return json({ error: 'FitBox request is invalid.' }, 400);
  }
  if (!['register_prospect', 'refresh_user', 'review_event'].includes(body?.action)) return json({ error: 'FitBox request is invalid.' }, 400);

  if (body.action === 'review_event') {
    try {
      const eventId = normalizeFitboxEventID(body.event_id);
      const result = await reviewFitboxEvent(admin, eventId, access.user.id);
      console.info('FitBox review-only event acknowledged.', {
        requestId: trace.requestId,
        eventId,
        actorId: access.user.id,
        alreadyReviewed: result.already_reviewed,
      });
      return json(result);
    } catch (error) {
      if (error.message === 'INVALID_FITBOX_EVENT_ID') return json({ error: 'FitBox event selection is invalid.' }, 400);
      if (error.message === 'FITBOX_EVENT_NOT_FOUND') return json({ error: 'This FitBox event no longer exists. Refresh the queue.' }, 404);
      if (error.message === 'FITBOX_EVENT_NOT_REVIEWABLE') return json({ error: 'This FitBox event cannot be acknowledged from the queue.' }, 409);
      if (['42P01', 'PGRST205'].includes(error.code)) return json({ error: 'FitBox reconciliation storage is unavailable.' }, 503);
      return json({ error: 'The FitBox event could not be acknowledged.' }, 500);
    }
  }

  let leadId;
  try {
    leadId = normalizeFitboxLeadID(body.lead_id);
  } catch {
    return json({ error: 'Lead selection is invalid.' }, 400);
  }

  if (body.action === 'refresh_user') {
    try {
      return json(await startGetUserRefresh({ admin, access, leadId }), 202);
    } catch (error) {
      if (error.message === 'FITBOX_GET_USER_NOT_CONFIGURED') return json({ error: 'FitBox read-only profile refresh is not configured.' }, 503);
      if (error.message === 'FITBOX_LINK_REQUIRED') return json({ error: 'Link this lead to a verified FitBox user before refreshing its profile.' }, 409);
      if (error.message === 'FITBOX_JOB_IN_PROGRESS') return json({ error: 'This lead already has a FitBox job in progress.' }, 409);
      if (error.message === 'FITBOX_PROFILE_REFRESH_DISPATCH_FAILED') return json({ error: 'Zapier could not start the read-only FitBox profile refresh. It is safe to retry.' }, 502);
      if (['42P01', 'PGRST205'].includes(error.code)) return json({ error: 'FitBox profile refresh storage is not installed.' }, 503);
      return json({ error: 'The FitBox profile refresh could not be started.' }, 500);
    }
  }

  const config = fitboxIntegrationEnvironment(process.env);
  if (!config.ready) return json({ error: 'FitBox Zapier handoff is not configured.' }, 503);

  try {
    const existing = await leadIntegrationState(admin, leadId);
    if (existing.link) return json({ error: 'This lead is already linked to FitBox.', ...existing }, 409);
    if (['queued', 'dispatched', 'dispatch_unknown'].includes(existing.current_job?.status)) {
      return json({ error: 'This lead already has a FitBox handoff in progress.', ...existing }, 409);
    }

    const { data: lead, error: leadError } = await admin.from('member_interest')
      .select('id, full_name, email, phone, suburb_town')
      .eq('id', leadId).maybeSingle();
    if (leadError) throw leadError;
    if (!lead) return json({ error: 'This lead no longer exists. Refresh the list.' }, 404);
    prospectForFitbox(lead);

    const callbackToken = randomBytes(32).toString('base64url');
    const { data: job, error: jobError } = await admin.from('fitbox_integration_jobs').insert({
      job_type: 'register_prospect',
      lead_type: 'member_interest',
      lead_id: leadId,
      status: 'queued',
      callback_token_hash: callbackTokenHash(callbackToken),
      fitbox_gym_id: config.gymId,
      created_by: access.user.id,
    }).select('id, status, fitbox_user_id, fitbox_status, last_error_code, dispatched_at, completed_at, created_at').single();
    if (jobError) {
      if (jobError.code === '23505') return json({ error: 'This lead already has a FitBox handoff in progress.' }, 409);
      throw jobError;
    }

    const payload = fitboxProspectDispatchPayload({ jobId: job.id, callbackToken, lead, environment: process.env });
    try {
      await dispatchProspect(config, payload);
    } catch {
      // A network timeout cannot prove Zapier rejected the request: FitBox may
      // already have created the prospect. Block blind retries until the
      // operator reconciles this job or the authenticated callback arrives.
      await admin.from('fitbox_integration_jobs').update({
        status: 'dispatch_unknown', last_error_code: 'ZAPIER_DISPATCH_OUTCOME_UNKNOWN', attempt_count: 1, updated_at: new Date().toISOString(),
      }).eq('id', job.id).eq('status', 'queued');
      return json({ error: 'Zapier did not confirm the handoff outcome. Do not retry yet—check FitBox for this email and reconcile the lead first.' }, 502);
    }

    const { data: dispatched, error: dispatchError } = await admin.from('fitbox_integration_jobs').update({
      status: 'dispatched', dispatched_at: new Date().toISOString(), attempt_count: 1, updated_at: new Date().toISOString(),
    }).eq('id', job.id).eq('status', 'queued')
      .select('id, status, fitbox_user_id, fitbox_status, last_error_code, dispatched_at, completed_at, created_at').maybeSingle();
    if (dispatchError) throw dispatchError;

    console.info('FitBox prospect handoff accepted by Zapier.', { requestId: trace.requestId, jobId: job.id, actorId: access.user.id });
    if (dispatched) return json({ job: publicFitboxJob(dispatched), link: null }, 202);
    const completedState = await leadIntegrationState(admin, leadId);
    return json(completedState, completedState.link ? 200 : 202);
  } catch (error) {
    if (error.message === 'FITBOX_FULL_NAME_REQUIRED') return json({ error: 'Add the lead’s first and last name before sending them to FitBox.' }, 400);
    if (error.message === 'FITBOX_EMAIL_REQUIRED') return json({ error: 'Add a valid lead email before sending them to FitBox.' }, 400);
    if (error.message === 'FITBOX_PHONE_REQUIRED') return json({ error: 'Add the lead’s phone number before sending them to FitBox.' }, 400);
    if (['42P01', 'PGRST205'].includes(error.code)) return json({ error: 'FitBox integration storage is not installed.' }, 503);
    return json({ error: 'The FitBox handoff could not be started.' }, 500);
  }
}
