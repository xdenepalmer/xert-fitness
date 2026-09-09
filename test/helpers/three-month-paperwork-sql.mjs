import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

export const MEMBER_PEQ_FORM_ID = '000cc2da-1c51-59bf-a33e-c76bee4d7188';
export const CASUAL_PEQ_FORM_ID = 'e90f30f7-b0d2-56e7-8e1d-8b290721e234';
export const TERMS_FORM_ID = '0173f880-7bee-4a2e-bb0c-ac15af40ad9e';
export const NAME_ANSWER_ID = '84703ad7-a28d-4904-9868-6c832ce38055';
export const EMAIL_ANSWER_ID = 'e4c4e161-43e3-5462-a865-f27c411ac809';
export const PHONE_ANSWER_ID = '5d5d7d53-d5ea-4743-8f94-22ecd5fd6ded';
export const SIGNATURE_ANSWER_ID = '576cbb02-2819-488f-a7d8-1719d8d53840';
export const VALID_SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
export const ACCEPTED_TERMS = 'I accept the Terms and Conditions';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

function functionDefinition(sql, name) {
  const marker = `create or replace function ${name}`;
  const start = sql.toLowerCase().indexOf(marker);
  if (start < 0) throw new Error(`Missing actual migration function ${name}`);
  const bodyStart = sql.indexOf('as $$', start);
  const end = sql.indexOf('$$;', bodyStart);
  if (bodyStart < 0 || end < 0) throw new Error(`Incomplete actual migration function ${name}`);
  return sql.slice(start, end + 3);
}

export function paperworkSnapshot(kind = 'member') {
  const questions = kind === 'terms'
    ? [
      { id: 'tc-accept', type: 'single_choice' },
      { id: 'tc-member-name', type: 'short_text' },
      { id: 'tc-signature', type: 'signature' },
    ]
    : [
      { id: NAME_ANSWER_ID, type: 'name_fields' },
      { id: EMAIL_ANSWER_ID, type: 'email' },
      { id: PHONE_ANSWER_ID, type: 'phone' },
      { id: SIGNATURE_ANSWER_ID, type: 'signature' },
    ];
  return { version: 1, title: kind === 'terms' ? 'Membership terms' : 'Member PEQ', questions };
}

export async function createPaperworkDatabase({ applyRepair = true } = {}) {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create table public.xert_form_responses (
      id uuid primary key,
      form_id uuid not null,
      answers jsonb not null default '{}'::jsonb,
      respondent_name text,
      respondent_email text,
      respondent_phone text,
      completed_at timestamptz,
      archived_at timestamptz,
      form_snapshot jsonb not null
    );
  `);

  const snapshotMigration = await read('../../supabase/migrations/20260813010000_xert_form_response_snapshots.sql');
  const visitorMigration = await read('../../supabase/migrations/20260908010000_three_day_visitor_pass.sql');
  const membershipMigration = await read('../../supabase/migrations/20260908060000_three_month_membership.sql');
  await db.exec(functionDefinition(snapshotMigration, 'public.xert_valid_form_signature'));
  await db.exec(functionDefinition(visitorMigration, 'public.xert_visitor_questionnaire_completed'));
  await db.exec(functionDefinition(membershipMigration, 'public.xert_membership_paperwork_signed'));
  await db.exec(`
    revoke all on function public.xert_valid_form_signature(text) from public, anon, authenticated;
    grant execute on function public.xert_valid_form_signature(text) to service_role;
    revoke all on function public.xert_visitor_questionnaire_completed(uuid, text, text, text) from public, anon, authenticated;
    grant execute on function public.xert_visitor_questionnaire_completed(uuid, text, text, text) to service_role;
    revoke all on function public.xert_membership_paperwork_signed(text) from public, anon, authenticated;
    grant execute on function public.xert_membership_paperwork_signed(text) to service_role;
    grant select on table public.xert_form_responses to service_role;
  `);

  if (applyRepair) {
    const repairMigration = await read('../../supabase/migrations/20260909081702_three_month_paperwork_proof.sql');
    if (repairMigration.trim()) await db.exec(repairMigration);
  }
  return db;
}

export async function insertPaperworkResponse(db, {
  id,
  formId,
  name = 'Alex Example',
  email = 'alex@example.invalid',
  phone = '0400 111 222',
  answers = {},
  snapshot = paperworkSnapshot(formId === TERMS_FORM_ID ? 'terms' : 'member'),
  completedAt = '2026-09-08T00:00:00Z',
  archivedAt = null,
}) {
  await db.query(`
    insert into public.xert_form_responses (
      id, form_id, answers, respondent_name, respondent_email, respondent_phone,
      completed_at, archived_at, form_snapshot
    ) values ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9::jsonb)
  `, [id, formId, JSON.stringify(answers), name, email, phone, completedAt, archivedAt, JSON.stringify(snapshot)]);
}

export function memberAnswers({
  first = 'Alex', last = 'Example', email = 'alex@example.invalid', phone = '0400 111 222',
  signature = VALID_SIGNATURE,
} = {}) {
  return {
    [NAME_ANSWER_ID]: { first, last },
    [EMAIL_ANSWER_ID]: email,
    [PHONE_ANSWER_ID]: phone,
    [SIGNATURE_ANSWER_ID]: signature,
  };
}

export function termsAnswers({
  accepted = ACCEPTED_TERMS, memberName = 'Alex Example', signature = VALID_SIGNATURE,
} = {}) {
  return { 'tc-accept': accepted, 'tc-member-name': memberName, 'tc-signature': signature };
}

export function pgliteMembershipAdmin(db, { settingsError = null } = {}) {
  return {
    from(table) {
      const query = {
        select() { return query; },
        eq() { return query; },
        limit() { return query; },
        async maybeSingle() {
          if (table === 'admin_settings') {
            return settingsError
              ? { data: null, error: settingsError }
              : { data: { casual_payments_enabled: true, three_month_price_cents: 43000 }, error: null };
          }
          return { data: { capability: 'three_month_membership' }, error: null };
        },
      };
      return query;
    },
    async rpc(name, args) {
      try {
        if (name === 'xert_visitor_questionnaire_completed') {
          const result = await db.query(`select public.xert_visitor_questionnaire_completed($1, $2, $3, $4) as value`, [
            args.p_response_id, args.p_name, args.p_email, args.p_phone,
          ]);
          return { data: result.rows[0].value, error: null };
        }
        if (name === 'xert_membership_checkout_paperwork_completed') {
          const result = await db.query(`select public.xert_membership_checkout_paperwork_completed($1, $2, $3, $4, $5) as value`, [
            args.p_questionnaire_response_id, args.p_agreement_response_id,
            args.p_name, args.p_email, args.p_phone,
          ]);
          return { data: result.rows[0].value, error: null };
        }
        if (name === 'xert_membership_paperwork_signed') {
          const result = await db.query('select public.xert_membership_paperwork_signed($1) as value', [args.p_email]);
          return { data: result.rows[0].value, error: null };
        }
        throw new Error(`Unexpected RPC ${name}`);
      } catch (error) {
        return { data: null, error };
      }
    },
  };
}
