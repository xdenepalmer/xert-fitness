import test from 'node:test';
import assert from 'node:assert/strict';
import { apiErrorMessage } from '../src/lib/apiError.js';
import { createRequestTrace } from '../src/lib/serverHttp.js';

const REQUEST_ID = '01234567-89ab-4def-8123-456789abcdef';

function responseRecorder() {
  return {
    headers: {},
    statusCode: 200,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(statusCode) { this.statusCode = statusCode; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
  };
}

test('request trace emits a stable response header and adds its ID only to failed JSON', () => {
  const response = responseRecorder();
  const trace = createRequestTrace(response, () => REQUEST_ID);

  trace.json({ ready: true });
  assert.equal(response.headers['x-request-id'], REQUEST_ID);
  assert.deepEqual(response.body, { ready: true });

  trace.json({ error: 'Payment operation failed.' }, 503);
  assert.deepEqual(response.body, { error: 'Payment operation failed.', request_id: REQUEST_ID });
});

test('request trace supports Web Response handlers without a Vercel response object', () => {
  const result = createRequestTrace(undefined, () => REQUEST_ID).text('Unavailable', 503);
  assert.equal(result.status, 503);
  assert.equal(result.headers.get('x-request-id'), REQUEST_ID);
});

test('API errors expose a short validated support reference without trusting arbitrary input', () => {
  assert.equal(
    apiErrorMessage({ error: 'Payment failed.', request_id: REQUEST_ID }, 'Fallback'),
    'Payment failed. Reference: 01234567.'
  );
  assert.equal(apiErrorMessage({ request_id: 'not-a-request-id\nforged-log' }, 'Fallback'), 'Fallback');
});
