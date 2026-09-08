import React, { useEffect, useRef, useState } from 'react';
import { adminSessionRoster, adminSetBookingStatus, staffBookMemberIntoClass, adminRecordSessionAttendance, adminSearchMembers, getClassSessions, getClassBookings } from '@/lib/adminData';
import { listOwnerForms, saveOwnerForm, validateFormDraft } from '@/lib/xertForms';
import { formatBroadcastSessionLabel } from '@/lib/adminAudiences';
import { recipientsFromRows, smsCampaignValidationError, smsSegments } from '@/lib/smsCampaigns';
import { sendAdminSms } from '@/lib/smsSend';
import { attendanceRoll, attendanceRosterMembers, attendanceRowId } from '@/lib/attendanceDraft';
import { createMutationGate, reviewedAttendance, reversibleAttendance } from '@/lib/adminCommandSystem';

/** Nested review flow. All writes remain behind explicit final review and the existing domain APIs. */
export default function AdminCommandActions({ command, onBack, onComplete, onBusyChange }) {
  const [stage, setStage] = useState('choose');
  const [rows, setRows] = useState([]);
  const [session, setSession] = useState(null);
  const [person, setPerson] = useState(null);
  const [form, setForm] = useState(null);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState(null);
  const [audienceReady, setAudienceReady] = useState(false);
  const [selectedPhones, setSelectedPhones] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState('');
  const [undoStatus, setUndoStatus] = useState(null);
  const [roll, setRoll] = useState([]);
  const [attendance, setAttendance] = useState({});
  const gate = useRef(createMutationGate());
  const requestId = useRef(null);
  const heading = useRef(null);
  const audienceSession = useRef(null);
  const isForm = command.id === 'publish-form';
  const isText = command.id === 'text-class';
  const isAttendance = command.id === 'mark-attendance';
  const isAdd = command.id === 'add-attendee';
  const recipients = audience?.recipients.filter(recipient => selectedPhones.includes(recipient.phone)) || [];
  useEffect(() => { heading.current?.focus(); }, [stage]);

  useEffect(() => {
    let active = true;
    let timer;
    setError(''); setRows([]);
    if (stage === 'review' || stage === 'done') return undefined;
    const load = async () => {
      setLoading(true);
      try {
        let loaded;
        if (stage === 'choose') loaded = isForm ? await listOwnerForms() : await getClassSessions(false);
        else if (stage === 'person') {
          if (isAdd) loaded = await adminSearchMembers(query.trim(), 12);
          else {
            const roster = await adminSessionRoster(session.id);
            if (isAttendance) {
              if (roster.some(row => row.status === 'requested')) throw new Error('Resolve outstanding member booking requests in the class calendar before taking attendance.');
              loaded = attendanceRosterMembers(attendanceRoll(roster, await getClassBookings({ class_session_id: session.id })));
              if (active) { setRoll(loaded); setAttendance(Object.fromEntries(loaded.map(row => [attendanceRowId(row), ['attended', 'no_show'].includes(row.status) ? row.status : '']))); }
            } else loaded = roster.filter(row => row.status === 'requested');
          }
        } else if (stage === 'compose') {
          setAudienceReady(false);
          // Unlike the legacy broadcast loader, a roster failure must block a class campaign.
          const [roster, signups] = await Promise.all([adminSessionRoster(session.id), getClassBookings({ class_session_id: session.id })]);
          const next = recipientsFromRows([...roster.map(row => ({ ...row, detail: `Roster · ${row.status}` })), ...signups.map(row => ({ ...row, detail: `Sign-up · ${row.status}` }))]);
          if (active) {
            setAudience(next);
            const preserveSelection = audienceSession.current === session.id;
            setSelectedPhones(current => preserveSelection ? current.filter(phone => next.recipients.some(row => row.phone === phone)) : next.recipients.map(row => row.phone));
            audienceSession.current = session.id;
            setAudienceReady(true);
          }
          loaded = [];
        }
        if (active) setRows(loaded || []);
      } catch (failure) { if (active) setError(failure.message || 'Could not load this step.'); }
      finally { if (active) setLoading(false); }
    };
    if (stage === 'person' && isAdd) {
      if (query.trim().length < 2) { setLoading(false); return undefined; }
      setLoading(true); timer = window.setTimeout(load, 250);
    } else void load();
    return () => { active = false; window.clearTimeout(timer); };
  }, [stage, retry, isAdd, isAttendance, isForm, query, session]);

  const back = () => {
    if (gate.current.busy) return;
    setError(''); setResult(''); setUndoStatus(null); requestId.current = null;
    if (stage === 'choose' || stage === 'done') onBack();
    else if (stage === 'review') setStage(isForm ? 'choose' : isText ? 'compose' : 'person');
    else { setSession(null); setPerson(null); setQuery(''); setStage('choose'); }
  };
  const submit = async (undo = false) => {
    if (gate.current.busy) return;
    const previous = roll;
    const nextAttendance = undo ? undoStatus : attendance;
    setError(''); setPending(true); onBusyChange(true);
    try {
      const receipt = await gate.current.run({
        optimistic: isAttendance ? () => setRoll(values => values.map(row => ({ ...row, status: nextAttendance[attendanceRowId(row)] }))) : undefined,
        rollback: isAttendance ? () => setRoll(previous) : undefined,
        mutate: async () => {
          if (isForm) {
            const validation = validateFormDraft(form);
            if (validation) throw new Error(validation);
            if (!form.id || !form.updated_at) throw new Error('Reload this form before publishing.');
            const saved = await saveOwnerForm({ ...form, is_active: true });
            if (!saved?.is_active || saved.id !== form.id) throw new Error('Publication was not confirmed. Refresh the forms workspace before continuing.');
            return `Published ${saved.title}.`;
          }
          if (isText) {
            const validation = smsCampaignValidationError({ message, recipients });
            if (validation) throw new Error(validation);
            const sent = await sendAdminSms({ message, recipients });
            // Preserve partial delivery information instead of claiming the whole audience received it.
            if (!Number.isInteger(sent.sent) || !Number.isInteger(sent.failed)) throw new Error('No delivery summary received. Check SMS results before starting another campaign.');
            return `${sent.sent} sent, ${sent.failed} failed. ${(sent.results || []).filter(row => row.error).map(row => `${row.phone || row.name}: ${row.error}`).join(' ')}`;
          }
          if (isAttendance) {
            const [freshMembers, freshSignups] = await Promise.all([adminSessionRoster(session.id), getClassBookings({ class_session_id: session.id })]);
            const entries = reviewedAttendance(previous, freshMembers, freshSignups, nextAttendance);
            if (undo) {
              const freshSession = (await getClassSessions(false)).find(row => row.id === session.id);
              if (!reversibleAttendance(freshSession, previous)) throw new Error('This class changed. Reload it in the class calendar before correcting attendance.');
            }
            const count = await adminRecordSessionAttendance(session.id, entries);
            if (count !== entries.length) throw new Error('Attendance count was not confirmed. Refresh the roster before continuing.');
            return `Attendance saved for ${count} people.`;
          }
          requestId.current ||= globalThis.crypto?.randomUUID?.();
          const saved = isAdd ? await staffBookMemberIntoClass(session.id, person.id, requestId.current) : await adminSetBookingStatus(person.booking_id, 'confirmed', requestId.current);
          return `Booking confirmed. ${saved.warning || (saved.announcement_id ? 'Member notice receipt confirmed.' : 'Booking receipt confirmed.')}`;
        },
      });
      setResult(receipt); setStage('done');
      setUndoStatus(isAttendance && !undo && reversibleAttendance(session, previous) ? Object.fromEntries(previous.map(row => [attendanceRowId(row), row.status])) : null);
      onComplete(command.id);
    } catch (failure) { setError(failure.message || 'The action could not be confirmed.'); }
    finally { setPending(false); onBusyChange(false); }
  };
  const review = () => {
    const validation = isText ? smsCampaignValidationError({ message, recipients }) : isForm ? validateFormDraft(form) : null;
    if (validation) { setError(validation); return; }
    setError(''); setStage('review');
  };
  return <section className="admin-command-stage" aria-busy={pending || loading} aria-label={command.label}>
    <h2 ref={heading} tabIndex={-1} className="font-display text-2xl">{command.label}</h2>
    {session && <p>{formatBroadcastSessionLabel(session)}</p>}
    {person && <p>{person.full_name || person.email} · {person.status?.replace('_', ' ') || 'Member'}</p>}
    {error && <div role="alert">{error}</div>}
    {loading && <p role="status">Loading…</p>}
    {stage === 'choose' && <>
      <p>{isForm ? 'Choose the form to publish.' : isText ? 'Choose the actual class and date. Review its audience before sending.' : 'Choose a class.'}</p>
      {!loading && !error && rows.filter(row => !isForm || !row.is_active).length === 0 && <p>No {isForm ? 'unpublished forms' : 'classes'} available.</p>}
      <ul>{rows.filter(row => !isForm || !row.is_active).map(row => <li key={row.id}><button type="button" onClick={() => {
        if (isForm) { setForm(row); setStage('review'); }
        else { setSession(row); setStage(isText ? 'compose' : 'person'); }
      }}>{isForm ? row.title : formatBroadcastSessionLabel(row)}</button></li>)}</ul>
    </>}
    {stage === 'person' && <>
      {isAdd && <label>Find member<input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="At least two letters" /></label>}
      {!loading && !error && rows.length === 0 && <p>{isAdd && query.trim().length < 2 ? 'Type at least two letters.' : 'No eligible people found.'}</p>}
      {isAttendance ? <><ul>{roll.map(row => <li key={attendanceRowId(row)}><label>{row.full_name || row.email}<select value={attendance[attendanceRowId(row)] || ''} onChange={event => setAttendance(values => ({ ...values, [attendanceRowId(row)]: event.target.value }))}><option value="">Choose attendance</option><option value="attended">Attended</option><option value="no_show">No show</option></select></label></li>)}</ul><button type="button" disabled={loading || !!error || !roll.length || roll.some(row => !attendance[attendanceRowId(row)])} onClick={review}>Review attendance</button></> : <ul>{rows.map(row => <li key={row.booking_id || row.id}><button type="button" onClick={() => { setPerson(row); setStage('review'); }}>{row.full_name || row.email} · {row.status || 'Member'}</button></li>)}</ul>}
    </>}
    {stage === 'compose' && !loading && audienceReady && audience && <>
      <p>{audience.recipients.length} available mobile numbers · {audience.missingPhone + audience.invalidPhone} without a valid mobile · {audience.duplicates} duplicate numbers removed</p>
      <ul>{audience.recipients.map(recipient => <li key={recipient.phone}><label><span><input type="checkbox" checked={selectedPhones.includes(recipient.phone)} onChange={event => setSelectedPhones(values => event.target.checked ? [...values, recipient.phone] : values.filter(phone => phone !== recipient.phone))} /> {recipient.name} · {recipient.phone}</span><small>{recipient.detail}</small></label></li>)}</ul>
      <label>Message<textarea value={message} onChange={event => setMessage(event.target.value)} /></label>
      <p>{smsSegments(message).segments} SMS segments per recipient</p><button type="button" onClick={review}>Preview message</button>
    </>}
    {stage === 'review' && <>
      <h3>Review before {isText ? 'sending' : isForm ? 'publishing' : 'saving'}</h3>
      {isForm && <><p>Publish “{form.title}” at /forms/{form.slug}. This makes the form available to the public.</p><p>{form.questions?.length || 0} fields · last edited {form.updated_at}</p></>}
      {isAttendance && <><ul>{roll.map(row => <li key={attendanceRowId(row)}>{row.full_name || row.email} · {attendance[attendanceRowId(row)]?.replace('_', ' ')}</li>)}</ul><p>Saving completes this class and removes it from the public timetable. First-time attendance cannot be undone here.</p></>}
      {!isText && !isForm && !isAttendance && <p>Confirm this member’s place in the class shown above. The existing capacity, time conflict and queue rules apply. A member notice may be delivered.</p>}
      {isText && <><p>Send this exact message to {recipients.length} selected recipients:</p><blockquote className="whitespace-pre-wrap">{message}</blockquote><ul>{recipients.map(row => <li key={row.phone}>{row.name} · {row.phone}</li>)}</ul><p>Sending cannot be undone. A failed response may have delivered messages; check delivery results before starting another campaign.</p></>}
      <button type="button" disabled={pending || (isText && !!error)} onClick={() => submit()}>{pending ? 'Saving…' : isText ? 'Send reviewed message' : isForm ? 'Publish reviewed form' : isAttendance ? 'Save attendance' : 'Confirm reviewed booking'}</button>
    </>}
    {stage === 'done' && <><p role="status">{pending ? 'Saving attendance correction…' : result}</p>{isAttendance && <ul>{roll.map(row => <li key={attendanceRowId(row)}>{row.full_name || row.email} · {row.status?.replace('_', ' ')}{pending ? ' (pending)' : ''}</li>)}</ul>}{undoStatus && <button type="button" disabled={pending} onClick={() => submit(true)}>Undo attendance change</button>}</>}
    <footer>
      {error && !['review', 'done'].includes(stage) && <button type="button" disabled={loading} onClick={() => setRetry(value => value + 1)}>Retry loading</button>}
      <button type="button" disabled={pending} onClick={back}>{stage === 'done' ? 'Back to commands' : 'Back'}</button>
      <button type="button" disabled={pending} onClick={onBack}>Cancel command</button>
    </footer>
  </section>;
}
