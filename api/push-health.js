import { createRequestTrace } from './http.js';
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
  const trace = createRequestTrace(response);
  const { json } = trace;
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  return json(inspectPushEnvironment(process.env));
}
