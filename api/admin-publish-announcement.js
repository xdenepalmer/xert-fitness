import { createClient } from '@supabase/supabase-js';
import { requestHeader, requestJson, sendJson } from './http.js';
import { sendMemberAnnouncementPushes } from './apns.js';

export const config = { maxDuration: 60 };

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TONES = new Set(['info', 'action', 'urgent']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function clean(value) {
  return String(value || '').trim();
}

export function normalizeAnnouncementPublish(body, now = new Date()) {
  const id = clean(body?.id) || null;
  const input = body?.announcement || {};
  const title = clean(input.title);
  const announcementBody = clean(input.body);
  const tone = clean(input.tone || 'info');
  const ctaLabel = clean(input.cta_label) || null;
  const ctaUrl = clean(input.cta_url) || null;
  const expiresAt = clean(input.expires_at) || null;
  if (id && !UUID.test(id)) throw new Error('ANNOUNCEMENT_ID_INVALID');
  if (!title || title.length > 120 || !announcementBody || announcementBody.length > 2000 || !TONES.has(tone)) {
    throw new Error('ANNOUNCEMENT_INVALID');
  }
  if ((ctaLabel && !ctaUrl) || (!ctaLabel && ctaUrl) || (ctaLabel && ctaLabel.length > 40)) {
    throw new Error('ANNOUNCEMENT_ACTION_INVALID');
  }
  if (ctaUrl && !(ctaUrl.startsWith('/') || /^https:\/\//i.test(ctaUrl))) throw new Error('ANNOUNCEMENT_ACTION_INVALID');
  if (expiresAt && (!Number.isFinite(new Date(expiresAt).getTime()) || new Date(expiresAt) <= now)) {
    throw new Error('ANNOUNCEMENT_EXPIRY_INVALID');
  }
  return {
    id,
    announcement: {
      title,
      body: announcementBody,
      tone,
      cta_label: ctaLabel,
      cta_url: ctaUrl,
      expires_at: expiresAt,
    },
  };
}

export default async function handler(request, response) {
  const json = (body, status = 200) => sendJson(response, body, status);
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: 'Announcement publishing is not configured.' }, 500);

  try {
    const authHeader = requestHeader(request, 'authorization');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return json({ error: 'Not authenticated.' }, 401);
    const publish = normalizeAnnouncementPublish(await requestJson(request));
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) return json({ error: 'Invalid or expired session.' }, 401);
    const { data: profile, error: profileError } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (profileError) return json({ error: 'Could not verify admin access.' }, 500);
    if (profile?.role !== 'admin') return json({ error: 'Admin access required.' }, 403);

    let existing = null;
    if (publish.id) {
      const result = await admin.from('member_announcements').select('id,published_at').eq('id', publish.id).maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) return json({ error: 'Announcement not found.' }, 404);
      existing = result.data;
    }
    const publishedAt = existing?.published_at || new Date().toISOString();
    const mutation = { ...publish.announcement, published_at: publishedAt };
    const result = publish.id
      ? await admin.from('member_announcements').update(mutation).eq('id', publish.id).select('*').single()
      : await admin.from('member_announcements').insert({ ...mutation, created_by: user.id }).select('*').single();
    if (result.error) throw result.error;

    let push = { configured: true, attempted: 0, delivered: 0, failed: 0 };
    if (!existing?.published_at) {
      try {
        push = await sendMemberAnnouncementPushes({ admin, announcement: result.data });
      } catch {
        push = { configured: true, attempted: 0, delivered: 0, failed: 1 };
      }
    }
    return json({ announcement: result.data, push });
  } catch (error) {
    if (error.message?.startsWith('ANNOUNCEMENT_')) return json({ error: 'Announcement details are invalid.' }, 400);
    return json({ error: 'Announcement could not be published.' }, 500);
  }
}
