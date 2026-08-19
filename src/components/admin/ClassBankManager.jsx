import React, { useEffect, useState } from 'react';
import { Clock, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import AdminConfirmDialog from '@/components/admin/AdminConfirmDialog';
import { createClassTemplate, deleteClassTemplate, updateClassTemplate } from '@/lib/adminData';
import { classTemplateEditorForm, classTemplateEditorIsDirty, classTemplateValidationError, formatStartMinute } from '@/lib/classCalendar';
import { BOOKING_MODE_LABELS } from '@/lib/classSignup';

const CLASS_TYPES = ['XERT Foundation', 'XERT Strength', 'XERT Engine', 'XERT Hybrid', 'XERT Event Prep', 'XERT Team'];
const BOOKING_MODES = ['interest_only', 'request_to_book', 'instant_book'];
const INTENSITY = ['Low', 'Moderate', 'High', 'Very high'];

const inputClass = 'w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red';
const labelClass = 'block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1';

function TemplateEditor({ template, onSaved, onCancel, onDirtyChange }) {
  const [form, setForm] = useState(() => classTemplateEditorForm(template));
  const [saving, setSaving] = useState(false);
  const isDirty = classTemplateEditorIsDirty(form, template);

  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const set = (field, value) => setForm(previous => ({ ...previous, [field]: value }));

  const handleSave = async () => {
    const validationError = classTemplateValidationError(form);
    if (validationError) {
      toast({ title: validationError, variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      if (template?.id) {
        await updateClassTemplate(template.id, form);
      } else {
        await createClassTemplate(form);
      }
      onDirtyChange?.(false);
      onSaved();
    } catch (error) {
      toast({ title: 'Bank save failed', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-xert-steel/25 bg-xert-charcoal p-4 sm:p-5 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="bank-name" className={labelClass}>Bank name *</label>
          <input id="bank-name" required value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. 6am Engine" className={inputClass} />
        </div>
        <div>
          <label htmlFor="bank-class-type" className={labelClass}>Class type</label>
          <select id="bank-class-type" value={form.class_type} onChange={e => set('class_type', e.target.value)} className={inputClass}>
            {CLASS_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="bank-title" className={labelClass}>Class title (defaults to bank name)</label>
        <input id="bank-title" value={form.title} onChange={e => set('title', e.target.value)} placeholder={form.name || 'Class title'} className={inputClass} />
      </div>
      <div>
        <label htmlFor="bank-description" className={labelClass}>Description</label>
        <textarea id="bank-description" value={form.description} onChange={e => set('description', e.target.value)} rows={2} className={`${inputClass} resize-none`} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <label htmlFor="bank-start" className={labelClass}>Usual start</label>
          <input id="bank-start" type="time" value={form.default_start} onChange={e => set('default_start', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="bank-duration" className={labelClass}>Duration (min)</label>
          <input id="bank-duration" type="number" min="1" step="1" value={form.duration_minutes} onChange={e => set('duration_minutes', +e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="bank-capacity" className={labelClass}>Capacity</label>
          <input id="bank-capacity" type="number" min="1" step="1" value={form.capacity} onChange={e => set('capacity', +e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="bank-intensity" className={labelClass}>Intensity</label>
          <select id="bank-intensity" value={form.intensity_level} onChange={e => set('intensity_level', e.target.value)} className={inputClass}>
            {INTENSITY.map(level => <option key={level} value={level}>{level}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label htmlFor="bank-coach" className={labelClass}>Coach name</label>
          <input id="bank-coach" value={form.coach_name} onChange={e => set('coach_name', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="bank-location" className={labelClass}>Location / zone</label>
          <input id="bank-location" value={form.location_zone} onChange={e => set('location_zone', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="bank-booking-mode" className={labelClass}>Booking mode</label>
          <select id="bank-booking-mode" value={form.booking_mode} onChange={e => set('booking_mode', e.target.value)} className={inputClass}>
            {BOOKING_MODES.map(mode => <option key={mode} value={mode}>{BOOKING_MODE_LABELS[mode] || mode}</option>)}
          </select>
        </div>
      </div>
      <label className="flex min-h-11 items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={form.beginner_friendly} onChange={e => set('beginner_friendly', e.target.checked)} className="peer sr-only" />
        <span aria-hidden="true" className="w-5 h-5 border-2 border-xert-steel/50 flex items-center justify-center peer-checked:border-xert-red peer-checked:bg-xert-steel peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-xert-offwhite">{form.beginner_friendly && <span className="text-xert-navy text-xs">&#10003;</span>}</span>
        <span className="font-body text-sm text-xert-concrete/80">Beginner friendly</span>
      </label>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} disabled={saving}
          className="min-h-11 border border-xert-steel/40 px-5 font-display text-xs uppercase text-xert-concrete/70 hover:border-xert-steel transition-colors disabled:opacity-50">
          Cancel
        </button>
        <button type="button" onClick={handleSave} disabled={saving}
          className="min-h-11 bg-xert-steel px-5 font-display text-xs uppercase text-xert-navy hover:bg-xert-pale transition-colors disabled:opacity-50">
          {saving ? 'Saving…' : template?.id ? 'Save bank entry' : 'Add to bank'}
        </button>
      </div>
    </div>
  );
}

export default function ClassBankManager({ templates, available, loading, onChanged, onClose, onDirtyChange }) {
  const [editing, setEditing] = useState(null); // null = list, {} = new, {...row} = edit
  const [editorDirty, setEditorDirty] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [showDiscardConfirmation, setShowDiscardConfirmation] = useState(false);
  const [pendingAfterDiscard, setPendingAfterDiscard] = useState(null);

  const reportDirty = value => {
    setEditorDirty(value);
    onDirtyChange?.(value);
  };

  const guardedNavigate = action => {
    if (editing && editorDirty) {
      setPendingAfterDiscard(() => action);
      setShowDiscardConfirmation(true);
      return;
    }
    action();
  };

  const handleDelete = async () => {
    if (!templateToDelete) return;
    setDeleting(true);
    try {
      await deleteClassTemplate(templateToDelete.id);
      toast({ title: 'Bank entry removed', description: `${templateToDelete.name} will no longer be offered on calendar dates.` });
      setTemplateToDelete(null);
      onChanged();
    } catch (error) {
      toast({ title: 'Could not remove bank entry', description: error.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-0 sm:items-center sm:p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="class-bank-title"
        className="flex max-h-[100dvh] w-full max-w-2xl flex-col border border-xert-steel/20 bg-xert-ink sm:max-h-[90vh]">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-xert-steel/20 p-5 sm:p-6">
          <div>
            <p className="font-body text-[10px] uppercase tracking-[0.22em] text-xert-steel">Reusable classes</p>
            <h3 id="class-bank-title" className="mt-1 font-display text-2xl uppercase text-xert-offwhite">Class bank</h3>
            <p className="mt-2 font-body text-xs leading-relaxed text-xert-concrete/55">
              Saved presets appear when you press a calendar date, so a regular class lands on the timetable in one tap.
            </p>
          </div>
          <button type="button" onClick={() => guardedNavigate(onClose)} aria-label="Close class bank" title="Close"
            className="inline-flex min-h-11 min-w-11 items-center justify-center text-xert-concrete/60 hover:text-xert-offwhite">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
          {!available ? (
            <p className="font-body text-xs" style={{ color: '#e0b36a' }}>
              The class bank becomes available after class_template_bank.sql is applied.
            </p>
          ) : editing ? (
            <TemplateEditor
              key={editing.id || 'new-template'}
              template={editing.id ? editing : null}
              onSaved={() => { setEditing(null); reportDirty(false); onChanged(); toast({ title: editing.id ? 'Bank entry updated' : 'Saved to class bank' }); }}
              onCancel={() => guardedNavigate(() => setEditing(null))}
              onDirtyChange={reportDirty}
            />
          ) : loading ? (
            <div className="space-y-2">{[1, 2, 3].map(index => <div key={index} className="h-16 bg-xert-charcoal animate-pulse" />)}</div>
          ) : templates.length === 0 ? (
            <div className="border border-xert-steel/20 py-12 text-center">
              <p className="font-display text-lg text-xert-offwhite uppercase mb-2">The bank is empty</p>
              <p className="mx-auto max-w-sm font-body text-sm text-xert-concrete/50">
                Save your regular classes once, then drop them onto any date. You can also save an existing class straight from the calendar.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {templates.map(template => (
                <li key={template.id} className="flex flex-wrap items-center justify-between gap-3 border border-xert-steel/15 bg-xert-charcoal p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-base uppercase text-xert-offwhite">{template.name}</p>
                    <p className="mt-0.5 font-body text-xs text-xert-concrete/50">
                      {template.class_type} · <Clock className="inline h-3 w-3 -mt-0.5" aria-hidden="true" /> {formatStartMinute(template.default_start_minute)} · {template.duration_minutes}min · Cap {template.capacity}
                      {template.coach_name ? ` · ${template.coach_name}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button type="button" onClick={() => setEditing(template)}
                      className="inline-flex min-h-11 items-center gap-1.5 border border-xert-steel/30 px-3 font-body text-xs text-xert-concrete/60 hover:border-xert-steel transition-colors">
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                    <button type="button" onClick={() => setTemplateToDelete(template)}
                      className="inline-flex min-h-11 items-center gap-1.5 border border-xert-red/30 px-3 font-body text-xs text-xert-red/60 hover:border-xert-red/60 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {available && !editing && (
          <div className="flex shrink-0 justify-end border-t border-xert-steel/20 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:p-6">
            <button type="button" onClick={() => setEditing({})}
              className="inline-flex min-h-11 items-center gap-2 bg-xert-steel px-5 font-display text-xs uppercase text-xert-navy hover:bg-xert-pale transition-colors">
              <Plus className="h-4 w-4" /> New bank entry
            </button>
          </div>
        )}
      </div>

      <AdminConfirmDialog
        open={Boolean(templateToDelete)}
        onOpenChange={open => { if (!open) setTemplateToDelete(null); }}
        title="Remove this bank entry?"
        description={templateToDelete ? `${templateToDelete.name} will no longer be offered when you press a calendar date. Classes already on the calendar are not affected.` : ''}
        warning="This permanently deletes the saved preset."
        cancelLabel="Keep entry"
        confirmLabel={deleting ? 'Removing…' : 'Remove entry'}
        busy={deleting}
        onConfirm={handleDelete}
      />
      <AdminConfirmDialog
        open={showDiscardConfirmation}
        onOpenChange={setShowDiscardConfirmation}
        title="Discard unsaved bank changes?"
        description="This bank entry has changes that have not been saved."
        warning="Discarding will permanently remove the edits made in this editor."
        cancelLabel="Keep editing"
        confirmLabel="Discard changes"
        onConfirm={() => {
          reportDirty(false);
          setEditing(null);
          const action = pendingAfterDiscard;
          setPendingAfterDiscard(null);
          action?.();
        }}
      />
    </div>
  );
}
