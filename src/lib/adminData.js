import { supabase } from './supabase';

// ─── Leads ────────────────────────────────────────────────────────────────────

export async function getMemberLeads(filters = {}) {
  let query = supabase.from('member_interest').select('*').order('created_at', { ascending: false });
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.search) query = query.or(`full_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getTrainerLeads(filters = {}) {
  let query = supabase.from('trainer_interest').select('*').order('created_at', { ascending: false });
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.search) query = query.or(`full_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getPartnerLeads(filters = {}) {
  let query = supabase.from('partner_interest').select('*').order('created_at', { ascending: false });
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.search) query = query.or(`full_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function updateLeadStatus(table, id, status) {
  const { error } = await supabase.from(table).update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function updateAdminNotes(table, id, admin_notes) {
  const { error } = await supabase.from(table).update({ admin_notes }).eq('id', id);
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
  const { data, error } = await supabase.from('class_sessions').insert([sessionData]).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateClassSession(id, updates) {
  const { error } = await supabase.from('class_sessions').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function cancelClassSession(id) {
  return updateClassSession(id, { status: 'cancelled' });
}

export async function duplicateClassSession(session) {
  const { id, created_at, updated_at, ...rest } = session;
  return createClassSession({ ...rest, status: 'draft', title: `${rest.title} (copy)` });
}

// ─── Bookings ─────────────────────────────────────────────────────────────────

export async function getClassBookings(filters = {}) {
  let query = supabase.from('class_bookings').select('*, class_sessions(title, start_time)').order('created_at', { ascending: false });
  if (filters.class_session_id) query = query.eq('class_session_id', filters.class_session_id);
  if (filters.status) query = query.eq('status', filters.status);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function updateBookingStatus(id, status) {
  const { error } = await supabase.from('class_bookings').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── PT Requests ──────────────────────────────────────────────────────────────

export async function getPTRequests(filters = {}) {
  let query = supabase.from('private_session_requests').select('*').order('created_at', { ascending: false });
  if (filters.status) query = query.eq('status', filters.status);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function updatePTRequestStatus(id, status, admin_notes) {
  const updates = { status };
  if (admin_notes !== undefined) updates.admin_notes = admin_notes;
  const { error } = await supabase.from('private_session_requests').update(updates).eq('id', id);
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

export async function deleteAvailabilityBlock(id) {
  const { error } = await supabase.from('availability_blocks').delete().eq('id', id);
  if (error) throw new Error(error.message);
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

export async function deleteBlackoutPeriod(id) {
  const { error } = await supabase.from('blackout_periods').delete().eq('id', id);
  if (error) throw new Error(error.message);
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
    announcement_banner_enabled: false,
  };
}

export async function updateSoftLaunchSettings(updates) {
  const current = await getSoftLaunchSettings();
  if (current?.id) {
    const { error } = await supabase.from('admin_settings').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', current.id);
    if (error) throw new Error(error.message);
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

  const [members, trainers, partners, newMembers, bookings, ptRequests] = await Promise.all([
    supabase.from('member_interest').select('id, status, preferred_training_times, main_training_goals, interested_in_pt, interested_in_event_prep', { count: 'exact' }),
    supabase.from('trainer_interest').select('id', { count: 'exact' }),
    supabase.from('partner_interest').select('id', { count: 'exact' }),
    supabase.from('member_interest').select('id', { count: 'exact' }).gte('created_at', weekAgoIso),
    supabase.from('class_bookings').select('id, status', { count: 'exact' }),
    supabase.from('private_session_requests').select('id, status', { count: 'exact' }),
  ]);

  const memberData = members.data || [];
  const bookingData = bookings.data || [];

  // Most requested class times
  const timeCounts = {};
  memberData.forEach(m => {
    (m.preferred_training_times || []).forEach(t => {
      timeCounts[t] = (timeCounts[t] || 0) + 1;
    });
  });
  const topTimes = Object.entries(timeCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, c]) => ({ time: t, count: c }));

  // Most common goals
  const goalCounts = {};
  memberData.forEach(m => {
    (m.main_training_goals || []).forEach(g => {
      goalCounts[g] = (goalCounts[g] || 0) + 1;
    });
  });
  const topGoals = Object.entries(goalCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g, c]) => ({ goal: g, count: c }));

  return {
    totalMembers: members.count || 0,
    newThisWeek: newMembers.count || 0,
    trainerApplicants: trainers.count || 0,
    partnerEnquiries: partners.count || 0,
    ptInterest: memberData.filter(m => m.interested_in_pt).length,
    eventPrepInterest: memberData.filter(m => m.interested_in_event_prep).length,
    topTimes,
    topGoals,
    pendingBookings: bookingData.filter(b => b.status === 'requested').length,
    waitlistedBookings: bookingData.filter(b => b.status === 'waitlisted').length,
    ptRequests: ptRequests.count || 0,
  };
}

export async function exportLeadsCsv(table) {
  const { data, error } = await supabase.from(table).select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return null;

  const headers = Object.keys(data[0]);
  const rows = data.map(row => headers.map(h => {
    const val = row[h];
    if (Array.isArray(val)) return `"${val.join(', ')}"`;
    if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
    return val ?? '';
  }).join(','));

  return [headers.join(','), ...rows].join('\n');
}