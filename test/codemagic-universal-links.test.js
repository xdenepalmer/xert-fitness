import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowURL = new URL('../codemagic.yaml', import.meta.url);
const scriptURL = new URL('../ios/XertFitnessApp/ci/configure-universal-links.sh', import.meta.url);
const entitlementsURL = new URL('../ios/XertFitnessApp/XertFitnessApp/XertFitnessApp.entitlements', import.meta.url);
const readmeURL = new URL('../ios/XertFitnessApp/README.md', import.meta.url);

test('Codemagic gates Universal Links until Apple capability and profile activation', async () => {
  const [workflow, script, entitlements, readme] = await Promise.all([
    readFile(workflowURL, 'utf8'),
    readFile(scriptURL, 'utf8'),
    readFile(entitlementsURL, 'utf8'),
    readFile(readmeURL, 'utf8'),
  ]);
  assert.equal((workflow.match(/bash ci\/configure-universal-links\.sh/g) || []).length, 2);
  assert.match(script, /ENABLE_UNIVERSAL_LINKS:-false/);
  assert.match(script, /AASA does not associate \$\{expectedAppID\} with \/open\/\*/);
  assert.match(script, /Delete \$PLIST_KEY/);
  assert.match(script, /Add \$PLIST_KEY:0 string applinks:\$DOMAIN/);
  assert.doesNotMatch(entitlements, /com\.apple\.developer\.associated-domains/);
  assert.match(workflow, /Universal Links were enabled but the signed IPA is missing/);
  assert.match(workflow, /Signed IPA contains Associated Domains while ENABLE_UNIVERSAL_LINKS is not true/);
  assert.match(readme, /ENABLE_UNIVERSAL_LINKS=true/);
  assert.match(readme, /regenerate the App Store provisioning profile/);
});

test('Codemagic recognizes the generic unavailable webhook response', async () => {
  const workflow = await readFile(workflowURL, 'utf8');
  assert.match(workflow, /case "\$WEBHOOK_CODE" in[\s\S]*503\) echo "Add STRIPE_WEBHOOK_SECRET/);
  assert.doesNotMatch(workflow, /case "\$WEBHOOK_CODE" in[\s\S]{0,120}500\) echo "Add STRIPE_WEBHOOK_SECRET/);
});
