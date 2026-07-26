import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const dataSource = readFileSync(new URL('../src/lib/adminData.js', import.meta.url), 'utf8');
const managerSource = readFileSync(new URL('../src/components/admin/AvailabilityManager.jsx', import.meta.url), 'utf8');

function functionBody(name) {
  const start = dataSource.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const next = dataSource.indexOf('\nexport async function ', start + 1);
  return dataSource.slice(start, next === -1 ? dataSource.length : next);
}

test('schedule mutations compare the server version before changing a row', () => {
  for (const name of [
    'updateAvailabilityBlock',
    'deleteAvailabilityBlock',
    'updateBlackoutPeriod',
    'deleteBlackoutPeriod',
  ]) {
    const body = functionBody(name);
    assert.match(body, /expectedUpdatedAt/);
    assert.match(body, /\.eq\('updated_at', expectedUpdatedAt\)/);
    assert.match(body, /assertAdminMutationVersion\(/);
  }
});

test('availability admin passes the version loaded into every edit and delete', () => {
  assert.match(managerSource, /updateAvailabilityBlock\(editingBlock\.id, payload, editingBlock\.updated_at\)/);
  assert.match(managerSource, /updateBlackoutPeriod\(editingBlackout\.id, payload, editingBlackout\.updated_at\)/);
  assert.match(managerSource, /deleteAvailabilityBlock\(block\.id, block\.updated_at\)/);
  assert.match(managerSource, /deleteBlackoutPeriod\(blackout\.id, blackout\.updated_at\)/);
});

test('availability and blackout editors refuse same-paint double saves', () => {
  assert.match(managerSource, /const saveLockRef = useRef\(false\)/);
  for (const name of ['saveBlock', 'saveBlackout']) {
    const start = managerSource.indexOf(`const ${name} = async`);
    assert.notEqual(start, -1, `${name} must exist`);
    const next = managerSource.indexOf('\n  const ', start + 1);
    const body = managerSource.slice(start, next === -1 ? managerSource.length : next);
    assert.match(body, /if \(saveLockRef\.current \|\| saving\) return/);
    assert.match(body, /saveLockRef\.current = true/);
    assert.match(body, /saveLockRef\.current = false/);
  }
});

test('availability Remove confirms refuse same-paint double deletes', () => {
  assert.match(managerSource, /const deleteLockRef = useRef\(false\)/);
  const start = managerSource.indexOf('const confirmRemoval');
  assert.notEqual(start, -1);
  const confirm = managerSource.slice(start, start + 450);
  assert.match(confirm, /if \(!pending \|\| deleteLockRef\.current \|\| removingId !== null\) return/);
  assert.match(confirm, /deleteLockRef\.current = true/);
});
