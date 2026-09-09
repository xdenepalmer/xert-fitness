import assert from 'node:assert/strict';
import { calendarFixtureIds as ids } from '../fixtures/admin-calendar-data.mjs';

export async function checkAdminCalendar(page, { origin, failures, capture = async () => {}, baseline = false }) {
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
  await editor.getByRole('button', { name: /^Close (class editor|drawer)$/ }).click();
  const discard = page.getByRole('alertdialog', { name: 'Discard unsaved class changes?', exact: true });
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
  }
}
