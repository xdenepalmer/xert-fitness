import { createClient } from '@supabase/supabase-js';
import { requestHeader, requestJson, sendJson } from './http.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function hasDeleteAccountConfirmation(body) {
  return body?.confirmation === 'DELETE';
}

export function isMissingPTTrackingColumn(error) {
  return error?.code === '42703' || (
    error?.code === 'PGRST204' && /user_id/i.test(error?.message || '')
  );
}

export async function deleteMemberAccount(admin, userId) {
  const { error: orderError } = await admin
    .from('orders')
    .update({ email: null })
    .eq('user_id', userId);
  if (orderError) throw orderError;

  // Authenticated PT requests contain contact and coaching notes. They are
  // account data, not financial records, so remove them before deleting Auth.
  // During migration rollout, older databases may not have user_id yet; in
  // that state no request can be linked to this account, so deletion proceeds.
  const { error: ptRequestError } = await admin
    .from('private_session_requests')
    .delete()
    .eq('user_id', userId);
  if (ptRequestError && !isMissingPTTrackingColumn(ptRequestError)) {
    throw ptRequestError;
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) throw deleteError;
}

export default async function handler(request, response) {
  const json = (body, status = 200) => sendJson(response, body, status);
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: 'Supabase is not configured.' }, 500);

  try {
    const authHeader = requestHeader(request, 'authorization');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return json({ error: 'Not authenticated.' }, 401);

    const body = await requestJson(request).catch(() => null);
    if (!hasDeleteAccountConfirmation(body)) {
      return json({ error: 'Account deletion was not confirmed.' }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const {
      data: { user },
      error: userError,
    } = await admin.auth.getUser(token);
    if (userError || !user) return json({ error: 'Invalid or expired session.' }, 401);

    await deleteMemberAccount(admin, user.id);
    return json({ deleted: true });
  } catch (error) {
    return json({ error: error.message || 'Could not delete account.' }, 500);
  }
}
