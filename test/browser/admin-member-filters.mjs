import assert from 'node:assert/strict';

export async function checkAdminMemberFilters(page, { origin, capture = async () => {} }) {
  const queries = [];
  const observe = request => {
    if (new URL(request.url()).pathname === '/rest/v1/rpc/admin_list_members_page' && request.method() === 'POST') queries.push(request.postDataJSON());
  };
  const snapshots = [];
  const snapshot = async stage => snapshots.push({ stage, url: page.url(), search: await page.getByLabel('Search members', { exact: true }).inputValue() });
  page.on('request', observe);
  try {
    await page.goto(origin + '/admin/gym-members?source=member-filter-proof#retained', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Directory Member 001', exact: true }).waitFor();
    await page.getByLabel('Search members', { exact: true }).fill('Member 10');
    await snapshot('after search fill');
    await page.getByLabel('Filter members by role', { exact: true }).selectOption('member');
    await snapshot('after role');
    await page.getByLabel('Filter members by credits', { exact: true }).selectOption('available');
    await snapshot('after credit');
    await page.waitForLoadState('networkidle');
    await snapshot('settled');
    await capture('member-fast-filter-state');
    assert.equal(snapshots.at(-1).search, 'Member 10', `Search survives immediate composed filters: ${JSON.stringify({ snapshots, queries })}`);
    await page.getByRole('button', { name: 'Directory Member 101', exact: true }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('source'), 'member-filter-proof');
    assert.equal(new URL(page.url()).hash, '#retained');
  } finally {
    page.off('request', observe);
  }
}
