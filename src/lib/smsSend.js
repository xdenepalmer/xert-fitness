import { supabase } from './supabase';

/**
 * Send an SMS campaign as the signed-in admin. Rides the admin communications
 * function (action: 'send_sms') to stay inside Vercel Hobby's function limit.
 */
export async function sendAdminSms({ message, recipients }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sign in again to send SMS.');
  const response = await fetch('/api/admin-publish-announcement', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      action: 'send_sms',
      message: String(message || '').trim(),
      recipients: recipients.map(recipient => ({ name: recipient.name, phone: recipient.phone })),
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'SMS sending failed.');
  return payload;
}
