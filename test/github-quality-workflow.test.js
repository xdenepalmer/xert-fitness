import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowURL = new URL('../.github/workflows/quality.yml', import.meta.url);
const nativeReadmeURL = new URL('../ios/XertFitnessApp/README.md', import.meta.url);

test('GitHub independently verifies web and unsigned native main builds', async () => {
  const [workflow, nativeReadme] = await Promise.all([
    readFile(workflowURL, 'utf8'),
    readFile(nativeReadmeURL, 'utf8'),
  ]);

  assert.match(workflow, /push:\s*\n\s*branches:\s*\n\s*- main/);
  assert.match(workflow, /pull_request:\s*\n\s*branches:\s*\n\s*- main/);
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.match(workflow, /cancel-in-progress: true/);
  for (const command of ['npm ci', 'npm run lint', 'npm run typecheck', 'npm test', 'npm run build']) {
    assert.match(workflow, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(workflow, /runs-on: macos-15/);
  assert.match(workflow, /cp Config\.example\.xcconfig Config\.xcconfig/);
  assert.match(workflow, /bash ci\/configure-universal-links\.sh/);
  assert.match(workflow, /bash ci\/run-swift-tests\.sh/);
  assert.match(workflow, /if: always\(\)[\s\S]*actions\/upload-artifact@v4/);
  assert.doesNotMatch(workflow, /app_store_connect|CERTIFICATE_PRIVATE_KEY|build-ipa|submit_to_testflight/);
  assert.match(nativeReadme, /GitHub Quality workflow/);
  assert.match(nativeReadme, /Codemagic remains the only workflow that signs or publishes/);
});
