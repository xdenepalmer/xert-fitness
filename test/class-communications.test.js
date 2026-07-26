import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  MAX_BCC_RECIPIENTS,
  buildClassCancellationMailto,
  buildClassCancellationMessage,
  collectClassCancellationContacts,
} from '../src/lib/classCommunications.js';

const adminCalendar = await readFile(new URL('../src/components/admin/ClassCalendarAdmin.jsx', import.meta.url), 'utf8');

test('cancellation contacts merge both booking systems without exposing inactive records', () => {
  const contacts = collectClassCancellationContacts(
    [
      { status: 'confirmed', full_name: ' Alex Runner ', email: 'ALEX@example.com', phone: '0400 111 222' },
      { status: 'cancelled', full_name: 'Cancelled', email: 'cancelled@example.com' },
      { status: 'attended', full_name: 'Already attended', email: 'past@example.com' },
    ],
    [
      { status: 'requested', full_name: 'Alex Runner', email: 'alex@example.com' },
      { status: 'waitlisted', full_name: 'Sam Strong', phone: '+61 412 345 678' },
      { status: 'confirmed', full_name: 'Invalid', email: 'not-an-email', phone: '123' },
    ]
  );

  assert.deepEqual(contacts, [
    { name: 'Alex Runner', email: 'alex@example.com', phone: '0400 111 222', phoneDialable: '0400111222' },
    { name: 'Sam Strong', email: '', phone: '+61 412 345 678', phoneDialable: '+61412345678' },
  ]);
});

test('cancellation copy names the class, Brisbane time and honest credit return', () => {
  const message = buildClassCancellationMessage({
    title: 'XERT Engine',
    start_time: '2026-07-15T08:30:00Z',
  });

  assert.equal(message.subject, 'XERT class cancelled: XERT Engine');
  assert.match(message.body, /Wednesday 15 July at 6:30 pm/);
  assert.match(
    message.body,
    /Reserved credits on open credit places are returned when the pack is still live/,
  );
  assert.match(message.body, /waitlist places never held a credit/);
  assert.doesNotMatch(message.body, /Any reserved session credit has been returned automatically/);
  assert.match(message.body, /choose another class/);

  assert.match(
    buildClassCancellationMessage({ title: 'Legacy class', start_time: 'not-a-date' }).body,
    /on the scheduled time/
  );
});

test('bulk email keeps recipients in BCC, deduplicates them and enforces a URL bound', () => {
  const contacts = Array.from({ length: MAX_BCC_RECIPIENTS + 2 }, (_, index) => ({
    email: `member${index}@example.com`,
  }));
  contacts.push({ email: 'MEMBER0@example.com' });

  const result = buildClassCancellationMailto(contacts, 'Class cancelled', 'Please rebook.');
  const parsed = new URL(result.url);

  assert.equal(parsed.protocol, 'mailto:');
  assert.equal(parsed.pathname, '');
  assert.equal(parsed.searchParams.get('to'), null);
  assert.equal(parsed.searchParams.get('bcc').split(',').length, MAX_BCC_RECIPIENTS);
  assert.equal(result.recipientCount, MAX_BCC_RECIPIENTS);
  assert.equal(result.omittedCount, 2);
  assert.equal(parsed.searchParams.get('subject'), 'Class cancelled');
});

test('class cancellation hands both rosters to a complete follow-up workspace', () => {
  const cancelFlow = adminCalendar.slice(
    adminCalendar.indexOf('const handleCancel = async'),
    adminCalendar.indexOf('const handleBookingStatus')
  );
  assert.match(cancelFlow, /Promise\.allSettled\([\s\S]*adminSessionRoster[\s\S]*getClassBookings/);
  assert.match(cancelFlow, /collectClassCancellationContacts/);
  assert.match(cancelFlow, /await cancelClassSession/);
  assert.match(cancelFlow, /if \(affectedBookings > 0\)[\s\S]*setCancellationFollowUp/);
  assert.match(adminCalendar, /CancellationFollowUpDialog/);
  assert.match(adminCalendar, /Email \{followUp\.mailto\.recipientCount\} via BCC/);
  assert.match(adminCalendar, /href=\{`mailto:\$\{contact\.email\}`\}/);
  assert.match(adminCalendar, /href=\{`tel:\$\{contact\.phoneDialable\}`\}/);
  assert.match(adminCalendar, /navigator\.clipboard\.writeText\(followUp\.message\.body\)/);
});
