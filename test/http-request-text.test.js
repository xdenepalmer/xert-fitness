import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { requestText } from '../api/http.js';

test('requestText returns exact string and Buffer bodies without re-serialising', async () => {
  assert.equal(await requestText({ body: '{"a":1,"b":2}' }), '{"a":1,"b":2}');
  const buffered = Buffer.from('{"exact":true}');
  const fromBuffer = await requestText({ body: buffered });
  assert.ok(Buffer.isBuffer(fromBuffer));
  assert.equal(fromBuffer.toString('utf8'), '{"exact":true}');
});

test('requestText refuses a pre-parsed JSON body instead of JSON.stringify', async () => {
  await assert.rejects(
    () => requestText({ body: { id: 'evt_1', type: 'checkout.session.completed' } }),
    error => error?.message === 'REQUEST_BODY_ALREADY_PARSED',
  );
});

test('requestText reads stream chunks when body is absent', async () => {
  const stream = Readable.from([Buffer.from('{"streamed":'), Buffer.from('true}')]);
  const raw = await requestText(stream);
  assert.ok(Buffer.isBuffer(raw));
  assert.equal(raw.toString('utf8'), '{"streamed":true}');
});

test('stripe webhook does not rely on Next.js bodyParser config', () => {
  const webhook = readFileSync(new URL('../api/stripe-webhook.js', import.meta.url), 'utf8');
  const http = readFileSync(new URL('../api/http.js', import.meta.url), 'utf8');
  assert.doesNotMatch(webhook, /export const config\s*=\s*\{[\s\S]*bodyParser/);
  assert.match(http, /REQUEST_BODY_ALREADY_PARSED/);
  assert.doesNotMatch(http, /JSON\.stringify\(request\.body\)/);
  assert.match(webhook, /REQUEST_BODY_ALREADY_PARSED/);
  assert.match(webhook, /requestText\(request\)/);
  assert.match(
    webhook,
    /REQUEST_BODY_ALREADY_PARSED[\s\S]*recordWebhookSignatureFailure\([\s\S]*REQUEST_BODY_ALREADY_PARSED/,
  );
});
