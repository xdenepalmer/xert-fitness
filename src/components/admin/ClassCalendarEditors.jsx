import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { createClassSession, updateClassSession, createClassSessions } from '@/lib/adminData';
import { blackoutsOverlappingSession, classSessionEditorForm, classSessionEditorIsDirty, classSessionValidationError, repeatedClassSessionCopies } from '@/lib/scheduling';
import { BOOKING_MODE_LABELS } from '@/lib/classSignup';
import { ADMIN_BUTTON, AdminDrawer, AdminFormField } from '@/components/admin/ui';

const CLASS_TYPES = ['XERT Foundation', 'XERT Strength', 'XERT Engine', 'XERT Hybrid', 'XERT Event Prep', 'XERT Team'];
const BOOKING_MODES = ['interest_only', 'request_to_book', 'instant_book'];
const INTENSITY = ['Low', 'Moderate', 'High', 'Very high'];

function classEditorStatuses(session) {
  if (!session?.id) return ['draft', 'published'];
  if (session.status === 'full') return ['full', 'published'];
  if (['cancelled', 'completed'].includes(session.status)) return [session.status];
  return ['draft', 'published'];
}

export function SessionEditor({ session, blackouts, onSave, onCancel, onDirtyChange }) {
  const [form, setForm] = useState(() => classSessionEditorForm(session));
  const [saving, setSaving] = useState(false);
  const [showDiscardConfirmation, setShowDiscardConfirmation] = useState(false);
  const isDirty = classSessionEditorIsDirty(form, session);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));
  const overlappingBlackouts = blackoutsOverlappingSession(form, blackouts);
  const requestCancel = () => {
    if (saving) return;
    if (isDirty) {
      setShowDiscardConfirmation(true);
      return;
    }
    onCancel();
  };

  const handleSave = async () => {
    const validationError = classSessionValidationError(form);
    if (validationError) {
      toast({ title: validationError, variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      if (session?.id) {
        await updateClassSession(session.id, form);
      } else {
        await createClassSession(form);
      }
      onDirtyChange?.(false);
      onSave();
    } catch (e) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <AdminDrawer open onOpenChange={open => { if (!open) requestCancel(); }} title={session?.id ? 'Edit Class' : 'New Class'} closeLabel="Close class editor">
        <div className="calendar-editor admin-kit-container">
          <div className="calendar-form-grid">
            <AdminFormField id="class-type" label="Class type">
              <select id="class-type" value={form.class_type} onChange={e => set('class_type', e.target.value)}>
                {CLASS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </AdminFormField>
            <AdminFormField id="class-status" label="Status" helper={session?.id && ['cancelled', 'completed'].includes(session.status) ? 'Terminal class status is locked. Create a new class rather than reopening it.' : null}>
              <select id="class-status" value={form.status} onChange={e => set('status', e.target.value)}>
                {classEditorStatuses(session).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </AdminFormField>
          </div>
          <AdminFormField id="class-title" label="Title" required>
            <input id="class-title" required value={form.title} onChange={e => set('title', e.target.value)} placeholder="Class title" />
          </AdminFormField>
          <AdminFormField id="class-description" label="Description">
            <textarea id="class-description" value={form.description} onChange={e => set('description', e.target.value)} rows={2} />
          </AdminFormField>
          <div className="calendar-form-grid">
            <AdminFormField id="class-start" label="Start time">
              <input id="class-start" type="datetime-local" value={form.start_time} onChange={e => set('start_time', e.target.value)} />
            </AdminFormField>
            <AdminFormField id="class-end" label="End time">
              <input id="class-end" type="datetime-local" value={form.end_time} onChange={e => set('end_time', e.target.value)} />
            </AdminFormField>
            <AdminFormField id="class-duration" label="Duration (min)">
              <input id="class-duration" type="number" min="1" step="1" value={form.duration_minutes} onChange={e => set('duration_minutes', +e.target.value)} />
            </AdminFormField>
          </div>
          <div className="calendar-form-grid">
            <AdminFormField id="class-capacity" label="Capacity">
              <input id="class-capacity" type="number" min="1" step="1" value={form.capacity} onChange={e => set('capacity', +e.target.value)} />
            </AdminFormField>
            <AdminFormField id="class-intensity" label="Intensity">
              <select id="class-intensity" value={form.intensity_level} onChange={e => set('intensity_level', e.target.value)}>
                {INTENSITY.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </AdminFormField>
            <AdminFormField id="class-booking-mode" label="Booking mode">
              <select id="class-booking-mode" value={form.booking_mode} onChange={e => set('booking_mode', e.target.value)}>
                {BOOKING_MODES.map(m => <option key={m} value={m}>{BOOKING_MODE_LABELS[m] || m}</option>)}
              </select>
            </AdminFormField>
          </div>
          {overlappingBlackouts.length > 0 && (
            <div role="alert" className="border border-xert-orange/40 bg-xert-orange/10 p-3 flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-xert-orange" />
              <p className="font-body text-xs leading-relaxed text-xert-concrete/80">
                This class overlaps a blackout: {overlappingBlackouts.map(blackout => blackout.reason).join(', ')}.
              </p>
            </div>
          )}
          <div className="calendar-form-grid">
            <AdminFormField id="class-coach" label="Coach name">
              <input id="class-coach" value={form.coach_name} onChange={e => set('coach_name', e.target.value)} />
            </AdminFormField>
            <AdminFormField id="class-location" label="Location / zone">
              <input id="class-location" value={form.location_zone} onChange={e => set('location_zone', e.target.value)} />
            </AdminFormField>
          </div>
          <div className="flex flex-wrap gap-6">
            <label className="flex min-h-11 items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.beginner_friendly} onChange={e => set('beginner_friendly', e.target.checked)} className="peer sr-only" />
              <span aria-hidden="true" className="w-5 h-5 border-2 border-xert-steel/50 flex items-center justify-center peer-checked:border-xert-red peer-checked:bg-xert-steel peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-xert-offwhite">{form.beginner_friendly && <span className="text-xert-navy text-xs">&#10003;</span>}</span>
              <span className="font-body text-sm text-xert-concrete/80">Beginner friendly</span>
            </label>
            <label className="flex min-h-11 items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.public_visible} onChange={e => set('public_visible', e.target.checked)} className="peer sr-only" />
              <span aria-hidden="true" className="w-5 h-5 border-2 border-xert-steel/50 flex items-center justify-center peer-checked:border-status-confirmed-500 peer-checked:bg-status-confirmed-500 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-xert-offwhite">{form.public_visible && <span className="text-white text-xs">&#10003;</span>}</span>
              <span className="font-body text-sm text-xert-concrete/80">Public visible</span>
            </label>
          </div>
          <AdminFormField id="class-notes" label="Notes">
            <textarea id="class-notes" value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
          </AdminFormField>
        </div>
        <div className="calendar-dialog-actions">
          <button type="button" onClick={requestCancel} disabled={saving}
            className="flex-1 py-3 border border-xert-steel/40 font-display text-sm text-xert-concrete/70 uppercase hover:border-xert-steel transition-colors">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            className={`${ADMIN_BUTTON.primary} flex-1`}>
            {saving ? 'Saving...' : 'Save class'}
          </button>
        </div>
      </AdminDrawer>
      <AdminDrawer role="alertdialog"
        open={showDiscardConfirmation}
        onOpenChange={setShowDiscardConfirmation}
        title="Discard unsaved class changes?"
        description="This class draft has changes that have not been saved."
        closeLabel="Close discard confirmation"
        footer={<>
          <button type="button" className={ADMIN_BUTTON.ghost} onClick={() => setShowDiscardConfirmation(false)}>Keep editing</button>
          <button type="button" className={ADMIN_BUTTON.danger} onClick={() => { onDirtyChange?.(false); onCancel(); }}>Discard changes</button>
        </>}
      ><p>Discarding will permanently remove the edits made in this class editor.</p></AdminDrawer>
    </>
  );
}

export function RepeatModal({ session, onDone, onCancel }) {
  const [intervalDays, setIntervalDays] = useState(8); // 4-on/4-off cycle
  const [count, setCount] = useState(4);
  const [keepPublished, setKeepPublished] = useState(session.status === 'published');
  const [saving, setSaving] = useState(false);

  const handleRepeat = async () => {
    if (!session.start_time) { toast({ title: 'This class needs a start time before it can be repeated.', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const copies = repeatedClassSessionCopies(session, { intervalDays, count, keepPublished });
      await createClassSessions(copies);
      onDone(copies.length);
    } catch (e) {
      toast({ title: 'Repeat failed', description: e.message, variant: 'destructive' });
      setSaving(false);
    }
  };

  const preview = session.start_time
    ? Array.from({ length: Math.min(count, 3) }, (_, i) =>
        new Date(new Date(session.start_time).getTime() + (i + 1) * intervalDays * 86400000)
          .toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }))
    : [];

  return (
    <AdminDrawer open onOpenChange={open => { if (!open && !saving) onCancel(); }} title="Repeat Class" description={session.title} closeLabel="Close repeat class">
        <div className="calendar-editor admin-kit-container">
          <div className="calendar-form-grid">
            <AdminFormField id="repeat-interval" label="Every ... days">
              <select id="repeat-interval" value={intervalDays} onChange={e => setIntervalDays(+e.target.value)}>
                <option value={1}>1 (daily)</option>
                <option value={2}>2</option>
                <option value={7}>7 (weekly)</option>
                <option value={8}>8 (4-on / 4-off cycle)</option>
                <option value={14}>14 (fortnightly)</option>
              </select>
            </AdminFormField>
            <AdminFormField id="repeat-count" label="Copies">
              <input id="repeat-count" type="number" min="1" max="26" value={count} onChange={e => setCount(Math.max(1, Math.min(26, +e.target.value)))} />
            </AdminFormField>
          </div>
          {preview.length > 0 && (
            <p className="font-body text-xs text-xert-concrete/40">
              Next dates: {preview.join(', ')}{count > 3 ? '…' : ''}
            </p>
          )}
          <label className="flex min-h-11 items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={keepPublished} onChange={e => setKeepPublished(e.target.checked)} className="peer sr-only" />
            <span aria-hidden="true" className="w-5 h-5 border-2 border-xert-steel/50 flex items-center justify-center peer-checked:border-status-confirmed-500 peer-checked:bg-status-confirmed-500 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-xert-offwhite">{keepPublished && <span className="text-white text-xs">&#10003;</span>}</span>
            <span className="font-body text-sm text-xert-concrete/80">Copies keep this class&rsquo;s publish status</span>
          </label>
        </div>
        <div className="calendar-dialog-actions">
          <button type="button" onClick={onCancel} disabled={saving} className="flex-1 py-3 border border-xert-steel/40 font-display text-sm text-xert-concrete/70 uppercase hover:border-xert-steel transition-colors disabled:opacity-50">Cancel</button>
          <button type="button" onClick={handleRepeat} disabled={saving}
            className={`${ADMIN_BUTTON.primary} flex-1`}>
            {saving ? 'Creating…' : `Create ${count} copies`}
          </button>
        </div>
    </AdminDrawer>
  );
}
