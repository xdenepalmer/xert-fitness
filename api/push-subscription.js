import { createClient } from '@supabase/supabase-js';
import { requestHeader, requestJson, sendJson } from './http.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function normalizePushSubscription(body) {
  const action = String(body?.action || 'register').trim().toLowerCase();
  const deviceToken = String(body?.device_token || '').trim().toLowerCase();
  const environment = String(body?.environment || '').trim().toLowerCase();
  if (!['register', 'unregister'].includes(action)) throw new Error('PUSH_ACTION_INVALID');
  if (!/^[0-9a-f]{64,200}$/.test(deviceToken)) throw new Error('PUSH_TOKEN_INVALID');
  if (!['sandbox', 'production'].includes(environment)) throw new Error('PUSH_ENVIRONMENT_INVALID');
  return { action, deviceToken, environment };
}

export default async function handler(request, response) {
  const json = (body, status = 200) => sendJson(response, body, status);
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: 'Push registration is not configured.' }, 500);

  try {
    const authHeader = requestHeader(request, 'authorization');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return json({ error: 'Not authenticated.' }, 401);
    const subscription = normalizePushSubscription(await requestJson(request));
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) return json({ error: 'Invalid or expired session.' }, 401);

    if (subscription.action === 'unregister') {
      const { error } = await admin
        .from('push_subscriptions')
        .update({ enabled: false, last_seen_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('device_token', subscription.deviceToken)
        .eq('environment', subscription.environment);
      if (error) throw error;
      return json({ registered: false });
    }

    const { error } = await admin.from('push_subscriptions').upsert({
      user_id: user.id,
      device_token: subscription.deviceToken,
      environment: subscription.environment,
      enabled: true,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: 'device_token,environment' });
    if (error) throw error;
    return json({ registered: true });
  } catch (error) {
    if (['PUSH_ACTION_INVALID', 'PUSH_TOKEN_INVALID', 'PUSH_ENVIRONMENT_INVALID'].includes(error.message)) {
      return json({ error: 'Push subscription is invalid.' }, 400);
    }
    return json({ error: 'Push subscription could not be updated.' }, 500);
  }
}
