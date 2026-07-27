import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('native Stripe incident actions preserve verified receipts across health readback failures', async () => {
  const [api, store, view] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
  ]);

  const resolveAPI = api.slice(
    api.indexOf('func adminResolveStripeReview'),
    api.indexOf('func adminRetryStripeEvent'),
  );
  assert.match(resolveAPI, /async throws -> AdminStripeReviewResolutionResponse/);
  assert.match(resolveAPI, /response\.event_id == eventID, response\.status == "ignored"/);
  assert.match(resolveAPI, /return response/);

  const retryAPI = api.slice(
    api.indexOf('func adminRetryStripeEvent'),
    api.indexOf('func adminPushHealth'),
  );
  assert.match(retryAPI, /response\.event_id == eventID/);
  assert.match(retryAPI, /\["processed", "ignored", "failed"\]\.contains\(response\.status\)/);

  const incidentStore = store.slice(
    store.indexOf('func resolveStripeReview'),
    store.indexOf('func updatePTRequest'),
  );
  assert.match(store, /@Published private\(set\) var stripeIncidentStatusMessage/);
  assert.match(store, /@Published private\(set\) var stripeIncidentStatusIsWarning/);
  assert.match(incidentStore, /guard healthSourceIsCurrent\("Stripe health"\)/);
  assert.match(incidentStore, /let receipt: AdminStripeReviewResolutionResponse/);
  assert.match(incidentStore, /let receipt: AdminStripeRetryResponse/);
  assert.match(incidentStore, /markCatalogueSourceUnavailable\("Stripe health"\)/);
  assert.match(incidentStore, /Do not mark it again; refresh this screen/);
  assert.match(incidentStore, /Do not retry it again; refresh this screen/);
  assert.match(incidentStore, /lastUpdatedAt = Date\(\)[\s\S]*return true/);

  const health = view.slice(
    view.indexOf('private struct AdminOperationsHealthView'),
    view.indexOf('private struct HealthStatusRow'),
  );
  assert.match(health, /Section\("Latest Stripe operation"\)/);
  assert.match(health, /\.textSelection\(\.enabled\)/);
  assert.match(health, /admin\.stripeIncidentStatusIsWarning[\s\S]*Color\.orange/);
  assert.match(health, /let succeeded = await admin\.resolveStripeReview/);
  assert.match(health, /let succeeded = await admin\.retryStripeEvent/);
});
