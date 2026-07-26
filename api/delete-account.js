import { createClient } from '@supabase/supabase-js';
import { createRequestTrace, requestHeader, requestJson } from './http.js';

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

export function isMissingClassBookingsTable(error) {
  return ['42P01', 'PGRST205'].includes(error?.code)
    || /class_bookings.*(?:not found|schema cache|does not exist)/i.test(error?.message || '');
}

export function isMissingAccountDeletionRoutine(error) {
  return ['42883', 'PGRST202'].includes(error?.code)
    || /delete_member_account.*(?:not found|schema cache|does not exist)/i.test(error?.message || '');
}

export function isMissingAuditSubjectRedactionRoutine(error) {
  return ['42883', 'PGRST202'].includes(error?.code)
    || /redact_audit_subject_pii.*(?:not found|schema cache|does not exist)/i.test(error?.message || '');
}

/** Matches SQL `lower(btrim(email))` used by delete_member_account. */
export function normalizeAccountEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/**
 * PostgREST cannot express lower(btrim(email)) = $1. Equality on the
 * normalised address is the exact-match substitute. Never use ilike: `_` and
 * `%` are LIKE wildcards and would match unrelated rows.
 */
export function deleteByNormalizedEmail(query, normalizedEmail) {
  return query.eq('email', normalizedEmail);
}

/**
 * Rollout-only fallback used until the atomic routine ships. These are separate
 * round trips with no transaction, so it is reached only when the durable
 * routine is absent. The auth deletion runs last because orders and PT requests
 * are `on delete set null` and could no longer be matched by user_id after it.
 */
export async function deleteMemberAccountLegacy(admin, userId, email) {
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

  // Legacy public enquiry table with no user_id column: match on the member's
  // normalised email. Absent installs are tolerated so deletion still proceeds.
  const normalizedEmail = normalizeAccountEmail(email);
  if (normalizedEmail) {
    const { error: bookingError } = await deleteByNormalizedEmail(
      admin.from('class_bookings').delete(),
      normalizedEmail,
    );
    if (bookingError && !isMissingClassBookingsTable(bookingError)) {
      throw bookingError;
    }

    // Anonymous PT rows and any leftover address match after the user_id delete.
    const { error: anonPtError } = await deleteByNormalizedEmail(
      admin.from('private_session_requests').delete(),
      normalizedEmail,
    );
    if (
      anonPtError
      && !isMissingPTTrackingColumn(anonPtError)
      && !['42P01', 'PGRST205'].includes(anonPtError.code)
    ) {
      throw anonPtError;
    }

    for (const table of ['member_interest', 'trainer_interest', 'partner_interest']) {
      const { error: leadError } = await deleteByNormalizedEmail(
        admin.from(table).delete(),
        normalizedEmail,
      );
      if (leadError && !['42P01', 'PGRST205'].includes(leadError.code)) {
        throw leadError;
      }
    }

    // Match delete_member_account: scrub denormalised subject email from
    // immutable audit tables before Auth (and the email key) disappear.
    const { error: redactError } = await admin.rpc('redact_audit_subject_pii', {
      p_subject_email: normalizedEmail,
    });
    if (redactError && !isMissingAuditSubjectRedactionRoutine(redactError)) {
      throw redactError;
    }
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) throw deleteError;
}

/**
 * Deletes a member atomically through a single service-role transaction so a
 * mid-way failure cannot leave the account partly destroyed.
 * Until that routine is installed, a non-atomic fallback preserves deletion.
 */
export async function deleteMemberAccount(admin, userId, email) {
  const { error } = await admin.rpc('delete_member_account', { p_user_id: userId });
  if (!error) return;
  if (!isMissingAccountDeletionRoutine(error)) throw error;
  await deleteMemberAccountLegacy(admin, userId, email);
}

export default async function handler(request, response) {
  const trace = createRequestTrace(response);
  const { json } = trace;
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

    await deleteMemberAccount(admin, user.id, user.email);
    return json({ deleted: true });
  } catch (error) {
    // Callers get a fixed string; the upstream code stays behind the trace id.
    console.error('Account deletion failed.', {
      requestId: trace.requestId,
      code: String(error?.code || error?.name || 'UNEXPECTED_DELETE_ERROR'),
    });
    return json({ error: 'Could not delete account. Please try again.' }, 500);
  }
}
