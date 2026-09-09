import assert from 'node:assert/strict';

export async function checkAdminMembersLoading(page, { origin, capture = async () => {} }) {
  const assertFragmentsFit = async scope => {
    const outside = await scope.evaluate(element => [...element.querySelectorAll('.admin-kit-skeleton')].flatMap(fragment => {
      const parent = fragment.parentElement.getBoundingClientRect();
      const box = fragment.getBoundingClientRect();
      return box.left < parent.left - 1 || box.right > parent.right + 1 ? [{ left: box.left, right: box.right, parentLeft: parent.left, parentRight: parent.right }] : [];
    }));
    assert.deepEqual(outside, [], 'Member loading fragments fit their actual containing columns');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  };
  const directoryReads = new Set(['admin_list_members_page', 'admin_member_activation_overview', 'admin_member_activation_queue', 'admin_member_follow_up_queue']);
  const matchDirectory = url => url.pathname.startsWith('/rest/v1/rpc/') && directoryReads.has(url.pathname.split('/').at(-1));
  let releaseDirectory;
  const directoryGate = new Promise(resolve => { releaseDirectory = resolve; });
  await page.route(matchDirectory, async route => { await directoryGate; return route.fallback(); });
  const resumedDirectory = [...directoryReads].map(name => page.waitForResponse(response => new URL(response.url()).pathname === `/rest/v1/rpc/${name}` && response.status() === 200));
  try {
    await page.goto(origin + '/admin/gym-members?source=member-loading', { waitUntil: 'domcontentloaded' });
    const workspace = page.locator('.members-workspace').first();
    await workspace.locator('[data-table-loading]').waitFor();
    await page.getByLabel('Loading member activation funnel', { exact: true }).waitFor();
    await page.getByLabel('Loading activation actions', { exact: true }).waitFor();
    await page.getByLabel('Loading follow-up queue', { exact: true }).waitFor();
    assert.equal(await workspace.locator('[data-member-placeholder="metric"]').count(), 6);
    assert.equal(await workspace.locator('[data-member-placeholder="queue"]').count(), 6);
    const firstRow = workspace.locator('[data-skeleton-row]').first();
    assert.equal(await firstRow.locator('[data-skeleton-cell]').count(), 5);
    assert.equal(await firstRow.locator('[data-skeleton-cell="full_name"] .admin-kit-skeleton').count(), 3);
    assert.equal(await firstRow.locator('[data-skeleton-cell="actions"] .admin-kit-skeleton').count(), 3);
    assert.equal(await workspace.locator('[data-table-loading] button, [data-member-placeholder] button').count(), 0);
    await capture('members-loading');
    await workspace.evaluate(element => { element.style.maxWidth = '384px'; });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await capture('members-loading-narrow-text-200');
    await assertFragmentsFit(workspace);
    await firstRow.scrollIntoViewIfNeeded();
    await capture('members-directory-loading-narrow-text-200');
  } finally {
    releaseDirectory();
    await Promise.all(resumedDirectory);
    await page.unroute(matchDirectory);
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; document.querySelector('.members-workspace')?.style.removeProperty('max-width'); });
  }

  const matchDetail = url => url.pathname === '/rest/v1/credit_batches';
  let releaseDetail;
  const detailGate = new Promise(resolve => { releaseDetail = resolve; });
  await page.route(matchDetail, async route => { if (route.request().method() === 'GET') await detailGate; return route.fallback(); });
  const resumedDetail = page.waitForResponse(response => matchDetail(new URL(response.url())) && response.status() === 200);
  try {
    await page.getByRole('button', { name: 'Directory Member 001', exact: true }).click();
    const detail = page.getByRole('dialog', { name: 'Directory Member 001', exact: true });
    const loading = detail.getByLabel('Loading Directory Member 001 record', { exact: true });
    await loading.waitFor();
    assert.equal(await loading.locator('[data-member-placeholder="detail"]').count(), 3);
    assert.ok(await loading.locator('.admin-kit-skeleton').count() >= 18);
    await detail.evaluate(element => { element.style.maxWidth = '384px'; });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await loading.locator('[data-member-placeholder="detail"]').first().scrollIntoViewIfNeeded();
    await capture('member-record-loading-narrow-text-200');
    await assertFragmentsFit(loading);
  } finally {
    releaseDetail();
    await resumedDetail;
    await page.unroute(matchDetail);
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  }
  const detail = page.getByRole('dialog', { name: 'Directory Member 001', exact: true });
  await detail.getByText('Fictional training reminder', { exact: true }).waitFor();
  await detail.getByRole('button', { name: 'Close member detail', exact: true }).click();
}
