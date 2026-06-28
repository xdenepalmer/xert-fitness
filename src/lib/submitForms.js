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

export async function requestClassBooking(formData) {
  if (isHoneypotFilled(formData)) return { success: true };
  const payload = {
    ...stripHoneypot(formData),
    status: 'requested',
  };
  const { error } = await supabase.from('class_bookings').insert([payload]);
  if (error) throw new Error(error.message);
  return { success: true };
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