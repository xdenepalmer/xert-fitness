import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEnvFile, loadOptionalLocalEnv } from '../scripts/run-with-local-env.mjs';

test('portable launch environment parser handles comments, exports, and quotes', () => {
  assert.deepEqual(parseEnvFile(`
# launch operator values
export STRIPE_MODE=live
APP_BASE_URL="https://xert-fitness.vercel.app"
LABEL='XERT launch #1'
PLAIN=value # operator note
`), {
    STRIPE_MODE: 'live',
    APP_BASE_URL: 'https://xert-fitness.vercel.app',
    LABEL: 'XERT launch #1',
    PLAIN: 'value',
  });
});

test('explicit process values override optional local defaults', () => {
  const result = loadOptionalLocalEnv({ cwd: new URL('.', import.meta.url).pathname, environment: { APP_BASE_URL: 'https://explicit.example' } });
  assert.equal(result.APP_BASE_URL, 'https://explicit.example');
});
