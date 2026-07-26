import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

const HONEST_NOTICE =
  /Reserved credits on open credit places are returned when the pack is still live/;
const DISHONEST_NOTICE =
  /Any reserved session credit has been returned automatically/;

test('class cancel copy does not claim every cancelled place returned a credit', () => {
  const web = read('../src/components/admin/ClassCalendarAdmin.jsx');
  assert.match(
    web,
    /Reserved credits on open credit places were returned when the pack is still live/,
  );
  assert.match(
    web,
    /waitlist and enquiry places never held a credit/,
  );
  // Follow-up dialog used to say every active booking was "cancelled and refunded".
  assert.doesNotMatch(web, /cancelled and refunded/);
  assert.doesNotMatch(
    web,
    /Reserved member credits were returned\.|any reserved class credits returned/,
  );

  const ios = read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminCommandCentreView.swift');
  assert.match(
    ios,
    /Reserved credits on open credit places are returned when the pack is still live/,
  );
  assert.match(ios, /waitlist places never held a credit/);
  assert.doesNotMatch(ios, /reserved credits are returned, and affected members/);
});

test('class-cancel private notice and mailto match credit honesty', () => {
  const tip = read('../supabase/migrations/20260726122000_class_cancel_notice_credit_honesty.sql');
  const operator = read('../src/supabase/class_cancel_notice_credit_honesty.sql');
  for (const sql of [tip, operator]) {
    assert.match(sql, HONEST_NOTICE);
    assert.match(sql, /waitlist places never held a credit/);
    assert.doesNotMatch(sql, DISHONEST_NOTICE);
    assert.match(sql, /values \('class_cancel_notice_credit_honesty'\)/);
  }

  const mailto = read('../src/lib/classCommunications.js');
  assert.match(mailto, HONEST_NOTICE);
  assert.match(mailto, /waitlist places never held a credit/);
  assert.doesNotMatch(mailto, DISHONEST_NOTICE);

  // Operator / historical recreations must not restore the dishonest body.
  for (const path of [
    '../src/supabase/class_cancellation_notifications_upgrade.sql',
    '../src/supabase/credit_batch_refund_reactivation.sql',
    '../supabase/migrations/20260714015000_class_cancellation_notifications.sql',
    '../supabase/migrations/20260726106000_credit_batch_refund_reactivation.sql',
  ]) {
    const sql = read(path);
    assert.match(sql, HONEST_NOTICE);
    assert.doesNotMatch(sql, DISHONEST_NOTICE);
  }
});
