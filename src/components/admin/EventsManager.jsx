import React, { useState, useEffect } from 'react';
import { toast } from '@/components/ui/use-toast';
import {
  getAllEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  seedXertEventCalendar,
} from '@/lib/adminData';
import AdminLoadError from '@/components/admin/AdminLoadError';

const CATEGORIES = ['run', 'marathon', 'triathlon', 'ironman', 'ultra', 'trail', 'cycling', 'hyrox', 'crossfit', 'functional', 'swim', 'spartan', 'adventure', 'games', 'community', 'sport', 'xert', 'other'];

const inputCls = 'w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red';
const labelCls = 'block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1';

function EventEditor({ event, onSave, onCancel }) {
  const [form, setForm] = useState(event || {
    name: '', category: 'run', event_date: '', end_date: '', location: '',
    region: 'South East Queensland', url: '', published: true, sort_order: 0,
  });
  const [saving, setSaving] = useState(false);
  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: 'Name required.', variant: 'destructive' }); return; }
    // Normalise empty date strings to null (Postgres date columns reject '').
    const payload = { ...form, event_date: form.event_date || null, end_date: form.end_date || null, url: form.url || null };
    setSaving(true);
    try {
      if (event?.id) await updateEvent(event.id, payload);
      else await createEvent(payload);
      onSave();
    } catch (e) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-4">
      <div className="bg-xert-ink border border-xert-steel/20 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-xert-steel/20">
          <h3 className="font-display text-xl text-xert-offwhite uppercase">{event?.id ? 'Edit' : 'New'} Event</h3>
          <button onClick={onCancel} className="text-xert-concrete/40 hover:text-xert-offwhite text-xl">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className={labelCls}>Event name *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} className={inputCls} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Category</label>
              <select value={form.category || 'other'} onChange={e => set('category', e.target.value)} className={inputCls}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Start date</label>
              <input type="date" value={form.event_date || ''} onChange={e => set('event_date', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>End date (optional)</label>
              <input type="date" value={form.end_date || ''} onChange={e => set('end_date', e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Location</label>
              <input value={form.location || ''} onChange={e => set('location', e.target.value)} placeholder="e.g. Sunshine Coast" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Region</label>
              <input value={form.region || ''} onChange={e => set('region', e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Official website link</label>
            <input value={form.url || ''} onChange={e => set('url', e.target.value)} placeholder="https://…" className={inputCls} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
            <div>
              <label className={labelCls}>Sort order</label>
              <input type="number" value={form.sort_order ?? 0} onChange={e => set('sort_order', +e.target.value)} className={inputCls} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer pb-2">
              <div onClick={() => set('published', !form.published)}
                className={`w-5 h-5 border-2 flex items-center justify-center transition-all ${form.published ? 'border-green-500 bg-green-500' : 'border-xert-steel/50'}`}>
                {form.published && <span className="text-white text-xs">✓</span>}
              </div>
              <span className="font-body text-sm text-xert-concrete/80">Published (visible on site)</span>
            </label>
          </div>
        </div>
        <div className="flex gap-3 p-6 border-t border-xert-steel/20">
          <button onClick={onCancel} className="flex-1 py-3 border border-xert-steel/40 font-display text-sm text-xert-concrete/70 uppercase hover:border-xert-steel transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-3 bg-xert-red text-white font-display text-sm uppercase hover:bg-xert-orange transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EventsManager() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [seeding, setSeeding] = useState(false);

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      setEvents(await getAllEvents());
    } catch (error) {
      setLoadError(error.message || 'Check the events table and admin permissions.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const handleDelete = async (id) => {
    if (!confirm('Delete this event?')) return;
    try { await deleteEvent(id); load(); } catch (e) { toast({ title: 'Delete failed', description: e.message, variant: 'destructive' }); }
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const result = await seedXertEventCalendar();
      toast({
        title: result.inserted ? 'Calendar loaded' : 'Calendar already loaded',
        description: result.inserted
          ? `${result.inserted} XERT 2026 event${result.inserted === 1 ? '' : 's'} added.`
          : 'No missing XERT 2026 events were found.',
      });
      load();
    } catch (e) {
      toast({ title: 'Calendar load failed', description: e.message, variant: 'destructive' });
    } finally {
      setSeeding(false);
    }
  };

  const usedCategories = ['all', ...Array.from(new Set(events.map(e => e.category).filter(Boolean))).sort()];
  const filtered = events.filter(ev => {
    if (catFilter !== 'all' && ev.category !== catFilter) return false;
    const q = search.trim().toLowerCase();
    if (q && !(`${ev.name} ${ev.location || ''}`.toLowerCase().includes(q))) return false;
    return true;
  });

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h2 className="font-display text-lg text-xert-offwhite uppercase">SE QLD Event Calendar</h2>
        <div className="flex items-center gap-2">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search events…"
            className="w-48 bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red" />
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
            className="bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red">
            {usedCategories.map(c => <option key={c} value={c}>{c === 'all' ? 'All categories' : c}</option>)}
          </select>
          <button onClick={handleSeed} disabled={seeding}
            className="px-4 py-2.5 border border-xert-steel/40 text-xert-concrete font-display text-sm uppercase hover:border-xert-steel transition-colors disabled:opacity-50">
            {seeding ? 'Loading...' : 'Load 2026 Calendar'}
          </button>
          <button onClick={() => { setEditing(null); setShowEditor(true); }}
            className="px-5 py-2.5 bg-xert-red text-white font-display text-sm uppercase hover:bg-xert-orange transition-colors">
            + Add Event
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-14 bg-xert-ink animate-pulse" />)}</div>
      ) : loadError ? (
        <AdminLoadError message={loadError} onRetry={load} />
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center border border-xert-steel/20">
          <p className="font-display text-lg text-xert-offwhite uppercase mb-2">
            {events.length === 0 ? 'No events yet' : 'No matches'}
          </p>
          <p className="font-body text-sm text-xert-concrete/40">
            {events.length === 0 ? 'Add events to the public 2026 calendar.' : 'Try a different search or category.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(ev => (
            <div key={ev.id} className="bg-xert-ink border border-xert-steel/20 p-4 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-body text-xs border border-xert-steel/30 text-xert-concrete/60 px-2 py-0.5 uppercase">{ev.category || 'other'}</span>
                  {!ev.published && <span className="font-body text-xs border border-xert-steel/30 text-xert-concrete/40 px-2 py-0.5 uppercase">Hidden</span>}
                  {ev.url && <span className="font-body text-xs border border-green-600/40 text-green-400 px-2 py-0.5 uppercase">Link</span>}
                </div>
                <h3 className="font-display text-base text-xert-offwhite uppercase">{ev.name}</h3>
                <p className="font-body text-xs text-xert-concrete/50">
                  {ev.event_date ? new Date(`${ev.event_date}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No date'}
                  {ev.location ? ` · ${ev.location}` : ''}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => { setEditing(ev); setShowEditor(true); }}
                  className="px-3 py-1.5 border border-xert-steel/30 font-body text-xs text-xert-concrete/60 hover:border-xert-steel transition-colors">Edit</button>
                <button onClick={() => handleDelete(ev.id)}
                  className="px-3 py-1.5 border border-xert-red/30 font-body text-xs text-xert-red/60 hover:border-xert-red/60 transition-colors">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showEditor && (
        <EventEditor event={editing} onSave={() => { setShowEditor(false); load(); }} onCancel={() => setShowEditor(false)} />
      )}
    </div>
  );
}
