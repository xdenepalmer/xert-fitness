import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('native Command Centre retries only cold-start member and health reads once', async () => {
  const store = await read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift');
  const refresh = store.slice(
    store.indexOf('func refresh(session: AuthSession)'),
    store.indexOf('/// Refreshes the bounded release-health'),
  );

  for (const [source, loader] of [
    ['members', 'adminMembers'],
    ['Stripe health', 'adminCommerceHealth'],
    ['push health', 'adminPushHealth'],
  ]) {
    assert.match(refresh, new RegExp(`!loadedSources\\.contains\\("${source}"\\), !Task\\.isCancelled`));
    assert.equal(
      (refresh.match(new RegExp(`api\\.${loader}\\(session: session\\)`, 'g')) || []).length,
      2,
      `${loader} should have one initial attempt and one bounded cold-start retry`,
    );
  }

  for (const unrelatedLoader of ['adminOrders', 'adminProducts', 'adminClassSessions']) {
    assert.equal(
      (refresh.match(new RegExp(`api\\.${unrelatedLoader}\\(session: session\\)`, 'g')) || []).length,
      1,
      `${unrelatedLoader} should not gain a startup retry`,
    );
  }
});

test('partial startup failures remain inline and never populate the global alert', async () => {
  const [store, view] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift'),
  ]);
  const refresh = store.slice(
    store.indexOf('func refresh(session: AuthSession)'),
    store.indexOf('/// Refreshes the bounded release-health'),
  );
  const dashboard = view.slice(
    view.indexOf('private func dashboard(session: AuthSession)'),
    view.indexOf('private var accessDenied'),
  );

  assert.doesNotMatch(refresh, /errorMessage\s*=/);
  assert.match(refresh, /refreshUnavailableSources = failures/);
  assert.match(dashboard, /AdminRefreshDataWarning/);
  assert.match(dashboard, /unavailableSources: admin\.refreshUnavailableSources/);
  assert.match(dashboard, /cachedSources: admin\.loadedSources/);
});
