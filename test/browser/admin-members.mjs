import assert from 'node:assert/strict';
import { assertReachableControl } from './control-geometry.mjs';

export async function checkAdminMembers(page, { origin, failures, capture = async () => {}, baseline = true, geometry = false }) {
  await page.goto(origin + '/admin/gym-members?source=member-proof', { waitUntil: 'networkidle' });
  const memberName = 'Directory Member 001';
  const firstRow = () => baseline
    ? page.getByRole('heading', { name: memberName, exact: true }).locator('../../..')
    : page.locator('[data-row-key="20000000-0000-4000-8000-000000000001"]');
  await page.getByRole('heading', { name: memberName, exact: true }).waitFor();
  await page.getByRole('button', { name: 'Next member page', exact: true }).click();
  await page.getByRole('heading', { name: 'Directory Member 051', exact: true }).waitFor();
  assert.ok((await page.getByRole('status').allTextContents()).some(text => text.includes('51-100 of 112')));
  await capture('members-page-two');
  await page.getByRole('button', { name: 'Previous member page', exact: true }).click();
  await firstRow().getByRole('button', { name: 'View', exact: true }).click();
  const detail = page.getByRole('dialog', { name: memberName, exact: true });
  await detail.getByText('Fictional training reminder', { exact: true }).waitFor();
  await detail.getByText('Fictional staff note: prefers a clear session overview.', { exact: true }).waitFor();
  assert.equal(await detail.getByText('Fictional archived note retained for staff history.', { exact: true }).count(), 0);
  await detail.getByRole('checkbox', { name: 'Show archived', exact: true }).check();
  await detail.getByText('Fictional archived note retained for staff history.', { exact: true }).waitFor();
  await detail.getByText('Fictional Foundation Strength', { exact: true }).waitFor();
  await detail.getByText('Fictional three-month membership', { exact: true }).waitFor();
  await capture('member-record');
  await detail.getByRole('textbox', { name: 'Private notice title', exact: true }).fill('Fictional reminder draft');
  await detail.getByRole('textbox', { name: 'Private notice message', exact: true }).fill('Keep this unsent notice while staff reviews it.');
  await detail.getByRole('button', { name: 'Close member detail', exact: true }).click();
  const discard = page.getByRole('alertdialog', { name: 'Discard private notice draft?', exact: true });
  await discard.getByRole('button', { name: 'Keep writing', exact: true }).click();
  assert.equal(await detail.getByRole('textbox', { name: 'Private notice title', exact: true }).inputValue(), 'Fictional reminder draft');
  await detail.getByRole('button', { name: 'Send privately', exact: true }).click();
  await detail.getByRole('alert').filter({ hasText: 'Mutation or unconfigured RPC blocked by local design fixture.' }).waitFor();
  assert.equal(await detail.getByRole('textbox', { name: 'Private notice message', exact: true }).inputValue(), 'Keep this unsent notice while staff reviews it.');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await detail.getByRole('button', { name: 'Send privately', exact: true }).scrollIntoViewIfNeeded();
  await capture('member-notice-text-200');
  if (geometry) {
    const send = detail.getByRole('button', { name: 'Send privately', exact: true });
    await assertReachableControl(send, 'Send private notice at enlarged text');
    assert.equal(await send.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      const hit = document.elementFromPoint((bounds.left + bounds.right) / 2, (bounds.top + bounds.bottom) / 2);
      return hit === element || element.contains(hit);
    }), true, 'Sticky member header must not cover the Send privately touch target');
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  await detail.getByRole('button', { name: 'Close member detail', exact: true }).click();
  await discard.getByRole('button', { name: 'Discard draft', exact: true }).click();
  await detail.waitFor({ state: 'hidden' });

  await firstRow().getByRole('button', { name: '+ Credits', exact: true }).click();
  const grant = page.getByRole('dialog', { name: 'Grant Credits', exact: true });
  await grant.getByRole('spinbutton', { name: 'Class credits', exact: true }).fill('0');
  await grant.getByRole('button', { name: 'Grant 0', exact: true }).click();
  await grant.getByRole('alert').filter({ hasText: 'Credits must be a whole number between 1 and 100.' }).waitFor();
  await grant.getByRole('spinbutton', { name: 'Class credits', exact: true }).fill('4');
  await grant.getByRole('textbox', { name: 'Grant reason', exact: true }).fill('Fictional audited grant draft');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await capture('member-grant-text-200');
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  await grant.getByRole('button', { name: 'Cancel', exact: true }).click();

  await firstRow().getByRole('button', { name: 'Make admin', exact: true }).click();
  const role = page.getByRole('alertdialog', { name: 'Grant administrator access?', exact: true });
  assert.ok((await role.textContent()).includes('This grants access to member data, bookings, sales, content, and staff controls.'));
  await role.getByRole('button', { name: 'Keep unchanged', exact: true }).click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV', exact: true }).click();
  const download = await downloadPromise;
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  const csv = Buffer.concat(chunks).toString('utf8');
  assert.equal((csv.match(/directory\.member\.\d{3}@example\.invalid/g) || []).length, 112, 'Member CSV includes all server pages');
  assert.ok(!csv.includes('Fictional staff note'), 'Private notes stay out of directory exports');

  await page.getByRole('textbox', { name: 'Search members', exact: true }).fill('Member 10');
  await page.getByRole('combobox', { name: 'Filter members by role', exact: true }).selectOption('member');
  await page.getByRole('combobox', { name: 'Filter members by credits', exact: true }).selectOption('available');
  await page.getByRole('heading', { name: 'Directory Member 101', exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Directory Member 100', exact: true }).count(), 0);
  await capture('members-filtered');
  await page.getByRole('textbox', { name: 'Search members', exact: true }).fill('Nobody matches this fixture');
  await page.getByText('No matches', { exact: true }).waitFor();
  await page.getByRole('textbox', { name: 'Search members', exact: true }).fill('');
  await page.getByRole('combobox', { name: 'Filter members by role', exact: true }).selectOption('all');
  await page.getByRole('combobox', { name: 'Filter members by credits', exact: true }).selectOption('all');
  await page.getByRole('heading', { name: memberName, exact: true }).waitFor();

  failures.admin_list_members_page = Number.POSITIVE_INFINITY;
  await page.getByRole('button', { name: 'Refresh members', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Fixture class service temporarily unavailable.' }).waitFor();
  assert.equal(await page.getByText('No members yet', { exact: true }).count(), 0);
  await capture('members-read-error');
  failures.admin_list_members_page = 0;
  await page.getByRole('button', { name: /^Retry( loading data)?$/ }).click();
  await page.getByRole('heading', { name: memberName, exact: true }).waitFor();
}
