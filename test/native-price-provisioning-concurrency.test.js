import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('native pricing serializes Stripe provisioning with catalogue edits and dismissal', async () => {
  const [store, view] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
  ]);

  const saveProduct = store.slice(
    store.indexOf('func saveProduct('),
    store.indexOf('func provisionProductPrice('),
  );
  assert.match(saveProduct, /guard savingProductID == nil, provisioningProductPriceID == nil/);

  const editor = view.slice(
    view.indexOf('private struct AdminProductEditor: View'),
    view.indexOf('private struct AdminEventsView: View'),
  );
  assert.match(editor, /isProductMutationInFlight: Bool \{ isSaving \|\| isProvisioningPrice \}/);
  assert.match(editor, /private var canSave:[\s\S]*!isProductMutationInFlight/);
  assert.match(editor, /interactiveDismissDisabled\(isDirty \|\| isProductMutationInFlight\)/);
  assert.match(editor, /Button\("Close"\)[\s\S]*disabled\(isProductMutationInFlight\)/);
  assert.ok((editor.match(/disabled\(!pricingMutationAvailable \|\| isProductMutationInFlight\)/g) || []).length >= 3);
});
