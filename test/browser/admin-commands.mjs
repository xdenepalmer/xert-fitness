import assert from 'node:assert/strict';
import { commandIds } from '../fixtures/admin-command-data.mjs';

// These tests run only with the in-memory command fixture, never live records.
export async function checkAdminCommands(page, { mutations, failures, requests, capture = async () => {} }) {
  const palette = page.getByRole('dialog', { name: 'Find an owner task', exact: true });
  const open = async label => {
    await page.keyboard.press('Control+k');
    await palette.waitFor();
    await palette.getByRole('combobox').fill(label);
    await palette.getByRole('option').filter({ hasText: label }).first().click();
    await palette.getByRole('heading', { name: label, exact: true }).waitFor();
  };
  const close = async () => {
    await page.keyboard.press('Escape');
    await palette.waitFor({ state: 'hidden' });
  };
  const writes = name => mutations.filter(row => row.name === name);
  const future = () => palette.getByRole('button', { name: /^Foundation Strength/ });
  const past = () => palette.getByRole('button', { name: /^Completed Strength/ });

  // A failed roster is not an empty, successfully loaded roll. Retry is explicit.
  await open('Mark attendance');
  failures.admin_session_roster = 1;
  await future().click();
  await palette.getByRole('alert').filter({ hasText: /temporarily unavailable/i }).waitFor();
  assert.equal(await palette.getByRole('button', { name: 'Review attendance', exact: true }).isDisabled(), true);
  await palette.getByRole('button', { name: 'Retry loading', exact: true }).click();
  await palette.getByRole('alert').filter({ hasText: /outstanding member booking requests/i }).waitFor();
  assert.equal(writes('admin_record_session_attendance').length, 0);
  await close();

  await open('Confirm booking');
  await future().click();
  await palette.getByRole('button', { name: 'Jordan Lee · requested', exact: true }).click();
  await capture('booking-review');
  assert.equal(writes('admin_set_booking_status_with_notice').length, 0, 'Review does not confirm a booking');
  failures.admin_set_booking_status_with_notice = 1;
  await palette.getByRole('button', { name: 'Confirm reviewed booking', exact: true }).click();
  await palette.getByRole('alert').filter({ hasText: /temporarily unavailable/i }).waitFor();
  assert.equal(writes('admin_set_booking_status_with_notice').length, 0, 'Failed confirmation does not report success');
  await palette.getByRole('button', { name: 'Confirm reviewed booking', exact: true }).click();
  await palette.getByRole('status').filter({ hasText: /Booking confirmed/i }).waitFor();
  assert.equal(writes('admin_set_booking_status_with_notice').length, 1);
  assert.equal(writes('admin_set_booking_status_with_notice')[0].body.p_booking_id, commandIds.request);
  assert.equal(await palette.getByRole('button', { name: /undo/i }).count(), 0, 'Booking notices have no fake Undo');
  await close();

  await open('Add attendee');
  await future().click();
  await palette.getByLabel('Find member', { exact: true }).fill('Reese');
  await palette.getByRole('button', { name: 'Reese Taylor · Member', exact: true }).click();
  assert.equal(writes('admin_book_member_into_class').length, 0);
  // Rapid repeated activation exercises the synchronously held mutation gate.
  await palette.getByRole('button', { name: 'Confirm reviewed booking', exact: true }).evaluate(button => { button.click(); button.click(); });
  await palette.getByRole('status').filter({ hasText: /Booking confirmed/i }).waitFor();
  assert.equal(writes('admin_book_member_into_class').length, 1, 'Repeated activation books only once');
  assert.equal(writes('admin_book_member_into_class')[0].body.p_member_id, commandIds.reese);
  await close();

  await open('Add attendee');
  await palette.getByRole('button', { name: /^Full Strength/ }).click();
  await palette.getByLabel('Find member', { exact: true }).fill('Reese');
  await palette.getByRole('button', { name: 'Reese Taylor · Member', exact: true }).click();
  await palette.getByRole('button', { name: 'Confirm reviewed booking', exact: true }).click();
  const waitlistResult = palette.getByRole('status');
  await waitlistResult.waitFor();
  assert.match(await waitlistResult.innerText(), /waitlist/i, 'A waitlisted server receipt must not claim a confirmed class place');
  assert.doesNotMatch(await waitlistResult.innerText(), /Booking confirmed/i);
  assert.equal(writes('admin_book_member_into_class').length, 2);
  assert.equal(writes('admin_book_member_into_class')[1].body.p_session_id, commandIds.fullClass);
  await capture('waitlisted-attendee');
  await close();

  // Transport-only substitutes keep the real receipt validation and UI running.
  // A missing or unknown outcome must not become a successfully confirmed place.
  for (const bookingStatus of [undefined, 'cancelled']) {
    const attempted = [];
    const malformedReceipt = async route => {
      if (route.request().method() !== 'POST') return route.fallback();
      const body = route.request().postDataJSON();
      attempted.push(body);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        request_id: body.p_request_id, session_id: body.p_session_id, member_id: body.p_member_id,
        booking_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', booking_status: bookingStatus,
        credit_batch_id: null, announcement_id: null, created_at: '2026-01-01T00:00:00Z',
      }) });
    };
    const endpoint = '**/rest/v1/rpc/admin_book_member_into_class';
    await page.route(endpoint, malformedReceipt);
    try {
      await open('Add attendee');
      await palette.getByRole('button', { name: /^Full Strength/ }).click();
      await palette.getByLabel('Find member', { exact: true }).fill('Reese');
      await palette.getByRole('button', { name: 'Reese Taylor · Member', exact: true }).click();
      await palette.getByRole('button', { name: 'Confirm reviewed booking', exact: true }).click();
      await palette.getByRole('alert').waitFor();
      assert.equal(await palette.getByRole('status').count(), 0, 'An unverifiable booking outcome never reports completion');
      assert.ok((await palette.getByRole('alert').innerText()).trim(), 'Staff can see why the receipt was rejected');
      await palette.getByRole('button', { name: 'Confirm reviewed booking', exact: true }).click();
      await palette.getByRole('alert').waitFor();
      assert.equal(attempted.length, 2);
      assert.ok(attempted[0].p_request_id);
      assert.equal(attempted[1].p_request_id, attempted[0].p_request_id, 'An uncertain receipt retry keeps its idempotency key');
      await close();
    } finally {
      await page.unroute(endpoint, malformedReceipt);
    }
  }

  await open('Mark attendance');
  await past().click();
  const attendance = palette.getByRole('combobox', { name: /Reese Taylor/ });
  await attendance.selectOption('no_show');
  await palette.getByRole('button', { name: 'Review attendance', exact: true }).click();
  assert.equal(writes('admin_record_session_attendance').length, 0);
  failures.admin_record_session_attendance = 1;
  await palette.getByRole('button', { name: 'Save attendance', exact: true }).click();
  await palette.getByRole('alert').filter({ hasText: /temporarily unavailable/i }).waitFor();
  assert.equal(await palette.getByRole('button', { name: 'Undo attendance change', exact: true }).count(), 0, 'Failed save cannot be undone as though successful');
  await palette.getByRole('button', { name: 'Save attendance', exact: true }).click();
  await palette.getByRole('status').filter({ hasText: /Attendance saved for 1/i }).waitFor();
  await capture('attendance-saved');
  assert.deepEqual(writes('admin_record_session_attendance')[0].body.p_no_show_ids, [commandIds.pastBooking]);
  await palette.getByRole('button', { name: 'Undo attendance change', exact: true }).click();
  await palette.getByRole('button', { name: 'Undo attendance change', exact: true }).waitFor({ state: 'hidden' });
  assert.deepEqual(writes('admin_record_session_attendance')[1].body.p_attended_ids, [commandIds.pastBooking], 'Undo restores the reviewed completed roll');
  await close();

  await open('Publish form');
  await palette.getByRole('button', { name: 'Member Feedback', exact: true }).click();
  assert.equal(writes('xert_forms').length, 0, 'Choosing a form only opens its publication review');
  await palette.getByText(/available to the public/).waitFor();
  await capture('publication-review');
  await palette.getByRole('button', { name: 'Publish reviewed form', exact: true }).click();
  await palette.getByRole('status').filter({ hasText: /Published Member Feedback/i }).waitFor();
  assert.equal(writes('xert_forms').length, 1);
  assert.equal(writes('xert_forms')[0].body.is_active, true);
  assert.equal(await palette.getByRole('button', { name: /undo/i }).count(), 0, 'Publication has no fake Undo');
  await close();

  await open('Text tomorrow’s 6:15am');
  await future().click();
  await palette.getByLabel('Message', { exact: true }).fill('Fictional browser verification message. Do not send.');
  await palette.getByRole('button', { name: 'Preview message', exact: true }).click();
  await palette.getByText(/Send this exact message to 2 selected recipients/).waitFor();
  await capture('message-review');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await palette.getByRole('button', { name: 'Send reviewed message', exact: true }).scrollIntoViewIfNeeded();
  await capture('message-review-text-200');
  const bounds = await palette.boundingBox();
  const viewport = page.viewportSize();
  assert.ok(bounds.x >= -1 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y >= -1 && bounds.y + bounds.height <= viewport.height + 1, 'Enlarged command review stays within the viewport');
  assert.equal(await palette.evaluate(element => element.scrollWidth > element.clientWidth + 1), false, 'Enlarged command review has no horizontal clipping');
  const overflowingControls = await palette.evaluate(element => [...element.querySelectorAll('button')].flatMap(button => {
    const box = button.getBoundingClientRect();
    const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if (!walker.currentNode.textContent.trim()) continue;
      if (walker.currentNode.parentElement.closest('.sr-only')) continue;
      const range = document.createRange();
      range.selectNodeContents(walker.currentNode);
      if ([...range.getClientRects()].some(text => text.top < box.top - 1 || text.bottom > box.bottom + 1 || text.left < box.left - 1 || text.right > box.right + 1)) return [button.textContent.trim()];
    }
    return [];
  }));
  assert.deepEqual(overflowingControls, [], 'Enlarged command button text stays inside each growing button');
  for (let index = 0; index < 8; index++) {
    await page.keyboard.press('Tab');
    assert.equal(await palette.evaluate(element => element.contains(document.activeElement)), true, 'Keyboard focus stays inside the command review');
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  assert.equal(requests.filter(row => row.path === '/api/admin-publish-announcement').length, 0, 'Recipient preview does not send SMS');
  await palette.getByRole('button', { name: 'Send reviewed message', exact: true }).click();
  await palette.getByRole('alert').waitFor();
  assert.equal(await palette.getByRole('button', { name: 'Send reviewed message', exact: true }).isDisabled(), true, 'Uncertain delivery blocks blindly resending');
  assert.equal(requests.filter(row => row.path === '/api/admin-publish-announcement' && row.blocked).length, 1, 'SMS endpoint is intercepted and blocked locally');
  await close();

  const preferences = await page.evaluate(() => localStorage.getItem('xert.admin.command-centre.v1'));
  assert.ok(preferences, 'Successful commands record preferences');
  const stored = JSON.parse(preferences);
  assert.ok(stored.history.some(row => row.id === 'confirm-booking'), 'Confirmed command enters recents');
  assert.ok(!preferences.match(/Jordan|Reese|example\.invalid|6149157/), 'Command preferences do not store member PII');
}
