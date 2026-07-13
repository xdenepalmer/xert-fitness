import { createClient } from '@supabase/supabase-js';
import { inspectAPNsEnvironment } from './apns.js';
import { requestHeader, sendJson } from './http.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DELIVERY_WINDOW_MS = 24 * 60 * 60 * 1000;

function exactCount(result) {
  if (result.error) throw result.error;
  return Number(result.count || 0);
}

export function summarizePushOperations(results, environment = process.env) {
  const [production, sandbox, disabled, delivered, failed, invalid, latest] = results;
  const apns = inspectAPNsEnvironment(environment);
  if (latest.error) throw latest.error;
  return {
    ready: apns.ready,
    environment: { ready: apns.ready, missing: apns.missing },
    subscriptions: {
      production: exactCount(production),
      sandbox: exactCount(sandbox),
      disabled: exactCount(disabled),
    },
    deliveries_24h: {
      delivered: exactCount(delivered),
      failed: exactCount(failed),
      invalid_token: exactCount(invalid),
    },
    last_attempt: latest.data
      ? {
          status: latest.data.status,
          reason: latest.data.reason || null,
          attempted_at: latest.data.attempted_at,
        }
      : null,
  };
}

export default async function handler(request, response) {
  const json = (body, status = 200) => sendJson(response, body, status);
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: 'Supabase is not configured.' }, 500);

  const authHeader = requestHeader(request, 'authorization');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return json({ error: 'Not authenticated.' }, 401);

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) return json({ error: 'Invalid or expired session.' }, 401);
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError) return json({ error: 'Could not verify admin access.' }, 500);
    if (profile?.role !== 'admin') return json({ error: 'Admin access required.' }, 403);

    const since = new Date(Date.now() - DELIVERY_WINDOW_MS).toISOString();
    const results = await Promise.all([
      admin.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('enabled', true).eq('environment', 'production'),
      admin.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('enabled', true).eq('environment', 'sandbox'),
      admin.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('enabled', false),
      admin.from('push_notification_deliveries').select('id', { count: 'exact', head: true }).eq('status', 'delivered').gte('attempted_at', since),
      admin.from('push_notification_deliveries').select('id', { count: 'exact', head: true }).eq('status', 'failed').gte('attempted_at', since),
      admin.from('push_notification_deliveries').select('id', { count: 'exact', head: true }).eq('status', 'invalid_token').gte('attempted_at', since),
      admin.from('push_notification_deliveries').select('status,reason,attempted_at').order('attempted_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    return json(summarizePushOperations(results));
  } catch {
    return json({ error: 'Push operations health could not be loaded.' }, 500);
  }
}
