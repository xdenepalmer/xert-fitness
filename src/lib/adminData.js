import { supabase } from './supabase';
import { XERT_2026_EVENTS } from './eventCalendar';
import { assertAdminMutation, assertSupabaseResponses } from './supabaseResults';
import { normalizeLeadPage, normalizeLeadSearch, normalizeLeadUpdate, validateLeadMutation } from './adminLeads';
import { normalizeRoleChange } from './memberAdmin';
import { summarizeSchemaCapabilities } from './schemaCapabilities';
import { normalizeClassSession } from './scheduling';
import {
  normalizeBookingStatusMutation,
  normalizeLegacyBookingNotes,
  normalizePTRequestMutation,
  normalizeSessionAttendanceMutation,
} from './adminRequests';
import { dashboardMetricsFromSettled } from './adminMetrics';
import { normalizePTRequestFilters } from './ptRequestAnalytics';
import { collectAdminBatches, collectAdminPages } from './adminPagination.js';

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

export async function updateLeadStatus(table, id, status) {
  const mutation = validateLeadMutation(table, status, [id]);
  const result = await supabase.from(mutation.table).update({ status: mutation.status }).eq('id', mutation.ids[0]).select('id');
  assertAdminMutation(result, 'Lead status update');
}

export async function updateLead(table, id, updates) {
  const mutation = normalizeLeadUpdate(table, updates);
  const validatedId = validateLeadMutation(table, mutation.updates.status, [id]).ids[0];
  const result = await supabase.from(mutation.table).update(mutation.updates).eq('id', validatedId).select('id');
  assertAdminMutation(result, 'Lead update');
}

export async function updateLeadStatuses(table, ids, status) {
  if (!ids?.length) return;
  const mutation = validateLeadMutation(table, status, ids);
  const result = await supabase.from(mutation.table).update({ status: mutation.status }).in('id', mutation.ids).select('id');
  assertAdminMutation(result, 'Bulk lead status update', mutation.ids.length);
}

export async function updateLegacyBookingNotes(id, adminNotes) {
  const mutation = normalizeLegacyBookingNotes(id, adminNotes);
  const result = await supabase.from('class_bookings').update({ admin_notes: mutation.admin_notes }).eq('id', mutation.id).select('id');
  assertAdminMutation(result, 'Booking notes update');
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
  if (error) throw new Error(error.message);
  return data;
}

export async function createClassSessions(sessionData) {
  if (!Array.isArray(sessionData) || sessionData.length === 0) throw new Error('Create at least one class session.');
  const payload = sessionData.map(item => normalizeClassSession(item));
  const { data, error } = await supabase.from('class_sessions').insert(payload).select();
  if (error) throw new Error(error.message);
  return data || [];
}

export async function updateClassSession(id, updates) {
  const payload = normalizeClassSession(updates);
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
  const result = await supabase.from('class_bookings').update({ status: mutation.status }).eq('id', mutation.id).select('id');
  assertAdminMutation(result, 'Booking status update');
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
  const result = await supabase.from('private_session_requests').update(mutation.updates).eq('id', mutation.id).select('id');
  assertAdminMutation(result, 'PT request update');
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
  if (error) throw new Error(error.message);
}

export async function updateBlackoutPeriod(id, periodData) {
  const result = await supabase.from('blackout_periods').update(periodData).eq('id', id).select('id');
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
    supabase.from('trainer_interest').select('id', { count: 'exact', head: true }),
    supabase.from('partner_interest').select('id', { count: 'exact', head: true }),
    supabase.from('member_interest').select('id', { count: 'exact', head: true }).gte('created_at', weekAgoIso),
    supabase.from('member_interest').select('id', { count: 'exact', head: true }).eq('interested_in_pt', true),
    supabase.from('member_interest').select('id', { count: 'exact', head: true }).eq('interested_in_event_prep', true),
    supabase.from('class_bookings').select('id', { count: 'exact', head: true }).eq('status', 'requested'),
    supabase.from('session_bookings').select('id', { count: 'exact', head: true }).eq('status', 'requested'),
    supabase.from('class_bookings').select('id', { count: 'exact', head: true }).eq('status', 'waitlisted'),
    supabase.from('session_bookings').select('id', { count: 'exact', head: true }).eq('status', 'waitlisted'),
    supabase.from('private_session_requests').select('id', { count: 'exact', head: true }),
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

// ─── Class rosters (credit-based bookings) ───────────────────────────────────

export async function adminSessionRoster(sessionId) {
  const { data, error } = await supabase.rpc('admin_session_roster', {
    p_session_id: sessionId
  });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function adminSetBookingStatus(bookingId, status) {
  const mutation = normalizeBookingStatusMutation(bookingId, status);
  const { error } = await supabase.rpc('admin_set_booking_status', {
    p_booking_id: mutation.id,
    p_status: mutation.status
  });
  if (error) throw new Error(error.message);
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
      .select('*, products(name)', { count: 'exact' })
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
        const affected = (result.issues || []).map(issue => issue.slug).join(', ');
        return {
          status: 'attention',
          count: result.active_product_count,
          detail: affected
            ? `Checkout configuration needs attention for: ${affected}.`
            : 'No active checkout products are configured.',
          action: 'Review Session Packs and the Stripe configuration in Vercel.'
        };
      }
      return {
        count: result.active_product_count,
        detail: `${result.stripe_price_count} Stripe-linked and ${result.dynamic_price_count} dynamic-price pack${result.active_product_count === 1 ? '' : 's'} verified.`
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
  const [credits, bookings, orders, grants] = await Promise.all([supabase.from('credit_batches').select('*').eq('user_id', userId).order('created_at', { ascending: false }), supabase.from('session_bookings').select('*, class_sessions(title, class_type, start_time)').eq('user_id', userId).order('created_at', { ascending: false }).limit(20), supabase.from('orders').select('*, products(name)').eq('user_id', userId).order('created_at', { ascending: false }), supabase.from('admin_credit_grants').select('*').eq('user_id', userId).order('created_at', { ascending: false })]);
  for (const r of [credits, bookings, orders]) {
    if (r.error) throw new Error(r.error.message);
  }
  return {
    credits: credits.data || [],
    bookings: bookings.data || [],
    orders: orders.data || [],
    grants: grants.error ? [] : grants.data || [],
    creditAuditAvailable: !grants.error
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
