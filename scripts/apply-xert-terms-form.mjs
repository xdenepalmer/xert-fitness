// Publishes the digital terms and conditions form from the repo definition.
// Creates it on first run and updates it in place afterwards, keeping the same
// id, slug and responses, and always pointing it at the PEQ as its
// prerequisite so nobody reaches the agreement without being screened first.
//
//   node scripts/apply-xert-terms-form.mjs            # dry run
//   node scripts/apply-xert-terms-form.mjs --apply

import {
  XERT_TERMS_FORM_DEFINITION, XERT_TERMS_FORM_ID, XERT_TERMS_FORM_PREREQUISITE_ID,
  validateXertTermsFormDefinition,
} from '../src/lib/xertTermsForm.js';

const apply = process.argv.includes('--apply');
const supabaseURL = process.env.XERT_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.XERT_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseURL || !serviceRoleKey) {
  throw new Error('Set XERT_SUPABASE_URL and XERT_SUPABASE_SERVICE_ROLE_KEY before running this script.');
}

const definitionError = validateXertTermsFormDefinition();
if (definitionError) throw new Error(definitionError);

const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  'Content-Type': 'application/json',
};

async function readJSON(response, what) {
  if (!response.ok) throw new Error(`${what} failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  return response.json();
}

const record = {
  ...XERT_TERMS_FORM_DEFINITION,
  prerequisite_form_id: XERT_TERMS_FORM_PREREQUISITE_ID,
};

const lookup = new URL('/rest/v1/xert_forms', supabaseURL);
lookup.searchParams.set('id', `eq.${XERT_TERMS_FORM_ID}`);
lookup.searchParams.set('select', 'id,title,slug,updated_at,response_count,is_active,prerequisite_form_id');
const [current] = await readJSON(await fetch(lookup, { headers }), 'Inspecting the terms form');

// The service role has no auth.uid(), so a new row needs an explicit owner.
// The prerequisite form already belongs to the club owner; match it.
const prerequisiteLookup = new URL('/rest/v1/xert_forms', supabaseURL);
prerequisiteLookup.searchParams.set('id', `eq.${XERT_TERMS_FORM_PREREQUISITE_ID}`);
prerequisiteLookup.searchParams.set('select', 'id,slug,created_by');
const [prerequisite] = await readJSON(await fetch(prerequisiteLookup, { headers }), 'Inspecting the prerequisite form');
if (!prerequisite) throw new Error('The prerequisite form is missing. Publish the PEQ before the terms form.');

console.log(JSON.stringify({
  mode: apply ? 'apply' : 'check',
  action: current ? 'update' : 'create',
  id: XERT_TERMS_FORM_ID,
  slug: record.slug,
  fields: record.questions.length,
  prerequisiteFormId: record.prerequisite_form_id,
  prerequisiteSlug: prerequisite.slug,
  responseCountPreserved: current?.response_count ?? 0,
}, null, 2));

if (!apply) {
  console.log('Dry run only. Re-run with --apply to publish this definition.');
  process.exit(0);
}

let saved;
if (current) {
  const patch = new URL('/rest/v1/xert_forms', supabaseURL);
  patch.searchParams.set('id', `eq.${XERT_TERMS_FORM_ID}`);
  patch.searchParams.set('updated_at', `eq.${current.updated_at}`);
  patch.searchParams.set('select', 'id,slug,updated_at,response_count,is_active,prerequisite_form_id');
  const rows = await readJSON(await fetch(patch, {
    method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(record),
  }), 'Updating the terms form');
  if (rows.length !== 1) throw new Error('The terms form changed during this update. Nothing was overwritten; inspect and retry.');
  [saved] = rows;
} else {
  const insert = new URL('/rest/v1/xert_forms', supabaseURL);
  insert.searchParams.set('select', 'id,slug,updated_at,response_count,is_active,prerequisite_form_id');
  const rows = await readJSON(await fetch(insert, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({ ...record, id: XERT_TERMS_FORM_ID, is_active: true, created_by: prerequisite.created_by }),
  }), 'Creating the terms form');
  [saved] = rows;
}

console.log(JSON.stringify({ published: true, ...saved }, null, 2));
