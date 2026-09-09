// Focused browser regression. Every data request is intercepted locally.
// Run with PLAYWRIGHT_MODULE and BROWSER_CHANNEL as for verify-design.mjs.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { installDesignFixtures } from './fixtures/design-data.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href : 'playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, define: {
  'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://ugmkwoapjcpiucsrxwzt.supabase.co'),
  'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('sb_publishable_LOCAL_DESIGN_FIXTURE_NOT_A_REAL_KEY'),
} });
let browser, releaseBulk;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const requests = [], bulkRequests = [];
  await installDesignFixtures(context, { origin, signedIn: true, leads: true, requests });
  const bulkWait = new Promise(resolve => { releaseBulk = resolve; });
  await context.route('**/rest/v1/rpc/admin_update_lead_statuses', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    bulkRequests.push(route.request().postDataJSON());
    await bulkWait;
    await route.fulfill({ status: 503, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ message: 'Local delayed bulk rejection.' }) });
  });
  const page = await context.newPage();
  await page.goto(origin + '/admin/members', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Lead Member 001', exact: true }).waitFor();
  if (process.argv.includes('--density-only')) {
    const row = page.locator('[data-lead-pipeline] tbody tr').first();
    const spacing = () => row.evaluate(element => getComputedStyle(element).getPropertyValue('--space-row').trim());
    const comfortable = await spacing();
    await page.getByRole('button', { name: 'Compact density', exact: true }).click();
    const compact = await spacing();
    assert.notEqual(compact, comfortable, 'Shell compact density must change actual lead row spacing');
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Lead Member 001', exact: true }).waitFor();
    assert.equal(await spacing(), compact, 'Lead rows inherit the persisted shell density after remount');
    console.log('PASS: Shell density changes lead row spacing and survives remount.');
  } else {
    await page.getByLabel('Select Lead Member 001', { exact: true }).check();
    await page.getByLabel('Move selected leads to', { exact: true }).selectOption('contacted');
    const leadReads = () => requests.filter(request => request.path === '/rest/v1/member_interest').length;
    const before = leadReads();
    await page.getByLabel('Search leads by name or email', { exact: true }).fill('Member 10');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    // Cross the real filter debounce while the intercepted mutation is unresolved.
    await page.waitForTimeout(650);
    assert.equal(bulkRequests.length, 1, 'Only one reviewed mutation is submitted');
    assert.equal(leadReads(), before, 'A queued filter cannot reload or clear selection while bulk update is pending');
    const selected = page.getByLabel('Select Lead Member 001', { exact: true });
    assert.equal(await selected.isChecked(), true);
    assert.equal(await selected.isDisabled(), true);
    assert.equal(await page.getByLabel('Select all leads on this page', { exact: true }).isDisabled(), true);
    assert.equal(await page.getByLabel('Search leads by name or email', { exact: true }).isDisabled(), true);
    assert.equal(await page.getByLabel('Filter leads by status', { exact: true }).isDisabled(), true);
    assert.equal(await page.getByLabel('Move selected leads to', { exact: true }).isDisabled(), true);
    for (const name of ['Refresh leads', 'Next lead page', 'Lead Member 001', 'Export results', 'Reset filters', 'Clear selection', 'Updating...']) {
      assert.equal(await page.getByRole('button', { name, exact: true }).isDisabled(), true, `${name} stays disabled while the request is pending`);
    }
    assert.deepEqual(bulkRequests[0], { p_lead_type: 'member_interest', p_lead_ids: ['fixture-member-lead-001'], p_status: 'contacted' });
    releaseBulk();
    await page.getByRole('button', { name: 'Lead Member 100', exact: true }).waitFor();
    assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 0, 'The deferred query clears old-page selection after settlement');
    assert.equal(await page.getByLabel('Search leads by name or email', { exact: true }).isDisabled(), false);
    console.log('PASS: Pending bulk freezes query/selection/actions, then applies the queued filter after a local rejection.');
  }
} finally {
  releaseBulk?.();
  await browser?.close();
  await server.close();
}
