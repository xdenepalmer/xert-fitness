import assert from 'node:assert/strict';
import {after, test} from 'node:test';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const server = await createServer({configFile:false, optimizeDeps:{noDiscovery:true,include:[]}, server:{middlewareMode:true,watch:null}, appType:'custom'});
after(() => server.close());
const kit = await server.ssrLoadModule('/src/components/admin/ui.jsx');
const render = (Component, props, children) => renderToStaticMarkup(React.createElement(Component, props, children));

test('form field associates real label, helper and error without replacing child associations', () => {
  assert.equal(typeof kit.AdminFormField, 'function');
  const html = render(kit.AdminFormField, {id:'email',label:'Email',helper:'Use an email',error:'Check address'}, React.createElement('input', {'aria-describedby':'external'}));
  assert.match(html, /for="email"/);
  assert.match(html, /id="email"/);
  assert.match(html, /aria-describedby="external email-helper email-error"/);
  assert.match(html, /aria-invalid="true"/);
});

test('table exposes real sort headers, row count and independent action cells', () => {
  assert.equal(typeof kit.AdminDataTable, 'function');
  const html = render(kit.AdminDataTable, {label:'Members',rows:[{id:'stable',name:'A'}],columns:[{key:'name',header:'Name',sortable:true},{key:'action',header:'Actions',render:()=>React.createElement('button',null,'Review A')}],defaultSort:{key:'name',direction:'ascending'},selectable:true});
  assert.match(html, /aria-rowcount="2"/);
  assert.match(html, /aria-sort="ascending"/);
  assert.match(html, /data-row-key="stable"/);
  assert.match(html, /aria-label="Select A"/);
  assert.match(html, /<button>Review A<\/button>/);
  assert.doesNotMatch(html, /<button[^>]*>[^<]*<button/);
});

test('table empty, pending and error states provide context and recovery', () => {
  assert.equal(typeof kit.AdminDataTable, 'function');
  assert.match(render(kit.AdminDataTable, {rows:[],columns:[],emptyTitle:'No matches',emptyDescription:'Change the filters'}), /Change the filters/);
  assert.match(render(kit.AdminDataTable, {rows:[],columns:[],loading:true}), /aria-busy="true"/);
  const failed = render(kit.AdminDataTable, {rows:[],columns:[],error:'Could not load',onRetry:()=>{}});
  assert.match(failed, /role="alert"/);
  assert.match(failed, /Retry/);
});

test('table selection names its loaded-page scope and locks every checkbox during a mutation', () => {
  const props = {rows:[{id:'a',name:'A'},{id:'b',name:'B'}],columns:[{key:'name',header:'Name'}],selectable:true};
  const html = render(kit.AdminDataTable, {...props,selectAllLabel:'Select all leads on this page',selectionDisabled:true});
  assert.match(html, /aria-label="Select all leads on this page"/);
  const checkboxes = html.match(/<input[^>]*type="checkbox"[^>]*>/g);
  assert.equal(checkboxes.length, 3);
  assert.ok(checkboxes.every(input => input.includes('disabled=""')));
  const defaultHtml = render(kit.AdminDataTable, props);
  assert.match(defaultHtml, /aria-label="Select all filtered results"/);
  assert.ok((defaultHtml.match(/<input[^>]*type="checkbox"[^>]*>/g)).every(input => !input.includes('disabled')));
});

test('unknown statuses remain readable and neutral, segmented items expose one selected radio', () => {
  assert.equal(typeof kit.AdminBadge, 'function');
  assert.match(render(kit.AdminBadge, {status:'future-status'}), /data-tone="neutral"/);
  assert.match(render(kit.AdminBadge, {status:'future-status'}), /future-status/);
  const html = render(kit.AdminSegmented, {label:'Period',options:[{value:'week',label:'Week'},{value:'month',label:'Month'}],defaultValue:'month'});
  assert.match(html, /role="radiogroup" aria-label="Period"/);
  assert.equal((html.match(/aria-checked="true"/g)||[]).length, 1);
  assert.match(html, /aria-checked="true"[^>]*tabindex="0"/);
});

test('timeline emits ordered records, machine-readable time and readable metadata', () => {
  assert.equal(typeof kit.AdminTimeline, 'function');
  const html = render(kit.AdminTimeline, {items:[{id:'event',timestamp:'2026-09-01T01:00:00Z',title:'Reviewed',metadata:'Owner'}]});
  assert.match(html, /<ol/);
  assert.match(html, /dateTime="2026-09-01T01:00:00Z"/);
  assert.match(html, /Owner/);
});
