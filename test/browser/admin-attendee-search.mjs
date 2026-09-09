import assert from 'node:assert/strict';
import { calendarFixtureIds as ids } from '../fixtures/admin-calendar-data.mjs';
import { assertReachableControl } from './control-geometry.mjs';

export async function checkAttendeeSearch(page, { origin, failures, capture = async () => {} }) {
  await page.goto(origin + '/admin/calendar?source=search-proof&calendarSearch=non-matching-filter#keep', { waitUntil: 'networkidle' });
  const search = page.getByRole('searchbox', { name: 'Search everyone registered for a class', exact: true });
  await search.fill('Morgan');
  await page.getByText('Morgan Ellis', { exact: true }).waitFor();
  const result = page.getByRole('button').filter({ hasText: 'Morning Strength' });
  await result.click();
  const roster = page.locator(`#class-session-${ids.pastClass}`);
  await roster.getByText('Morgan Ellis', { exact: true }).waitFor();
  assert.ok((await roster.textContent()).includes('outside current filters'));
  assert.equal(new URL(page.url()).searchParams.get('calendarSearch'), 'non-matching-filter');
  assert.equal(new URL(page.url()).hash, '#keep');
  await roster.getByRole('button', { name: 'Bookings', exact: true }).click();
  await roster.waitFor({ state: 'hidden' });

  failures.admin_search_class_attendees = Number.POSITIVE_INFINITY;
  await search.fill('Taylor');
  await page.waitForResponse(response => response.url().includes('/rpc/admin_search_class_attendees') && response.status() === 503);
  // Flush the component's response handlers without a fixed timing assumption.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await capture('attendee-search-error');
  assert.equal(await page.getByText(/Nobody matching/).count(), 0, 'A failed attendee lookup is not reported as an empty result');
  await page.getByRole('alert').filter({ hasText: 'Fixture class service temporarily unavailable.' }).waitFor();
  assert.equal(await page.getByText('Morgan Ellis', { exact: true }).count(), 0, 'Previous-query matches are hidden after changing the query');
  failures.admin_search_class_attendees = 0;
  const period = page.getByRole('radiogroup', { name: 'Class period', exact: true });
  await period.getByRole('radio', { name: /^Past \(/ }).click();
  await search.fill('Sky');
  await page.getByText('Sky Parker', { exact: true }).waitFor();
  await page.getByRole('alert').filter({ hasText: 'Fixture class service temporarily unavailable.' }).waitFor({ state: 'hidden' });
  assert.equal(await page.getByText('Could not search the timetable', { exact: true }).count(), 0, 'Successful recovery does not leave a contradictory failure toast');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await assertReachableControl(page.getByRole('button').filter({ hasText: 'Foundation Strength' }), 'Recovered attendee class action');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'Search results stay readable at enlarged text');
  await capture('attendee-search-recovered-text-200');
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  await page.getByRole('button').filter({ hasText: 'Foundation Strength' }).click();
  const futureRoster = page.locator(`#class-session-${ids.futureClass}`);
  await futureRoster.getByText('Sky Parker', { exact: true }).waitFor();
  assert.equal(await period.getByRole('radio', { name: /^Past \(/ }).getAttribute('aria-checked'), 'true', 'Opening an upcoming attendee result preserves the selected Past period');
  assert.ok((await futureRoster.textContent()).includes('outside current filters'), 'Selected-session exception reveals the result without changing filters');
  assert.equal(new URL(page.url()).searchParams.get('calendarSearch'), 'non-matching-filter');
  assert.equal(new URL(page.url()).hash, '#keep');
  await capture('attendee-search-period-preserved');
}
