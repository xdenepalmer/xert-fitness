import assert from 'node:assert/strict';

export async function checkAdminRecovery(context, { origin, capture = async () => {} }) {
  const page = await context.newPage();
  const errors = [];
  let attempts = 0;
  page.on('pageerror', error => errors.push(error.message));
  // A one-off failed lazy chunk download must leave the shell available and
  // offer a useful retry, not repeatedly mount React's same rejected promise.
  await page.route('**/src/components/admin/WorkoutManager.jsx*', route => {
    attempts += 1;
    return attempts === 1 ? route.abort('failed') : route.continue();
  });
  try {
    const target = origin + '/admin/workouts?source=design-recovery';
    await page.goto(target, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Retry workspace', exact: true }).waitFor();
    await capture(page, 'failed-workspace');
    assert.equal(await page.locator('[data-admin-shell]').count(), 1, 'A failed chunk does not remove the owner shell');
    assert.equal(page.url(), target, 'A failed chunk does not discard the current URL filters');
    await page.getByRole('button', { name: 'Retry workspace', exact: true }).click();
    await page.getByRole('button', { name: 'Retry workspace', exact: true }).waitFor({ state: 'hidden' });
    await page.getByRole('heading', { name: /workout/i }).first().waitFor();
    assert.ok(attempts >= 2, 'Retry makes a fresh request for the failed workspace');
    assert.equal(page.url(), target, 'Recovered workspace retains URL parameters');
    assert.ok(errors.every(error => /Failed to fetch dynamically imported module|Importing a module script failed/.test(error)), `Only the deliberately failed chunk may report a runtime error: ${errors}`);
    await capture(page, 'recovered-workspace');
  } catch (error) {
    await capture(page, 'workspace-recovery-failure');
    throw error;
  } finally {
    await page.close();
  }
}
