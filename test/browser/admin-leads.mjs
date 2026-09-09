import assert from 'node:assert/strict';

export async function checkAdminLeads(page, { origin, failures, capture = async () => {}, baseline = false }) {
  await page.goto(origin + '/admin/members?source=lead-proof', { waitUntil: 'networkidle' });
  await page.getByText('Lead Member 001', { exact: true }).waitFor();
  await page.getByLabel('Select Lead Member 001', { exact: true }).check();
  await page.getByRole('button', { name: 'Next lead page', exact: true }).click();
  await page.getByText('Lead Member 051', { exact: true }).waitFor();
  assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 0, 'Selection does not silently carry into a different server page');
  await capture('leads-page-two');
  await page.getByRole('button', { name: 'Previous lead page', exact: true }).click();
  await page.getByText('Lead Member 001', { exact: true }).click();
  const detail = page.getByRole('dialog', { name: 'Lead Detail', exact: true });
  await detail.waitFor();
  assert.ok((await detail.textContent()).includes('Lead Member 001'));
  assert.ok((await detail.textContent()).includes('Returning to training'));
  const discard = page.getByRole('alertdialog', { name: 'Discard unsaved lead changes?', exact: true });
  if (!baseline) {
    await detail.getByRole('textbox', { name: 'Admin notes', exact: true }).fill('Keep this fictional lead draft');
    await page.keyboard.press('Escape');
    await discard.waitFor({ timeout: 5000 });
    await discard.getByRole('button', { name: 'Keep editing', exact: true }).click();
    assert.equal(await detail.getByRole('textbox', { name: 'Admin notes', exact: true }).inputValue(), 'Keep this fictional lead draft', 'Cancelling dismissal preserves lead notes');
    for (let step = 0; step < 12; step++) {
      await page.keyboard.press('Tab');
      assert.equal(await detail.evaluate(element => element.contains(document.activeElement)), true, 'Lead detail retains modal keyboard focus');
    }
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await capture('leads-detail-text-200');
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  await detail.getByRole('button', { name: /^Close (lead details|drawer)$/ }).click();
  if (!baseline) await discard.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await detail.waitFor({ state: 'hidden' });

  const search = page.getByLabel('Search leads by name or email', { exact: true });
  const status = page.getByLabel('Filter leads by status', { exact: true });
  await search.fill('Member 10');
  await page.getByText('Lead Member 100', { exact: true }).waitFor();
  await status.selectOption('contacted');
  await page.getByText('Lead Member 102', { exact: true }).waitFor();
  await page.getByText('Lead Member 106', { exact: true }).waitFor();
  assert.equal(await page.getByText('Lead Member 100', { exact: true }).count(), 0, 'Server search and status filters compose');
  await capture('leads-filtered');
  if (!baseline) assert.equal(new URL(page.url()).searchParams.get('source'), 'lead-proof', 'Lead filters preserve caller context');
  await search.fill('');
  await status.selectOption('');
  await page.getByText('Lead Member 001', { exact: true }).waitFor();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export results', exact: true }).click();
  const download = await downloadPromise;
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  const csv = Buffer.concat(chunks).toString('utf8');
  assert.ok(download.suggestedFilename().startsWith('xert_member_interest_'));
  assert.equal((csv.match(/lead\.member\.\d{3}@example\.invalid/g) || []).length, 112, 'CSV export includes all filtered server pages, not only 50 visible rows');
  assert.ok(!csv.includes('Fictional internal note'), 'Private admin notes are excluded from the export projection');

  failures.member_interest = Number.POSITIVE_INFINITY;
  await page.getByRole('button', { name: 'Refresh leads', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Fixture class service temporarily unavailable.' }).waitFor();
  await capture('leads-error');
  failures.member_interest = 0;
  await page.getByRole('button', { name: /^Retry( loading data)?$/ }).click();
  await page.getByText('Lead Member 001', { exact: true }).waitFor();
}
