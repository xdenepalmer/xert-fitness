import React, { useEffect, useRef, useState } from 'react';
import { toast } from '@/components/ui/use-toast';
import { updateLead } from '@/lib/adminData';
import FitboxLeadHandoff from '@/components/admin/FitboxLeadHandoff';
import { ADMIN_BUTTON, AdminDrawer, AdminFormField } from '@/components/admin/ui';

function DetailField({ label, children }) {
  return <div><dt>{label}</dt><dd>{children || '—'}</dd></div>;
}

export default function LeadDetailDrawer({ lead, statuses, table, onClose, onUpdate, onDirtyChange }) {
  const [status, setStatus] = useState(lead.status || 'new');
  const [notes, setNotes] = useState(lead.admin_notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const savingRef = useRef(false);
  const dirty = status !== (lead.status || 'new') || notes !== (lead.admin_notes || '');

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  function requestClose() {
    if (savingRef.current) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  }

  async function save() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      await updateLead(table, lead.id, { status, admin_notes: notes });
      onDirtyChange?.(false);
      await onUpdate();
      toast({ title: 'Lead updated', description: `${lead.full_name || 'Lead'} is now ${status.replace(/_/g, ' ')}.` });
      onClose();
    } catch (e) {
      setError(e.message);
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return <>
    <AdminDrawer open title="Lead Detail" closeLabel="Close lead details" onOpenChange={open => { if (!open) requestClose(); }}
      footer={<><button type="button" className="admin-kit-button" disabled={saving} onClick={requestClose}>Cancel</button><button type="button" className={ADMIN_BUTTON.primary} disabled={saving} onClick={() => void save()}>{saving ? 'Saving...' : 'Save changes'}</button></>}>
      <div className="lead-detail admin-kit-container">
        <dl className="lead-detail-fields">
          <DetailField label="Name">{lead.full_name}</DetailField>
          <DetailField label="Email">{lead.email && <a href={`mailto:${lead.email}`}>{lead.email}</a>}</DetailField>
          <DetailField label="Phone">{lead.phone && <a href={`tel:${lead.phone}`}>{lead.phone}</a>}</DetailField>
          {lead.suburb_town && <DetailField label="Suburb">{lead.suburb_town}</DetailField>}
          {lead.current_training_level && <DetailField label="Level">{lead.current_training_level}</DetailField>}
          {lead.main_training_goals?.length > 0 && <DetailField label="Goals">{lead.main_training_goals.join(', ')}</DetailField>}
          {lead.preferred_training_times?.length > 0 && <DetailField label="Preferred times">{lead.preferred_training_times.join(', ')}</DetailField>}
          {lead.qualifications && <DetailField label="Qualifications">{lead.qualifications}</DetailField>}
          {lead.profession && <DetailField label="Profession">{lead.profession}</DetailField>}
          {lead.business_name && <DetailField label="Business">{lead.business_name}</DetailField>}
          {lead.short_intro && <DetailField label="Intro">{lead.short_intro}</DetailField>}
          <DetailField label="Source">{lead.utm_source}</DetailField>
          {lead.utm_medium && <DetailField label="Campaign medium">{lead.utm_medium}</DetailField>}
          {lead.utm_campaign && <DetailField label="Campaign">{lead.utm_campaign}</DetailField>}
          <DetailField label="Submitted">{new Date(lead.created_at).toLocaleString('en-AU')}</DetailField>
          <DetailField label="Lead ID">{lead.id}</DetailField>
        </dl>
        {table === 'member_interest' && <FitboxLeadHandoff lead={lead} />}
        <AdminFormField id="lead-status" label="Status">
          <select value={status} disabled={saving} onChange={event => setStatus(event.target.value)}>
            {!statuses.includes(status) && <option value={status}>{status.replace(/_/g, ' ')}</option>}
            {statuses.map(value => <option key={value} value={value}>{value.replace(/_/g, ' ')}</option>)}
          </select>
        </AdminFormField>
        <AdminFormField id="lead-notes" label="Admin notes" helper={`${notes.length} / 5000 characters. Internal notes stay out of CSV exports.`}>
          <textarea maxLength={5000} rows={5} value={notes} disabled={saving} onChange={event => setNotes(event.target.value)} placeholder="Internal notes..." />
        </AdminFormField>
        {dirty && <p className="lead-secondary" role="status">Unsaved changes</p>}
        {error && <p className="admin-field-error" role="alert">{error}</p>}
      </div>
    </AdminDrawer>
    <AdminDrawer role="alertdialog" open={confirmDiscard} onOpenChange={setConfirmDiscard} title="Discard unsaved lead changes?" children={null}
      description="This lead draft has changes that have not been saved." closeLabel="Close discard confirmation"
      footer={<><button type="button" className="admin-kit-button" onClick={() => setConfirmDiscard(false)}>Keep editing</button><button type="button" className={ADMIN_BUTTON.danger} onClick={onClose}>Discard changes</button></>} />
  </>;
}
