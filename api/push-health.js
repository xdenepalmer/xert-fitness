import { sendJson } from './http.js';
import { inspectAPNsEnvironment } from './apns.js';

export function inspectPushEnvironment(environment = {}) {
  const apns = inspectAPNsEnvironment(environment);
  const supabaseReady = Boolean(
    String(environment.SUPABASE_URL || environment.VITE_SUPABASE_URL || '').trim()
    && String(environment.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  );
  return { ready: apns.ready && supabaseReady };
}

export default async function handler(request, response) {
  if (request.method !== 'GET') return sendJson(response, { error: 'Method not allowed' }, 405);
  return sendJson(response, inspectPushEnvironment(process.env));
}
