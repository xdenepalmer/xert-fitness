import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [store, view] = await Promise.all([
  readFile(
    new URL('../ios/XertFitnessApp/XertFitnessApp/Store/AdminStore.swift', import.meta.url),
    'utf8',
  ),
  readFile(
    new URL('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift', import.meta.url),
    'utf8',
  ),
]);

const resolver = store.slice(
  store.indexOf('func resolveOwnerTask('),
  store.indexOf('func loadMemberDetail('),
);
const taskSheet = view.slice(
  view.indexOf('private struct AdminOwnerTaskSheet'),
  view.indexOf('private enum AdminAccessDirectoryMode'),
);

test('native protected owner records use latest-request-wins resolution', () => {
  assert.doesNotMatch(resolver, /guard resolvingOwnerTask == nil else \{ return \}/);
  assert.match(store, /private var ownerTaskResolutionGeneration: UInt = 0/);
  assert.match(resolver, /ownerTaskResolutionGeneration &\+= 1/);
  assert.match(resolver, /let generation = ownerTaskResolutionGeneration/);
  assert.match(resolver, /let requiresResolution: Bool/);
  assert.match(
    resolver,
    /ownerTaskResolutionGeneration == generation,[\s\S]*resolvingOwnerTask == task/,
  );
  assert.ok(
    resolver.match(/ownerTaskResolutionGeneration == generation/g)?.length >= 8,
    'every exact task response and error must be generation guarded',
  );
});

test('native protected owner resolution failures remain task-scoped and privacy bounded', () => {
  assert.match(
    store,
    /@Published private\(set\) var ownerTaskResolutionErrorTask: XertOwnerTask\?/,
  );
  assert.match(
    store,
    /@Published private\(set\) var ownerTaskResolutionErrorMessage: String\?/,
  );
  assert.match(resolver, /ownerTaskResolutionErrorTask = nil/);
  assert.match(resolver, /ownerTaskResolutionErrorMessage = nil/);
  assert.match(resolver, /ownerTaskResolutionErrorTask = task/);
  assert.match(
    resolver,
    /XERT could not securely load this protected record\. Check your connection and try again\./,
  );
  assert.doesNotMatch(resolver, /ownerTaskResolutionErrorMessage = error\.localizedDescription/);
  assert.match(
    store,
    /func resetOwnerTaskResolution\(\) \{[\s\S]*ownerTaskResolutionGeneration &\+= 1[\s\S]*resolvingOwnerTask = nil[\s\S]*ownerTaskResolutionErrorTask = nil/,
  );
});

test('native owner task recovery retries the exact record and cannot spin forever', () => {
  assert.match(view, /AdminOwnerTaskSheet\(admin: admin, session: session, task: task\)[\s\S]*\.id\(task\)/);
  assert.match(
    taskSheet,
    /admin\.resolvingOwnerTask == task[\s\S]*admin\.isLoading && admin\.lastUpdatedAt == nil/,
  );
  assert.doesNotMatch(
    taskSheet,
    /admin\.isLoading \|\| admin\.resolvingOwnerTask == task \|\| admin\.lastUpdatedAt == nil/,
  );
  assert.match(taskSheet, /admin\.ownerTaskResolutionErrorTask == task/);
  assert.match(
    taskSheet,
    /await admin\.resolveOwnerTask\(session: session, task: task\)/,
  );
  assert.match(taskSheet, /Retry protected record/);
  assert.match(taskSheet, /Check protected record again/);
  assert.doesNotMatch(taskSheet, /Task \{ await admin\.refresh\(session: session\) \}/);
  assert.match(taskSheet, /\.frame\(minHeight: 44\)/);
  assert.match(
    view,
    /\.onChange\(of: store\.authSession\?\.user\?\.id\)[\s\S]*admin\.resetOwnerTaskResolution\(\)/,
  );
  assert.match(
    view,
    /private func closePresentedOwnerTask\(\) \{[\s\S]*admin\.resetOwnerTaskResolution\(\)/,
  );
});
