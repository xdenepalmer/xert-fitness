import { supabase } from '@/lib/supabase';

export async function deleteMyAccount(accessToken) {
  if (!accessToken) throw new Error('Please sign in again before deleting your account.');

  const response = await fetch('/api/delete-account', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ confirmation: 'DELETE' })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Could not delete your account.');

  await supabase.auth.signOut({ scope: 'local' });
}
