import assert from 'node:assert/strict';

export async function checkAdminFormsLoading(page, { origin, capture = async () => {} }) {
  const assertFragmentsFit = async loading => {
    const outside = await loading.evaluate(element => [...element.querySelectorAll('.admin-kit-skeleton')].flatMap(fragment => {
      const bounds = fragment.parentElement.getBoundingClientRect();
      const box = fragment.getBoundingClientRect();
      return box.left < bounds.left - 1 || box.right > bounds.right + 1 ? [{ left: box.left, right: box.right, parentLeft: bounds.left, parentRight: bounds.right }] : [];
    }));
    assert.deepEqual(outside, [], 'Each loading fragment fits its containing layout at enlarged text');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  };
  const holdRead = async (table, trigger, label, minimum, name) => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const match = url => url.pathname === `/rest/v1/${table}`;
    await page.route(match, async route => {
      if (route.request().method() === 'GET') await gate;
      return route.fallback();
    });
    const resumed = page.waitForResponse(response => match(new URL(response.url())) && response.status() === 200);
    try {
      await trigger();
      const loading = page.getByLabel(label, { exact: true });
      await loading.waitFor({ timeout: 5000 });
      await capture(`${name}-loading`);
      const fragments = loading.locator('.admin-kit-skeleton');
      assert.ok(await fragments.count() >= minimum, `${label} composes distinct content fragments, not an empty rectangle`);
      if (table === 'xert_forms') {
        const cards = loading.locator('[data-form-placeholder="card"]');
        assert.ok(await cards.count() >= 2, 'Form loading preserves repeated cards');
        assert.ok(await cards.first().locator('.admin-kit-skeleton').count() >= 3, 'Each card reserves separate title, type badge and summary');
      }
      assert.equal(await loading.locator('button,input,select,textarea,a[href]').count(), 0, 'Loading content does not invent interactive controls');
      const workspace = page.locator('.forms-workspace').first();
      await workspace.evaluate(element => { element.style.maxWidth = '384px'; });
      await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
      await loading.scrollIntoViewIfNeeded();
      await capture(`${name}-loading-narrow-text-200`);
      await assertFragmentsFit(loading);
      if (name === 'forms-analytics') {
        await page.getByRole('radio', { name: 'Trends', exact: true }).click();
        assert.ok(await loading.locator('[data-form-placeholder="trend"] li').count() >= 7, 'Loading trends reserve repeated date/bar/count rows');
        await loading.scrollIntoViewIfNeeded();
        await capture('forms-trends-loading-narrow-text-200');
        await assertFragmentsFit(loading);
      }
    } finally {
      release();
      await resumed;
      await page.unroute(match);
      await page.evaluate(() => { document.documentElement.style.fontSize = ''; document.querySelector('.forms-workspace')?.style.removeProperty('max-width'); });
    }
  };
  await holdRead('xert_forms', () => page.goto(origin + '/admin/forms?source=loading-proof', { waitUntil: 'domcontentloaded' }), 'Loading forms', 9, 'forms-list');
  await page.getByRole('button', { name: /Member experience survey/ }).click();
  await holdRead('xert_form_responses', () => page.getByRole('button', { name: 'Analytics', exact: true }).click(), 'Loading responses', 6, 'forms-analytics');
  await page.getByRole('radio', { name: 'Responses', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search respondents', exact: true }).fill('Form Member 001');
  await holdRead('xert_form_responses', () => page.getByRole('button', { name: 'View full form', exact: true }).click(), 'Loading full response', 10, 'forms-record');
  await page.getByRole('article', { name: 'Original launch agreement', exact: true }).waitFor();
}
