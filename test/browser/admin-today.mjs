import assert from 'node:assert/strict';
import { assertReachableControl } from './control-geometry.mjs';

export async function checkAdminToday(page, { origin, failures, capture = async () => {}, baseline = true, partialError = false }) {
  const openToday = async () => {
    await page.goto(origin + '/admin?source=today-proof', { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Foundation Strength', exact: true }).waitFor();
  };
  await openToday();
  await page.getByText('6/8', { exact: true }).waitFor();
  await page.getByText('5 booking requests need a decision', { exact: true }).waitFor();
  await page.getByText('3 members are waiting for class places', { exact: true }).waitFor();
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  for (const label of ['Roster', 'Roll call', 'Add a class', 'Text members', 'Publish a notice', "Set today's workout"]) {
    const action = page.getByRole('button', { name: label, exact: true });
    if (!baseline) await assertReachableControl(action, `${label} on Today at enlarged text`);
  }
  await page.getByRole('button', { name: 'Add a class', exact: true }).scrollIntoViewIfNeeded();
  await capture('today-actions-text-200');
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  for (const [name, pathname] of [
    [/^Confirm booking requests/, '/admin/bookings'], [/^Respond to PT requests/, '/admin/pt-requests'],
    [/^Review class waitlists/, '/admin/calendar'], [/^Review trainer applicants/, '/admin/trainers'],
    [/^Review partner enquiries/, '/admin/partners'], ['Add a class', '/admin/calendar'],
    ['Text members', '/admin/sms'], ['Publish a notice', '/admin/announcements'], ["Set today's workout", '/admin/workouts'],
  ]) {
    await openToday();
    await page.getByRole('button', { name, exact: typeof name === 'string' }).click();
    await page.waitForURL(url => url.pathname === pathname);
    await page.waitForLoadState('networkidle');
  }
  await openToday();
  await page.getByRole('button', { name: 'Roster', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/admin/calendar');
  await page.getByRole('heading', { name: 'Foundation Strength', exact: true }).first().waitFor();
  await capture('today-roster-target');
  await openToday();
  if (partialError) {
    const sources = ['member_interest', 'trainer_interest', 'partner_interest', 'class_bookings', 'session_bookings', 'private_session_requests'];
    for (const source of sources) failures[source] = Number.POSITIVE_INFINITY;
    try {
      await openToday();
      await capture('today-counts-unavailable');
      assert.equal(await page.getByText('Nothing waiting on you. Nice.', { exact: true }).count(), 0, 'Unavailable counts must not say all work is caught up');
      assert.ok(await page.getByRole('alert').count() > 0, 'Returned partial metric errors are visible');
    } finally {
      for (const source of sources) failures[source] = 0;
    }
    await page.getByRole('button', { name: 'Refresh today', exact: true }).click();
    await page.getByText('5 booking requests need a decision', { exact: true }).waitFor();
  }
}
