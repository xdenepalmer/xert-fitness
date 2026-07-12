import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function hasDeleteAccountConfirmation(body) {
  return body?.confirmation === 'DELETE';
}

export async function deleteMemberAccount(admin, userId) {
  const { error: orderError } = await admin
    .from('orders')
    .update({ email: null })
    .eq('user_id', userId);
  if (orderError) throw orderError;

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) throw deleteError;
}

export default async function handler(request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: 'Supabase is not configured.' }, 500);

  try {
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return json({ error: 'Not authenticated.' }, 401);

    const body = await request.json().catch(() => null);
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
