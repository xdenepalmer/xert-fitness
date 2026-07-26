import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  activationQueuePresentation,
  activationSnapshotPresentation,
  activationStagePresentation,
} from '../src/lib/memberActivation.js';
import { createFollowUpCopy, createFollowUpLog } from '../src/lib/memberFollowUp.js';

test('activation stages show authoritative counts and account-cohort conversion rates', () => {
  const stages = activationStagePresentation({
    accounts_created: 20,
    readiness_complete: 16,
    training_access: 13,
    first_booking: 10,
    first_attended: 8,
    returned: 5,
  });

  assert.deepEqual(stages.map(stage => stage.count), [20, 16, 13, 10, 8, 5]);
  assert.deepEqual(stages.map(stage => stage.rate), [100, 80, 65, 50, 40, 25]);
  assert.equal(stages[4].detail, 'First class completed');
  assert.equal(stages.some(stage => stage.inconsistent), false);
});

test('activation snapshot identifies partial, stale and inconsistent data honestly', () => {
  const presentation = activationSnapshotPresentation({
    as_of: '2026-07-21T00:00:00.000Z',
    cohort_days: 30,
    accounts_created: 3,
    readiness_complete: null,
    training_access: 2,
    first_booking: 4,
    first_attended: 2,
    returned: 1,
  }, {
    now: new Date('2026-07-21T00:20:00.000Z'),
    maximumAgeMs: 15 * 60 * 1000,
  });

  assert.equal(presentation.partial, true);
  assert.equal(presentation.stale, true);
  assert.equal(presentation.inconsistent, true);
  assert.equal(presentation.stages[1].countLabel, '—');
  assert.equal(presentation.stages[1].rateLabel, 'Not enough data');
});

test('activation action queue is deduplicated, labelled and bounded', () => {
  const rows = Array.from({ length: 25 }, (_, index) => ({
    id: `member-${index}`,
    reason: index === 0 ? 'setup_incomplete' : 'no_first_booking',
  }));
  rows.splice(2, 0, { id: 'member-0', reason: 'no_first_attendance' }, { reason: 'invalid' });

  const queue = activationQueuePresentation(rows, 12);
  assert.equal(queue.length, 12);
  assert.equal(queue[0].activationReasonLabel, 'Setup incomplete');
  assert.equal(queue[1].activationReasonLabel, 'No first booking');
  assert.equal(new Set(queue.map(member => member.id)).size, 12);
});

test('activation queue labels missing training access as a distinct next step', () => {
  const [member] = activationQueuePresentation([{ id: 'member-access', reason: 'no_training_access' }]);
  assert.equal(member.activationReasonLabel, 'No training access');
});

test('activation outreach copy sends each member to the correct next step', () => {
  const readiness = createFollowUpCopy({ full_name: 'Alex', reason: 'readiness_incomplete' }, 'https://xert.example');
  const access = createFollowUpCopy({ full_name: 'Alex', reason: 'no_training_access' }, 'https://xert.example');
  const attendance = createFollowUpCopy({ full_name: 'Alex', reason: 'no_first_attendance' }, 'https://xert.example');

  assert.match(readiness.emailBody, /account#member-readiness/);
  assert.match(access.emailBody, /session pack/i);
  assert.match(attendance.emailBody, /first XERT class/i);
  assert.match(createFollowUpLog({ reason: 'no_training_access' }, 'email'), /session-pack access/);
});

test('web member admin keeps activation authoritative, bounded and independently recoverable', async () => {
  const source = await readFile(
    new URL('../src/components/admin/MembersManager.jsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /adminMemberActivationOverview\(30\)/);
  assert.match(source, /adminListMemberActivationQueue\(12\)/);
  assert.match(source, /Authoritative 30-day account cohort/);
  assert.match(source, /not page views/);
  assert.match(source, /Some activation stages are unavailable/);
  assert.match(source, /Showing the last successful activation snapshot/);
  assert.match(source, /This activation snapshot is stale/);
  assert.match(source, /Outreach remains manual/);
  assert.match(source, /const outreachAllowed = !queueError && !queueLoading/);
  assert.match(source, /disabled=\{!outreachAllowed\}/);
  assert.match(source, /Email unavailable until activation actions refresh/);
  assert.match(source, /Call unavailable until activation actions refresh/);
  assert.match(source, /activationQueuePresentation\(queue, 12\)/);
  assert.match(source, /onView=\{setViewing\}/);
  assert.match(source, /onLog=\{setLoggingFollowUp\}/);

  const activationIndex = source.indexOf('<ActivationCockpit');
  const retentionIndex = source.indexOf('<FollowUpQueue');
  assert.ok(activationIndex >= 0 && activationIndex < retentionIndex);
});
