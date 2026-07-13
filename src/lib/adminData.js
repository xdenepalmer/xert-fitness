import { supabase } from './supabase';
import { XERT_2026_EVENTS } from './eventCalendar';
import { assertAdminMutation, assertSupabaseResponses } from './supabaseResults';
import { leadMutationError, normalizeLeadPage, normalizeLeadSearch, normalizeLeadUpdate, validateLeadMutation } from './adminLeads';
import {
  filterMembers, normalizeMemberDirectoryQuery, normalizeMemberNote,
  normalizeMemberNoteArchive, normalizeRoleChange
} from './memberAdmin';
import { summarizeSchemaCapabilities } from './schemaCapabilities';
import { blackoutPeriodMutationError, classSessionUpdateGuardError, classSessionUpdateRpcError, normalizeClassSession } from './scheduling';
import {
  normalizeBookingStatusMutation,
  normalizeLegacyBookingNotes,
  normalizePTRequestMutation,
  normalizeSessionAttendanceMutation,
  normalizeSessionPromotion,
} from './adminRequests';
import { dashboardMetricsFromSettled } from './adminMetrics';
import { normalizePTRequestFilters } from './ptRequestAnalytics';
import { collectAdminBatches, collectAdminPages } from './adminPagination.js';
import { productStripeTransitionError } from './products.js';
import { adminAuditRangeStart } from './adminAudit.js';

// ─── Leads ────────────────────────────────────────────────────────────────────

async function getLeadPage(table, filters = {}) {
  const pagination = normalizeLeadPage(filters.page, filters.pageSize);
  let query = supabase.from(table).select('*', { count: 'exact' }).order('created_at', { ascending: false });
  if (filters.status) query = query.eq('status', filters.status);
  const search = normalizeLeadSearch(filters.search);
  if (search) query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
  const { data, count, error } = await query.range(pagination.from, pagination.to);
  if (error) throw new Error(error.message);
  return { rows: data || [], total: count || 0, page: pagination.page, pageSize: pagination.pageSize };
}

export async function getMemberLeads(filters = {}) {
  return getLeadPage('member_interest', filters);
}

export async function getTrainerLeads(filters = {}) {
  return getLeadPage('trainer_interest', filters);
}

export async function getPartnerLeads(filters = {}) {
  return getLeadPage('partner_interest', filters);
}

export async function getCampaignAttributionRows() {
  const pageSize = 500;
  return collectAdminPages(async page => {
    const from = (page - 1) * pageSize;
    const { data, count, error } = await supabase
      .from('member_interest')
      .select('id, utm_source, utm_medium, utm_campaign, source, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    return { rows: data || [], total: count || 0 };
  });
}

export async function updateLeadStatus(table, id, status) {
  const mutation = validateLeadMutation(table, status, [id]);
  const { data, error } = await supabase.rpc('admin_update_lead_statuses', {
    p_lead_type: mutation.table,
    p_lead_ids: mutation.ids,
    p_status: mutation.status,
  });
  if (error) throw leadMutationError(error, 'Lead status update failed.');
  if (Number(data) !== 1) throw new Error('Lead status update was not acknowledged. Refresh and try again.');
}

export async function updateLead(table, id, updates) {
  const mutation = normalizeLeadUpdate(table, updates);
  const validatedId = validateLeadMutation(table, mutation.updates.status, [id]).ids[0];
  const { data, error } = await supabase.rpc('admin_update_lead', {
    p_lead_type: mutation.table,
    p_lead_id: validatedId,
    p_status: mutation.updates.status,
    p_admin_notes: mutation.updates.admin_notes,
  });
  if (error) throw leadMutationError(error);
  if (Number(data) !== 1) throw new Error('Lead update was not acknowledged. Refresh and try again.');
}

export async function updateLeadStatuses(table, ids, status) {
  if (!ids?.length) return;
  const mutation = validateLeadMutation(table, status, ids);
  const { data, error } = await supabase.rpc('admin_update_lead_statuses', {
    p_lead_type: mutation.table,
    p_lead_ids: mutation.ids,
    p_status: mutation.status,
  });
  if (error) throw leadMutationError(error, 'Bulk lead status update failed.');
  if (Number(data) !== mutation.ids.length) {
    throw new Error('Bulk lead update was not fully acknowledged. Refresh and try again.');
  }
}

export async function updateLegacyBookingNotes(id, adminNotes) {
  const mutation = normalizeLegacyBookingNotes(id, adminNotes);
  const { error } = await supabase.rpc('admin_update_request', {
    p_request_type: 'class_booking',
    p_request_id: mutation.id,
    p_status: null,
    p_admin_notes: mutation.admin_notes,
    p_update_admin_notes: true,
  });
  if (error) throw new Error(error.message);
}

// ─── Classes ──────────────────────────────────────────────────────────────────

export async function getClassSessions(publicOnly = false) {
  let query = supabase.from('class_sessions').select('*').order('start_time', { ascending: true });
  if (publicOnly) query = query.eq('public_visible', true).eq('status', 'published');
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function createClassSession(sessionData) {
  const payload = normalizeClassSession(sessionData);
  const { data, error } = await supabase.from('class_sessions').insert([payload]).select().single();
  if (error) throw new Error(classSessionUpdateRpcError(error.message));
  return data;
}

export async function createClassSessions(sessionData) {
  if (!Array.isArray(sessionData) || sessionData.length === 0) throw new Error('Create at least one class session.');
  const payload = sessionData.map(item => normalizeClassSession(item));
  const { data, error } = await supabase.from('class_sessions').insert(payload).select();
  if (error) throw new Error(classSessionUpdateRpcError(error.message));
  return data || [];
}

export async function updateClassSession(id, updates) {
  const payload = normalizeClassSession(updates);
  const guarded = await supabase.rpc('admin_update_class_session', {
    p_session_id: id,
    p_session: payload,
  });
  if (!guarded.error) return guarded.data;

  const guardUnavailable = ['42883', 'PGRST202'].includes(guarded.error.code)
    || /admin_update_class_session.*(?:not found|schema cache|does not exist)/i.test(guarded.error.message || '');
  if (!guardUnavailable) throw new Error(classSessionUpdateRpcError(guarded.error.message));

  // Compatibility path for projects awaiting the class session guard migration.
  // The migration makes this check transactional; the preflight still blocks
  // unsafe edits immediately on older installations.
  const [current, active] = await Promise.all([
    supabase.from('class_sessions').select('status').eq('id', id).single(),
    supabase.from('session_bookings').select('id', { count: 'exact', head: true })
      .eq('class_session_id', id).in('status', ['requested', 'confirmed']),
  ]);
  if (current.error) throw new Error(current.error.message);
  if (active.error) throw new Error(active.error.message);
  const integrityError = classSessionUpdateGuardError({
    currentStatus: current.data?.status,
    nextStatus: payload.status,
    capacity: payload.capacity,
    activeBookings: active.count || 0,
  });
  if (integrityError) throw new Error(integrityError);

  const result = await supabase
    .from('class_sessions')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id');
  assertAdminMutation(result, 'Class session update');
}

export async function cancelClassSession(id) {
  const { data, error } = await supabase.rpc('admin_cancel_class_session', {
    p_session_id: id
  });
  if (error) throw new Error(error.message);
  return data || 0;
}

export async function duplicateClassSession(session) {
  return createClassSession({
    ...session,
    status: 'draft',
    public_visible: false,
    title: `${session.title} (copy)`
  });
}

// ─── Bookings ─────────────────────────────────────────────────────────────────

export async function getClassBookings(filters = {}) {
  const pageSize = 500;
  return collectAdminPages(async page => {
    const from = (page - 1) * pageSize;
    let query = supabase
      .from('class_bookings')
      .select('*, class_sessions(title, start_time, coach_name, location_zone)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });
    if (filters.class_session_id) query = query.eq('class_session_id', filters.class_session_id);
    if (filters.status) query = query.eq('status', filters.status);
    const { data, count, error } = await query.range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    return { rows: data || [], total: count || 0 };
  });
}

export async function updateBookingStatus(id, status) {
  const mutation = normalizeBookingStatusMutation(id, status);
  const { error } = await supabase.rpc('admin_update_request', {
    p_request_type: 'class_booking',
    p_request_id: mutation.id,
    p_status: mutation.status,
    p_admin_notes: null,
    p_update_admin_notes: false,
  });
  if (error) throw new Error(error.message);
}

// Authenticated member bookings are a separate, credit-backed workflow from
// pre-launch enquiry forms. The admin queue presents both together.
export async function getMemberBookingRequests(filters = {}) {
  const pageSize = 500;
  const rows = await collectAdminPages(async page => {
    const from = (page - 1) * pageSize;
    let query = supabase
      .from('session_bookings')
      .select('id, user_id, status, created_at, credit_batch_id, class_sessions(title, start_time, coach_name, location_zone)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });
    if (filters.status) query = query.eq('status', filters.status);
    const { data, count, error } = await query.range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    return { rows: data || [], total: count || 0 };
  });
  const memberIds = [...new Set(rows.map(row => row.user_id).filter(Boolean))];
  if (memberIds.length === 0) return [];

  const profiles = [];
  for (let index = 0; index < memberIds.length; index += 100) {
    const ids = memberIds.slice(index, index + 100);
    const { data, error } = await supabase.from('profiles').select('id, full_name, email, phone').in('id', ids);
    if (error) throw new Error(error.message);
    profiles.push(...(data || []));
  }

  const profileById = new Map(profiles.map(profile => [profile.id, profile]));
  return rows.map(row => ({
    ...row,
    profile: profileById.get(row.user_id) || null
  }));
}

export async function updateMemberBookingStatus(id, status) {
  return adminSetBookingStatus(id, status);
}

// ─── PT Requests ──────────────────────────────────────────────────────────────

export async function getPTRequests(filters = {}) {
  const normalized = normalizePTRequestFilters(filters);
  const applyFilters = (query, status = normalized.status) => {
    let filtered = query;
    if (status) filtered = filtered.eq('status', status);
    if (normalized.sessionType) filtered = filtered.eq('requested_session_type', normalized.sessionType);
    if (normalized.cutoff) filtered = filtered.gte('created_at', normalized.cutoff);
    if (normalized.search) {
      const term = `%${normalized.search}%`;
      filtered = filtered.or([
        'full_name', 'email', 'phone', 'requested_session_type', 'preferred_day',
        'preferred_time', 'training_goal', 'experience_level', 'admin_notes'
      ].map(column => `${column}.ilike.${term}`).join(','));
    }
    return filtered;
  };

  const pageQuery = applyFilters(
    supabase.from('private_session_requests').select('*', { count: 'exact' }).order('created_at', { ascending: false })
  ).range(normalized.from, normalized.to);
  const statusCount = status => applyFilters(
    supabase.from('private_session_requests').select('id', { count: 'exact', head: true }),
    status
  );
  if (filters.includeSummary === false) {
    const pageResult = await pageQuery;
    assertSupabaseResponses([pageResult]);
    return { rows: pageResult.data || [], total: pageResult.count || 0, page: normalized.page, pageSize: normalized.pageSize, summary: null };
  }
  const [pageResult, requested, approved, completed] = await Promise.all([
    pageQuery,
    statusCount('requested'),
    statusCount('approved'),
    statusCount('completed')
  ]);
  assertSupabaseResponses([pageResult, requested, approved, completed]);
  return {
    rows: pageResult.data || [],
    total: pageResult.count || 0,
    page: normalized.page,
    pageSize: normalized.pageSize,
    summary: {
      total: pageResult.count || 0,
      requested: normalized.status && normalized.status !== 'requested' ? 0 : requested.count || 0,
      approved: normalized.status && normalized.status !== 'approved' ? 0 : approved.count || 0,
      completed: normalized.status && normalized.status !== 'completed' ? 0 : completed.count || 0
    }
  };
}

export async function updatePTRequestStatus(id, status, admin_notes) {
  const mutation = normalizePTRequestMutation(id, status, admin_notes);
  const updatesNotes = Object.hasOwn(mutation.updates, 'admin_notes');
  const { error } = await supabase.rpc('admin_update_request', {
    p_request_type: 'private_session',
    p_request_id: mutation.id,
    p_status: mutation.updates.status,
    p_admin_notes: updatesNotes ? mutation.updates.admin_notes : null,
    p_update_admin_notes: updatesNotes,
  });
  if (error) throw new Error(error.message);
}

// ─── Availability / Blackouts ─────────────────────────────────────────────────

export async function getAvailabilityBlocks() {
  const { data, error } = await supabase.from('availability_blocks').select('*').order('start_time', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function createAvailabilityBlock(blockData) {
  const { error } = await supabase.from('availability_blocks').insert([blockData]);
  if (error) throw new Error(error.message);
}

export async function updateAvailabilityBlock(id, blockData) {
  const result = await supabase.from('availability_blocks').update(blockData).eq('id', id).select('id');
  assertAdminMutation(result, 'Availability update');
}

export async function deleteAvailabilityBlock(id) {
  const result = await supabase.from('availability_blocks').delete().eq('id', id).select('id');
  assertAdminMutation(result, 'Availability deletion');
}

export async function getBlackoutPeriods() {
  const { data, error } = await supabase.from('blackout_periods').select('*').order('start_time', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function createBlackoutPeriod(periodData) {
  const { error } = await supabase.from('blackout_periods').insert([periodData]);
  if (error) throw new Error(blackoutPeriodMutationError(error.message));
}

export async function updateBlackoutPeriod(id, periodData) {
  const result = await supabase.from('blackout_periods').update(periodData).eq('id', id).select('id');
  if (result.error) throw new Error(blackoutPeriodMutationError(result.error.message));
  assertAdminMutation(result, 'Blackout update');
}

export async function deleteBlackoutPeriod(id) {
  const result = await supabase.from('blackout_periods').delete().eq('id', id).select('id');
  assertAdminMutation(result, 'Blackout deletion');
}

// ─── Admin Settings ───────────────────────────────────────────────────────────

export async function getSoftLaunchSettings() {
  const { data, error } = await supabase.from('admin_settings').select('*').limit(1).single();
  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return data || getDefaultSettings();
}

export function getDefaultSettings() {
  return {
    soft_launch_mode: true,
    target_launch_date: '2026-08-01',
    countdown_enabled: true,
    max_soft_launch_class_capacity: 12,
    bookings_enabled: false,
    default_booking_mode: 'request_to_book',
    show_limited_capacity_badge: true,
    show_opening_in_stages_message: true,
    memberships_enabled: false,
    payments_enabled: false,
    fitbox_enabled: false,
    fitbox_booking_url: null,
    announcement_banner_text: null,
    announcement_banner_enabled: false
  };
}

export async function updateSoftLaunchSettings(updates) {
  const current = await getSoftLaunchSettings();
  if (current?.id) {
    const result = await supabase
      .from('admin_settings')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', current.id)
      .select('id');
    assertAdminMutation(result, 'Launch settings update');
  } else {
    const { error } = await supabase.from('admin_settings').insert([{ ...getDefaultSettings(), ...updates }]);
    if (error) throw new Error(error.message);
  }
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export async function getDashboardStats() {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoIso = weekAgo.toISOString();
  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);
  const monthAgoIso = monthAgo.toISOString();

  const results = await Promise.allSettled([
    supabase.from('member_interest').select('id, status, preferred_training_times, main_training_goals, interested_in_pt, interested_in_event_prep', {
      count: 'exact'
    }).range(0, 999),
    supabase.from('trainer_interest').select('id', { count: 'exact', head: true }).eq('status', 'new'),
    supabase.from('partner_interest').select('id', { count: 'exact', head: true }).eq('status', 'new'),
    supabase.from('member_interest').select('id', { count: 'exact', head: true }).gte('created_at', weekAgoIso),
    supabase.from('member_interest').select('id', { count: 'exact', head: true }).eq('interested_in_pt', true),
    supabase.from('member_interest').select('id', { count: 'exact', head: true }).eq('interested_in_event_prep', true),
    supabase.from('class_bookings').select('id', { count: 'exact', head: true }).eq('status', 'requested'),
    supabase.from('session_bookings').select('id', { count: 'exact', head: true }).eq('status', 'requested'),
    supabase.from('class_bookings').select('id', { count: 'exact', head: true }).eq('status', 'waitlisted'),
    supabase.from('session_bookings').select('id', { count: 'exact', head: true }).eq('status', 'waitlisted'),
    supabase.from('private_session_requests').select('id', { count: 'exact', head: true }).eq('status', 'requested'),
    supabase.from('session_bookings').select('id', { count: 'exact', head: true }).eq('status', 'attended').gte('attendance_marked_at', monthAgoIso),
    supabase.from('session_bookings').select('id', { count: 'exact', head: true }).eq('status', 'no_show').gte('attendance_marked_at', monthAgoIso)
  ]);
  return dashboardMetricsFromSettled(results);
}

// ─── Coaches (admin CRUD) ───────────────────────────────────────────────────

export async function getAllCoaches() {
  const { data, error } = await supabase.from('coaches').select('*').order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function createCoach(coach) {
  const { error } = await supabase.from('coaches').insert([coach]);
  if (error) throw new Error(error.message);
}

export async function updateCoach(id, updates) {
  const result = await supabase.from('coaches').update(updates).eq('id', id).select('id');
  assertAdminMutation(result, 'Coach update');
}

export async function deleteCoach(id) {
  const result = await supabase.from('coaches').delete().eq('id', id).select('id');
  assertAdminMutation(result, 'Coach deletion');
}

// ─── Events (admin CRUD) ────────────────────────────────────────────────────

export async function getAllEvents() {
  const { data, error } = await supabase.from('events').select('*').order('event_date', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getEventGoalCounts() {
  const { data, error } = await supabase.from('member_event_goals').select('event_id');
  if (error) throw new Error(error.message);
  return (data || []).reduce((counts, goal) => {
    counts[goal.event_id] = (counts[goal.event_id] || 0) + 1;
    return counts;
  }, {});
}

export async function getEventGoalMembers(eventId) {
  if (!eventId) throw new Error('An event is required to load its training group.');
  const { data, error } = await supabase.rpc('admin_event_goal_members', {
    p_event_id: eventId
  });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function createEvent(event) {
  const { error } = await supabase.from('events').insert([event]);
  if (error) throw new Error(error.message);
}

export async function updateEvent(id, updates) {
  const result = await supabase.from('events').update(updates).eq('id', id).select('id');
  assertAdminMutation(result, 'Event update');
}

export async function deleteEvent(id) {
  const result = await supabase.from('events').delete().eq('id', id).select('id');
  assertAdminMutation(result, 'Event deletion');
}

// ─── Member announcements ───────────────────────────────────────────────────

export async function getAllMemberAnnouncements() {
  const [announcementResult, metricResult, pushMetricResult] = await Promise.all([
    supabase.from('member_announcements').select('*').order('created_at', { ascending: false }),
    supabase.rpc('admin_announcement_metrics'),
    supabase.rpc('admin_announcement_push_metrics'),
  ]);
  if (announcementResult.error) throw new Error(announcementResult.error.message);
  if (metricResult.error) throw new Error(metricResult.error.message);
  if (pushMetricResult.error) throw new Error(pushMetricResult.error.message);
  const metrics = new Map((metricResult.data || []).map(item => [item.announcement_id, item]));
  const pushMetrics = new Map((pushMetricResult.data || []).map(item => [item.announcement_id, item]));
  return (announcementResult.data || []).map(item => ({
    ...item,
    read_count: Number(metrics.get(item.id)?.read_count) || 0,
    dismissed_count: Number(metrics.get(item.id)?.dismissed_count) || 0,
    push_delivered_count: Number(pushMetrics.get(item.id)?.delivered_count) || 0,
    push_failed_count: (Number(pushMetrics.get(item.id)?.failed_count) || 0) + (Number(pushMetrics.get(item.id)?.invalid_token_count) || 0),
    push_last_attempted_at: pushMetrics.get(item.id)?.last_attempted_at || null,
  }));
}

export async function publishMemberAnnouncement(id, announcement) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) throw new Error('Your admin session has expired. Sign in again.');
  const response = await fetch('/api/admin-publish-announcement', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ id: id || null, announcement }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Announcement could not be published.');
  return body;
}

export async function createMemberAnnouncement(announcement) {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('Your admin session has expired. Sign in again.');
  const { data, error } = await supabase
    .from('member_announcements')
    .insert({ ...announcement, created_by: user.id })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateMemberAnnouncement(id, updates) {
  const { data, error } = await supabase
    .from('member_announcements')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteMemberAnnouncement(id) {
  const result = await supabase.from('member_announcements').delete().eq('id', id).select('id');
  if (/ANNOUNCEMENT_ARCHIVE_REQUIRED/i.test(result.error?.message || '')) {
    throw new Error('Published notices must be archived so their member and delivery history stays intact.');
  }
  assertAdminMutation(result, 'Announcement deletion');
}

export async function setMemberAnnouncementArchived(id, archived) {
  const { error } = await supabase.rpc('admin_archive_member_announcement', {
    p_announcement_id: id,
    p_archived: Boolean(archived),
  });
  if (error) throw new Error(error.message);
}

export async function seedXertEventCalendar() {
  const { data: existing, error: existingError } = await supabase.from('events').select('name,event_date');
  if (existingError) throw new Error(existingError.message);

  const existingKeys = new Set((existing || []).map(event => `${event.name}|${event.event_date}`));
  const missing = XERT_2026_EVENTS.filter(event => !existingKeys.has(`${event.name}|${event.event_date}`));

  if (missing.length === 0) {
    return { inserted: 0, total: existing?.length || 0 };
  }

  const payload = missing.map(event => ({
    name: event.name,
    category: event.category,
    event_date: event.event_date,
    end_date: event.end_date,
    location: event.location,
    region: event.region,
    sort_order: event.sort_order,
    published: true,
    url: /** @type {{ url?: string }} */ (event).url || null
  }));

  const { error } = await supabase.from('events').insert(payload);
  if (error) throw new Error(error.message);
  return {
    inserted: missing.length,
    total: (existing?.length || 0) + missing.length
  };
}

// ─── Members (admin) ─────────────────────────────────────────────────────────

export async function adminListMembers() {
  return collectAdminBatches(async (page, pageSize) => {
    const from = (page - 1) * pageSize;
    const { data, error } = await supabase
      .rpc('admin_list_members')
      .order('joined_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    return data || [];
  });
}

export async function adminSearchMembers(search, limit = 12) {
  const normalizedSearch = normalizeLeadSearch(search);
  if (normalizedSearch.length < 2) return [];
  const normalizedLimit = Math.max(1, Math.min(20, Number.parseInt(String(limit), 10) || 12));

  const primary = await supabase.rpc('admin_search_members', {
    p_search: normalizedSearch,
    p_limit: normalizedLimit
  });
  if (!primary.error) return primary.data || [];

  const functionUnavailable = ['42883', 'PGRST202'].includes(primary.error.code)
    || /admin_search_members.*(?:not found|schema cache|does not exist)/i.test(primary.error.message || '');
  if (!functionUnavailable) throw new Error(primary.error.message);

  const term = `%${normalizedSearch}%`;
  const { data, error } = await supabase
    .rpc('admin_list_members')
    .or(['full_name', 'email', 'phone'].map(column => `${column}.ilike.${term}`).join(','))
    .order('joined_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(normalizedLimit);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function adminListMembersPage(filters = {}) {
  const query = normalizeMemberDirectoryQuery(filters);
  const response = await supabase.rpc('admin_list_members_page', {
    p_search: query.search || null,
    p_role: query.role,
    p_credit: query.credit,
    p_limit: query.pageSize,
    p_offset: query.offset,
    p_user_id: query.memberId
  });

  if (!response.error) {
    const rows = (response.data || []).map(({ total_count: _totalCount, ...member }) => member);
    return {
      rows,
      total: Number(response.data?.[0]?.total_count || 0),
      page: query.page,
      pageSize: query.pageSize,
      serverPaged: true
    };
  }

  const functionUnavailable = ['42883', 'PGRST202'].includes(response.error.code)
    || /admin_list_members_page.*(?:not found|schema cache|does not exist)/i.test(response.error.message || '');
  if (!functionUnavailable) throw new Error(response.error.message);

  const allMembers = await adminListMembers();
  const filtered = filterMembers(
    query.memberId ? allMembers.filter(member => member.id === query.memberId) : allMembers,
    query
  );
  return {
    rows: filtered.slice(query.offset, query.offset + query.pageSize),
    total: filtered.length,
    page: query.page,
    pageSize: query.pageSize,
    serverPaged: false
  };
}

export async function adminExportMembers(filters = {}) {
  const query = normalizeMemberDirectoryQuery({ ...filters, page: 1, pageSize: 100, memberId: null });
  const first = await adminListMembersPage(query);
  if (!first.serverPaged) {
    return filterMembers(await adminListMembers(), query);
  }
  return collectAdminPages(page => (
    page === 1 ? first : adminListMembersPage({ ...query, page })
  ));
}

export async function adminRecentMembers(limit = 6) {
  const safeLimit = Math.max(1, Math.min(20, Number.parseInt(String(limit), 10) || 6));
  const { data, error } = await supabase
    .rpc('admin_list_members')
    .order('joined_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(safeLimit);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function adminGrantCredits(userId, sessions, validityDays, requestId, note) {
  const { error } = await supabase.rpc('admin_grant_credits_v2', {
    p_user_id: userId,
    p_sessions: sessions,
    p_validity_days: validityDays ?? null,
    p_request_id: requestId,
    p_note: note
  });
  if (error) {
    if (/admin_grant_credits_v2|schema cache|function.*not found/i.test(error.message || '')) {
      throw new Error('Apply credit_grant_audit_upgrade.sql before issuing manual credits.');
    }
    throw new Error(error.message);
  }
}

export async function adminSetRole(userId, role) {
  const change = normalizeRoleChange(userId, role);
  const { error } = await supabase.rpc('admin_set_role', {
    p_user_id: change.userId,
    p_role: change.role
  });
  if (error) {
    if (/CANNOT_DEMOTE_LAST_ADMIN/i.test(error.message || '')) {
      throw new Error('Promote another administrator before removing the final admin.');
    }
    throw new Error(error.message);
  }
}

export async function adminListMemberNotes(userId, includeArchived = false) {
  const member = normalizeMemberDirectoryQuery({ memberId: userId, pageSize: 1 });
  const { data, error } = await supabase.rpc('admin_list_member_notes', {
    p_user_id: member.memberId,
    p_include_archived: Boolean(includeArchived)
  });
  if (!error) return { rows: data || [], available: true };
  const functionUnavailable = ['42883', 'PGRST202'].includes(error.code)
    || /admin_list_member_notes.*(?:not found|schema cache|does not exist)/i.test(error.message || '');
  if (functionUnavailable) return { rows: [], available: false };
  throw new Error(error.message);
}

export async function adminAddMemberNote(userId, category, body) {
  const note = normalizeMemberNote(userId, category, body);
  const { data, error } = await supabase.rpc('admin_add_member_note', {
    p_user_id: note.userId,
    p_category: note.category,
    p_body: note.body
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function adminSetMemberNoteArchived(noteId, archived) {
  const note = normalizeMemberNoteArchive(noteId, archived);
  const { error } = await supabase.rpc('admin_set_member_note_archived', {
    p_note_id: note.noteId,
    p_archived: note.archived
  });
  if (error) throw new Error(error.message);
}

export async function adminListMemberFollowUps(limit = 20) {
  const safeLimit = Math.max(1, Math.min(50, Number.parseInt(String(limit), 10) || 20));
  const { data, error } = await supabase.rpc('admin_member_follow_up_queue', { p_limit: safeLimit });
  if (!error) return { rows: data || [], available: true };
  const functionUnavailable = ['42883', 'PGRST202'].includes(error.code)
    || /admin_member_follow_up_queue.*(?:not found|schema cache|does not exist)/i.test(error.message || '');
  if (functionUnavailable) return { rows: [], available: false };
  throw new Error(error.message);
}

async function getAuditProfiles(ids) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  const profiles = [];
  for (let index = 0; index < uniqueIds.length; index += 100) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', uniqueIds.slice(index, index + 100));
    if (error) throw new Error(error.message);
    profiles.push(...(data || []));
  }
  return profiles;
}

export async function getAdminAuditRecords(days = '30') {
  const cutoffIso = adminAuditRangeStart(days);
  const loadTable = (table, columns) => collectAdminBatches(async (page, pageSize) => {
    const from = (page - 1) * pageSize;
    let query = supabase
      .from(table)
      .select(columns)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });
    if (cutoffIso) query = query.gte('created_at', cutoffIso);
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    return data || [];
  });

  const sources = await Promise.allSettled([
    loadTable('admin_role_changes', 'id, target_user_id, changed_by, previous_role, new_role, created_at'),
    loadTable('admin_credit_grants', 'id, user_id, granted_by, sessions, validity_days, note, created_at'),
    loadTable('admin_request_status_changes', 'id, request_type, request_id, changed_by, previous_status, new_status, previous_admin_notes, new_admin_notes, subject_label, subject_email, created_at'),
    loadTable('member_announcement_admin_events', 'id, announcement_id, announcement_title, action, actor_id, previous_published_at, new_published_at, previous_archived_at, new_archived_at, created_at'),
    loadTable('admin_lead_changes', 'id, lead_type, lead_id, changed_by, previous_status, new_status, previous_admin_notes, new_admin_notes, subject_label, subject_email, created_at'),
    loadTable('admin_schedule_changes', 'id, resource_type, resource_id, action, changed_by, subject_label, previous_snapshot, new_snapshot, created_at'),
    loadTable('admin_content_changes', 'id, resource_type, resource_id, action, changed_by, subject_label, previous_snapshot, new_snapshot, created_at'),
    loadTable('session_booking_changes', 'id, booking_id, class_session_id, member_id, changed_by, actor_role, action, class_label, previous_snapshot, new_snapshot, created_at'),
  ]);
  const warnings = [];
  const sourceValue = (index, label) => {
    if (sources[index].status === 'fulfilled') return sources[index].value;
    warnings.push(`${label}: ${sources[index].reason?.message || 'unavailable'}`);
    return [];
  };
  const roleChanges = sourceValue(0, 'Role changes');
  const creditGrants = sourceValue(1, 'Credit grants');
  const requestChanges = sourceValue(2, 'Request changes');
  const announcementEvents = sourceValue(3, 'Announcement changes');
  const leadChanges = sourceValue(4, 'Lead changes');
  const scheduleChanges = sourceValue(5, 'Schedule changes');
  const contentChanges = sourceValue(6, 'Content changes');
  const bookingChanges = sourceValue(7, 'Booking changes');
  if (sources.every(result => result.status === 'rejected')) {
    throw new Error(warnings.join(' | '));
  }

  const ids = [
    ...roleChanges.flatMap(row => [row.target_user_id, row.changed_by]),
    ...creditGrants.flatMap(row => [row.user_id, row.granted_by]),
    ...requestChanges.map(row => row.changed_by),
    ...announcementEvents.map(row => row.actor_id),
    ...leadChanges.map(row => row.changed_by),
    ...scheduleChanges.map(row => row.changed_by),
    ...contentChanges.map(row => row.changed_by),
    ...bookingChanges.flatMap(row => [row.member_id, row.changed_by]),
  ];
  let profiles = [];
  try {
    profiles = await getAuditProfiles(ids);
  } catch (error) {
    warnings.push(`User identities: ${error.message || 'unavailable'}`);
  }
  return { roleChanges, creditGrants, requestChanges, announcementEvents, leadChanges, scheduleChanges, contentChanges, bookingChanges, profiles, warnings };
}

// ─── Class rosters (credit-based bookings) ───────────────────────────────────

export async function adminSessionRoster(sessionId) {
  const { data, error } = await supabase.rpc('admin_session_roster', {
    p_session_id: sessionId
  });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function adminWaitlistOverview(limit = 20) {
  const safeLimit = Math.max(1, Math.min(50, Number.parseInt(String(limit), 10) || 20));
  const { data, error } = await supabase.rpc('admin_waitlist_overview', { p_limit: safeLimit });
  if (!error) return { rows: data || [], available: true };
  const functionUnavailable = ['42883', 'PGRST202'].includes(error.code)
    || /admin_waitlist_overview.*(?:not found|schema cache|does not exist)/i.test(error.message || '');
  if (functionUnavailable) return { rows: [], available: false };
  throw new Error(error.message);
}

export async function adminSetBookingStatus(bookingId, status) {
  const mutation = normalizeBookingStatusMutation(bookingId, status);
  const { error } = await supabase.rpc('admin_set_booking_status', {
    p_booking_id: mutation.id,
    p_status: mutation.status
  });
  if (error) {
    if (/WAITLIST_ORDER_REQUIRED|WAITLIST_PRIORITY/i.test(error.message || '')) {
      throw new Error('Promote the next waitlisted member before reopening another booking.');
    }
    if (/BOOKING_TIME_CONFLICT/i.test(error.message || '')) {
      throw new Error('This member already has another active class at the same time. Resolve that booking before confirming this place.');
    }
    throw new Error(error.message);
  }
}

export async function adminPromoteNextWaitlisted(sessionId) {
  const mutation = normalizeSessionPromotion(sessionId);
  const { data, error } = await supabase.rpc('admin_promote_next_waitlisted', {
    p_session_id: mutation.sessionId
  });
  if (!error) return data;
  const message = error.message || '';
  if (/WAITLIST_EMPTY/i.test(message)) throw new Error('No members are waiting for this class.');
  if (/WAITLIST_MEMBER_NO_CREDITS|NO_CREDITS/i.test(message)) {
    throw new Error('The next member has no available class credit. Contact them before changing the queue.');
  }
  if (/SESSION_FULL/i.test(message)) throw new Error('This class is still full. Refresh the roster before promoting anyone.');
  if (/BOOKING_TIME_CONFLICT/i.test(message)) {
    throw new Error('The next member already has another active class at the same time. Contact them before changing the queue.');
  }
  throw new Error(message);
}

export async function adminRecordSessionAttendance(sessionId, attendance) {
  const mutation = normalizeSessionAttendanceMutation(sessionId, attendance);
  const { data, error } = await supabase.rpc('admin_record_session_attendance', {
    p_session_id: mutation.sessionId,
    p_attended_ids: mutation.attendedIds,
    p_no_show_ids: mutation.noShowIds,
  });
  if (error) throw new Error(error.message);
  return Number(data || 0);
}

// ─── Orders (admin) ──────────────────────────────────────────────────────────

export async function getAllOrders() {
  const pageSize = 500;
  return collectAdminPages(async page => {
    const from = (page - 1) * pageSize;
    const { data, count, error } = await supabase
      .from('orders')
      .select('*, products(name), stripe_refunds(refund_id, amount_cents, credits_revoked, credits_consumed, bookings_cancelled, refunded_at)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    return { rows: data || [], total: count || 0 };
  });
}

export async function getRecentOrders(limit = 6) {
  const safeLimit = Math.max(1, Math.min(20, Number.parseInt(String(limit), 10) || 6));
  const { data, error } = await supabase.from('orders').select('*, products(name)').order('created_at', { ascending: false }).limit(safeLimit);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function refundOrder(orderId, reason, confirmation) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) throw new Error('Your admin session has expired. Sign in again.');
  const response = await fetch('/api/admin-refund-order', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ order_id: orderId, reason, confirmation }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Refund could not be completed.');
  return body;
}

export async function reconcileOrder(orderId) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) throw new Error('Your admin session has expired. Sign in again.');
  const response = await fetch('/api/admin-reconcile-order', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ order_id: orderId }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Payment could not be reconciled.');
  return body;
}

// ─── Products (admin) ────────────────────────────────────────────────────────

export async function getAllProducts() {
  const { data, error } = await supabase.from('products').select('*').order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function createProduct(product) {
  const { error } = await supabase.from('products').insert([product]);
  if (error) throw new Error(error.message);
}

export async function updateProduct(id, updates) {
  const guarded = await supabase.rpc('admin_update_product', {
    p_product_id: id,
    p_product: updates,
  });
  if (!guarded.error) return guarded.data;

  const guardUnavailable = ['42883', 'PGRST202'].includes(guarded.error.code)
    || /admin_update_product.*(?:not found|schema cache|does not exist)/i.test(guarded.error.message || '');
  if (!guardUnavailable) {
    if (/STRIPE_PRICE_REFRESH_REQUIRED/i.test(guarded.error.message || '')) {
      throw new Error('Replace or clear the Stripe Price ID before changing this pack\'s price or currency.');
    }
    throw new Error(guarded.error.message);
  }

  // Compatibility path for projects awaiting the product update migration.
  const current = await supabase.from('products').select('price_cents, currency, stripe_price_id').eq('id', id).single();
  if (current.error) throw new Error(current.error.message);
  const integrityError = productStripeTransitionError(current.data, updates);
  if (integrityError) throw new Error(integrityError);

  const result = await supabase.from('products').update(updates).eq('id', id).select('id');
  assertAdminMutation(result, 'Product update');
}

// ─── Business stats (admin overview) ─────────────────────────────────────────

export async function getBusinessStats() {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const nowIso = new Date().toISOString();

  const pageSize = 500;
  const paidOrders = collectAdminPages(async page => {
    const from = (page - 1) * pageSize;
    const { data, count, error } = await supabase
      .from('orders')
      .select('id, amount_cents, paid_at, created_at', { count: 'exact' })
      .eq('status', 'paid')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    return { rows: data || [], total: count || 0 };
  });
  const creditBatches = collectAdminPages(async page => {
    const from = (page - 1) * pageSize;
    const { data, count, error } = await supabase
      .from('credit_batches')
      .select('id, remaining, expires_at', { count: 'exact' })
      .gt('remaining', 0)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    return { rows: data || [], total: count || 0 };
  });
  const [paid, members, credits, upcoming] = await Promise.all([
    paidOrders,
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    creditBatches,
    supabase.from('class_sessions').select('id', { count: 'exact', head: true }).eq('status', 'published').gte('start_time', nowIso)
  ]);
  assertSupabaseResponses([members, upcoming]);

  const monthPaid = paid.filter(o => new Date(o.paid_at || o.created_at) >= monthStart);
  const activeCredits = credits.filter(c => !c.expires_at || new Date(c.expires_at) > new Date()).reduce((s, c) => s + (c.remaining || 0), 0);

  return {
    totalRevenueCents: paid.reduce((s, o) => s + (o.amount_cents || 0), 0),
    monthRevenueCents: monthPaid.reduce((s, o) => s + (o.amount_cents || 0), 0),
    paidOrders: paid.length,
    memberCount: members.count || 0,
    activeCredits,
    upcomingClasses: upcoming.count || 0
  };
}

// ─── Sidebar badge counts (things needing attention) ─────────────────────────

export async function getAdminBadgeCounts() {
  const [newLeads, pendingLegacyBookings, pendingMemberBookings, pendingPT] = await Promise.all([
    supabase.from('member_interest').select('id', { count: 'exact', head: true }).eq('status', 'new'),
    supabase.from('class_bookings').select('id', { count: 'exact', head: true }).eq('status', 'requested'),
    supabase.from('session_bookings').select('id', { count: 'exact', head: true }).eq('status', 'requested'),
    supabase.from('private_session_requests').select('id', { count: 'exact', head: true }).eq('status', 'requested')
  ]);
  assertSupabaseResponses([newLeads, pendingLegacyBookings, pendingMemberBookings, pendingPT]);
  return {
    members: newLeads.count || 0,
    bookings: (pendingLegacyBookings.count || 0) + (pendingMemberBookings.count || 0),
    'pt-requests': pendingPT.count || 0
  };
}

// ─── Operations health (admin readiness checklist) ──────────────────────────

async function healthCheck(key, label, fn) {
  try {
    const result = await fn();
    return {
      key,
      label,
      status: result.status || 'ok',
      detail: result.detail || 'Ready',
      action: result.action || null,
      count: result.count ?? null
    };
  } catch (error) {
    return {
      key,
      label,
      status: 'error',
      detail: error.message || 'Check failed',
      action: 'Check Supabase schema, RLS policies, and admin permissions.',
      count: null
    };
  }
}

async function getCommerceConfigurationHealth() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.access_token) throw new Error('Admin session is unavailable.');
  const response = await fetch('/api/admin-commerce-health', {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Commerce health check failed.');
  return body;
}

async function getPushConfigurationHealth() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.access_token) throw new Error('Admin session is unavailable.');
  const response = await fetch('/api/admin-push-health', {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Notification health check failed.');
  return body;
}

export async function getOperationsHealth() {
  const nowIso = new Date().toISOString();

  return Promise.all([
    healthCheck('supabase', 'Supabase connection', async () => {
      const { error } = await supabase.from('admin_settings').select('id', { count: 'exact', head: true });
      if (error) throw error;
      return { detail: 'Admin settings table is reachable.' };
    }),

    healthCheck('admins', 'Admin access', async () => {
      const { count, error } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin');
      if (error) throw error;
      return count > 0
        ? {
            count,
            detail: `${count} admin account${count === 1 ? '' : 's'} configured.`
          }
        : {
            status: 'attention',
            count: 0,
            detail: 'No admin profile found.',
            action: 'Promote an owner account in Supabase profiles.role.'
          };
    }),

    healthCheck('products', 'Session packs', async () => {
      const { data, error } = await supabase.from('products').select('slug, active, stripe_price_id').eq('active', true);
      if (error) throw error;
      const products = data || [];
      const missingStripePrices = products.filter(p => !p.stripe_price_id).length;
      if (products.length === 0) {
        return {
          status: 'attention',
          count: 0,
          detail: 'No active session packs.',
          action: 'Activate products in Session Packs.'
        };
      }
      return {
        status: missingStripePrices > 0 ? 'attention' : 'ok',
        count: products.length,
        detail: missingStripePrices > 0 ? `${products.length} active pack${products.length === 1 ? '' : 's'}; ${missingStripePrices} use ad-hoc Stripe pricing.` : `${products.length} active pack${products.length === 1 ? '' : 's'} with Stripe price IDs.`,
        action: missingStripePrices > 0 ? 'Add Stripe Price IDs for cleaner product reporting.' : null
      };
    }),

    healthCheck('commerce-config', 'Stripe checkout', async () => {
      const result = await getCommerceConfigurationHealth();
      if (!result.ready) {
        const missing = result.environment?.missing || [];
        const affected = [...new Set((result.issues || [])
          .map(issue => issue.slug)
          .filter(slug => slug && slug !== 'server'))];
        const problems = [
          missing.length > 0 ? `Missing server settings: ${missing.join(', ')}.` : '',
          affected.length > 0 ? `Checkout configuration needs attention for: ${affected.join(', ')}.` : '',
        ].filter(Boolean);
        return {
          status: 'attention',
          count: result.active_product_count,
          detail: problems.join(' ') || 'No active checkout products are configured.',
          action: missing.length > 0
            ? 'Set the missing values in Vercel, redeploy, then refresh this check.'
            : 'Review the affected records in Session Packs and Stripe.'
        };
      }
      return {
        count: result.active_product_count,
        detail: `${result.stripe_price_count} Stripe-linked and ${result.dynamic_price_count} dynamic-price pack${result.active_product_count === 1 ? '' : 's'} verified.`
      };
    }),

    healthCheck('push-notifications', 'Member notifications', async () => {
      const result = await getPushConfigurationHealth();
      const productionDevices = Number(result.subscriptions?.production || 0);
      const sandboxDevices = Number(result.subscriptions?.sandbox || 0);
      const delivered = Number(result.deliveries_24h?.delivered || 0);
      const failed = Number(result.deliveries_24h?.failed || 0);
      const invalid = Number(result.deliveries_24h?.invalid_token || 0);
      const deliveryProblems = failed + invalid;
      if (!result.ready) {
        const missing = result.environment?.missing || [];
        return {
          status: 'attention',
          count: productionDevices,
          detail: `Production push delivery is not configured${missing.length ? `: ${missing.join(', ')}` : '.'}`,
          action: 'Set the missing APNs values in the production Vercel project, redeploy, then refresh this check.'
        };
      }
      if (productionDevices === 0) {
        return {
          status: 'attention',
          count: 0,
          detail: `APNs is configured; ${sandboxDevices} sandbox device${sandboxDevices === 1 ? '' : 's'} and no production devices are registered.`,
          action: 'Install the TestFlight build and enable Member notice notifications in Account.'
        };
      }
      return {
        status: deliveryProblems > 0 ? 'attention' : 'ok',
        count: productionDevices,
        detail: `${productionDevices} production device${productionDevices === 1 ? '' : 's'} registered; ${delivered} accepted and ${deliveryProblems} failed in the last 24 hours.`,
        action: deliveryProblems > 0 ? 'Review recent delivery results in Member Notices and refresh after invalid devices are retired.' : null
      };
    }),

    healthCheck('classes', 'Published classes', async () => {
      const { count, error } = await supabase.from('class_sessions').select('id', { count: 'exact', head: true }).eq('status', 'published').eq('public_visible', true).gte('start_time', nowIso);
      if (error) throw error;
      return count > 0
        ? {
            count,
            detail: `${count} upcoming public class${count === 1 ? '' : 'es'} available.`
          }
        : {
            status: 'attention',
            count: 0,
            detail: 'No upcoming public classes.',
            action: 'Publish launch classes in Class Calendar.'
          };
    }),

    healthCheck('coaches', 'Published coaches', async () => {
      const { count, error } = await supabase.from('coaches').select('id', { count: 'exact', head: true }).eq('published', true);
      if (error) throw error;
      return count > 0
        ? {
            count,
            detail: `${count} published team profile${count === 1 ? '' : 's'}.`
          }
        : {
            status: 'attention',
            count: 0,
            detail: 'No published team profiles.',
            action: 'Add coaches, nutritionists, physios, or massage partners.'
          };
    }),

    healthCheck('events', 'Published events', async () => {
      const { count, error } = await supabase.from('events').select('id', { count: 'exact', head: true }).eq('published', true);
      if (error) throw error;
      return count > 0
        ? {
            count,
            detail: `${count} public event${count === 1 ? '' : 's'} in the calendar.`
          }
        : {
            status: 'attention',
            count: 0,
            detail: 'No published events.',
            action: 'Seed or add the 2026 SEQ event calendar.'
          };
    }),

    healthCheck('cms', 'Site CMS content', async () => {
      const { count, error } = await supabase.from('site_content').select('key', { count: 'exact', head: true });
      if (error) throw error;
      return count > 0
        ? {
            count,
            detail: `${count} editable content block${count === 1 ? '' : 's'} saved.`
          }
        : {
            status: 'attention',
            count: 0,
            detail: 'Using built-in content defaults.',
            action: 'Review and save content in Site Content.'
          };
    }),

    healthCheck('orders', 'Commerce activity', async () => {
      const { count, error } = await supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'paid');
      if (error) throw error;
      return count > 0
        ? {
            count,
            detail: `${count} paid order${count === 1 ? '' : 's'} recorded.`
          }
        : {
            status: 'attention',
            count: 0,
            detail: 'No paid orders recorded yet.',
            action: 'Run a Stripe test purchase after deployment.'
          };
    }),

    healthCheck('credit-audit', 'Audited credit grants', async () => {
      const { count, error } = await supabase.from('admin_credit_grants').select('id', { count: 'exact', head: true });
      if (error) {
        return {
          status: 'attention',
          detail: 'Manual credit grant auditing is not installed.',
          action: 'Apply src/supabase/credit_grant_audit_upgrade.sql in Supabase.'
        };
      }
      return { count, detail: `${count || 0} audited manual credit grant${count === 1 ? '' : 's'} recorded.` };
    }),

    healthCheck('schema-contract', 'Database release contract', async () => {
      const { data, error } = await supabase.rpc('xert_public_capabilities');
      if (error) {
        return {
          status: 'attention',
          detail: 'Database capability reporting is not installed.',
          action: 'Apply the required upgrade SQL files listed in src/lib/schemaCapabilities.js.'
        };
      }
      const summary = summarizeSchemaCapabilities(data);
      return summary.ready
        ? {
            count: summary.installed.length,
            detail: 'Required booking, waitlist, attendance, PT tracking, and admin safety migrations are installed.'
          }
        : {
            status: 'attention',
            count: summary.installed.length,
            detail: `Missing database capabilities: ${summary.missing.join(', ')}.`,
            action: summary.actions.join(' ')
          };
    })
  ]);
}

// ─── Member detail (admin drawer) ────────────────────────────────────────────

export async function adminMemberDetail(userId) {
  const [credits, bookings, orders, grants, notes] = await Promise.all([supabase.from('credit_batches').select('*').eq('user_id', userId).order('created_at', { ascending: false }), supabase.from('session_bookings').select('*, class_sessions(title, class_type, start_time)').eq('user_id', userId).order('created_at', { ascending: false }).limit(20), supabase.from('orders').select('*, products(name)').eq('user_id', userId).order('created_at', { ascending: false }), supabase.from('admin_credit_grants').select('*').eq('user_id', userId).order('created_at', { ascending: false }), adminListMemberNotes(userId, true)]);
  for (const r of [credits, bookings, orders]) {
    if (r.error) throw new Error(r.error.message);
  }
  return {
    credits: credits.data || [],
    bookings: bookings.data || [],
    orders: orders.data || [],
    grants: grants.error ? [] : grants.data || [],
    creditAuditAvailable: !grants.error,
    notes: notes.rows,
    memberNotesAvailable: notes.available
  };
}

// ─── Site content (CMS) ──────────────────────────────────────────────────────

export async function getAllSiteContent() {
  const { data, error } = await supabase.from('site_content').select('*');
  if (error) throw new Error(error.message);
  return data || [];
}

export async function saveSiteContent(key, contentData) {
  const { error } = await supabase.from('site_content').upsert({ key, data: contentData, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}
