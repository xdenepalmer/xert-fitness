import assert from 'node:assert/strict';
import { XERT_TERMS_FORM_DEFINITION, XERT_TERMS_FORM_ID, TERMS_ACCEPT_OPTION, TERMS_DECLINE_OPTION } from '../../src/lib/xertTermsForm.js';
import { XERT_PEQ_FORM_DEFINITION, XERT_PEQ_FORM_ID } from '../../src/lib/xertPeqForm.js';

export async function checkMembershipPaperwork(page, { origin, requests, capture = async () => {} }) {
  const identity = { name: 'Alex Morgan', email: 'alex@example.invalid', phone: '0400000000', date_of_birth: '1990-01-01', response_id: '11111111-1111-4111-8111-111111111111' };
  const agreementID = '22222222-2222-4222-8222-222222222222';
  const accepted = { response_id: agreementID, agreement_accepted: true };
  const submissions = [];
  const publicFormPattern = '**/rest/v1/rpc/xert_public_form';
  const submitPattern = '**/rest/v1/rpc/submit_xert_form_response_v2';
  const fixtureResponse = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  const publicForm = async route => {
    const slug = route.request().postDataJSON().p_slug;
    const forms = {
      peq: { ...XERT_PEQ_FORM_DEFINITION, id: XERT_PEQ_FORM_ID, follow_on_slug: 'terms-and-conditions' },
      'terms-and-conditions': { ...XERT_TERMS_FORM_DEFINITION, id: XERT_TERMS_FORM_ID, prerequisite_slug: 'peq', prerequisite_title: 'Member questionnaire' },
    };
    await fixtureResponse(route, forms[slug] ? [{ ...forms[slug], updated_at: '2026-09-09T00:00:00Z' }] : []);
  };
  const submit = async route => {
    const payload = route.request().postDataJSON();
    assert.equal(payload.p_slug, 'terms-and-conditions', 'Only fictional terms submissions are allowed by this probe');
    submissions.push(payload);
    await fixtureResponse(route, agreementID);
  };
  await page.route(publicFormPattern, publicForm);
  await page.route(submitPattern, submit);
  try {
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
    await page.goto(origin + '/3months', { waitUntil: 'networkidle' });
    await page.evaluate(() => sessionStorage.clear());
    await page.goto(origin + '/forms/terms-and-conditions?return=3months', { waitUntil: 'networkidle' });
    await page.waitForURL(url => url.pathname === '/forms/peq' && url.searchParams.get('return') === '3months');
    assert.equal(new URL(page.url()).searchParams.get('next'), 'terms-and-conditions', 'Prerequisite preserves both next form and payment return');

    await seed(null);
    await page.getByRole('button', { name: 'Sign the questionnaire and agreement first', exact: true }).click();
    await page.waitForURL(url => url.pathname === '/forms/terms-and-conditions' && url.searchParams.get('return') === '3months');
    assert.equal(checkouts().length, before, 'A questionnaire alone resumes the agreement without opening checkout');

    await seed({ ...accepted, email: 'someone-else@example.invalid' });
    await page.getByRole('button', { name: 'Sign the questionnaire and agreement first', exact: true }).click();
    await page.waitForURL(url => url.pathname === '/forms/terms-and-conditions' && url.searchParams.get('return') === '3months');
    assert.equal(checkouts().length, before, 'Another visitor’s agreement marker cannot skip the agreement');

    await seed({ ...accepted, agreement_accepted: false });
    assert.equal(await page.getByRole('button', { name: 'Pay $430.00', exact: true }).count(), 0, 'A declined agreement cannot present as ready to pay');
    await seed({ response_id: agreementID });
    assert.equal(await page.getByRole('button', { name: 'Pay $430.00', exact: true }).count(), 0, 'An old marker without an acceptance hint resumes the agreement');

    // Complete the real terms UI, including its decline skip rule, with fictional I/O.
    await page.goto(origin + '/forms/terms-and-conditions?return=3months', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByText(TERMS_DECLINE_OPTION, { exact: true }).click();
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    await page.waitForURL(url => url.pathname === '/3months');
    assert.equal(submissions.at(-1).p_answers['tc-accept'], TERMS_DECLINE_OPTION);
    assert.equal(submissions.at(-1).p_answers['tc-signature'], undefined, 'Decline does not produce a signature');
    assert.equal(await page.getByRole('button', { name: 'Pay $430.00', exact: true }).count(), 0);
    await capture('membership-declined-terms');

    await page.getByRole('button', { name: 'Sign the questionnaire and agreement first', exact: true }).click();
    await page.waitForURL(url => url.pathname === '/forms/terms-and-conditions');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByText(TERMS_ACCEPT_OPTION, { exact: true }).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    assert.equal(await page.locator('main input[type="text"]').inputValue(), 'Alex Morgan', 'Participant name carries from questionnaire');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const pad = page.getByLabel('Signature pad');
    await pad.scrollIntoViewIfNeeded();
    const bounds = await pad.boundingBox();
    await page.mouse.move(bounds.x + 25, bounds.y + 50);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 110, bounds.y + 80, { steps: 5 });
    await page.mouse.up();
    await page.getByText('Signature captured', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    await page.waitForURL(url => url.pathname === '/3months');
    assert.equal(submissions.at(-1).p_answers['tc-accept'], TERMS_ACCEPT_OPTION);
    assert.match(submissions.at(-1).p_answers['tc-signature'], /^data:image\/png;base64,/);
    const marker = await page.evaluate(() => JSON.parse(sessionStorage.getItem('xert-form-complete:terms-and-conditions')));
    assert.equal(marker.agreement_accepted, true, 'Real accepted signed submission produces an acceptance hint');
    assert.equal(marker.response_id, agreementID);
    assert.equal('answers' in marker || 'signature' in marker, false, 'No answers/signature copied into completion marker');

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
    assert.equal(payload.agreement_response_id, agreementID, 'Both exact saved response IDs reach server verification');
    assert.equal(checkouts().length, before + 1, 'Both markers enable only the server verification request');
    await page.getByRole('alert').waitFor();

    await seed(accepted);
    await page.getByLabel('Email', { exact: true }).fill('different@example.invalid');
    await page.getByRole('button', { name: 'Sign the questionnaire and agreement first', exact: true }).click();
    await page.waitForURL(url => url.pathname === '/forms/peq');
    assert.equal(checkouts().length, before + 1, 'Editing purchaser identity cannot reuse another person’s markers');
    await page.evaluate(() => {
      sessionStorage.removeItem('xert-form-complete:peq');
      sessionStorage.removeItem('xert-form-complete:terms-and-conditions');
    });
  } finally {
    await page.unroute(publicFormPattern, publicForm);
    await page.unroute(submitPattern, submit);
  }
}
