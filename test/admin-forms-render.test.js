import assert from 'node:assert/strict';
import {after, test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

// Expose the real editor at the test boundary; no production test-only API.
const server = await createServer({configFile:false, resolve:{alias:{'@':fileURLToPath(new URL('../src', import.meta.url))}},
  plugins:[{name:'forms-render-boundary',transform(code,id){if (id.endsWith('/FormsSurveysManager.jsx')) return `${code}\nexport {FormEditor};`;}}],
  define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify('https://ugmkwoapjcpiucsrxwzt.supabase.co'),'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify('sb_publishable_fixture_render_key_not_real')},
  optimizeDeps:{noDiscovery:true,include:[]}, server:{middlewareMode:true,watch:null}, appType:'custom'});
after(() => server.close());
const {FormEditor} = await server.ssrLoadModule('/src/components/admin/FormsSurveysManager.jsx');
const {default: FormResponseRecord} = await server.ssrLoadModule('/src/components/admin/FormResponseRecord.jsx');
const draft = {title:'Survey',questions:[{id:'one',type:'single_choice',question:'Preferred time?',options:['Morning','Evening']}]};
const render = props => renderToStaticMarkup(React.createElement(FormEditor, {draft,setDraft:()=>{},onSave:()=>{},onCancel:()=>{},...props}));

test('builder names each question, type and option and disambiguates duplicate/remove controls', () => {
  const html = render({});
  for (const label of ['Question 1','Field type for question 1','Option 1 for question 1','Option 2 for question 1','Duplicate question 1','Remove question 1']) {
    assert.ok(html.includes(`aria-label="${label}"`), `Missing accessible name: ${label}`);
  }
});

test('a pending save disables the editor and its navigation while retaining typed values', () => {
  const html = render({saving:true});
  assert.match(html, /<fieldset[^>]*disabled=""/);
  assert.match(html, /value="Preferred time\?"/);
  assert.match(html, /value="Survey"/);
});

test('a legacy response without layout blocks still warns that current labels are unverified', () => {
  const response = {id:'legacy',completed_at:'2026-09-08T12:00:00Z',status:'new',answers:{q:'Yes'}};
  const html = renderToStaticMarkup(React.createElement(FormResponseRecord, {form:{title:'Current agreement',questions:[{id:'q',type:'yes_no',question:'New wording'}]},response,responses:[response]}));
  assert.match(html, /Reconstructed record — original wording unverified/);
});
