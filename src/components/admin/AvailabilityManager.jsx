import React, { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { getAvailabilityBlocks, createAvailabilityBlock, updateAvailabilityBlock, deleteAvailabilityBlock, getBlackoutPeriods, createBlackoutPeriod, updateBlackoutPeriod, deleteBlackoutPeriod } from '@/lib/adminData';
import { availabilityBlockEditorForm, blackoutPeriodEditorForm, normalizeAvailabilityBlock, normalizeBlackoutPeriod } from '@/lib/scheduling';
import AdminConfirmDialog from '@/components/admin/AdminConfirmDialog';
import { ADMIN_BUTTON, ADMIN_PAGE } from '@/components/admin/ui';

const BLOCK_TYPES = ['PT available', 'private session available', 'group class available', 'admin only', 'open gym placeholder', 'workshop placeholder'];
const AFFECTS = ['all', 'group_classes', 'pt_only', 'facility_only', 'coach_only'];
const BLACKOUT_REASONS = ['full day unavailable', 'partial day unavailable', 'recurring unavailable', 'personal work', 'facility maintenance', 'equipment install', 'private event', 'soft launch restricted'];
const emptyBlock = () => ({ start_time: '', end_time: '', type: 'PT available', coach_name: '', notes: '', is_bookable: false });
const emptyBlackout = () => ({ start_time: '', end_time: '', affects: 'all', reason: 'facility maintenance', notes: '' });

export default function AvailabilityManager() {
  const [blocks, setBlocks] = useState([]);
  const [blackouts, setBlackouts] = useState([]);
  const [tab, setTab] = useState('availability');
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [showBlackoutForm, setShowBlackoutForm] = useState(false);
  const [blockForm, setBlockForm] = useState(emptyBlock);
  const [blackoutForm, setBlackoutForm] = useState(emptyBlackout);
  const [editingBlock, setEditingBlock] = useState(null);
  const [editingBlackout, setEditingBlackout] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [removingId, setRemovingId] = useState(null);
  const [pendingRemoval, setPendingRemoval] = useState(null);

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [loadedBlocks, loadedBlackouts] = await Promise.all([getAvailabilityBlocks(), getBlackoutPeriods()]);
      setBlocks(loadedBlocks);
      setBlackouts(loadedBlackouts);
    } catch (error) {
      const message = error.message || 'Could not load availability records.';
      setLoadError(message);
      toast({ title: 'Could not load availability', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!showBlockForm && !showBlackoutForm) return undefined;
    const closeOnEscape = event => {
      if (event.key !== 'Escape' || saving) return;
      setShowBlockForm(false);
      setShowBlackoutForm(false);
      setEditingBlock(null);
      setEditingBlackout(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [saving, showBlackoutForm, showBlockForm]);

  const saveBlock = async () => {
    setSaving(true);
    try {
      const payload = normalizeAvailabilityBlock(blockForm);
      if (editingBlock) await updateAvailabilityBlock(editingBlock.id, payload, editingBlock.updated_at);
      else await createAvailabilityBlock(payload);
      setBlockForm(emptyBlock());
      setEditingBlock(null);
      setShowBlockForm(false);
      await load();
      toast({ title: editingBlock ? 'Availability block updated' : 'Availability block saved' });
    } catch (e) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const saveBlackout = async () => {
    setSaving(true);
    try {
      const payload = normalizeBlackoutPeriod(blackoutForm);
      if (editingBlackout) await updateBlackoutPeriod(editingBlackout.id, payload, editingBlackout.updated_at);
      else await createBlackoutPeriod(payload);
      setBlackoutForm(emptyBlackout());
      setEditingBlackout(null);
      setShowBlackoutForm(false);
      await load();
      toast({ title: editingBlackout ? 'Blackout period updated' : 'Blackout period saved' });
    } catch (e) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const deleteBlock = async block => {
    setRemovingId(block.id);
    try {
      await deleteAvailabilityBlock(block.id, block.updated_at);
      await load();
      toast({ title: 'Availability block removed' });
    } catch (e) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' });
    } finally {
      setRemovingId(null);
    }
  };

  const deleteBlackout = async blackout => {
    setRemovingId(blackout.id);
    try {
      await deleteBlackoutPeriod(blackout.id, blackout.updated_at);
      await load();
      toast({ title: 'Blackout period removed' });
    } catch (e) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' });
    } finally {
      setRemovingId(null);
    }
  };

  const confirmRemoval = () => {
    const pending = pendingRemoval;
    setPendingRemoval(null);
    if (pending?.kind === 'availability') void deleteBlock(pending.item);
    if (pending?.kind === 'blackout') void deleteBlackout(pending.item);
  };

  return (
    <div className={ADMIN_PAGE}>
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex gap-2">
          {['availability', 'blackouts'].map(t => (
            <button key={t} onClick={() => setTab(t)} disabled={removingId !== null}
              className={`min-h-11 px-5 py-2 font-display text-sm uppercase transition-colors disabled:opacity-50 ${tab === t ? 'bg-xert-steel text-xert-navy' : 'border border-xert-steel/40 text-xert-concrete/60 hover:border-xert-steel'}`}>
              {t === 'availability' ? 'Availability blocks' : 'Blackout periods'}
            </button>
          ))}
        </div>
        <button type="button" onClick={load} disabled={loading} title="Refresh availability" aria-label="Refresh availability"
          className="min-w-11 min-h-11 p-2 border border-xert-steel/40 text-xert-concrete/60 hover:border-xert-steel transition-colors disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loadError && (
        <div role="alert" className="mb-5 border border-xert-red/30 bg-xert-steel/10 px-4 py-3 flex items-center justify-between gap-4">
          <p className="font-body text-sm text-xert-offwhite">Could not load availability records: {loadError}</p>
          <button type="button" onClick={load} className="font-body text-xs uppercase text-xert-red hover:text-xert-orange transition-colors">Retry</button>
        </div>
      )}

      {tab === 'availability' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => { setEditingBlock(null); setBlockForm(emptyBlock()); setShowBlockForm(true); }} disabled={removingId !== null}
              className={ADMIN_BUTTON.primary}>
              + Add block
            </button>
          </div>
          {loading ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-20 bg-xert-ink animate-pulse" />)}</div>
          ) : blocks.length === 0 ? (
            <div className="py-12 text-center border border-xert-steel/20">
              <p className="font-body text-sm text-xert-concrete/40">No availability blocks set.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {blocks.map(b => (
                <div key={b.id} className="flex flex-col gap-3 border border-xert-steel/20 bg-xert-ink p-4 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between min-[420px]:gap-4">
                  <div className="min-w-0">
                    <p className="font-display text-sm text-xert-offwhite uppercase">{b.type}</p>
                    <p className="font-body text-xs text-xert-concrete/50">{b.start_time ? new Date(b.start_time).toLocaleString('en-AU') : ''} — {b.end_time ? new Date(b.end_time).toLocaleString('en-AU') : ''}</p>
                    {b.coach_name && <p className="font-body text-xs text-xert-concrete/40">{b.coach_name}</p>}
                    {b.notes && <p className="font-body text-xs text-xert-concrete/40 mt-1">{b.notes}</p>}
                    {b.is_bookable && <span className="inline-block mt-1 font-body text-[10px] uppercase tracking-wider text-green-400">Bookable</span>}
                  </div>
                  <div className="grid shrink-0 grid-cols-2 gap-2 min-[420px]:flex">
                    <button type="button" onClick={() => {
                      setEditingBlock(b);
                      setBlockForm(availabilityBlockEditorForm(b));
                      setShowBlockForm(true);
                    }} disabled={removingId !== null}
                      className="min-h-11 px-3 py-2.5 border border-xert-steel/30 font-body text-xs text-xert-concrete/60 hover:border-xert-steel transition-colors disabled:opacity-50">Edit</button>
                    <button onClick={() => setPendingRemoval({ kind: 'availability', item: b })} disabled={removingId !== null}
                      className="min-h-11 px-3 py-2.5 border border-xert-red/30 font-body text-xs text-xert-red/60 hover:border-xert-red/60 transition-colors disabled:opacity-50">
                      {removingId === b.id ? 'Removing...' : 'Remove'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showBlockForm && (
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 sm:items-center sm:p-4">
              <div role="dialog" aria-modal="true" aria-labelledby="availability-dialog-title" className="max-h-[100dvh] w-full max-w-md space-y-4 overflow-y-auto overscroll-contain border border-xert-steel/20 bg-xert-ink p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:max-h-[calc(100dvh-2rem)] sm:p-6">
                <h3 id="availability-dialog-title" className="font-display text-xl text-xert-offwhite uppercase">{editingBlock ? 'Edit' : 'New'} availability block</h3>
                <div>
                  <label htmlFor="availability-type" className="block font-body text-xs text-xert-concrete/40 uppercase mb-1">Type</label>
                  <select id="availability-type" autoFocus value={blockForm.type} onChange={e => setBlockForm(p => ({ ...p, type: e.target.value }))}
                    className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red">
                    {BLOCK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
                  <div>
                    <label htmlFor="availability-start" className="block font-body text-xs text-xert-concrete/40 uppercase mb-1">Start</label>
                    <input id="availability-start" type="datetime-local" value={blockForm.start_time} onChange={e => setBlockForm(p => ({ ...p, start_time: e.target.value }))}
                      className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red" />
                  </div>
                  <div>
                    <label htmlFor="availability-end" className="block font-body text-xs text-xert-concrete/40 uppercase mb-1">End</label>
                    <input id="availability-end" type="datetime-local" min={blockForm.start_time || undefined} value={blockForm.end_time} onChange={e => setBlockForm(p => ({ ...p, end_time: e.target.value }))}
                      className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red" />
                  </div>
                </div>
                <div>
                  <label htmlFor="availability-coach" className="block font-body text-xs text-xert-concrete/40 uppercase mb-1">Coach (optional)</label>
                  <input id="availability-coach" value={blockForm.coach_name} onChange={e => setBlockForm(p => ({ ...p, coach_name: e.target.value }))}
                    className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red" />
                </div>
                <label className="flex items-center gap-2 cursor-pointer font-body text-sm text-xert-concrete/80">
                  <input type="checkbox" checked={blockForm.is_bookable} onChange={e => setBlockForm(p => ({ ...p, is_bookable: e.target.checked }))}
                    className="accent-xert-red" />
                  Mark this block as bookable
                </label>
                <div>
                  <label htmlFor="availability-notes" className="block font-body text-xs text-xert-concrete/40 uppercase mb-1">Notes</label>
                  <textarea id="availability-notes" value={blockForm.notes} onChange={e => setBlockForm(p => ({ ...p, notes: e.target.value }))} rows={2}
                    className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red resize-none" />
                </div>
                <div className="sticky bottom-0 -mx-4 flex gap-3 border-t border-xert-steel/15 bg-xert-ink px-4 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-3 sm:static sm:mx-0 sm:border-0 sm:p-0">
                  <button onClick={() => { setShowBlockForm(false); setEditingBlock(null); }} disabled={saving}
                    className="flex-1 min-h-11 py-2.5 border border-xert-steel/40 font-display text-xs text-xert-concrete/60 uppercase disabled:opacity-50">Cancel</button>
                  <button onClick={saveBlock} disabled={saving}
                    className={`${ADMIN_BUTTON.primary} flex-1`}>
                    {saving ? 'Saving...' : editingBlock ? 'Update block' : 'Save block'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'blackouts' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => { setEditingBlackout(null); setBlackoutForm(emptyBlackout()); setShowBlackoutForm(true); }} disabled={removingId !== null}
              className={ADMIN_BUTTON.primary}>
              + Add blackout
            </button>
          </div>
          {loading ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-20 bg-xert-ink animate-pulse" />)}</div>
          ) : blackouts.length === 0 ? (
            <div className="py-12 text-center border border-xert-steel/20">
              <p className="font-body text-sm text-xert-concrete/40">No blackout periods set.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {blackouts.map(b => (
                <div key={b.id} className="flex flex-col gap-3 border border-xert-red/20 bg-xert-ink p-4 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between min-[420px]:gap-4">
                  <div className="min-w-0">
                    <p className="font-display text-sm text-xert-red uppercase">{b.reason}</p>
                    <p className="font-body text-xs text-xert-concrete/50">
                      {b.start_time ? new Date(b.start_time).toLocaleString('en-AU') : ''} — {b.end_time ? new Date(b.end_time).toLocaleString('en-AU') : ''}
                    </p>
                    <p className="font-body text-xs text-xert-concrete/40">Affects: {b.affects}</p>
                    {b.notes && <p className="font-body text-xs text-xert-concrete/40 mt-1">{b.notes}</p>}
                  </div>
                  <div className="grid shrink-0 grid-cols-2 gap-2 min-[420px]:flex">
                    <button type="button" onClick={() => {
                      setEditingBlackout(b);
                      setBlackoutForm(blackoutPeriodEditorForm(b));
                      setShowBlackoutForm(true);
                    }} disabled={removingId !== null}
                      className="min-h-11 px-3 py-2.5 border border-xert-steel/30 font-body text-xs text-xert-concrete/60 hover:border-xert-steel transition-colors disabled:opacity-50">Edit</button>
                    <button onClick={() => setPendingRemoval({ kind: 'blackout', item: b })} disabled={removingId !== null}
                      className="min-h-11 px-3 py-2.5 border border-xert-red/30 font-body text-xs text-xert-red/60 hover:border-xert-red/60 transition-colors disabled:opacity-50">
                      {removingId === b.id ? 'Removing...' : 'Remove'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showBlackoutForm && (
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 sm:items-center sm:p-4">
              <div role="dialog" aria-modal="true" aria-labelledby="blackout-dialog-title" className="max-h-[100dvh] w-full max-w-md space-y-4 overflow-y-auto overscroll-contain border border-xert-steel/20 bg-xert-ink p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:max-h-[calc(100dvh-2rem)] sm:p-6">
                <h3 id="blackout-dialog-title" className="font-display text-xl text-xert-offwhite uppercase">{editingBlackout ? 'Edit' : 'New'} blackout period</h3>
                <div>
                  <label htmlFor="blackout-reason" className="block font-body text-xs text-xert-concrete/40 uppercase mb-1">Reason</label>
                  <select id="blackout-reason" autoFocus value={blackoutForm.reason} onChange={e => setBlackoutForm(p => ({ ...p, reason: e.target.value }))}
                    className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red">
                    {BLACKOUT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="blackout-affects" className="block font-body text-xs text-xert-concrete/40 uppercase mb-1">Affects</label>
                  <select id="blackout-affects" value={blackoutForm.affects} onChange={e => setBlackoutForm(p => ({ ...p, affects: e.target.value }))}
                    className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red">
                    {AFFECTS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
                  <div>
                    <label htmlFor="blackout-start" className="block font-body text-xs text-xert-concrete/40 uppercase mb-1">Start</label>
                    <input id="blackout-start" type="datetime-local" value={blackoutForm.start_time} onChange={e => setBlackoutForm(p => ({ ...p, start_time: e.target.value }))}
                      className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red" />
                  </div>
                  <div>
                    <label htmlFor="blackout-end" className="block font-body text-xs text-xert-concrete/40 uppercase mb-1">End</label>
                    <input id="blackout-end" type="datetime-local" min={blackoutForm.start_time || undefined} value={blackoutForm.end_time} onChange={e => setBlackoutForm(p => ({ ...p, end_time: e.target.value }))}
                      className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red" />
                  </div>
                </div>
                <div>
                  <label htmlFor="blackout-notes" className="block font-body text-xs text-xert-concrete/40 uppercase mb-1">Notes</label>
                  <textarea id="blackout-notes" value={blackoutForm.notes} onChange={e => setBlackoutForm(p => ({ ...p, notes: e.target.value }))} rows={2}
                    className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red resize-none" />
                </div>
                <div className="sticky bottom-0 -mx-4 flex gap-3 border-t border-xert-steel/15 bg-xert-ink px-4 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-3 sm:static sm:mx-0 sm:border-0 sm:p-0">
                  <button onClick={() => { setShowBlackoutForm(false); setEditingBlackout(null); }} disabled={saving}
                    className="flex-1 min-h-11 py-2.5 border border-xert-steel/40 font-display text-xs text-xert-concrete/60 uppercase disabled:opacity-50">Cancel</button>
                  <button onClick={saveBlackout} disabled={saving}
                    className={`${ADMIN_BUTTON.primary} flex-1`}>
                    {saving ? 'Saving...' : editingBlackout ? 'Update blackout' : 'Save blackout'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      <AdminConfirmDialog
        open={Boolean(pendingRemoval)}
        onOpenChange={open => !open && setPendingRemoval(null)}
        title={pendingRemoval?.kind === 'blackout' ? 'Remove blackout period?' : 'Remove availability block?'}
        description={pendingRemoval ? `${pendingRemoval.item.type || pendingRemoval.item.reason} starting ${new Date(pendingRemoval.item.start_time).toLocaleString('en-AU')}` : ''}
        warning={pendingRemoval?.kind === 'blackout'
          ? 'Classes and staff planning may immediately become available during this period.'
          : 'This time will no longer appear as available for scheduling.'}
        confirmLabel="Remove"
        onConfirm={confirmRemoval}
        busy={removingId !== null}
      />
    </div>
  );
}
