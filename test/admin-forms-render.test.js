import assert from 'node:assert/strict';
import {after, test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {StaticRouter} from 'react-router-dom/server.js';

// Expose the real editor at the test boundary; no production test-only API.
const server = await createServer({configFile:false, resolve:{alias:{'@':fileURLToPath(new URL('../src', import.meta.url))}},
  plugins:[{name:'forms-render-boundary',transform(code,id){if (id.endsWith('/FormsSurveysManager.jsx')) return `${code}\nexport {FormEditor, Analytics};`;}}],
  define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify('https://ugmkwoapjcpiucsrxwzt.supabase.co'),'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify('sb_publishable_fixture_render_key_not_real')},
  optimizeDeps:{noDiscovery:true,include:[]}, server:{middlewareMode:true,watch:null}, appType:'custom'});
after(() => server.close());
const {default: FormsSurveysManager, FormEditor, Analytics} = await server.ssrLoadModule('/src/components/admin/FormsSurveysManager.jsx');
const recordModule = await server.ssrLoadModule('/src/components/admin/FormResponseRecord.jsx');
const {default: FormResponseRecord} = recordModule;
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

test('pending form cards reserve separate title, badge and summary geometry without pretend actions', () => {
  const html = renderToStaticMarkup(React.createElement(StaticRouter, {location:'/admin/forms'}, React.createElement(FormsSurveysManager)));
  const cards = [...html.matchAll(/<article[^>]*data-form-placeholder="card"[^>]*>([\s\S]*?)<\/article>/g)];
  assert.equal(cards.length, 3, 'loading retains repeated form-card groups');
  for (const [, card] of cards) {
    assert.match(card, /data-size="title"/);
    assert.match(card, /forms-loading-badge/);
    assert.match(card, /data-size="medium"/);
    assert.doesNotMatch(card, /<button|<input|<select|<a\s/);
  }
});

test('pending analytics reserve each question header, count and answer rows', () => {
  const form = {...draft,id:'survey',questions:[...draft.questions,{id:'two',type:'short_text',question:'Why?'}]};
  const html = renderToStaticMarkup(React.createElement(Analytics, {form,onBack:()=>{}}));
  const questions = [...html.matchAll(/<section[^>]*data-form-placeholder="question"[^>]*>([\s\S]*?)<\/section>/g)];
  assert.equal(questions.length, 2, 'loading retains each question card');
  for (const [, question] of questions) {
    assert.match(question, /data-size="title"/);
    assert.match(question, /data-size="short"/);
    assert.equal((question.match(/data-form-placeholder="answer-row"/g) || []).length, 3);
    assert.doesNotMatch(question, /<button|<input|<select|<a\s/);
  }
});

test('pending full records reserve header, paired metadata and original-answer areas', () => {
  assert.equal(typeof recordModule.FormRecordLoading, 'function', 'full-record loading needs a composed document shape');
  const html = renderToStaticMarkup(React.createElement(recordModule.FormRecordLoading));
  assert.match(html, /role="status" aria-label="Loading full response"/);
  assert.match(html, /data-form-placeholder="record-header"/);
  assert.equal((html.match(/data-form-placeholder="metadata-item"/g) || []).length, 6);
  assert.equal((html.match(/data-form-placeholder="record-answer"/g) || []).length, 2);
  assert.doesNotMatch(html, /<button|<input|<select|<a\s/);
});
