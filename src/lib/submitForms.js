import { supabase } from './supabase';
import { captureLeadSource } from './captureLeadSource';

function isHoneypotFilled(data) {
  return !!(data.company_website || data.website_url);
}

function stripHoneypot(data) {
  const clean = { ...data };
  delete clean.company_website;
  delete clean.website_url;
  return clean;
}

export async function submitMemberInterest(formData) {
  if (isHoneypotFilled(formData)) {
    // Silently succeed — bot submission
    return { success: true };
  }
  const payload = {
    ...stripHoneypot(formData),
    ...captureLeadSource(),
    status: 'new',
  };
  const { error } = await supabase.from('member_interest').insert([payload]);
  if (error) throw new Error(error.message);
  return { success: true };
}

export async function submitTrainerInterest(formData) {
  if (isHoneypotFilled(formData)) return { success: true };
  const payload = {
    ...stripHoneypot(formData),
    ...captureLeadSource(),
    status: 'new',
  };
  const { error } = await supabase.from('trainer_interest').insert([payload]);
  if (error) throw new Error(error.message);
  return { success: true };
}

export async function submitPartnerInterest(formData) {
  if (isHoneypotFilled(formData)) return { success: true };
  const payload = {
    ...stripHoneypot(formData),
    ...captureLeadSource(),
    status: 'new',
  };
  const { error } = await supabase.from('partner_interest').insert([payload]);
  if (error) throw new Error(error.message);
  return { success: true };
}

/**
 * Submits a public sign-up for one class. The class's own booking_mode decides
 * whether this holds a real spot (instant_book) or only records interest, and
 * the database serialises spot-taking so the class cannot be oversold.
 */
export async function submitClassSignup(formData) {
  if (isHoneypotFilled(formData)) {
    return { success: true, status: 'requested', took_spot: false, spots_left: null };
  }
  const { data, error } = await supabase.rpc('submit_class_signup', {
    p_session_id: formData.class_session_id,
    p_full_name: formData.full_name,
    p_email: formData.email,
    p_phone: formData.phone,
    p_consent: formData.consent_to_contact === true,
    p_training_level: formData.training_level || null,
    p_notes: formData.notes || null,
    p_join_waitlist: formData.join_waitlist === true,
  });
  if (error) throw new Error(error.message);
  return { success: true, ...(data || {}) };
}

/**
 * Releases a spot taken through the public timetable, using the one-time token
 * the sign-up returned. Anonymous visitors have no account, so this token is
 * the only handle they have on their own place — without it a class reads full
 * while the room is not.
 */
export async function cancelClassSignup(token) {
  const trimmed = String(token || '').trim();
  if (!trimmed) throw new Error('SIGNUP_NOT_FOUND');
  const { data, error } = await supabase.rpc('cancel_class_signup', { p_token: trimmed });
  if (error) throw new Error(error.message);
  return { success: true, ...(data || {}) };
}

/** Live remaining places per class, keyed by class session id. */
export async function getPublicClassAvailability() {
  const { data, error } = await supabase.rpc('public_class_availability');
  if (error) throw new Error(error.message);
  const byId = {};
  for (const row of data || []) {
    if (row?.class_session_id) byId[row.class_session_id] = row;
  }
  return byId;
}

export async function requestPrivateSession(formData) {
  if (isHoneypotFilled(formData)) return { success: true };
  const payload = {
    ...stripHoneypot(formData),
    status: 'requested',
  };
  const { error } = await supabase.from('private_session_requests').insert([payload]);
  if (error) throw new Error(error.message);
  return { success: true };
}