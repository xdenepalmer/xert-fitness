export function assertSupabaseResponses(responses) {
  const failure = responses.find(response => response?.error)?.error;
  if (failure) throw new Error(failure.message || 'Supabase query failed.');
  return responses;
}
