import assert from 'node:assert/strict';

export async function checkMembershipPaperwork(page, { origin, requests, capture = async () => {} }) {
  const identity = { name: 'Alex Morgan', email: 'alex@example.invalid', phone: '0400000000', response_id: '11111111-1111-4111-8111-111111111111' };
  const seed = async agreement => {
    await page.goto(origin + '/3months', { waitUntil: 'networkidle' });
    await page.evaluate(({ identity, agreement }) => {
      const marker = { ...identity, at: Date.now() };
      sessionStorage.setItem('xert-form-complete:peq', JSON.stringify(marker));
      sessionStorage.removeItem('xert-form-complete:terms-and-conditions');
      if (agreement) sessionStorage.setItem('xert-form-complete:terms-and-conditions', JSON.stringify({ ...marker, ...agreement }));
    }, { identity, agreement });
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.getByLabel('First name', { exact: true }).inputValue(), 'Alex');
  };
  const checkouts = () => requests.filter(request => request.path === '/api/checkout');
  const before = checkouts().length;
  await seed(null);
  await page.getByRole('button', { name: 'Sign the questionnaire and agreement first', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/forms/terms-and-conditions' && url.searchParams.get('return') === '3months');
  assert.equal(checkouts().length, before, 'A questionnaire alone resumes the agreement without opening checkout');

  await seed({ email: 'someone-else@example.invalid' });
  await page.getByRole('button', { name: 'Sign the questionnaire and agreement first', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/forms/terms-and-conditions' && url.searchParams.get('return') === '3months');
  assert.equal(checkouts().length, before, 'Another visitor’s agreement marker cannot skip the agreement');

  await seed({ response_id: '22222222-2222-4222-8222-222222222222' });
  const pay = page.getByRole('button', { name: 'Pay $430.00', exact: true });
  await pay.waitFor();
  await capture('membership-both-markers-ready');
  // The fixture returns 403 here; there is no Stripe connection or real charge.
  const blocked = page.waitForResponse(response => new URL(response.url()).pathname === '/api/checkout' && response.status() === 403);
  await pay.click();
  const response = await blocked;
  const payload = response.request().postDataJSON();
  assert.equal(payload.action, 'three_month_membership');
  assert.equal(payload.already_signed, false);
  assert.equal(payload.questionnaire_response_id, identity.response_id);
  assert.equal(checkouts().length, before + 1, 'Both markers enable only the server verification request');
  await page.getByRole('alert').waitFor();
  await page.evaluate(() => {
    sessionStorage.removeItem('xert-form-complete:peq');
    sessionStorage.removeItem('xert-form-complete:terms-and-conditions');
  });
}
