import React, { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { getAvailabilityBlocks, createAvailabilityBlock, deleteAvailabilityBlock, getBlackoutPeriods, createBlackoutPeriod, deleteBlackoutPeriod } from '@/lib/adminData';

const BLOCK_TYPES = ['PT available', 'private session available', 'group class available', 'admin only', 'open gym placeholder', 'workshop placeholder'];
const AFFECTS = ['all', 'group_classes', 'pt_only', 'facility_only', 'coach_only'];
const BLACKOUT_REASONS = ['full day unavailable', 'partial day unavailable', 'recurring unavailable', 'personal work', 'facility maintenance', 'equipment install', 'private event', 'soft launch restricted'];
const emptyBlock = () => ({ start_time: '', end_time: '', type: 'PT available', coach_name: '', notes: '', is_bookable: false });
const emptyBlackout = () => ({ start_time: '', end_time: '', affects: 'all', reason: 'facility maintenance', notes: '' });

function timeRangeError({ start_time, end_time }, label) {
  if (!start_time || !end_time) return `${label} needs both a start and end time.`;
  const startMs = new Date(start_time).getTime();
  const endMs = new Date(end_time).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
    return `${label} must end after it starts.`;
  }
  return null;
}

export default function AvailabilityManager() {
  const [blocks, setBlocks] = useState([]);
  const [blackouts, setBlackouts] = useState([]);
  const [tab, setTab] = useState('availability');
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [showBlackoutForm, setShowBlackoutForm] = useState(false);
  const [blockForm, setBlockForm] = useState(emptyBlock);
  const [blackoutForm, setBlackoutForm] = useState(emptyBlackout);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [removingId, setRemovingId] = useState(null);

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

  const saveBlock = async () => {
    const error = timeRangeError(blockForm, 'Availability block');
    if (error) {
      toast({ title: error, variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await createAvailabilityBlock(blockForm);
      setBlockForm(emptyBlock());
      setShowBlockForm(false);
      await load();
      toast({ title: 'Availability block saved' });
    } catch (e) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const saveBlackout = async () => {
    const error = timeRangeError(blackoutForm, 'Blackout period');
    if (error) {
      toast({ title: error, variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await createBlackoutPeriod(blackoutForm);
      setBlackoutForm(emptyBlackout());
      setShowBlackoutForm(false);
      await load();
      toast({ title: 'Blackout period saved' });
    } catch (e) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const deleteBlock = async (id) => {
    if (!confirm('Delete this block?')) return;
    setRemovingId(id);
    try {
      await deleteAvailabilityBlock(id);
      await load();
      toast({ title: 'Availability block removed' });
    } catch (e) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' });
    } finally {
      setRemovingId(null);
    }
  };

  const deleteBlackout = async (id) => {
    if (!confirm('Delete this blackout?')) return;
    setRemovingId(id);
    try {
      await deleteBlackoutPeriod(id);
      await load();
      toast({ title: 'Blackout period removed' });
    } catch (e) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' });
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex gap-2">
          {['availability', 'blackouts'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-2 font-display text-sm uppercase transition-colors ${tab === t ? 'bg-xert-red text-white' : 'border border-xert-steel/40 text-xert-concrete/60 hover:border-xert-steel'}`}>
              {t === 'availability' ? 'Availability blocks' : 'Blackout periods'}
            </button>
          ))}
        </div>
        <button type="button" onClick={load} disabled={loading} title="Refresh availability" aria-label="Refresh availability"
          className="p-2 border border-xert-steel/40 text-xert-concrete/60 hover:border-xert-steel transition-colors disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loadError && (
        <div role="alert" className="mb-5 border border-xert-red/30 bg-xert-red/10 px-4 py-3 flex items-center justify-between gap-4">
          <p className="font-body text-sm text-xert-offwhite">Could not load availability records: {loadError}</p>
          <button type="button" onClick={load} className="font-body text-xs uppercase text-xert-red hover:text-xert-orange transition-colors">Retry</button>
        </div>
      )}

      {tab === 'availability' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => { setBlockForm(emptyBlock()); setShowBlockForm(true); }}
              className="px-5 py-2.5 bg-xert-red text-white font-display text-sm uppercase hover:bg-xert-orange transition-colors">
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
                <div key={b.id} className="bg-xert-ink border border-xert-steel/20 p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-display text-sm text-xert-offwhite uppercase">{b.type}</p>
                    <p className="font-body text-xs text-xert-concrete/50">{b.start_time ? new Date(b.start_time).toLocaleString('en-AU') : ''} — {b.end_time ? new Date(b.end_time).toLocaleString('en-AU') : ''}</p>
                    {b.coach_name && <p className="font-body text-xs text-xert-concrete/40">{b.coach_name}</p>}
                    {b.notes && <p className="font-body text-xs text-xert-concrete/40 mt-1">{b.notes}</p>}
                    {b.is_bookable && <span className="inline-block mt-1 font-body text-[10px] uppercase tracking-wider text-green-400">Bookable</span>}
                  </div>
                  <button onClick={() => deleteBlock(b.id)} disabled={removingId === b.id}
                    className="px-3 py-1.5 border border-xert-red/30 font-body text-xs text-xert-red/60 hover:border-xert-red/60 transition-colors disabled:opacity-50">
                    {removingId === b.id ? 'Removing...' : 'Remove'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {showBlockForm && (
            <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
              <div className="bg-xert-ink border border-xert-steel/20 p-6 max-w-md w-full space-y-4">
                <h3 className="font-display text-xl text-xert-offwhite uppercase">New availability block</h3>
                <div>
                  <label className="block font-body text-xs text-xert-concrete/40 uppercase mb-1">Type</label>
                  <select value={blockForm.type} onChange={e => setBlockForm(p => ({ ...p, type: e.target.value }))}
                    className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red">
                    {BLOCK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-body text-xs text-xert-concrete/40 uppercase mb-1">Start</label>
                    <input type="datetime-local" value={blockForm.start_time} onChange={e => setBlockForm(p => ({ ...p, start_time: e.target.value }))}
                      className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red" />
                  </div>
                  <div>
                    <label className="block font-body text-xs text-xert-concrete/40 uppercase mb-1">End</label>
                    <input type="datetime-local" value={blockForm.end_time} onChange={e => setBlockForm(p => ({ ...p, end_time: e.target.value }))}
                      className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red" />
                  </div>
                </div>
                <div>
                  <label className="block font-body text-xs text-xert-concrete/40 uppercase mb-1">Coach (optional)</label>
                  <input value={blockForm.coach_name} onChange={e => setBlockForm(p => ({ ...p, coach_name: e.target.value }))}
                    className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red" />
                </div>
                <label className="flex items-center gap-2 cursor-pointer font-body text-sm text-xert-concrete/80">
                  <input type="checkbox" checked={blockForm.is_bookable} onChange={e => setBlockForm(p => ({ ...p, is_bookable: e.target.checked }))}
                    className="accent-xert-red" />
                  Mark this block as bookable
                </label>
                <div>
                  <label className="block font-body text-xs text-xert-concrete/40 uppercase mb-1">Notes</label>
                  <textarea value={blockForm.notes} onChange={e => setBlockForm(p => ({ ...p, notes: e.target.value }))} rows={2}
                    className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red resize-none" />
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowBlockForm(false)}
                    className="flex-1 py-2.5 border border-xert-steel/40 font-display text-xs text-xert-concrete/60 uppercase">Cancel</button>
                  <button onClick={saveBlock} disabled={saving}
                    className="flex-1 py-2.5 bg-xert-red text-white font-display text-xs uppercase hover:bg-xert-orange transition-colors disabled:opacity-50">
                    {saving ? 'Saving...' : 'Save block'}
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
            <button onClick={() => { setBlackoutForm(emptyBlackout()); setShowBlackoutForm(true); }}
              className="px-5 py-2.5 bg-xert-red text-white font-display text-sm uppercase hover:bg-xert-orange transition-colors">
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
                <div key={b.id} className="bg-xert-ink border border-xert-red/20 p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-display text-sm text-xert-red uppercase">{b.reason}</p>
                    <p className="font-body text-xs text-xert-concrete/50">
                      {b.start_time ? new Date(b.start_time).toLocaleString('en-AU') : ''} — {b.end_time ? new Date(b.end_time).toLocaleString('en-AU') : ''}
                    </p>
                    <p className="font-body text-xs text-xert-concrete/40">Affects: {b.affects}</p>
                    {b.notes && <p className="font-body text-xs text-xert-concrete/40 mt-1">{b.notes}</p>}
                  </div>
                  <button onClick={() => deleteBlackout(b.id)} disabled={removingId === b.id}
                    className="px-3 py-1.5 border border-xert-red/30 font-body text-xs text-xert-red/60 hover:border-xert-red/60 transition-colors disabled:opacity-50">
                    {removingId === b.id ? 'Removing...' : 'Remove'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {showBlackoutForm && (
            <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
              <div className="bg-xert-ink border border-xert-steel/20 p-6 max-w-md w-full space-y-4">
                <h3 className="font-display text-xl text-xert-offwhite uppercase">New blackout period</h3>
                <div>
                  <label className="block font-body text-xs text-xert-concrete/40 uppercase mb-1">Reason</label>
                  <select value={blackoutForm.reason} onChange={e => setBlackoutForm(p => ({ ...p, reason: e.target.value }))}
                    className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red">
                    {BLACKOUT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-body text-xs text-xert-concrete/40 uppercase mb-1">Affects</label>
                  <select value={blackoutForm.affects} onChange={e => setBlackoutForm(p => ({ ...p, affects: e.target.value }))}
                    className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red">
                    {AFFECTS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-body text-xs text-xert-concrete/40 uppercase mb-1">Start</label>
                    <input type="datetime-local" value={blackoutForm.start_time} onChange={e => setBlackoutForm(p => ({ ...p, start_time: e.target.value }))}
                      className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red" />
                  </div>
                  <div>
                    <label className="block font-body text-xs text-xert-concrete/40 uppercase mb-1">End</label>
                    <input type="datetime-local" value={blackoutForm.end_time} onChange={e => setBlackoutForm(p => ({ ...p, end_time: e.target.value }))}
                      className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red" />
                  </div>
                </div>
                <div>
                  <label className="block font-body text-xs text-xert-concrete/40 uppercase mb-1">Notes</label>
                  <textarea value={blackoutForm.notes} onChange={e => setBlackoutForm(p => ({ ...p, notes: e.target.value }))} rows={2}
                    className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red resize-none" />
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowBlackoutForm(false)}
                    className="flex-1 py-2.5 border border-xert-steel/40 font-display text-xs text-xert-concrete/60 uppercase">Cancel</button>
                  <button onClick={saveBlackout} disabled={saving}
                    className="flex-1 py-2.5 bg-xert-red text-white font-display text-xs uppercase hover:bg-xert-orange transition-colors disabled:opacity-50">
                    {saving ? 'Saving...' : 'Save blackout'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
