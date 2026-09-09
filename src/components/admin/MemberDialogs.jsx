import React, { useEffect, useRef, useState } from 'react';
import { toast } from '@/components/ui/use-toast';
import { adminAddMemberNote, adminGrantCredits } from '@/lib/adminData';
import { creditGrantValidationError } from '@/lib/memberAdmin';
import { createFollowUpLog } from '@/lib/memberFollowUp';
import MemberConfirmation from './MemberConfirmation';
import { ADMIN_BUTTON, AdminDrawer, AdminSegmented } from '@/components/admin/ui';

export function FollowUpModal({ member, onDone, onCancel, onDirtyChange }) {
  const [channel, setChannel] = useState('email');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const [discard, setDiscard] = useState(false);
  const dirty = Boolean(note || channel !== 'email');
  useEffect(() => {onDirtyChange?.(dirty || saving);}, [dirty, saving, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  const close = () => {if (!saving) {if (dirty) setDiscard(true); else onCancel();}};

  const handleSubmit = async event => {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setError('');
    try {
      const body = createFollowUpLog(member, channel, note);
      await adminAddMemberNote(member.id, 'follow_up', body);
      toast({ title: 'Follow-up recorded', description: `${member.full_name || member.email} will leave the queue for seven days.` });
      onDone();
    } catch (submitError) {
      setError(submitError.message || 'Could not record this follow-up.');
      setSaving(false);
      pending.current = false;
    }
  };

  return (
    <AdminDrawer open title="Log Follow-up" description={member.full_name || member.email} closeDisabled={saving} onOpenChange={open => !open && close()}>
      <form onSubmit={handleSubmit} className="members-workspace members-stack admin-kit-container">
        <div className="members-stack">
          <div>
            <label htmlFor="follow-up-channel" className="block font-body text-sm text-text-secondary uppercase tracking-wider mb-1">Contact method</label>
            <select id="follow-up-channel" value={channel} onChange={event => setChannel(event.target.value)} disabled={saving} className="admin-kit-input">
              <option value="email">Email</option>
              <option value="phone">Phone call</option>
              <option value="sms">SMS</option>
              <option value="in_person">In person</option>
            </select>
          </div>
          <div>
            <label htmlFor="follow-up-context" className="block font-body text-sm text-text-secondary uppercase tracking-wider mb-1">Context (optional)</label>
            <textarea id="follow-up-context" value={note} onChange={event => setNote(event.target.value)} disabled={saving} maxLength={500} rows={3} placeholder="Outcome, callback requested, or anything staff should know" className="admin-kit-input" />
            <p className="mt-1 font-body text-sm text-text-secondary text-right">{note.length}/500</p>
          </div>
          <p className="font-body text-sm leading-relaxed text-text-secondary">This adds a dated staff note and removes the member from the follow-up queue for seven days.</p>
          {error && <p role="alert" className="font-body text-sm text-state-danger">{error}</p>}
        </div>
        <div className="members-actions">
          <button type="button" onClick={close} disabled={saving} className="admin-kit-button">Cancel</button>
          <button type="submit" disabled={saving} className={`admin-kit-button ${ADMIN_BUTTON.primary}`}>
            {saving ? 'Saving...' : 'Mark Contacted'}
          </button>
        </div>
      </form>
      <MemberConfirmation open={discard} onOpenChange={setDiscard} title="Discard follow-up draft?" description="This follow-up has not been recorded." cancelLabel="Keep writing" confirmLabel="Discard draft" onConfirm={onCancel} />
    </AdminDrawer>
  );
}

export function GrantCreditsModal({ member, onDone, onCancel, onDirtyChange }) {
  const [sessions, setSessions] = useState(1);
  const [validityDays, setValidityDays] = useState(28);
  const [note, setNote] = useState('');
  const [requestId] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const [discard, setDiscard] = useState(false);
  const dirty = Boolean(note || sessions !== 1 || validityDays !== 28);
  useEffect(() => {onDirtyChange?.(dirty || saving);}, [dirty, saving, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  const close = () => {if (!saving) {if (dirty) setDiscard(true); else onCancel();}};

  const validationError = creditGrantValidationError({ sessions, validityDays, note });

  const handleGrant = async () => {
    if (pending.current) return;
    if (validationError) {
      setError(validationError);
      return;
    }
    pending.current = true;
    setSaving(true);
    setError('');
    try {
      await adminGrantCredits(member.id, sessions, validityDays > 0 ? validityDays : null, requestId, note.trim());
      toast({ title: 'Credits granted', description: `${sessions} credit${sessions === 1 ? '' : 's'} added to ${member.full_name || member.email}.` });
      onDone();
    } catch (e) {
      setError(e.message);
      setSaving(false);
      pending.current = false;
    }
  };

  return (
    <AdminDrawer open title="Grant Credits" description={member.full_name || member.email} closeDisabled={saving} onOpenChange={open => !open && close()}>
      <div className="members-workspace admin-kit-container">
        <fieldset disabled={saving} className="members-stack">
          <div>
            <label htmlFor="grant-credit-count" className="block font-body text-sm text-text-secondary uppercase tracking-wider mb-1">Class credits</label>
            <input id="grant-credit-count" type="number" min="1" max="100" value={sessions} onChange={e => setSessions(+e.target.value)} className="admin-kit-input" />
            <AdminSegmented label="Credit presets" value={sessions} onValueChange={setSessions} options={[1,4,10].map(value => ({value, label:String(value), disabled:saving}))} />
          </div>
          <div>
            <label htmlFor="grant-validity-days" className="block font-body text-sm text-text-secondary uppercase tracking-wider mb-1">Validity (days, 0 = never expires)</label>
            <input id="grant-validity-days" type="number" min="0" max="3650" value={validityDays} onChange={e => setValidityDays(+e.target.value)} className="admin-kit-input" />
            <AdminSegmented label="Validity presets" value={validityDays} onValueChange={setValidityDays} options={[{label:'14 days',value:14},{label:'28 days',value:28},{label:'56 days',value:56},{label:'No expiry',value:0}].map(option => ({...option,disabled:saving}))} />
          </div>
          <div>
            <label htmlFor="grant-credit-reason" className="block font-body text-sm text-text-secondary uppercase tracking-wider mb-1">Grant reason</label>
            <textarea id="grant-credit-reason" value={note} onChange={event => setNote(event.target.value)} maxLength={500} rows={3} placeholder="e.g. Cash sale, service recovery, competition prize" className="admin-kit-input" />
            <p className="font-body text-sm text-text-secondary mt-1">Required for the permanent admin audit trail.</p>
          </div>
          <p className="font-body text-sm text-text-secondary">
            Use for comps, refunds or manual/cash sales. Credits appear instantly in the member&rsquo;s account.
          </p>
          {error && <p role="alert" className="font-body text-sm text-state-danger">{error}</p>}
        </fieldset>
        <div className="members-actions">
          <button type="button" disabled={saving} onClick={close} className="admin-kit-button">Cancel</button>
          <button type="button" onClick={handleGrant} disabled={saving}
            className={`admin-kit-button ${ADMIN_BUTTON.primary}`}>
            {saving ? 'Granting…' : `Grant ${sessions}`}
          </button>
        </div>
      </div>
      <MemberConfirmation open={discard} onOpenChange={setDiscard} title="Discard credit grant draft?" description="These credits have not been granted." cancelLabel="Keep writing" confirmLabel="Discard draft" onConfirm={onCancel} />
    </AdminDrawer>
  );
}
