const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function apiErrorMessage(body, fallback) {
  const message = typeof body?.error === 'string' && body.error.trim()
    ? body.error.trim()
    : fallback;
  const requestId = typeof body?.request_id === 'string' && REQUEST_ID_PATTERN.test(body.request_id)
    ? body.request_id.slice(0, 8).toLowerCase()
    : null;
  return requestId ? `${message} Reference: ${requestId}.` : message;
}
