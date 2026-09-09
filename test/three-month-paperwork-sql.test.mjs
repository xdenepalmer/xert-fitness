import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { startThreeMonthMembershipCheckout } from '../api/checkout.js';
import {
  CASUAL_PEQ_FORM_ID,
  MEMBER_PEQ_FORM_ID,
  TERMS_FORM_ID,
  VALID_SIGNATURE,
  createPaperworkDatabase,
  insertPaperworkResponse,
  memberAnswers,
  paperworkSnapshot,
  pgliteMembershipAdmin,
  termsAnswers,
} from './helpers/three-month-paperwork-sql.mjs';

const QUESTIONNAIRE_ID = '11111111-1111-4111-8111-111111111111';
const AGREEMENT_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_ID = '33333333-3333-4333-8333-333333333333';
const visitor = {
  action: 'three_month_membership',
  first_name: 'Alex',
  last_name: 'Example',
  email: 'alex@example.invalid',
  phone: '0400 111 222',
  already_signed: false,
  questionnaire_response_id: QUESTIONNAIRE_ID,
  agreement_response_id: AGREEMENT_ID,
};

let db;

before(async () => { db = await createPaperworkDatabase(); });
beforeEach(async () => { await db.exec('truncate table public.xert_form_responses'); });
after(async () => { await db.close(); });

async function insertValidPair({
  questionnaireId = QUESTIONNAIRE_ID,
  agreementId = AGREEMENT_ID,
  questionnaire = {},
  agreement = {},
} = {}) {
  await insertPaperworkResponse(db, {
    id: questionnaireId,
    formId: MEMBER_PEQ_FORM_ID,
    answers: memberAnswers(),
    ...questionnaire,
  });
  await insertPaperworkResponse(db, {
    id: agreementId,
    formId: TERMS_FORM_ID,
    answers: termsAnswers(),
    ...agreement,
  });
}

async function checkout(overrides = {}) {
  const created = [];
  const stripe = { checkout: { sessions: { async create(parameters) {
    created.push(parameters);
    return { url: 'https://checkout.stripe.com/c/pay/cs_test_paperwork' };
  } } } };
  const promise = startThreeMonthMembershipCheckout({
    payload: { ...visitor, ...overrides },
    admin: pgliteMembershipAdmin(db),
    stripe,
    origin: 'https://xertfitness.com.au',
    now: Date.parse('2026-09-09T00:00:00Z'),
  });
  return { promise, created };
}

test('a declined, unsigned terms response does not count as already-signed paperwork', async () => {
  await insertPaperworkResponse(db, {
    id: QUESTIONNAIRE_ID,
    formId: MEMBER_PEQ_FORM_ID,
    answers: memberAnswers(),
  });
  await insertPaperworkResponse(db, {
    id: AGREEMENT_ID,
    formId: TERMS_FORM_ID,
    answers: termsAnswers({ accepted: 'I decline', signature: null }),
  });

  const { rows } = await db.query(
    'select public.xert_membership_paperwork_signed($1) as proof',
    ['alex@example.invalid'],
  );
  assert.deepEqual(rows[0].proof, { questionnaire: true, agreement: false });
});

test('the real checkout handler accepts a valid member pair and never substitutes the casual PEQ proof', async () => {
  await insertValidPair();
  const attempt = await checkout();
  await attempt.promise;
  assert.equal(attempt.created.length, 1);
  assert.equal(attempt.created[0].metadata.xert_paperwork_verified, undefined);
});

test('the checkout proof requires the exact completed member PEQ and accepted agreement records', async () => {
  await insertValidPair();
  const { rows } = await db.query(`
    select public.xert_membership_checkout_paperwork_completed($1, $2, $3, $4, $5) as proof
  `, [QUESTIONNAIRE_ID, AGREEMENT_ID, '\t ALEX \n example \r', ' ALEX@EXAMPLE.INVALID ', '+61 400 111 222']);
  assert.equal(rows[0].proof, true);

  await db.exec('truncate table public.xert_form_responses');
  await insertValidPair({ questionnaire: { formId: CASUAL_PEQ_FORM_ID } });
  const casual = await db.query(`
    select public.xert_membership_checkout_paperwork_completed($1, $2, $3, $4, $5) as proof
  `, [QUESTIONNAIRE_ID, AGREEMENT_ID, 'Alex Example', 'alex@example.invalid', '0400111222']);
  assert.equal(casual.rows[0].proof, false);

  await db.exec('truncate table public.xert_form_responses');
  await insertValidPair({ agreement: { formId: MEMBER_PEQ_FORM_ID } });
  const wrongAgreementForm = await db.query(`
    select public.xert_membership_checkout_paperwork_completed($1, $2, $3, $4, $5) as proof
  `, [QUESTIONNAIRE_ID, AGREEMENT_ID, 'Alex Example', 'alex@example.invalid', '0400111222']);
  assert.equal(wrongAgreementForm.rows[0].proof, false);
});

test('declined, unsigned, malformed and historically repurposed terms records are rejected', async () => {
  const cases = [
    { label: 'declined with leftover signature', answers: termsAnswers({ accepted: 'I decline' }) },
    { label: 'missing signature', answers: termsAnswers({ signature: null }) },
    { label: 'invalid signature', answers: termsAnswers({ signature: 'Alex Example' }) },
    {
      label: 'repurposed snapshot',
      answers: termsAnswers(),
      snapshot: { version: 1, title: 'Old questionnaire', questions: [{ id: 'tc-signature', type: 'short_text' }] },
    },
  ];
  for (const item of cases) {
    await db.exec('truncate table public.xert_form_responses');
    await insertValidPair({ agreement: item });
    const { rows } = await db.query(`
      select public.xert_membership_checkout_paperwork_completed($1, $2, $3, $4, $5) as proof
    `, [QUESTIONNAIRE_ID, AGREEMENT_ID, 'Alex Example', 'alex@example.invalid', '0400111222']);
    assert.equal(rows[0].proof, false, item.label);
  }
});

test('missing or invalid PEQ signature evidence is rejected', async () => {
  for (const signature of [null, '', 'not-an-image', 'data:image/png;base64,***']) {
    await db.exec('truncate table public.xert_form_responses');
    await insertValidPair({ questionnaire: { answers: memberAnswers({ signature }) } });
    const { rows } = await db.query(`
      select public.xert_membership_checkout_paperwork_completed($1, $2, $3, $4, $5) as proof
    `, [QUESTIONNAIRE_ID, AGREEMENT_ID, 'Alex Example', 'alex@example.invalid', '0400111222']);
    assert.equal(rows[0].proof, false, String(signature));
  }
});

test('purchaser identity and the typed terms member name must all match', async () => {
  const cases = [
    ['different name', ['Other Person', 'alex@example.invalid', '0400111222']],
    ['different email', ['Alex Example', 'other@example.invalid', '0400111222']],
    ['different phone', ['Alex Example', 'alex@example.invalid', '0400999888']],
  ];
  for (const [label, identity] of cases) {
    await db.exec('truncate table public.xert_form_responses');
    await insertValidPair();
    const { rows } = await db.query(`
      select public.xert_membership_checkout_paperwork_completed($1, $2, $3, $4, $5) as proof
    `, [QUESTIONNAIRE_ID, AGREEMENT_ID, ...identity]);
    assert.equal(rows[0].proof, false, label);
  }

  await db.exec('truncate table public.xert_form_responses');
  await insertValidPair({ agreement: { answers: termsAnswers({ memberName: 'Other Person' }) } });
  const typedName = await db.query(`
    select public.xert_membership_checkout_paperwork_completed($1, $2, $3, $4, $5) as proof
  `, [QUESTIONNAIRE_ID, AGREEMENT_ID, 'Alex Example', 'alex@example.invalid', '0400111222']);
  assert.equal(typedName.rows[0].proof, false);
});

test('terms phone is optional, but when present it must match an Australian equivalent', async () => {
  for (const termsPhone of [null, '', '0400 111 222', '61400111222', '+61 400 111 222']) {
    await db.exec('truncate table public.xert_form_responses');
    await insertValidPair({ agreement: { phone: termsPhone } });
    const { rows } = await db.query(`
      select public.xert_membership_checkout_paperwork_completed($1, $2, $3, $4, $5) as proof
    `, [QUESTIONNAIRE_ID, AGREEMENT_ID, 'Alex Example', 'alex@example.invalid', '0400111222']);
    assert.equal(rows[0].proof, true, String(termsPhone));
  }

  await db.exec('truncate table public.xert_form_responses');
  for (const termsPhone of ['0400 999 888', 'not-a-phone']) {
    await db.exec('truncate table public.xert_form_responses');
    await insertValidPair({ agreement: { phone: termsPhone } });
    const mismatch = await db.query(`
      select public.xert_membership_checkout_paperwork_completed($1, $2, $3, $4, $5) as proof
    `, [QUESTIONNAIRE_ID, AGREEMENT_ID, 'Alex Example', 'alex@example.invalid', '0400111222']);
    assert.equal(mismatch.rows[0].proof, false, termsPhone);
  }
});

test('all Australian purchaser and PEQ phone forms normalize to the same value', async () => {
  for (const purchaserPhone of ['0400111222', '61400111222', '+61400111222', '+61 400 111 222']) {
    await db.exec('truncate table public.xert_form_responses');
    await insertValidPair({ questionnaire: { phone: '04 0011 1222', answers: memberAnswers({ phone: '+61400111222' }) } });
    const { rows } = await db.query(`
      select public.xert_membership_checkout_paperwork_completed($1, $2, $3, $4, $5) as proof
    `, [QUESTIONNAIRE_ID, AGREEMENT_ID, 'Alex Example', 'alex@example.invalid', purchaserPhone]);
    assert.equal(rows[0].proof, true, purchaserPhone);
  }
});

test('missing, blank and malformed identity inputs fail closed', async () => {
  await insertValidPair();
  const cases = [
    [null, 'alex@example.invalid', '0400111222'],
    ['', 'alex@example.invalid', '0400111222'],
    ['   ', 'alex@example.invalid', '0400111222'],
    ['Alex Example', null, '0400111222'],
    ['Alex Example', '', '0400111222'],
    ['Alex Example', 'not-an-email', '0400111222'],
    ['Alex Example', 'alex@example.invalid', null],
    ['Alex Example', 'alex@example.invalid', ''],
    ['Alex Example', 'alex@example.invalid', 'not-a-phone'],
  ];
  for (const identity of cases) {
    const { rows } = await db.query(`
      select public.xert_membership_checkout_paperwork_completed($1, $2, $3, $4, $5) as proof
    `, [QUESTIONNAIRE_ID, AGREEMENT_ID, ...identity]);
    assert.equal(rows[0].proof, false, JSON.stringify(identity));
  }
});

test('archived, future, incomplete, wrong-ID and duplicate records fail closed', async () => {
  const variants = [
    ['archived PEQ', { questionnaire: { archivedAt: '2026-09-08T01:00:00Z' } }],
    ['future agreement', { agreement: { completedAt: '2099-01-01T00:00:00Z' } }],
    ['incomplete PEQ', { questionnaire: { completedAt: null } }],
  ];
  for (const [label, options] of variants) {
    await db.exec('truncate table public.xert_form_responses');
    await insertValidPair(options);
    const { rows } = await db.query(`
      select public.xert_membership_checkout_paperwork_completed($1, $2, $3, $4, $5) as proof
    `, [QUESTIONNAIRE_ID, AGREEMENT_ID, 'Alex Example', 'alex@example.invalid', '0400111222']);
    assert.equal(rows[0].proof, false, label);
  }

  await db.exec('truncate table public.xert_form_responses');
  await insertValidPair();
  for (const ids of [[OTHER_ID, AGREEMENT_ID], [QUESTIONNAIRE_ID, OTHER_ID], [QUESTIONNAIRE_ID, QUESTIONNAIRE_ID]]) {
    const { rows } = await db.query(`
      select public.xert_membership_checkout_paperwork_completed($1, $2, $3, $4, $5) as proof
    `, [...ids, 'Alex Example', 'alex@example.invalid', '0400111222']);
    assert.equal(rows[0].proof, false, ids.join('/'));
  }
});

test('old but valid signed records remain usable', async () => {
  await insertValidPair({
    questionnaire: { completedAt: '2020-01-01T00:00:00Z' },
    agreement: { completedAt: '2020-01-02T00:00:00Z' },
  });
  const { rows } = await db.query(`
    select public.xert_membership_checkout_paperwork_completed($1, $2, $3, $4, $5) as proof
  `, [QUESTIONNAIRE_ID, AGREEMENT_ID, 'Alex Example', 'alex@example.invalid', '0400111222']);
  assert.equal(rows[0].proof, true);
});

test('already-signed lookup distinguishes genuine, declined, unsigned and empty-email records', async () => {
  await insertValidPair();
  let result = await db.query('select public.xert_membership_paperwork_signed($1) as proof', ['alex@example.invalid']);
  assert.deepEqual(result.rows[0].proof, { questionnaire: true, agreement: true });

  await db.exec('truncate table public.xert_form_responses');
  await insertValidPair({ agreement: { answers: termsAnswers({ accepted: 'I decline' }) } });
  result = await db.query('select public.xert_membership_paperwork_signed($1) as proof', ['alex@example.invalid']);
  assert.deepEqual(result.rows[0].proof, { questionnaire: true, agreement: false });

  await db.exec('truncate table public.xert_form_responses');
  await insertValidPair({ questionnaire: { answers: memberAnswers({ signature: null }) } });
  result = await db.query('select public.xert_membership_paperwork_signed($1) as proof', ['alex@example.invalid']);
  assert.deepEqual(result.rows[0].proof, { questionnaire: false, agreement: true });

  await db.exec('truncate table public.xert_form_responses');
  await insertValidPair({
    questionnaire: { email: '', answers: memberAnswers({ email: '' }) },
    agreement: { email: '' },
  });
  result = await db.query('select public.xert_membership_paperwork_signed($1) as proof', ['']);
  assert.deepEqual(result.rows[0].proof, { questionnaire: false, agreement: false });
});

test('only service_role can execute the new proof helpers and RPC', async () => {
  const invocations = [
    "select public.xert_paperwork_normalized_name(' Alex Example ')",
    "select public.xert_paperwork_normalized_email('alex@example.invalid')",
    "select public.xert_paperwork_normalized_phone('0400111222')",
    "select public.xert_paperwork_snapshot_has_question('{}'::jsonb, 'id', 'signature')",
    `select public.xert_membership_checkout_paperwork_completed(
      '${QUESTIONNAIRE_ID}'::uuid, '${AGREEMENT_ID}'::uuid,
      'Alex Example', 'alex@example.invalid', '0400111222'
    )`,
  ];

  const publicGrants = await db.query(`
    select count(*)::integer as count
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where (p.proname like 'xert_paperwork_%'
        or p.proname = 'xert_membership_checkout_paperwork_completed')
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  `);
  assert.equal(publicGrants.rows[0].count, 0, 'PUBLIC has no execute grant on proof helpers');

  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    try {
      for (const invocation of invocations) {
        await assert.rejects(db.query(invocation), /permission denied for function/);
      }
    } finally {
      await db.exec('reset role');
    }
  }

  await db.exec('set role service_role');
  try {
    for (const invocation of invocations) await db.query(invocation);
  } finally {
    await db.exec('reset role');
  }
});

test('proof rejection is actionable and never reaches Stripe', async () => {
  await insertValidPair({ agreement: { answers: termsAnswers({ accepted: 'I decline', signature: VALID_SIGNATURE }) } });
  const attempt = await checkout();
  await assert.rejects(attempt.promise, /questionnaire and membership agreement.*same contact details/i);
  assert.equal(attempt.created.length, 0);
});

test('wrong or malformed response IDs are rejected by the Node handler before RPC', async () => {
  await insertValidPair();
  for (const overrides of [
    { questionnaire_response_id: undefined },
    { questionnaire_response_id: 'not-a-uuid' },
    { agreement_response_id: undefined },
    { agreement_response_id: 'not-a-uuid' },
  ]) {
    const attempt = await checkout(overrides);
    await assert.rejects(attempt.promise, /questionnaire and membership agreement/i);
    assert.equal(attempt.created.length, 0);
  }
});

test('snapshot checks use expected answer types rather than trusting an ID alone', async () => {
  await insertValidPair({
    questionnaire: {
      snapshot: {
        ...paperworkSnapshot('member'),
        questions: [{ id: '576cbb02-2819-488f-a7d8-1719d8d53840', type: 'short_text' }],
      },
    },
  });
  const { rows } = await db.query(`
    select public.xert_membership_checkout_paperwork_completed($1, $2, $3, $4, $5) as proof
  `, [QUESTIONNAIRE_ID, AGREEMENT_ID, 'Alex Example', 'alex@example.invalid', '0400111222']);
  assert.equal(rows[0].proof, false);
});
