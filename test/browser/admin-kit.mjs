import assert from 'node:assert/strict';
import { kitRows } from '../fixtures/admin-kit-data.mjs';

const rowSelector = '[data-row-key]';
const selected = async page => (await page.getByLabel('Selected fixture keys', { exact: true }).textContent()).split(',').filter(Boolean);
const settleLayout = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

async function waitCount(page, expected) {
  await page.waitForFunction(value => document.querySelector('[aria-label="Filtered fixture count"]')?.textContent === String(value), expected);
}

async function checkRowsReadable(page, table) {
  await settleLayout(page);
  const geometry = await table.locator(rowSelector).evaluateAll(rows => rows.map(row => {
    const box = row.getBoundingClientRect();
    const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
    const clipped = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const parent = node.parentElement;
      if (!node.textContent.trim() || !parent?.checkVisibility({ visibilityProperty: true }) || parent.closest('.sr-only')) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const textBox of range.getClientRects()) {
        if (textBox.left < box.left - 2 || textBox.right > box.right + 2 || textBox.top < box.top - 2 || textBox.bottom > box.bottom + 2) clipped.push(node.textContent.slice(0, 70));
      }
    }
    return { id: row.getAttribute('data-row-key'), index: Number(row.getAttribute('aria-rowindex')), top: box.top, bottom: box.bottom, height: box.height, clipped };
  }));
  assert.ok(geometry.length > 0, 'The table has visible record geometry');
  assert.deepEqual(geometry.flatMap(row => row.clipped), [], 'Wrapped record text fits its measured row, including enlarged text');
  const ordered = geometry.toSorted((left, right) => left.index - right.index);
  for (let index = 1; index < ordered.length; index++) {
    assert.ok(ordered[index].top >= ordered[index - 1].bottom - 2, `Measured rows do not overlap: ${ordered[index - 1].id} / ${ordered[index].id}`);
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'The kit does not cause page-wide horizontal overflow');
  return geometry;
}

export async function checkAdminKit(context, { origin, width, capture = async () => {} }) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const fixtureUrl = origin + '/test/fixtures/admin-kit.html?source=retained&workspace=members#kit';
  try {
    await page.goto(fixtureUrl, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Command Centre kit fixture', exact: true }).waitFor({ timeout: 10000 });
    const table = page.locator('[data-admin-table]');
    await table.waitFor();
    await waitCount(page, 320);
    const shortTargets = await page.getByRole('radiogroup', { name: 'Short segment targets', exact: true }).getByRole('radio').evaluateAll(elements => elements.map(element => {
      const box = element.getBoundingClientRect(); return { text: element.textContent, width: box.width, height: box.height };
    }));
    assert.ok(shortTargets.every(target => target.width >= 44 && target.height >= 44), `Short-label controls preserve 44px targets: ${JSON.stringify(shortTargets)}`);
    assert.equal(await table.getAttribute('data-virtualized'), 'true', 'A large table uses actual virtualization');
    assert.equal(await table.getByRole('table', { name: 'Fictional members', exact: true }).getAttribute('aria-rowcount'), '321', 'Accessible count includes all records and the header');
    const initialRows = await table.locator(rowSelector).count();
    assert.ok(initialRows > 0 && initialRows < 200, `Only a bounded window is mounted (${initialRows} of 320)`);
    await checkRowsReadable(page, table);
    await table.evaluate(element => element.scrollIntoView({ block: 'start' }));
    await capture(page, 'kit-initial');

    const all = table.getByRole('checkbox', { name: 'Select all filtered results', exact: true });
    await all.check();
    assert.equal((await selected(page)).length, 320, 'Select-all includes unmounted filtered rows');
    await all.uncheck();
    assert.deepEqual(await selected(page), [], 'Clearing all filtered results clears their stable keys');
    await table.getByRole('checkbox', { name: 'Select Member 001', exact: true }).check();
    const chosen = ['fixture-member-001'];
    assert.deepEqual(await selected(page), chosen);

    const status = page.getByRole('combobox', { name: 'Member status', exact: true });
    await status.selectOption('pending');
    await waitCount(page, 80);
    assert.deepEqual(await selected(page), chosen, 'Filtering retains selection outside current results');
    assert.ok((await table.textContent()).includes('1 selected (1 outside current results)'), 'Outside-filter selection is clearly counted');
    await all.check();
    assert.equal((await selected(page)).length, 81, 'Select-all adds filtered results without losing outside keys');
    await all.uncheck();
    assert.deepEqual(await selected(page), chosen, 'Clearing current results preserves outside keys');
    let location = new URL(page.url());
    assert.equal(location.searchParams.get('source'), 'retained');
    assert.equal(location.searchParams.get('workspace'), 'members');
    assert.equal(location.hash, '#kit');
    await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
    await waitCount(page, 320);

    const search = page.getByRole('searchbox', { name: 'Search fictional members', exact: true });
    await search.fill('Member 319');
    await page.waitForURL(url => url.searchParams.get('memberQuery') === 'Member 319');
    await waitCount(page, 1);
    assert.equal(await table.locator(rowSelector).first().getAttribute('data-row-key'), 'fixture-member-319');
    assert.equal(await table.getAttribute('data-virtualized'), 'false', 'Small filtered results do not pay for virtualization');
    await page.getByRole('link', { name: 'Visit pending filter', exact: true }).click();
    await waitCount(page, 80);
    assert.equal(await search.inputValue(), '', 'External URL changes update the search control');
    assert.equal(await status.inputValue(), 'pending');
    await page.goBack();
    await page.waitForURL(url => url.searchParams.get('memberQuery') === 'Member 319');
    await waitCount(page, 1);
    assert.equal(await search.inputValue(), 'Member 319', 'Back restores the URL-backed search');
    await page.goForward();
    await waitCount(page, 80);
    await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
    await waitCount(page, 320);
    location = new URL(page.url());
    assert.equal(location.searchParams.get('source'), 'retained', 'Reset removes only kit-owned parameters');
    assert.equal(location.hash, '#kit', 'Reset preserves the hash');

    await table.getByRole('button', { name: 'Amount', exact: true }).click();
    assert.equal(await table.getByRole('columnheader').filter({ has: page.getByRole('button', { name: 'Amount', exact: true }) }).getAttribute('aria-sort'), 'ascending');
    const expectedAscending = kitRows.toSorted((left, right) => left.amountInCents - right.amountInCents).map(row => row.id);
    const mountedAscending = await table.locator(rowSelector).evaluateAll(rows => rows.map(row => ({ id: row.getAttribute('data-row-key'), index: Number(row.getAttribute('aria-rowindex')) })));
    assert.ok(mountedAscending.every(row => row.id === expectedAscending[row.index - 2]), 'Numeric sorting uses the whole source, not strings or the mounted window');
    assert.deepEqual(await selected(page), chosen, 'Sorting does not change selected identities');
    await table.getByRole('button', { name: 'Amount', exact: true }).click();
    const expectedDescending = [...expectedAscending].reverse();
    const mountedDescending = await table.locator(rowSelector).evaluateAll(rows => rows.map(row => ({ id: row.getAttribute('data-row-key'), index: Number(row.getAttribute('aria-rowindex')) })));
    assert.ok(mountedDescending.every(row => row.id === expectedDescending[row.index - 2]), 'Descending sort reaches the numeric maximum');

    await table.getByRole('button', { name: 'Show all 320 results for keyboard navigation', exact: true }).click();
    assert.equal(await table.getAttribute('data-virtualized'), 'false');
    assert.equal(await table.locator(rowSelector).count(), 320, 'Full-results keyboard mode exposes every record');
    const lastCheckbox = table.locator(rowSelector).last().getByRole('checkbox');
    const wasLastChecked = await lastCheckbox.isChecked();
    await lastCheckbox.focus();
    await page.keyboard.press('Space');
    assert.equal(await lastCheckbox.isChecked(), !wasLastChecked, 'An otherwise unmounted final record can be toggled by keyboard');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('type')), 'checkbox', 'Reverse tab reaches the preceding record');
    await table.getByRole('button', { name: 'Use virtual scrolling', exact: true }).click();
    const scroll = table.locator('[data-table-scroll]');
    await scroll.evaluate(element => { element.scrollTop = 0; });
    await settleLayout(page);
    const firstMounted = table.locator(rowSelector).first();
    const pinnedKey = await firstMounted.getAttribute('data-row-key');
    await firstMounted.getByRole('checkbox').focus();
    await scroll.evaluate(element => { element.scrollTop = element.scrollHeight * .65; });
    await page.waitForFunction(key => [...document.querySelectorAll('[data-row-key]')].some(row => row.getAttribute('data-row-key') !== key && Number(row.getAttribute('aria-rowindex')) > 100), pinnedKey);
    assert.equal(await page.evaluate(() => document.activeElement?.closest('[data-row-key]')?.getAttribute('data-row-key')), pinnedKey, 'Recycling does not remove the focused record');
    assert.ok(await table.locator(rowSelector).count() < 200, 'Focus pinning does not mount the entire data set');
    await page.getByRole('heading', { name: 'Command Centre kit fixture', exact: true }).click();
    await scroll.evaluate(element => { element.scrollTop = 0; });

    if (width >= 1024) {
      const viewportBefore = page.viewportSize();
      await page.getByRole('button', { name: 'Narrow column', exact: true }).click();
      await settleLayout(page);
      assert.deepEqual(page.viewportSize(), viewportBefore, 'Narrow-column proof keeps the desktop viewport unchanged');
      const cells = table.locator(rowSelector).first().getByRole('cell');
      const boxes = await cells.evaluateAll(elements => elements.map(element => { const box = element.getBoundingClientRect(); return { y: box.y, bottom: box.bottom }; }));
      assert.ok(boxes.length >= 3 && boxes.at(-1).y > boxes[0].y, 'A narrow container uses stacked cards even on a wide desktop');
      await table.evaluate(element => element.scrollIntoView({ block: 'start' }));
      await capture(page, 'kit-desktop-narrow');
    }
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await settleLayout(page);
    await checkRowsReadable(page, table);
    await table.evaluate(element => element.scrollIntoView({ block: 'start' }));
    await capture(page, 'kit-text-200');
    await page.getByRole('button', { name: 'Compact density', exact: true }).click();
    await checkRowsReadable(page, table);
    await table.evaluate(element => element.scrollIntoView({ block: 'start' }));
    await capture(page, 'kit-compact-text-200');
    await page.getByRole('button', { name: 'Comfortable density', exact: true }).click();

    const segmented = page.getByRole('radiogroup', { name: 'Fixture view', exact: true });
    await segmented.getByRole('radio', { name: 'Upcoming', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.getByLabel('Fixture view value', { exact: true }).textContent(), 'past', 'Segmented arrows skip disabled options');
    assert.equal(await segmented.getByRole('radio', { name: 'Past', exact: true }).getAttribute('aria-checked'), 'true');
    await page.keyboard.press('Home');
    assert.equal(await page.getByLabel('Fixture view value', { exact: true }).textContent(), 'upcoming');
    await page.keyboard.press('End');
    assert.equal(await page.getByLabel('Fixture view value', { exact: true }).textContent(), 'past');
    const skeletonMotion = await page.getByRole('status', { name: 'Loading fictional editor', exact: true }).evaluate(element => ({ reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, duration: parseFloat(getComputedStyle(element).animationDuration) }));
    assert.equal(skeletonMotion.duration > 0, !skeletonMotion.reduced, 'Skeleton motion follows the shared reduced-motion setting');
    const timeline = page.getByRole('list', { name: 'Fictional member timeline', exact: true });
    assert.equal(await timeline.getByRole('listitem').count(), 3, 'Timeline retains the dated event sequence');
    const times = await timeline.locator('time').evaluateAll(elements => elements.map(element => ({ dateTime: element.dateTime, text: element.textContent })));
    assert.ok(times.every(time => Number.isFinite(Date.parse(time.dateTime)) && time.text), 'Each timeline event exposes readable and machine-readable time');
    await segmented.scrollIntoViewIfNeeded();
    await capture(page, 'kit-primitives-text-200');

    const opener = page.getByRole('button', { name: 'Open member drawer', exact: true });
    await opener.click();
    const drawer = page.getByRole('dialog', { name: 'Fictional member detail', exact: true });
    await drawer.waitFor();
    await capture(page, 'kit-drawer-open-text-200');
    const closeBox = await drawer.getByRole('button', { name: 'Close drawer', exact: true }).boundingBox();
    const viewport = page.viewportSize();
    assert.ok(closeBox && closeBox.x >= 0 && closeBox.y >= 0 && closeBox.x + closeBox.width <= viewport.width + 1 && closeBox.y + closeBox.height <= viewport.height + 1, 'Drawer close control remains visible at enlarged text');
    const note = drawer.getByRole('textbox', { name: 'Fictional note', exact: true });
    assert.equal(await note.getAttribute('aria-invalid'), 'true');
    const descriptions = (await note.getAttribute('aria-describedby')).split(/\s+/);
    assert.ok(descriptions.includes('fixture-original-description'), 'Field composition preserves existing descriptions');
    const describedCopy = await note.evaluate(element => element.getAttribute('aria-describedby').split(/\s+/).map(id => document.getElementById(id)?.textContent));
    assert.ok(describedCopy.includes('No data leaves this fixture.') && describedCopy.includes('Enter a fictional note.'), 'Helper and error are both associated with the field');
    await note.fill('A fictional local note');
    assert.equal(await drawer.getByLabel('Field change count', { exact: true }).textContent(), '1', 'Field composition preserves the child change handler');
    await drawer.getByRole('button', { name: 'Focus fictional note', exact: true }).click();
    assert.equal(await note.evaluate(element => element === document.activeElement), true, 'Field composition preserves the child ref');
    await opener.evaluate(element => element.focus());
    assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"], dialog'))), true, 'The background cannot take focus while the drawer is modal');
    for (let step = 0; step < 12; step++) {
      const key = step % 3 ? 'Tab' : 'Shift+Tab';
      await page.keyboard.press(key);
      const focus = await page.evaluate(() => ({ contained: Boolean(document.activeElement?.closest('[role="dialog"], dialog')), tag: document.activeElement?.tagName, label: document.activeElement?.getAttribute('aria-label'), text: document.activeElement?.textContent?.slice(0, 70) }));
      assert.equal(focus.contained, true, `Drawer traps ${key} at step ${step}: ${JSON.stringify(focus)}`);
    }
    await capture(page, 'kit-drawer-text-200');
    await page.keyboard.press('Escape');
    await drawer.waitFor({ state: 'hidden' });
    assert.equal(await opener.evaluate(element => element === document.activeElement), true, 'Escape restores the original drawer opener');

    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    await page.getByRole('button', { name: 'Simulate table error', exact: true }).click();
    await page.getByText('Fictional table is temporarily unavailable.', { exact: true }).waitFor();
    await capture(page, 'kit-error');
    await table.getByRole('button', { name: /retry/i }).click();
    await table.locator(rowSelector).first().waitFor();
    await page.getByRole('button', { name: 'Simulate table loading', exact: true }).click();
    assert.equal(await table.locator(rowSelector).count(), 0, 'Loading does not leave stale record controls actionable');
    await capture(page, 'kit-loading');
    await page.getByRole('button', { name: 'Restore fixture data', exact: true }).click();
    await search.fill('No fictional match');
    await waitCount(page, 0);
    await page.getByText('No matching fictional members', { exact: true }).waitFor();
    await capture(page, 'kit-empty');
    assert.deepEqual(errors, [], 'No runtime errors during actual kit interactions');
  } catch (error) {
    await capture(page, 'kit-failure');
    error.message += errors.length ? `; browser errors: ${errors.join(' | ')}` : '';
    throw error;
  } finally {
    await page.close();
  }
}

export async function checkAdminFilterGuard(context, { origin, capture = async () => {} }) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(origin + '/test/fixtures/admin-filter-guard.html', { waitUntil: 'networkidle' });
    const headline = page.getByLabel('Headline', { exact: true });
    await headline.waitFor();
    await headline.fill('Keep this real editor draft during filter changes');
    const query = page.getByRole('searchbox', { name: 'Isolated owner search', exact: true });
    await query.fill('local filter');
    await page.waitForURL(url => url.searchParams.get('fixtureQuery') === 'local filter');
    assert.equal(await headline.inputValue(), 'Keep this real editor draft during filter changes', 'A URL filter does not remount or discard the actual content editor');
    assert.equal(new URL(page.url()).pathname, '/admin/content');
    assert.equal(new URL(page.url()).searchParams.get('workspace'), 'website');
    const filteredUrl = page.url();
    await page.getByRole('main').click({ position: { x: 8, y: 8 } });
    await page.keyboard.press('Control+k');
    const palette = page.getByRole('dialog', { name: 'Find an owner task', exact: true });
    await palette.getByRole('combobox').fill('Class calendar');
    await palette.getByRole('option').filter({ hasText: 'Class calendar' }).click();
    const guard = page.getByRole('alertdialog', { name: 'Discard unsaved changes?', exact: true });
    await guard.waitFor();
    await capture(page, 'filter-real-dirty-guard');
    await guard.getByRole('button', { name: 'Keep editing', exact: true }).click();
    await guard.waitFor({ state: 'hidden' });
    await page.keyboard.press('Escape');
    assert.equal(page.url(), filteredUrl, 'Cancelled navigation retains the current filter URL');
    assert.equal(await headline.inputValue(), 'Keep this real editor draft during filter changes', 'The real workspace guard remains active after URL filtering');
    await page.getByRole('complementary', { name: 'Isolated owner filter', exact: true }).getByRole('button', { name: 'Reset filters', exact: true }).click();
    await page.waitForURL(url => !url.searchParams.has('fixtureQuery'));
    assert.equal(new URL(page.url()).searchParams.get('source'), 'filter-guard');
    assert.equal(await headline.inputValue(), 'Keep this real editor draft during filter changes', 'Resetting owned filters also preserves the unsaved editor');
    assert.deepEqual(errors, [], 'No runtime errors during real owner/filter guard composition');
  } catch (error) {
    await capture(page, 'filter-real-guard-failure');
    error.message += errors.length ? `; browser errors: ${errors.join(' | ')}` : '';
    throw error;
  } finally {
    await page.close();
  }
}
