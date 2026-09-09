import assert from 'node:assert/strict';
import { assertReachableControl } from './control-geometry.mjs';

export async function checkAdminForms(page, { origin, failures, capture = async () => {}, capturePDF = async () => {}, baseline = true }) {
  await page.goto(origin + '/admin/forms?source=forms-proof', { waitUntil: 'networkidle' });
  const search = page.getByLabel('Search forms', { exact: true });
  await search.fill('Coaching');
  await page.getByRole('button', { name: /Coaching registration/ }).waitFor();
  await page.getByRole('button', { name: /Member experience survey/ }).waitFor({ state: 'hidden' });
  assert.equal(await page.getByRole('button', { name: /Member experience survey/ }).count(), 0);
  if (!baseline) {
    assert.equal(new URL(page.url()).searchParams.get('form-search'), 'Coaching');
    assert.equal(new URL(page.url()).searchParams.get('source'), 'forms-proof');
    await page.getByRole('combobox', { name: 'Form type', exact: true }).selectOption('survey');
    await page.getByRole('heading', { name: 'No matching forms', exact: true }).waitFor();
    assert.equal(await page.getByText('No forms yet', { exact: true }).count(), 0);
    await page.getByRole('combobox', { name: 'Form type', exact: true }).selectOption('');
  }
  await search.fill('');
  await page.getByRole('button', { name: /Member experience survey/ }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const title = page.getByRole('textbox', { name: 'Form title', exact: true });
  await title.fill('Keep this fictional form draft');
  if (!baseline) {
    await page.getByRole('radio', { name: 'Fields', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.getByRole('radio', { name: 'Settings', exact: true }).getAttribute('aria-checked'), 'true', 'Form editor views are keyboard-operable');
    await page.getByRole('switch', { name: 'Collect email', exact: true }).click();
    await page.getByRole('switch', { name: 'One response per email', exact: true }).click();
    assert.equal(await page.getByRole('switch', { name: 'Collect email', exact: true }).getAttribute('aria-checked'), 'true');
    assert.equal(await page.getByRole('switch', { name: 'Require email', exact: true }).getAttribute('aria-checked'), 'true', 'One-response rule retains required email collection');
    await page.getByRole('radio', { name: 'Settings', exact: true }).focus();
    await page.keyboard.press('ArrowLeft');
    await page.getByRole('textbox', { name: 'Question 2', exact: true }).waitFor();
  }
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  const discard = page.getByRole('alertdialog', { name: 'Discard unsaved form changes?', exact: true });
  await discard.waitFor();
  if (!baseline) {
    for (let index = 0; index < 5; index++) {
      await page.keyboard.press('Tab');
      assert.equal(await discard.evaluate(element => element.contains(document.activeElement)), true, 'Form discard confirmation contains keyboard focus');
    }
  }
  await discard.getByRole('button', { name: 'Keep editing', exact: true }).click();
  assert.equal(await title.inputValue(), 'Keep this fictional form draft');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  if (!baseline) {
    await assertReachableControl(page.getByRole('button', { name: 'Save form', exact: true }), 'Save form at enlarged text');
    await assertReachableControl(page.getByRole('button', { name: 'Back', exact: true }), 'Leave form editor at enlarged text');
  }
  await capture('form-editor-text-200');
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  if (!baseline) {
    await page.getByRole('button', { name: 'Save form', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Writes blocked by local design fixture.' }).waitFor();
    assert.equal(await title.inputValue(), 'Keep this fictional form draft', 'Failed form save retains the draft');
    await capture('form-save-failure-retained');
  }
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await discard.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await page.getByRole('button', { name: 'Analytics', exact: true }).click();
  await page.getByRole('button', { name: 'Export CSV', exact: true }).waitFor();
  const exportButton = page.getByRole('button', { name: 'Export CSV', exact: true });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.includes('Export CSV') && !button.disabled));
  const downloadPromise = page.waitForEvent('download');
  await exportButton.click();
  const download = await downloadPromise;
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  const csv = Buffer.concat(chunks).toString('utf8');
  assert.equal((csv.match(/form\.member\.\d{3}@example\.invalid/g) || []).length, 503, 'Response export spans both server pages');
  assert.ok(csv.includes('Do you accept these original terms?'), 'Export retains original captured questions');
  await page.getByRole(baseline ? 'button' : 'radio', { name: 'Responses', exact: true }).click();
  if (!baseline) {
    const table = page.locator('[data-admin-table][aria-label="Form responses"]');
    await table.locator('table[aria-rowcount="504"]').waitFor();
    assert.equal(await table.getAttribute('data-virtualized'), 'true');
    assert.ok(await table.locator('[data-row-key]').count() < 503, 'Large response history is actually virtualized');
    await table.getByRole('button', { name: 'Show all 503 results for keyboard navigation', exact: true }).click();
    assert.equal(await table.locator('[data-row-key]').count(), 503, 'Keyboard full-results mode retains every respondent');
    await table.getByRole('button', { name: 'Use virtual scrolling', exact: true }).click();
  }
  await page.getByRole('textbox', { name: 'Search respondents', exact: true }).fill('Form Member 001');
  if (!baseline) failures.xert_form_responses = Number.POSITIVE_INFINITY;
  await page.getByRole('button', { name: 'View full form', exact: true }).click();
  if (!baseline) {
    await page.getByRole('alert').filter({ hasText: 'Fixture class service temporarily unavailable.' }).waitFor();
    assert.equal(await page.getByRole('article', { name: 'Original launch agreement', exact: true }).count(), 0, 'Failed full-record read never shows a partial record as the original');
    await capture('full-form-read-error');
    failures.xert_form_responses = 0;
    await page.getByRole('button', { name: 'Retry full response', exact: true }).click();
  }
  const record = page.getByRole('article', { name: 'Original launch agreement', exact: true });
  await record.waitFor();
  const recordText = await record.textContent();
  for (const value of ['Form Member 001', 'form.member.001@example.invalid', '8 September 2026', '1 min 30 sec', 'fixture-response-001', 'https://example.invalid/forms/fixture-survey']) {
    assert.ok(recordText.includes(value), `Original record includes actual submission metadata: ${value}`);
  }
  if (!baseline) {
    const contrast = await record.getByRole('heading', { name: 'Original launch agreement', exact: true }).evaluate(element => {
      const rgba = value => (value.match(/[\d.]+/g) || []).map(Number);
      const over = (front, back) => front.slice(0, 3).map((channel, index) => channel * (front[3] ?? 1) + back[index] * (1 - (front[3] ?? 1)));
      const layers = [];
      for (let node = element; node; node = node.parentElement) layers.unshift(rgba(getComputedStyle(node).backgroundColor));
      const background = layers.reduce((back, front) => over(front, back), [255, 255, 255]);
      const foreground = over(rgba(getComputedStyle(element).color), background);
      const luminance = channels => channels.map(channel => channel / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
      const light = luminance(foreground), dark = luminance(background);
      return { foreground, background, ratio: (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05) };
    });
    assert.ok(contrast.ratio >= 4.5, `Original record heading stays legible against its actual rendered header: ${JSON.stringify(contrast)}`);
  }
  assert.ok((await record.textContent()).includes('Original recorded terms — fictional fixture only.'));
  assert.ok((await record.textContent()).includes('Original unmatched value'));
  assert.ok((await record.textContent()).includes('Archived administrative value'));
  assert.ok((await record.textContent()).includes('Form definition preserved at submission.'));
  assert.equal(await page.getByRole('heading', { name: 'Original launch agreement', exact: true }).evaluate(node => node === document.activeElement), true);
  await capture('original-form-record');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  if (!baseline) {
    await assertReachableControl(page.getByRole('button', { name: 'Print / Save PDF', exact: true }), 'Print original form record at enlarged text');
    await assertReachableControl(page.getByRole('button', { name: 'All responses', exact: true }), 'Return from original form record at enlarged text');
    await assertReachableControl(page.getByRole('combobox', { name: 'Workflow status', exact: true }), 'Review original form record at enlarged text');
  }
  await capture('original-form-record-text-200');
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  if (!baseline) {
    await page.emulateMedia({ media: 'print' });
    try {
      assert.equal(await record.isVisible(), true, 'Original record remains visible for printing');
      assert.equal(await page.getByRole('button', { name: 'Print / Save PDF', exact: true }).isVisible(), false, 'Print hides interactive controls');
      assert.equal(await record.evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(255, 255, 255)', 'Print retains a white documentary surface');
      assert.equal(await record.locator('.xert-response-metadata .forms-record-grid').evaluate(element => getComputedStyle(element).display), 'grid', 'Print preserves the document metadata grid independently of screen queries');
      await capturePDF('original-form-record');
    } finally {
      await page.emulateMedia({ media: 'screen' });
    }
  }
  await page.getByRole('button', { name: 'Older', exact: true }).click();
  await page.getByRole('heading', { name: 'Reconstructed form layout — not verified as presented', exact: true }).waitFor();
  await capture('legacy-form-record');
  await page.getByRole('button', { name: 'All responses', exact: true }).click();
  if (!baseline) assert.ok(!(await page.title()).includes('Original launch agreement'), 'Leaving the record restores the workspace document title');
  await page.getByRole('textbox', { name: 'Search respondents', exact: true }).fill('Form Member 503');
  await page.getByText('Form Member 503', { exact: true }).waitFor();
  await capture('last-response');
  if (!baseline) {
    const workspace = page.locator('.forms-workspace').first();
    await workspace.evaluate(element => { element.style.maxWidth = '384px'; });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await assertReachableControl(page.getByRole('button', { name: 'View full form', exact: true }), 'Open response in a narrow enlarged-text column');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'Narrow response table uses cards without page overflow');
    await capture('form-response-narrow-text-200');
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    failures.xert_forms = Number.POSITIVE_INFINITY;
    await page.goto(origin + '/admin/forms?source=forms-proof', { waitUntil: 'networkidle' });
    await page.getByRole('alert').filter({ hasText: 'Fixture class service temporarily unavailable.' }).waitFor();
    assert.equal(await page.getByText('No forms yet', { exact: true }).count(), 0, 'A form-list read error never becomes a false empty state');
    await capture('forms-list-read-error');
    failures.xert_forms = 0;
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByRole('button', { name: /Member experience survey/ }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('source'), 'forms-proof');
  }
}
