// Publishes both pre-exercise questionnaires from the repo definitions:
// the membership one that leads into the terms agreement, and the casual-visit
// one that does not. Creates each on first run and updates it in place after,
// keeping the same id, slug and responses.
//
//   node scripts/apply-xert-peq-form.mjs            # dry run
//   node scripts/apply-xert-peq-form.mjs --apply

import {
  XERT_CASUAL_PEQ_FORM_DEFINITION, XERT_CASUAL_PEQ_FORM_ID,
  XERT_PEQ_FORM_DEFINITION, XERT_PEQ_FORM_ID, validateXertPeqFormDefinition,
} from '../src/lib/xertPeqForm.js';

const apply = process.argv.includes('--apply');
const supabaseURL = process.env.XERT_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.XERT_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseURL || !serviceRoleKey) {
  throw new Error('Set XERT_SUPABASE_URL and XERT_SUPABASE_SERVICE_ROLE_KEY before running this script.');
}

const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  'Content-Type': 'application/json',
};
const selection = 'id,title,slug,updated_at,response_count,is_active';

async function readJSON(response, what) {
  if (!response.ok) throw new Error(`${what} failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  return response.json();
}

async function publish(id, definition) {
  const definitionError = validateXertPeqFormDefinition(definition);
  if (definitionError) throw new Error(`${definition.slug}: ${definitionError}`);

  const lookup = new URL('/rest/v1/xert_forms', supabaseURL);
  lookup.searchParams.set('id', `eq.${id}`);
  lookup.searchParams.set('select', selection);
  const [current] = await readJSON(await fetch(lookup, { headers }), `Inspecting ${definition.slug}`);

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'check',
    action: current ? 'update' : 'create',
    id,
    slug: definition.slug,
    fields: definition.questions.length,
    responseCountPreserved: current?.response_count ?? 0,
  }, null, 2));
  if (!apply) return;

  if (current) {
    const patch = new URL('/rest/v1/xert_forms', supabaseURL);
    patch.searchParams.set('id', `eq.${id}`);
    patch.searchParams.set('updated_at', `eq.${current.updated_at}`);
    patch.searchParams.set('select', selection);
    const rows = await readJSON(await fetch(patch, {
      method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(definition),
    }), `Updating ${definition.slug}`);
    if (rows.length !== 1) throw new Error(`${definition.slug} changed during this update. Nothing was overwritten; inspect and retry.`);
    console.log(JSON.stringify({ published: true, ...rows[0] }, null, 2));
    return;
  }

  // A new record needs an explicit owner: the service role has no auth.uid().
  const ownerLookup = new URL('/rest/v1/xert_forms', supabaseURL);
  ownerLookup.searchParams.set('select', 'created_by');
  ownerLookup.searchParams.set('created_by', 'not.is.null');
  ownerLookup.searchParams.set('limit', '1');
  const [owner] = await readJSON(await fetch(ownerLookup, { headers }), 'Finding the form owner');
  const insert = new URL('/rest/v1/xert_forms', supabaseURL);
  insert.searchParams.set('select', selection);
  const rows = await readJSON(await fetch(insert, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({ ...definition, id, is_active: true, created_by: owner?.created_by }),
  }), `Creating ${definition.slug}`);
  console.log(JSON.stringify({ created: true, ...rows[0] }, null, 2));
}

await publish(XERT_PEQ_FORM_ID, XERT_PEQ_FORM_DEFINITION);
await publish(XERT_CASUAL_PEQ_FORM_ID, XERT_CASUAL_PEQ_FORM_DEFINITION);
if (!apply) console.log('Dry run only. Re-run with --apply to publish these definitions.');
