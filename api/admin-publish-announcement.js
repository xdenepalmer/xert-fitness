import { createClient } from '@supabase/supabase-js';
import { createRequestTrace, requestHeader, requestJson } from './http.js';
import { sendMemberAnnouncementPushes } from './apns.js';

export const config = { maxDuration: 60 };

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TONES = new Set(['info', 'action', 'urgent']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function clean(value) {
  return String(value || '').trim();
}

function announcementPushFailureReason(error) {
  const raw = String(error?.code || error?.message || 'ANNOUNCEMENT_PUSH_FAILED').trim();
  return raw.slice(0, 200) || 'ANNOUNCEMENT_PUSH_FAILED';
}

export function normalizeAnnouncementPublish(body, now = new Date()) {
  const id = clean(body?.id) || null;
  const expectedUpdatedAt = clean(body?.expected_updated_at) || null;
  const input = body?.announcement || {};
  const title = clean(input.title);
  const announcementBody = clean(input.body);
  const tone = clean(input.tone || 'info');
  const ctaLabel = clean(input.cta_label) || null;
  const ctaUrl = clean(input.cta_url) || null;
  const expiresAt = clean(input.expires_at) || null;
  if (id && !UUID.test(id)) throw new Error('ANNOUNCEMENT_ID_INVALID');
  if (id && (!expectedUpdatedAt || !Number.isFinite(new Date(expectedUpdatedAt).getTime()))) {
    throw new Error('ANNOUNCEMENT_VERSION_INVALID');
  }
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
    expectedUpdatedAt,
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

export function summarizePreviousClassAlertPushes(rows = []) {
  const delivered = rows.filter(row => row.status === 'delivered').length;
  return {
    configured: true,
    already_attempted: rows.length > 0,
    attempted: rows.length,
    delivered,
    failed: rows.length - delivered,
  };
}

export async function notifyClassCancellation(admin, sessionId) {
  if (!UUID.test(sessionId)) throw new Error('CLASS_NOTICE_SESSION_INVALID');
  const { data: announcement, error: announcementError } = await admin
    .from('member_announcements')
    .select('id,title,body,cta_url,expires_at')
    .eq('audience', 'targeted')
    .eq('source_kind', 'class_cancellation')
    .eq('source_id', sessionId)
    .maybeSingle();
  if (announcementError) throw announcementError;
  if (!announcement) throw new Error('CLASS_NOTICE_NOT_FOUND');

  const [{ data: targets, error: targetError }, { data: previous, error: previousError }] = await Promise.all([
    admin.from('member_announcement_targets').select('user_id').eq('announcement_id', announcement.id),
    admin.from('push_notification_deliveries').select('status').eq('announcement_id', announcement.id),
  ]);
  if (targetError) throw targetError;
  if (previousError) throw previousError;
  const userIds = [...new Set((targets || []).map(target => target.user_id).filter(Boolean))];
  if ((previous || []).length > 0) {
    return { announcement_id: announcement.id, recipients: userIds.length, push: summarizePreviousClassAlertPushes(previous) };
  }

  const push = await sendMemberAnnouncementPushes({
    admin,
    announcement,
    targetUserIds: userIds,
  });
  return { announcement_id: announcement.id, recipients: userIds.length, push };
}

export async function notifyTargetedAnnouncement(admin, announcementId) {
  if (!UUID.test(announcementId)) throw new Error('TARGETED_NOTICE_ID_INVALID');
  const { data: announcement, error: announcementError } = await admin
    .from('member_announcements')
    .select('id,title,body,cta_url,expires_at')
    .eq('id', announcementId)
    .eq('audience', 'targeted')
    .in('source_kind', ['member_direct', 'waitlist_promotion', 'booking_decision'])
    .maybeSingle();
  if (announcementError) throw announcementError;
  if (!announcement) throw new Error('TARGETED_NOTICE_NOT_FOUND');

  const [{ data: targets, error: targetError }, { data: previous, error: previousError }] = await Promise.all([
    admin.from('member_announcement_targets').select('user_id').eq('announcement_id', announcement.id),
    admin.from('push_notification_deliveries').select('status').eq('announcement_id', announcement.id),
  ]);
  if (targetError) throw targetError;
  if (previousError) throw previousError;
  const userIds = [...new Set((targets || []).map(target => target.user_id).filter(Boolean))];
  if (userIds.length !== 1) throw new Error('TARGETED_NOTICE_RECIPIENT_INVALID');
  if ((previous || []).length > 0) {
    return { announcement_id: announcement.id, recipients: 1, push: summarizePreviousClassAlertPushes(previous) };
  }
  const push = await sendMemberAnnouncementPushes({ admin, announcement, targetUserIds: userIds });
  return { announcement_id: announcement.id, recipients: 1, push };
}

export default async function handler(request, response) {
  const trace = createRequestTrace(response);
  const { json } = trace;
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = requestHeader(request, 'authorization');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return json({ error: 'Not authenticated.' }, 401);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: 'Announcement publishing is not configured.' }, 500);

  try {
    const body = await requestJson(request);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) return json({ error: 'Invalid or expired session.' }, 401);
    const { data: profile, error: profileError } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (profileError) return json({ error: 'Could not verify admin access.' }, 500);
    if (profile?.role !== 'admin') return json({ error: 'Admin access required.' }, 403);

    if (body?.action === 'notify_class_cancellation') {
      try {
        return json(await notifyClassCancellation(admin, String(body?.session_id || '').trim()));
      } catch (error) {
        if (error.message?.startsWith('CLASS_NOTICE_')) throw error;
        throw new Error('CLASS_NOTICE_DELIVERY_FAILED', { cause: error });
      }
    }

    if (body?.action === 'notify_targeted_announcement') {
      try {
        return json(await notifyTargetedAnnouncement(admin, String(body?.announcement_id || '').trim()));
      } catch (error) {
        if (error.message?.startsWith('TARGETED_NOTICE_')) throw error;
        throw new Error('TARGETED_NOTICE_DELIVERY_FAILED', { cause: error });
      }
    }

    const publish = normalizeAnnouncementPublish(body);

    let existing = null;
    if (publish.id) {
      const result = await admin.from('member_announcements').select('id,audience,published_at,archived_at,updated_at').eq('id', publish.id).maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) return json({ error: 'Announcement not found.' }, 404);
      existing = result.data;
    }
    // Targeted notices have their own publish/resend workflows. The generic
    // publish path broadcasts, so it must refuse a stored targeted row rather
    // than push a private notice to every enrolled device.
    if (existing && existing.audience !== 'all') {
      return json({ error: 'This notice is targeted and cannot be published as a broadcast.' }, 409);
    }
    if (existing?.archived_at) return json({ error: 'Restore this announcement before publishing it.' }, 409);
    const publishedAt = existing?.published_at || new Date().toISOString();
    const mutation = { ...publish.announcement, published_at: publishedAt, last_changed_by: user.id };
    const result = publish.id
      ? await admin.from('member_announcements').update(mutation).eq('id', publish.id).eq('updated_at', publish.expectedUpdatedAt).select('*').maybeSingle()
      : await admin.from('member_announcements').insert({ ...mutation, created_by: user.id }).select('*').single();
    if (result.error) throw result.error;
    if (publish.id && !result.data) {
      return json({ error: 'This announcement changed since you opened it. Refresh the admin view and review the latest version.' }, 409);
    }

    // Resend is idempotent per device: sendMemberAnnouncementPushes only sends to
    // subscriptions with no delivery row for this notice, so re-publishing a
    // broadcast completes a fan-out that a prior 60s timeout cut short instead of
    // being suppressed by published_at.
    let push = { configured: true, attempted: 0, delivered: 0, failed: 0 };
    try {
      push = await sendMemberAnnouncementPushes({ admin, announcement: result.data });
    } catch (error) {
      push = { configured: true, attempted: 0, delivered: 0, failed: 1, reason: announcementPushFailureReason(error) };
    }
    return json({ announcement: result.data, push });
  } catch (error) {
    if (error.message === 'CLASS_NOTICE_SESSION_INVALID') return json({ error: 'A valid class session is required.' }, 400);
    if (error.message === 'CLASS_NOTICE_NOT_FOUND') return json({ error: 'No member-account cancellation notice was created for this class.' }, 404);
    if (error.message === 'TARGETED_NOTICE_ID_INVALID') return json({ error: 'A valid private notice is required.' }, 400);
    if (error.message === 'TARGETED_NOTICE_NOT_FOUND') return json({ error: 'Private member notice not found.' }, 404);
    if (error.message === 'TARGETED_NOTICE_RECIPIENT_INVALID') return json({ error: 'Private member notice recipient is invalid.' }, 409);
    if (error.message?.startsWith('ANNOUNCEMENT_')) return json({ error: 'Announcement details are invalid.' }, 400);
    if (error.message?.startsWith('CLASS_NOTICE_')) {
      console.error('Class cancellation push delivery failed.', {
        requestId: trace.requestId,
        code: String(error?.code || error?.message || 'CLASS_NOTICE_DELIVERY_FAILED'),
      });
      return json({ error: 'The cancellation notice was saved, but push delivery could not be completed.' }, 500);
    }
    if (error.message?.startsWith('TARGETED_NOTICE_')) {
      console.error('Targeted notice push delivery failed.', {
        requestId: trace.requestId,
        code: String(error?.code || error?.message || 'TARGETED_NOTICE_DELIVERY_FAILED'),
      });
      return json({ error: 'The private notice was saved, but push delivery could not be completed.' }, 500);
    }
    console.error('Announcement publishing failed.', {
      requestId: trace.requestId,
      code: String(error?.code || error?.message || 'UNEXPECTED_ANNOUNCEMENT_ERROR'),
    });
    return json({ error: 'Announcement could not be published.' }, 500);
  }
}
