import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowURL = new URL('../codemagic.yaml', import.meta.url);
const nativeReadmeURL = new URL('../ios/XertFitnessApp/README.md', import.meta.url);

test('Codemagic verifies the commit pushed to main rather than a PR target', async () => {
  const [workflow, nativeReadme] = await Promise.all([
    readFile(workflowURL, 'utf8'),
    readFile(nativeReadmeURL, 'utf8'),
  ]);
  const verifyStart = workflow.indexOf('  ios-verify:');
  const releaseStart = workflow.indexOf('  ios-testflight:');
  const verify = workflow.slice(verifyStart, releaseStart);

  assert.ok(verifyStart >= 0 && releaseStart > verifyStart);
  assert.match(verify, /triggering:[\s\S]*events:\s*\n\s*- push/);
  assert.doesNotMatch(verify, /- pull_request/);
  assert.match(verify, /pattern: main\s*\n\s*include: true[\s\S]*source: true/);
  assert.doesNotMatch(verify, /source: false/);
  assert.match(nativeReadme, /ios-verify` runs on every push to `main`/);
  assert.match(nativeReadme, /App settings > Webhooks/);
  assert.match(nativeReadme, /Update webhook/);
});
