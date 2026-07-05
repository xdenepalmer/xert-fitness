import React, { useState, useEffect } from 'react';
import { toast } from '@/components/ui/use-toast';
import { getAvailabilityBlocks, createAvailabilityBlock, deleteAvailabilityBlock, getBlackoutPeriods, createBlackoutPeriod, deleteBlackoutPeriod } from '@/lib/adminData';

const BLOCK_TYPES = ['PT available', 'private session available', 'group class available', 'admin only', 'open gym placeholder', 'workshop placeholder'];
const AFFECTS = ['all', 'group_classes', 'pt_only', 'facility_only', 'coach_only'];
const BLACKOUT_REASONS = ['full day unavailable', 'partial day unavailable', 'recurring unavailable', 'personal work', 'facility maintenance', 'equipment install', 'private event', 'soft launch restricted'];

export default function AvailabilityManager() {
  const [blocks, setBlocks] = useState([]);
  const [blackouts, setBlackouts] = useState([]);
  const [tab, setTab] = useState('availability');
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [showBlackoutForm, setShowBlackoutForm] = useState(false);
  const [blockForm, setBlockForm] = useState({ start_time: '', end_time: '', type: 'PT available', coach_name: '', notes: '', is_bookable: false });
  const [blackoutForm, setBlackoutForm] = useState({ start_time: '', end_time: '', affects: 'all', reason: 'facility maintenance', notes: '' });
  const [saving, setSaving] = useState(false);

  const load = () => {
    getAvailabilityBlocks().then(setBlocks).catch(() => {});
    getBlackoutPeriods().then(setBlackouts).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const saveBlock = async () => {
    setSaving(true);
    try { await createAvailabilityBlock(blockForm); load(); setShowBlockForm(false); } catch (e) { toast({ title: 'Save failed', description: e.message, variant: 'destructive' }); }
    setSaving(false);
  };

  const saveBlackout = async () => {
    setSaving(true);
    try { await createBlackoutPeriod(blackoutForm); load(); setShowBlackoutForm(false); } catch (e) { toast({ title: 'Save failed', description: e.message, variant: 'destructive' }); }
    setSaving(false);
  };

  const deleteBlock = async (id) => {
    if (!confirm('Delete this block?')) return;
    try { await deleteAvailabilityBlock(id); load(); } catch (e) { toast({ title: 'Delete failed', description: e.message, variant: 'destructive' }); }
  };

  const deleteBlackout = async (id) => {
    if (!confirm('Delete this blackout?')) return;
    try { await deleteBlackoutPeriod(id); load(); } catch (e) { toast({ title: 'Delete failed', description: e.message, variant: 'destructive' }); }
  };

  return (
    <div className="p-6">
      <div className="flex gap-2 mb-6">
        {['availability', 'blackouts'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2 font-display text-sm uppercase transition-colors ${tab === t ? 'bg-xert-red text-white' : 'border border-xert-steel/40 text-xert-concrete/60 hover:border-xert-steel'}`}>
            {t === 'availability' ? 'Availability blocks' : 'Blackout periods'}
          </button>
        ))}
      </div>

      {tab === 'availability' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowBlockForm(true)}
              className="px-5 py-2.5 bg-xert-red text-white font-display text-sm uppercase hover:bg-xert-orange transition-colors">
              + Add block
            </button>
          </div>
          {blocks.length === 0 ? (
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
                  </div>
                  <button onClick={() => deleteBlock(b.id)}
                    className="px-3 py-1.5 border border-xert-red/30 font-body text-xs text-xert-red/60 hover:border-xert-red/60 transition-colors">
                    Remove
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
            <button onClick={() => setShowBlackoutForm(true)}
              className="px-5 py-2.5 bg-xert-red text-white font-display text-sm uppercase hover:bg-xert-orange transition-colors">
              + Add blackout
            </button>
          </div>
          {blackouts.length === 0 ? (
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
                  </div>
                  <button onClick={() => deleteBlackout(b.id)}
                    className="px-3 py-1.5 border border-xert-red/30 font-body text-xs text-xert-red/60 hover:border-xert-red/60 transition-colors">
                    Remove
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