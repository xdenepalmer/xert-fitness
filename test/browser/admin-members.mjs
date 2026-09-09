import assert from 'node:assert/strict';
import { assertReachableControl } from './control-geometry.mjs';

async function assertDrawerPausesShortcuts(page, drawer, focusTarget) {
  const url = page.url();
  await focusTarget.focus();
  await page.keyboard.press('Control+k');
  assert.equal(await page.getByRole('dialog', { name: 'Find an owner task', exact: true, includeHidden: true }).count(), 0, 'A native modal must not open the command palette behind its inert background');
  await page.keyboard.press('?');
  assert.equal(await page.getByRole('dialog', { name: 'Keyboard shortcuts', exact: true, includeHidden: true }).count(), 0, 'A native modal must not open shortcut help');
  await page.keyboard.press('g');
  await page.keyboard.press('c');
  assert.equal(page.url(), url, 'Navigation shortcuts pause on native drawer buttons');
  assert.equal(await drawer.isVisible(), true, 'Shortcut keys never dismiss a native drawer');
  assert.equal(await drawer.evaluate(element => element.contains(document.activeElement)), true, 'Modal shortcut attempts preserve drawer focus');
}

export async function checkAdminMembers(page, { origin, failures, capture = async () => {}, baseline = true, geometry = false, noteGuard = false }) {
  await page.goto(origin + '/admin/gym-members?source=member-proof', { waitUntil: 'networkidle' });
  const memberName = 'Directory Member 001';
  const memberLabel = name => page.getByRole(baseline ? 'heading' : 'button', { name, exact: true });
  const firstRow = () => baseline
    ? page.getByRole('heading', { name: memberName, exact: true }).locator('../../..')
    : page.locator('[data-row-key="20000000-0000-4000-8000-000000000001"]');
  await memberLabel(memberName).waitFor();
  await page.getByRole('button', { name: 'Next member page', exact: true }).click();
  await memberLabel('Directory Member 051').waitFor();
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
  if (!baseline) {
    await assertDrawerPausesShortcuts(page, detail, detail.getByRole('button', { name: 'Close member detail', exact: true }));
    for (let index = 0; index < 32; index++) {
      await page.keyboard.press('Tab');
      assert.equal(await detail.evaluate(element => element.contains(document.activeElement)), true, 'Member drawer contains keyboard focus');
    }
  }
  await capture('member-record');
  if (noteGuard) {
    const note = detail.getByRole('textbox', { name: 'Staff note', exact: true });
    await note.fill('Keep this unsaved fictional coaching note.');
    await detail.getByRole('button', { name: 'Close member detail', exact: true }).click();
    assert.equal(await page.getByRole('alertdialog').count(), 1, 'Closing a member with an unsaved staff note requires confirmation');
    await page.getByRole('alertdialog').getByRole('button', { name: /^Keep (writing|editing)$/ }).click();
    assert.equal(await note.inputValue(), 'Keep this unsaved fictional coaching note.', 'Keep editing preserves staff-note text');
    await note.fill('');
  }
  await detail.getByRole('textbox', { name: 'Private notice title', exact: true }).fill('Fictional reminder draft');
  await detail.getByRole('textbox', { name: 'Private notice message', exact: true }).fill('Keep this unsent notice while staff reviews it.');
  await detail.getByRole('button', { name: 'Close member detail', exact: true }).click();
  const discard = page.getByRole('alertdialog', { name: 'Discard private notice draft?', exact: true });
  if (!baseline) await assertDrawerPausesShortcuts(page, discard, discard.getByRole('button', { name: 'Keep writing', exact: true }));
  await discard.getByRole('button', { name: 'Keep writing', exact: true }).click();
  assert.equal(await detail.getByRole('textbox', { name: 'Private notice title', exact: true }).inputValue(), 'Fictional reminder draft');
  if (baseline) {
    await detail.getByRole('button', { name: 'Send privately', exact: true }).click();
  } else {
    let releaseNotice;
    const noticeGate = new Promise(resolve => { releaseNotice = resolve; });
    const matchesNotice = url => url.pathname === '/rest/v1/rpc/admin_send_member_notice';
    const noticeRequest = page.waitForRequest(request => matchesNotice(new URL(request.url())) && request.method() === 'POST', { timeout: 5000 });
    await page.route(matchesNotice, async route => {
      if (route.request().method() === 'POST') await noticeGate;
      return route.fallback();
    });
    const rejectedNotice = page.waitForResponse(response => matchesNotice(new URL(response.url())) && response.status() === 501);
    try {
      await detail.getByRole('button', { name: 'Send privately', exact: true }).click();
      await noticeRequest;
      assert.equal(await detail.getByRole('textbox', { name: 'Private notice title', exact: true }).isEnabled(), false);
      assert.equal(await detail.getByRole('button', { name: 'Close member detail', exact: true }).isEnabled(), false, 'An uncertain pending notice cannot be dismissed');
      await page.keyboard.press('Escape');
      assert.equal(await detail.isVisible(), true);
      await capture('member-notice-pending');
    } finally {
      releaseNotice();
      await rejectedNotice;
      await page.unroute(matchesNotice);
    }
  }
  await detail.getByRole('alert').filter({ hasText: 'Mutation or unconfigured RPC blocked by local design fixture.' }).waitFor();
  assert.equal(await detail.getByRole('textbox', { name: 'Private notice message', exact: true }).inputValue(), 'Keep this unsent notice while staff reviews it.');
  if (!baseline) {
    failures.credit_batches = Number.POSITIVE_INFINITY;
    await detail.getByRole('button', { name: `Refresh ${memberName} record`, exact: true }).click();
    await detail.getByRole('alert').filter({ hasText: 'Fixture class service temporarily unavailable.' }).waitFor();
    assert.equal(await detail.getByRole('button', { name: 'Send privately', exact: true }).isEnabled(), false, 'Failed member refresh disables mutations against stale detail');
    assert.equal(await detail.getByRole('textbox', { name: 'Private notice title', exact: true }).inputValue(), 'Fictional reminder draft');
    await capture('member-stale-record');
    failures.credit_batches = 0;
    await detail.getByRole('button', { name: `Refresh ${memberName} record`, exact: true }).click();
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Send privately' && !button.disabled));
    assert.equal(await detail.getByRole('textbox', { name: 'Private notice message', exact: true }).inputValue(), 'Keep this unsent notice while staff reviews it.', 'Refreshing detail never discards unsent notice text');
  }
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
  if (!baseline) {
    const grantRequests = [];
    const observeGrant = request => {
      if (new URL(request.url()).pathname === '/rest/v1/rpc/admin_grant_credits_v2' && request.method() === 'POST') grantRequests.push(request.postDataJSON());
    };
    page.on('request', observeGrant);
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const rejected = page.waitForResponse(response => new URL(response.url()).pathname === '/rest/v1/rpc/admin_grant_credits_v2' && response.status() === 501);
        await grant.getByRole('button', { name: 'Grant 4', exact: true }).click();
        await rejected;
        await grant.getByRole('alert').filter({ hasText: 'Mutation or unconfigured RPC blocked by local design fixture.' }).waitFor();
        assert.equal(await grant.getByRole('textbox', { name: 'Grant reason', exact: true }).inputValue(), 'Fictional audited grant draft');
      }
      assert.equal(grantRequests.length, 2);
      assert.match(grantRequests[0].p_request_id, /^[0-9a-f-]{36}$/i);
      assert.equal(grantRequests[1].p_request_id, grantRequests[0].p_request_id, 'Retry keeps the same credit-grant draft idempotency key');
    } finally {
      page.off('request', observeGrant);
    }
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  if (!baseline) {
    await assertReachableControl(grant.getByRole('button', { name: 'Grant 4', exact: true }), 'Grant credits at enlarged text');
    await assertReachableControl(grant.getByRole('button', { name: 'Cancel', exact: true }), 'Cancel credit grant at enlarged text');
  }
  await capture('member-grant-text-200');
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  await grant.getByRole('button', { name: 'Cancel', exact: true }).click();
  if (!baseline) {
    await page.getByRole('alertdialog').getByRole('button', { name: 'Keep writing', exact: true }).click();
    assert.equal(await grant.getByRole('textbox', { name: 'Grant reason', exact: true }).inputValue(), 'Fictional audited grant draft');
    assert.equal(await grant.getByRole('spinbutton', { name: 'Class credits', exact: true }).inputValue(), '4');
    await grant.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Discard draft', exact: true }).click();
    await grant.waitFor({ state: 'hidden' });
  }

  await firstRow().getByRole('button', { name: 'Make admin', exact: true }).click();
  const role = page.getByRole('alertdialog', { name: 'Grant administrator access?', exact: true });
  assert.ok((await role.textContent()).includes('This grants access to member data, bookings, sales, content, and staff controls.'));
  await role.getByRole('button', { name: 'Keep unchanged', exact: true }).click();

  if (!baseline) {
    await page.getByTitle('Log activation follow-up with Directory Member 002', { exact: true }).click();
    const followUp = page.getByRole('dialog', { name: 'Log Follow-up', exact: true });
    const context = followUp.getByRole('textbox', { name: 'Context (optional)', exact: true });
    await followUp.getByLabel('Contact method', { exact: true }).selectOption('phone');
    await context.fill('Fictional callback requested; nothing was sent.');
    await followUp.getByRole('button', { name: 'Cancel', exact: true }).click();
    const discardFollowUp = page.getByRole('alertdialog', { name: 'Discard follow-up draft?', exact: true });
    await discardFollowUp.getByRole('button', { name: 'Keep writing', exact: true }).click();
    assert.equal(await context.inputValue(), 'Fictional callback requested; nothing was sent.');
    assert.equal(await followUp.getByLabel('Contact method', { exact: true }).inputValue(), 'phone');
    await followUp.getByRole('button', { name: 'Mark Contacted', exact: true }).click();
    await followUp.getByRole('alert').filter({ hasText: 'Mutation or unconfigured RPC blocked by local design fixture.' }).waitFor();
    assert.equal(await context.inputValue(), 'Fictional callback requested; nothing was sent.', 'Rejected follow-up log retains staff context');
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await assertReachableControl(followUp.getByRole('button', { name: 'Mark Contacted', exact: true }), 'Record manual follow-up at enlarged text');
    await capture('member-follow-up-text-200');
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    await followUp.getByRole('button', { name: 'Cancel', exact: true }).click();
    await discardFollowUp.getByRole('button', { name: 'Discard draft', exact: true }).click();
    await followUp.waitFor({ state: 'hidden' });
  }

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV', exact: true }).click();
  const download = await downloadPromise;
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  const csv = Buffer.concat(chunks).toString('utf8');
  assert.equal((csv.match(/directory\.member\.\d{3}@example\.invalid/g) || []).length, 112, 'Member CSV includes all server pages');
  assert.ok(!csv.includes('Fictional staff note'), 'Private notes stay out of directory exports');

  await page.getByLabel('Search members', { exact: true }).fill('Member 10');
  await page.getByRole('combobox', { name: 'Filter members by role', exact: true }).selectOption('member');
  await page.getByRole('combobox', { name: 'Filter members by credits', exact: true }).selectOption('available');
  await memberLabel('Directory Member 101').waitFor();
  assert.equal(await memberLabel('Directory Member 100').count(), 0);
  await capture('members-filtered');
  await page.getByLabel('Search members', { exact: true }).fill('Nobody matches this fixture');
  await page.getByText('No matches', { exact: true }).waitFor();
  await page.getByLabel('Search members', { exact: true }).fill('');
  await page.getByRole('combobox', { name: 'Filter members by role', exact: true }).selectOption(baseline ? 'all' : '');
  await page.getByRole('combobox', { name: 'Filter members by credits', exact: true }).selectOption(baseline ? 'all' : '');
  await memberLabel(memberName).waitFor();

  failures.admin_list_members_page = Number.POSITIVE_INFINITY;
  await page.getByRole('button', { name: 'Refresh members', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Fixture class service temporarily unavailable.' }).waitFor();
  assert.equal(await page.getByText('No members yet', { exact: true }).count(), 0);
  await capture('members-read-error');
  failures.admin_list_members_page = 0;
  await page.getByRole('button', { name: /^Retry( loading data)?$/ }).click();
  await memberLabel(memberName).waitFor();
  if (!baseline) {
    const workspace = page.locator('.members-workspace').first();
    await workspace.evaluate(element => { element.style.maxWidth = '384px'; });
    await page.getByRole('button', { name: 'Compact density', exact: true }).click();
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    const openMember = firstRow().getByRole('button', { name: memberName, exact: true });
    await openMember.scrollIntoViewIfNeeded();
    await assertReachableControl(openMember, 'Open member record in a narrow compact column');
    assert.ok((await workspace.boundingBox()).width <= 385);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await capture('members-narrow-compact-text-200');
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; document.querySelector('.members-workspace')?.style.removeProperty('max-width'); });
    const targetId = '20000000-0000-4000-8000-000000000112';
    await page.goto(origin + `/admin/gym-members?member=${targetId}&member-search=Member%2010&member-role=admin&member-credit=none&source=member-proof#retained-context`, { waitUntil: 'networkidle' });
    const target = page.getByRole('dialog', { name: 'Directory Member 112', exact: true });
    await target.waitFor();
    await page.waitForURL(url => !url.searchParams.has('member'));
    assert.equal(await page.getByLabel('Search members', { exact: true }).inputValue(), 'Member 10');
    assert.equal(await page.getByLabel('Filter members by role', { exact: true }).inputValue(), 'admin');
    assert.equal(await page.getByLabel('Filter members by credits', { exact: true }).inputValue(), 'none');
    assert.equal(new URL(page.url()).searchParams.get('source'), 'member-proof');
    assert.equal(new URL(page.url()).hash, '#retained-context');
    assert.equal(await target.getByText('Fictional staff note: prefers a clear session overview.', { exact: true }).count(), 0, 'Off-page intent never shows another member record');
    await capture('member-off-page-intent');
    await target.getByRole('button', { name: 'Close member detail', exact: true }).click();
  }
}
