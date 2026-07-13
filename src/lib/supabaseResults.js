export function assertSupabaseResponses(responses) {
  const failure = responses.find(response => response?.error)?.error;
  if (failure) throw new Error(failure.message || 'Supabase query failed.');
  return responses;
}

export function assertAdminMutation(response, label, expectedRows = 1) {
  if (response?.error) throw new Error(response.error.message || `${label} failed.`);
  if (!Number.isSafeInteger(expectedRows) || expectedRows < 1) {
    throw new Error('Expected mutation row count must be a positive integer.');
  }
  const rows = Array.isArray(response?.data)
    ? response.data
    : response?.data
      ? [response.data]
      : [];
  if (rows.length !== expectedRows) {
    throw new Error(
      `${label} changed ${rows.length} of ${expectedRows} expected records. Refresh the admin view and try again.`
    );
  }
  return rows;
}
