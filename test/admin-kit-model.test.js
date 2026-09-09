import assert from 'node:assert/strict';
import test from 'node:test';
import * as model from '../src/components/admin/ui/model.mjs';

// These cases catch in-place sorting, lexical numeric order, dropped hidden
// selections, URL clobbering, and fixed-height/off-by-one virtual windows.

test('sort is numeric, stable and leaves incoming rows intact; nulls stay last', () => {
  assert.equal(typeof model.sortRows, 'function');
  const rows = Object.freeze([{id:'a',n:20},{id:'b',n:3},{id:'c',n:3},{id:'d',n:null}]);
  const columns = [{key:'n',sortable:true}];
  assert.deepEqual(model.sortRows(rows, columns, {key:'n',direction:'ascending'}).map(r=>r.id), ['b','c','a','d']);
  assert.deepEqual(model.sortRows(rows, columns, {key:'n',direction:'descending'}).map(r=>r.id), ['a','b','c','d']);
  assert.deepEqual(rows.map(r=>r.id), ['a','b','c','d']);
  assert.deepEqual(model.sortRows(rows, columns, {key:'missing',direction:'ascending'}), rows);
});

test('sort toggles ascending, descending and cleared', () => {
  assert.equal(typeof model.nextSort, 'function');
  assert.deepEqual(model.nextSort(null, 'n'), {key:'n',direction:'ascending'});
  assert.deepEqual(model.nextSort({key:'n',direction:'ascending'}, 'n'), {key:'n',direction:'descending'});
  assert.equal(model.nextSort({key:'n',direction:'descending'}, 'n'), null);
});

test('select-all covers filtered results and preserves selections outside them', () => {
  assert.equal(typeof model.toggleSelection, 'function');
  const selection = new Set(['outside','a']);
  const selected = model.toggleSelection(selection, ['a','b'], true);
  assert.deepEqual([...selected], ['outside','a','b']);
  assert.deepEqual([...model.toggleSelection(selected, ['a','b'], false)], ['outside']);
  assert.deepEqual([...selection], ['outside','a']);
  assert.deepEqual(model.selectionSummary(selected, ['a','b']), {total:3,visible:2,outside:1,all:true,partial:false});
  assert.deepEqual(model.selectionSummary(new Set(['outside']), []), {total:1,visible:0,outside:1,all:false,partial:false});
});

test('owned URL values normalize options while preserving workspace, duplicate unknowns and other intent', () => {
  assert.equal(typeof model.readFilterValues, 'function');
  const fields = [{key:'q'},{key:'status',options:[{value:'active',label:'Active'}]}];
  assert.deepEqual(model.readFilterValues('?section=members&q=Jo&status=invalid', fields), {q:'Jo',status:''});
  assert.equal(model.writeFilterValues('?section=members&tag=a&tag=b&member=42&q=old', {q:'new',status:'active'}, fields), 'section=members&tag=a&tag=b&member=42&q=new&status=active');
  assert.equal(model.writeFilterValues('?section=members&q=Jo&status=active&intent=review', {}, fields), 'section=members&intent=review');
});

test('measured variable-height window uses the actual viewport and preserves a focused row', () => {
  assert.equal(typeof model.virtualWindow, 'function');
  const keys = ['a','b','c','d','e'];
  const heights = new Map([['a',40],['b',160],['c',50],['d',80],['e',30]]);
  const result = model.virtualWindow(keys, heights, {scrollTop:205,viewportHeight:60,estimate:50,overscan:0,focusedKey:'a'});
  assert.deepEqual(result.indices, [0,2,3]);
  assert.deepEqual(result.offsets, [0,40,200,250,330,360]);
  assert.equal(result.totalHeight, 360);
  assert.deepEqual(model.virtualWindow([], heights, {scrollTop:0,viewportHeight:100,estimate:50}).indices, []);
});

test('large windows recycle records independently of selected keys and reach the final result', () => {
  assert.equal(typeof model.virtualWindow, 'function');
  const keys = Array.from({length:320}, (_,i)=>`member-${i}`);
  const beginning = model.virtualWindow(keys, new Map(), {scrollTop:0,viewportHeight:400,estimate:50,overscan:2});
  const end = model.virtualWindow(keys, new Map(), {scrollTop:15600,viewportHeight:400,estimate:50,overscan:2});
  assert.equal(beginning.indices.length, 10);
  assert.equal(beginning.indices[0], 0);
  assert.equal(end.indices.at(-1), 319);
  assert.ok(!end.indices.includes(0));
  assert.equal(end.totalHeight, 16000);
});
