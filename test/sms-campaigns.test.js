import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  SMS_MAX_RECIPIENTS, normalizeAUMobile, recipientsFromRows, smsCampaignValidationError, smsSegments,
} from '../src/lib/smsCampaigns.js';
import { e164AUMobile, normalizeSmsSendRequest } from '../api/admin-publish-announcement.js';

test('australian mobiles normalise to E.164 and everything else is refused', () => {
  for (const normalize of [normalizeAUMobile, e164AUMobile]) {
    assert.equal(normalize('0485 070 921'), '+61485070921');
    assert.equal(normalize('+61 485 070 921'), '+61485070921');
    assert.equal(normalize('61485070921'), '+61485070921');
    assert.equal(normalize('(04) 8507-0921'), '+61485070921');
    assert.equal(normalize('07 4162 1234'), null, 'landlines are not textable');
    assert.equal(normalize('+64211234567'), null, 'other countries are refused, not guessed');
    assert.equal(normalize(''), null);
    assert.equal(normalize('call me'), null);
  }
});

test('segment counting matches GSM-7 and UCS-2 rules', () => {
  assert.deepEqual(smsSegments(''), { characters: 0, segments: 0, encoding: 'GSM-7' });
  assert.equal(smsSegments('a'.repeat(160)).segments, 1);
  assert.equal(smsSegments('a'.repeat(161)).segments, 2, 'multipart shrinks to 153 per segment');
  assert.equal(smsSegments('a'.repeat(306)).segments, 2);
  assert.equal(smsSegments('a'.repeat(307)).segments, 3);
  const braces = smsSegments('{}');
  assert.equal(braces.characters, 4, 'GSM extension characters cost two');
  const emoji = smsSegments(`💪${'a'.repeat(69)}`);
  assert.equal(emoji.encoding, 'UCS-2');
  assert.equal(emoji.segments, 1);
  assert.equal(smsSegments(`💪${'a'.repeat(70)}`).segments, 2, 'unicode caps at 70 then 67');
});

test('audience rows dedupe by phone and report what was skipped', () => {
  const { recipients, missingPhone, invalidPhone, duplicates } = recipientsFromRows([
    { full_name: 'Byron', phone: '0485 070 921', detail: 'Member' },
    { full_name: 'Byron again', phone: '+61485070921' },
    { full_name: 'No phone', email: 'x@y.z' },
    { full_name: 'Landline', phone: '07 4162 1234' },
    { full_name: 'Kirra', phone: '0400111222' },
  ]);
  assert.deepEqual(recipients.map(recipient => recipient.name), ['Byron', 'Kirra']);
  assert.equal(recipients[0].phone, '+61485070921');
  assert.equal(missingPhone, 1);
  assert.equal(invalidPhone, 1);
  assert.equal(duplicates, 1);
});

test('campaign validation blocks empty, oversize and unticked sends', () => {
  const recipient = { name: 'Byron', phone: '+61485070921' };
  assert.equal(smsCampaignValidationError({ message: 'Hi', recipients: [recipient] }), null);
  assert.match(smsCampaignValidationError({ message: '  ', recipients: [recipient] }), /Write the message/);
  assert.match(smsCampaignValidationError({ message: 'Hi', recipients: [] }), /at least one recipient/);
  assert.match(
    smsCampaignValidationError({ message: 'x'.repeat(1601), recipients: [recipient] }),
    /1600 characters/,
  );
  assert.match(
    smsCampaignValidationError({ message: 'Hi', recipients: Array.from({ length: SMS_MAX_RECIPIENTS + 1 }, () => recipient) }),
    /at most 500/,
  );
});

test('the API validates its own input independently of the browser', () => {
  const good = normalizeSmsSendRequest({
    message: '  Class is on!  ',
    recipients: [
      { name: 'Byron', phone: '0485070921' },
      { name: 'Byron dupe', phone: '+61485070921' },
    ],
  });
  assert.equal(good.message, 'Class is on!');
  assert.equal(good.recipients.length, 1, 'duplicates collapse server-side too');
  assert.equal(good.recipients[0].phone, '+61485070921');

  assert.throws(() => normalizeSmsSendRequest({ message: '', recipients: [{ phone: '0485070921' }] }), /SMS_MESSAGE_REQUIRED/);
  assert.throws(() => normalizeSmsSendRequest({ message: 'Hi', recipients: [] }), /SMS_RECIPIENTS_REQUIRED/);
  assert.throws(() => normalizeSmsSendRequest({ message: 'Hi', recipients: [{ phone: 'nope' }] }), /SMS_RECIPIENT_PHONE_INVALID/);
  assert.throws(
    () => normalizeSmsSendRequest({ message: 'x'.repeat(1601), recipients: [{ phone: '0485070921' }] }),
    /SMS_MESSAGE_TOO_LONG/,
  );
});

test('twilio credentials stay server-side and the admin gate is enforced', async () => {
  const api = await readFile(new URL('../api/admin-publish-announcement.js', import.meta.url), 'utf8');
  assert.match(api, /process\.env\.TWILIO_ACCOUNT_SID/);
  assert.match(api, /process\.env\.TWILIO_AUTH_TOKEN/);
  assert.match(api, /process\.env\.TWILIO_FROM_NUMBER/);
  assert.doesNotMatch(api, /AC[0-9a-f]{32}/i, 'no account SID committed');
  assert.doesNotMatch(api, /SK[0-9a-f]{32}/i, 'no API key committed');
  assert.match(api, /profile\?\.role !== 'admin'/, 'only admins can send');
  const smsAction = api.indexOf("body?.action === 'send_sms'");
  const adminGate = api.indexOf("profile?.role !== 'admin'");
  assert.ok(adminGate > -1 && smsAction > adminGate, 'the SMS action sits behind the admin check');

  const lib = await readFile(new URL('../src/lib/smsCampaigns.js', import.meta.url), 'utf8');
  assert.doesNotMatch(lib, /TWILIO/, 'the browser bundle never references Twilio credentials');

  const ui = await readFile(new URL('../src/components/admin/SmsManager.jsx', import.meta.url), 'utf8');
  assert.match(ui, /AdminConfirmDialog/, 'sending requires an explicit confirmation');
  assert.match(ui, /unchecked/, 'individual recipients can be unticked');
});
