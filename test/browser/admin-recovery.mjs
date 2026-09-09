import assert from 'node:assert/strict';

export async function checkAdminRecovery(context, { origin, capture = async () => {} }) {
  const page = await context.newPage();
  const errors = [];
  let attempts = 0;
  page.on('pageerror', error => errors.push(error.message));
  // A one-off failed lazy chunk download must leave the shell available and
  // offer an explicit reload. Browser module caches can outlive React's lazy
  // payload, so retrying the same import in this document is not recovery.
  await page.route('**/src/components/admin/WorkoutManager.jsx*', route => {
    attempts += 1;
    return attempts === 1 ? route.abort('failed') : route.continue();
  });
  try {
    const target = origin + '/admin/workouts?source=design-recovery';
    await page.goto(target, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Reload workspace', exact: true }).waitFor();
    await capture(page, 'failed-workspace');
    assert.equal(await page.locator('[data-admin-shell]').count(), 1, 'A failed chunk does not remove the owner shell');
    assert.equal(page.url(), target, 'A failed chunk does not discard the current URL filters');
    await page.getByRole('button', { name: 'Reload workspace', exact: true }).click();
    await page.getByRole('button', { name: 'Reload workspace', exact: true }).waitFor({ state: 'hidden' });
    await page.getByRole('heading', { name: 'Workout Of The Day', exact: true }).waitFor();
    assert.ok(attempts >= 2, 'Retry makes a fresh request for the failed workspace');
    assert.equal(page.url(), target, 'Recovered workspace retains URL parameters');
    assert.ok(errors.every(error => /Failed to fetch dynamically imported module|Importing a module script failed/.test(error)), `Only the deliberately failed chunk may report a runtime error: ${errors}`);
    await capture(page, 'recovered-workspace');
    errors.length = 0;
    const fixtureTarget = origin + '/test/fixtures/admin-recovery.html?filter=retained';
    await page.goto(fixtureTarget, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Retry workspace', exact: true }).waitFor();
    await page.getByLabel('Unsaved surrounding draft').fill('Keep this local draft');
    await page.getByRole('button', { name: 'Make test region available', exact: true }).click();
    await page.getByRole('button', { name: 'Retry workspace', exact: true }).click();
    await page.getByRole('heading', { name: 'Recovered local region', exact: true }).waitFor();
    assert.equal(await page.getByLabel('Unsaved surrounding draft').inputValue(), 'Keep this local draft', 'Render recovery does not remount the surrounding editor');
    assert.equal(page.url(), fixtureTarget);
    assert.ok(errors.every(error => error === 'Intentional local recovery fixture failure'), `Only deliberate fixture render errors are expected: ${errors}`);
  } catch (error) {
    await capture(page, 'workspace-recovery-failure');
    throw error;
  } finally {
    await page.close();
  }
}
