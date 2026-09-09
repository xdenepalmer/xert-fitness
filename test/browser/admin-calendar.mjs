import assert from 'node:assert/strict';
import { calendarFixtureIds as ids } from '../fixtures/admin-calendar-data.mjs';
import { assertReachableControl } from './control-geometry.mjs';

export async function checkAdminCalendar(page, { origin, failures, capture = async () => {}, baseline = false }) {
  if (!baseline) {
    await page.goto(origin + '/admin/calendar', { waitUntil: 'networkidle' });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    const grid = page.getByRole('grid', { name: /^Class calendar for/ });
    await grid.waitFor();
    await grid.scrollIntoViewIfNeeded();
    const targets = await grid.getByRole('button').evaluateAll(buttons => buttons.map(button => {
      const box = button.getBoundingClientRect();
      return { label: button.getAttribute('aria-label'), width: box.width, height: box.height };
    }));
    await capture('calendar-day-targets-text-200');
    assert.deepEqual(targets.filter(target => target.width < 44 || target.height < 44).slice(0, 5), [], 'Calendar day targets retain 44px in both dimensions at enlarged text');
    const days = grid.getByRole('button');
    const dayIndex = await days.nth(6).getAttribute('aria-pressed') === 'true' ? 13 : 6;
    await days.first().focus();
    for (let step = 0; step < dayIndex; step++) await page.keyboard.press('Tab');
    assert.equal(await days.nth(dayIndex).evaluate(element => element === document.activeElement), true, 'Keyboard users can reach the last weekday column');
    await days.nth(dayIndex).press('Enter');
    assert.equal(await days.nth(dayIndex).getAttribute('aria-pressed'), 'true', 'Keyboard activation selects the actual calendar day');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'Large calendar targets do not overflow the page');
    await capture('calendar-day-keyboard-text-200');
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  }
  const rosterUrl = origin + `/admin/calendar?source=calendar-proof&action=roster&session=${ids.futureClass}`;
  await page.goto(rosterUrl, { waitUntil: 'networkidle' });
  const future = page.locator(`#class-session-${ids.futureClass}`);
  await future.getByText('Drew Rowan', { exact: true }).waitFor();
  await future.getByText('Casey Reed', { exact: true }).waitFor();
  await future.getByText('Sky Parker', { exact: true }).waitFor();
  const intentPreservedSource = new URL(page.url()).searchParams.get('source') === 'calendar-proof';
  await future.scrollIntoViewIfNeeded();
  await capture('calendar-live-roster');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await capture('calendar-live-roster-text-200');
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });

  await page.getByRole('button', { name: 'Promote next', exact: true }).click();
  const promotion = page.getByRole('alertdialog', { name: 'Confirm and notify this member?', exact: true });
  await promotion.waitFor();
  assert.ok((await promotion.textContent()).includes('Drew Rowan'), 'FIFO review names the actual next candidate');
  assert.ok((await promotion.textContent()).includes('FIFO protected'), 'Queue review explains the freshness guard');
  await capture('calendar-waitlist-review');
  await promotion.getByRole('button', { name: 'Keep unchanged', exact: true }).click();
  await promotion.waitFor({ state: 'hidden' });

  await future.getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit Class', exact: true });
  await editor.waitFor();
  const title = editor.getByRole('textbox', { name: /^Title/ });
  await title.fill('Keep this fictional class draft');
  const discard = page.getByRole('alertdialog', { name: 'Discard unsaved class changes?', exact: true });
  if (!baseline) {
    for (let step = 0; step < 14; step++) {
      await page.keyboard.press('Tab');
      assert.equal(await editor.evaluate(element => element.contains(document.activeElement)), true, 'Editor keyboard focus remains within the modal');
    }
    await page.keyboard.press('Escape');
    await discard.waitFor();
    for (let step = 0; step < 8; step++) {
      await page.keyboard.press('Tab');
      assert.equal(await discard.evaluate(element => element.contains(document.activeElement)), true, 'Nested discard confirmation owns keyboard focus');
    }
    await page.keyboard.press('Escape');
    await discard.waitFor({ state: 'hidden' });
    assert.equal(await editor.evaluate(element => element.contains(document.activeElement)), true, 'Cancelling the nested confirmation returns focus to the editor');
  }
  await editor.getByRole('button', { name: /^Close (class editor|drawer)$/ }).click();
  await discard.waitFor();
  await discard.getByRole('button', { name: 'Keep editing', exact: true }).click();
  assert.equal(await title.inputValue(), 'Keep this fictional class draft', 'Cancelling discard preserves the real class draft');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await capture('calendar-editor-text-200');
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  await editor.getByRole('button', { name: /^Close (class editor|drawer)$/ }).click();
  await discard.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await editor.waitFor({ state: 'hidden' });

  await page.goto(origin + `/admin/calendar?action=attendance&session=${ids.pastClass}`, { waitUntil: 'networkidle' });
  const attendance = page.getByRole('dialog', { name: 'Morning Strength', exact: true });
  await attendance.waitFor();
  const save = attendance.getByRole('button', { name: 'Save attendance', exact: true });
  assert.equal(await save.isDisabled(), true, 'Incomplete attendance cannot be saved');
  await attendance.getByRole('group', { name: 'Attendance for Morgan Ellis', exact: true }).getByRole('button', { name: 'Present', exact: true }).click();
  assert.equal(await save.isDisabled(), true, 'Marking the member alone does not omit the public sign-up');
  await attendance.getByRole('group', { name: 'Attendance for Taylor Lane', exact: true }).getByRole('button', { name: 'No show', exact: true }).click();
  assert.equal(await save.isEnabled(), true, 'A complete roll can be reviewed despite an unrelated public enquiry');
  assert.equal(await attendance.getByRole('group', { name: 'Attendance for Pat River', exact: true }).count(), 0, 'Public enquiries are not misrepresented as booked attendees');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  if (!baseline) {
    await assertReachableControl(attendance.getByRole('group', { name: 'Attendance for Morgan Ellis', exact: true }).getByRole('button', { name: 'Present', exact: true }), 'Member attendance control');
    await capture('calendar-member-attendance-text-200');
    await assertReachableControl(attendance.getByRole('group', { name: 'Attendance for Taylor Lane', exact: true }).getByRole('button', { name: 'No show', exact: true }), 'Public signup attendance control');
    await capture('calendar-public-attendance-text-200');
    await assertReachableControl(save, 'Save attendance');
  }
  await capture('calendar-complete-attendance-text-200');
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  // Deliberately cancel: this read-only fixture does not authorize attendance writes.
  await attendance.getByRole('button', { name: 'Cancel', exact: true }).click();

  await page.goto(origin + `/admin/calendar?action=attendance&session=${ids.blockedClass}`, { waitUntil: 'networkidle' });
  const blocked = page.getByRole('dialog', { name: 'Review Pending Requests', exact: true });
  await blocked.waitFor();
  await blocked.getByRole('button', { name: 'Mark all present', exact: true }).click();
  assert.equal(await blocked.getByRole('button', { name: 'Save attendance', exact: true }).isDisabled(), true, 'Pending member requests still block completing the class');
  assert.ok((await blocked.getByRole('alert').textContent()).includes('Resolve 1 booking request'), 'The reserved-credit blocker is explained');
  await capture('calendar-pending-member-blocker');
  await blocked.getByRole('button', { name: 'Cancel', exact: true }).click();

  // Hold the failure through any SDK read retries; restore only when the
  // visible panel offers its own Retry action.
  failures.admin_waitlist_overview = Number.POSITIVE_INFINITY;
  await page.goto(origin + '/admin/calendar?source=calendar-proof', { waitUntil: 'networkidle' });
  const waitlistDesk = page.getByRole('region', { name: /^Waitlist desk/ });
  await waitlistDesk.getByRole('alert').waitFor();
  await capture('calendar-waitlist-error');
  failures.admin_waitlist_overview = 0;
  await waitlistDesk.getByRole('button', { name: 'Retry', exact: true }).click();
  await waitlistDesk.getByText(/Next: Drew Rowan/).waitFor();
  if (!baseline) {
    await page.getByRole('button', { name: /^(\+ )?New Class$/i }).click();
    const newEditor = page.getByRole('dialog', { name: 'New Class', exact: true });
    await newEditor.waitFor();
    assert.equal(await newEditor.getByRole('textbox', { name: /^Title/ }).inputValue(), '', 'New class starts as an empty draft without a null-session crash');
    await newEditor.getByRole('button', { name: /^Close (class editor|drawer)$/ }).click();
    assert.equal(intentPreservedSource, true, 'Handling a roster deep link preserves unrelated URL parameters');

    await page.getByRole('radiogroup', { name: 'Calendar view', exact: true }).getByRole('radio', { name: 'List', exact: true }).click();
    await page.getByRole('radiogroup', { name: 'Class period', exact: true }).getByRole('radio', { name: 'All', exact: true }).click();
    await page.locator(`#class-session-${ids.pastClass}`).waitFor();
    const search = page.getByRole('searchbox', { name: 'Search classes', exact: true });
    await search.fill('Morning');
    await page.waitForURL(url => url.searchParams.get('calendarSearch') === 'Morning');
    assert.equal(await page.locator(`#class-session-${ids.futureClass}`).count(), 0, 'Search filters actual list records');
    await page.locator(`#class-session-${ids.pastClass}`).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('source'), 'calendar-proof');
    await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
    await page.locator(`#class-session-${ids.futureClass}`).waitFor();
    await page.getByRole('combobox', { name: 'Class type', exact: true }).selectOption('XERT Strength');
    await page.waitForURL(url => url.searchParams.get('calendarType') === 'XERT Strength');
    await page.locator(`#class-session-${ids.futureClass}`).waitFor();
    await page.getByRole('button', { name: 'Reset filters', exact: true }).click();

    const workspace = page.locator('.calendar-workspace');
    await workspace.evaluate(element => { element.style.maxWidth = '384px'; });
    await page.locator('[data-admin-shell]').evaluate(element => { element.dataset.density = 'compact'; });
    const roster = page.locator(`#class-session-${ids.futureClass}`);
    await roster.getByRole('button', { name: 'Bookings', exact: true }).click();
    await roster.getByText('Casey Reed', { exact: true }).waitFor();
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    assert.ok((await workspace.boundingBox()).width <= 385, 'The test keeps the containing column narrow independently of text size');
    await roster.scrollIntoViewIfNeeded();
    await capture('calendar-narrow-column-compact-text-200');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'Narrow calendar column with enlarged text does not overflow the page');
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    await workspace.evaluate(element => { element.style.maxWidth = ''; });
    await page.locator('[data-admin-shell]').evaluate(element => { element.dataset.density = 'comfortable'; });

    await page.goto(origin + `/admin/calendar?source=calendar-proof&calendarSearch=non-matching-filter&action=roster&session=${ids.futureClass}#retained-context`, { waitUntil: 'networkidle' });
    const outsideFilter = page.locator(`#class-session-${ids.futureClass}`);
    await outsideFilter.getByText('Drew Rowan', { exact: true }).waitFor();
    assert.equal(await page.getByRole('searchbox', { name: 'Search classes', exact: true }).inputValue(), 'non-matching-filter', 'An explicit roster intent does not clear the user filter');
    assert.ok((await outsideFilter.textContent()).includes('outside current filters'), 'A selected class exception is explained rather than passed off as a search match');
    const deepLink = new URL(page.url());
    assert.equal(deepLink.searchParams.get('source'), 'calendar-proof');
    assert.equal(deepLink.hash, '#retained-context');
    assert.equal(deepLink.searchParams.has('action'), false, 'Only the handled action is consumed');
    await capture('calendar-roster-outside-filters');
    await outsideFilter.getByRole('button', { name: 'Bookings', exact: true }).click();
    await outsideFilter.waitFor({ state: 'hidden' });
  }
}
