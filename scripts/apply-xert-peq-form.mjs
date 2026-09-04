import { XERT_PEQ_FORM_DEFINITION, XERT_PEQ_FORM_ID, validateXertPeqFormDefinition } from '../src/lib/xertPeqForm.js';

const apply = process.argv.includes('--apply');
const supabaseURL = process.env.XERT_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.XERT_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseURL || !serviceRoleKey) {
  throw new Error('Set XERT_SUPABASE_URL and XERT_SUPABASE_SERVICE_ROLE_KEY before running this script.');
}

const definitionError = validateXertPeqFormDefinition();
if (definitionError) throw new Error(definitionError);

const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  'Content-Type': 'application/json',
};
const endpoint = new URL('/rest/v1/xert_forms', supabaseURL);
endpoint.searchParams.set('id', `eq.${XERT_PEQ_FORM_ID}`);
endpoint.searchParams.set('slug', 'eq.peq');
endpoint.searchParams.set('archived_at', 'is.null');
endpoint.searchParams.set('select', 'id,title,slug,updated_at,response_count,is_active');

const currentResponse = await fetch(endpoint, { headers });
if (!currentResponse.ok) throw new Error(`Could not inspect the PEQ form (${currentResponse.status}).`);
const matches = await currentResponse.json();
if (matches.length > 1) throw new Error(`Expected at most one PEQ form record; found ${matches.length}.`);

const [current] = matches;
console.log(JSON.stringify({
  mode: apply ? 'apply' : 'check',
  action: current ? 'update' : 'create',
  id: XERT_PEQ_FORM_ID,
  currentTitle: current?.title || null,
  nextTitle: XERT_PEQ_FORM_DEFINITION.title,
  responseCountPreserved: current?.response_count ?? 0,
  activeStatePreserved: current?.is_active ?? true,
  nextFieldCount: XERT_PEQ_FORM_DEFINITION.questions.length,
}, null, 2));

if (!apply) {
  console.log('Dry run only. Re-run with --apply to update this exact record.');
  process.exit(0);
}

if (!current) {
  // A brand-new record needs an explicit owner: the service role has no auth.uid().
  const ownerLookup = new URL('/rest/v1/xert_forms', supabaseURL);
  ownerLookup.searchParams.set('select', 'created_by');
  ownerLookup.searchParams.set('created_by', 'not.is.null');
  ownerLookup.searchParams.set('limit', '1');
  const [owner] = await (await fetch(ownerLookup, { headers })).json();
  const insertEndpoint = new URL('/rest/v1/xert_forms', supabaseURL);
  insertEndpoint.searchParams.set('select', 'id,slug,updated_at,response_count,is_active');
  const created = await fetch(insertEndpoint, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({ ...XERT_PEQ_FORM_DEFINITION, id: XERT_PEQ_FORM_ID, is_active: true, created_by: owner?.created_by }),
  });
  if (!created.ok) throw new Error(`Could not create the PEQ form (${created.status}): ${(await created.text()).slice(0, 300)}`);
  console.log(JSON.stringify({ created: true, ...(await created.json())[0] }, null, 2));
  process.exit(0);
}

const patchEndpoint = new URL(endpoint);
patchEndpoint.searchParams.delete('select');
patchEndpoint.searchParams.set('updated_at', `eq.${current.updated_at}`);
patchEndpoint.searchParams.set('select', 'id,title,slug,updated_at,response_count,is_active');
const updateResponse = await fetch(patchEndpoint, {
  method: 'PATCH',
  headers: { ...headers, Prefer: 'return=representation' },
  body: JSON.stringify(XERT_PEQ_FORM_DEFINITION),
});
if (!updateResponse.ok) throw new Error(`Could not update the PEQ form (${updateResponse.status}).`);
const updated = await updateResponse.json();
if (updated.length !== 1) {
  throw new Error('The PEQ form changed during this update. Nothing was overwritten; inspect and retry.');
}
console.log(JSON.stringify({
  updated: true,
  id: updated[0].id,
  title: updated[0].title,
  responseCountPreserved: updated[0].response_count,
  activeStatePreserved: updated[0].is_active,
  updatedAt: updated[0].updated_at,
}, null, 2));
