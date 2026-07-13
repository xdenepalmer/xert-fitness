import React, { useState, useEffect } from 'react';
import { toast } from '@/components/ui/use-toast';
import { getAllCoaches, createCoach, updateCoach, deleteCoach } from '@/lib/adminData';
import ImageUploader from '@/components/admin/ImageUploader';
import AdminLoadError from '@/components/admin/AdminLoadError';
import { normalizeCoachInput } from '@/lib/coachAdmin';

const CATEGORIES = [
  { value: 'coach', label: 'Coach' },
  { value: 'nutritionist', label: 'Nutritionist' },
  { value: 'massage', label: 'Massage Therapist' },
  { value: 'physio', label: 'Physiotherapist' },
];

const inputCls = 'w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red';
const labelCls = 'block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1';

function CoachEditor({ coach, onSave, onCancel }) {
  const [form, setForm] = useState(coach || {
    name: '', role: '', category: 'coach', bio: '', experience: '',
    currently_training_for: '', photo_url: '', social_url: '', sort_order: 0, published: true,
  });
  const [saving, setSaving] = useState(false);
  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));

  useEffect(() => {
    const closeOnEscape = event => {
      if (event.key === 'Escape' && !saving) onCancel();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onCancel, saving]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = normalizeCoachInput(form);
      if (coach?.id) await updateCoach(coach.id, payload);
      else await createCoach(payload);
      onSave();
    } catch (e) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="coach-editor-title" className="bg-xert-ink border border-xert-steel/20 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-xert-steel/20">
          <h3 id="coach-editor-title" className="font-display text-xl text-xert-offwhite uppercase">{coach?.id ? 'Edit' : 'New'} Team Member</h3>
          <button type="button" onClick={onCancel} aria-label="Close team member editor" className="min-w-11 min-h-11 text-xert-concrete/40 hover:text-xert-offwhite text-xl">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="coach-name" className={labelCls}>Name *</label>
              <input id="coach-name" required autoFocus value={form.name} onChange={e => set('name', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label htmlFor="coach-category" className={labelCls}>Category</label>
              <select id="coach-category" value={form.category} onChange={e => set('category', e.target.value)} className={inputCls}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="coach-role" className={labelCls}>Role (e.g. Owner / Head Coach)</label>
            <input id="coach-role" value={form.role || ''} onChange={e => set('role', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label htmlFor="coach-bio" className={labelCls}>Bio</label>
            <textarea id="coach-bio" value={form.bio || ''} onChange={e => set('bio', e.target.value)} rows={3} className={`${inputCls} resize-none`} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="coach-experience" className={labelCls}>Experience</label>
              <input id="coach-experience" value={form.experience || ''} onChange={e => set('experience', e.target.value)} placeholder="e.g. 8 years coaching" className={inputCls} />
            </div>
            <div>
              <label htmlFor="coach-training-for" className={labelCls}>Currently training for</label>
              <input id="coach-training-for" value={form.currently_training_for || ''} onChange={e => set('currently_training_for', e.target.value)} placeholder="e.g. Hyrox Melbourne" className={inputCls} />
            </div>
          </div>
          <ImageUploader value={form.photo_url || ''} onChange={v => set('photo_url', v)} folder="coaches" label="Photo" />
          <div>
            <label htmlFor="coach-social" className={labelCls}>Social link</label>
            <input id="coach-social" type="url" value={form.social_url || ''} onChange={e => set('social_url', e.target.value)} placeholder="https://instagram.com/…" className={inputCls} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
            <div>
              <label htmlFor="coach-sort-order" className={labelCls}>Sort order</label>
              <input id="coach-sort-order" type="number" min="0" step="1" value={form.sort_order ?? 0} onChange={e => set('sort_order', +e.target.value)} className={inputCls} />
            </div>
            <label className="flex min-h-11 items-center gap-2 cursor-pointer pb-2">
              <input type="checkbox" checked={Boolean(form.published)} onChange={e => set('published', e.target.checked)} className="w-5 h-5 accent-green-500" />
              <span className="font-body text-sm text-xert-concrete/80">Published (visible on site)</span>
            </label>
          </div>
        </div>
        <div className="flex gap-3 p-6 border-t border-xert-steel/20">
          <button type="button" onClick={onCancel} disabled={saving} className="flex-1 min-h-11 py-3 border border-xert-steel/40 font-display text-sm text-xert-concrete/70 uppercase hover:border-xert-steel transition-colors disabled:opacity-50">Cancel</button>
          <button type="button" onClick={handleSave} disabled={saving} className="flex-1 min-h-11 py-3 bg-xert-steel text-xert-navy font-display text-sm uppercase hover:bg-xert-pale transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CoachesManager({ initialAction, onIntentHandled }) {
  const [coaches, setCoaches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      setCoaches(await getAllCoaches());
    } catch (error) {
      setLoadError(error.message || 'Check the coaches table and admin permissions.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (initialAction !== 'create') return;
    setEditing(null);
    setShowEditor(true);
    onIntentHandled?.();
  }, [initialAction, onIntentHandled]);

  const handleDelete = async (coach) => {
    if (!confirm(`Delete ${coach.name}? This removes them from the public Coaches page.`)) return;
    setDeletingId(coach.id);
    try {
      await deleteCoach(coach.id);
      toast({ title: 'Team member deleted', description: `${coach.name} was removed.` });
      await load();
    } catch (e) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display text-lg text-xert-offwhite uppercase">Coaches &amp; Practitioners</h2>
        <button onClick={() => { setEditing(null); setShowEditor(true); }}
          className="px-5 py-2.5 bg-xert-steel text-xert-navy font-display text-sm uppercase hover:bg-xert-pale transition-colors">
          + Add Person
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-xert-ink animate-pulse" />)}</div>
      ) : loadError ? (
        <AdminLoadError message={loadError} onRetry={load} />
      ) : coaches.length === 0 ? (
        <div className="py-16 text-center border border-xert-steel/20">
          <p className="font-display text-lg text-xert-offwhite uppercase mb-2">No team members yet</p>
          <p className="font-body text-sm text-xert-concrete/40">Add coaches, a nutritionist, massage therapist or physio — they appear on the public Coaches page.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {coaches.map(c => (
            <div key={c.id} className="bg-xert-ink border border-xert-steel/20 p-4 flex items-start justify-between gap-4">
              <div className="w-12 h-14 shrink-0 border border-xert-steel/20 bg-xert-charcoal overflow-hidden flex items-center justify-center">
                {c.photo_url ? (
                  <img src={c.photo_url} alt={c.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="font-display text-lg text-xert-concrete/20 uppercase">
                    {(c.name || '?').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('')}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-body text-xs border border-xert-steel/30 text-xert-concrete/60 px-2 py-0.5 uppercase">
                    {CATEGORIES.find(x => x.value === c.category)?.label || c.category}
                  </span>
                  {c.published
                    ? <span className="font-body text-xs border border-green-600/40 text-green-400 px-2 py-0.5 uppercase">Published</span>
                    : <span className="font-body text-xs border border-xert-steel/30 text-xert-concrete/40 px-2 py-0.5 uppercase">Hidden</span>}
                </div>
                <h3 className="font-display text-lg text-xert-offwhite uppercase">{c.name}</h3>
                <p className="font-body text-xs text-xert-concrete/50">{[c.role, c.experience].filter(Boolean).join(' · ')}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => { setEditing(c); setShowEditor(true); }} disabled={deletingId !== null}
                  className="min-h-11 px-3 py-2.5 border border-xert-steel/30 font-body text-xs text-xert-concrete/60 hover:border-xert-steel transition-colors disabled:opacity-50">Edit</button>
                <button onClick={() => handleDelete(c)} disabled={deletingId !== null}
                  className="min-h-11 px-3 py-2.5 border border-xert-red/30 font-body text-xs text-xert-red/60 hover:border-xert-red/60 transition-colors disabled:opacity-50">{deletingId === c.id ? 'Deleting...' : 'Delete'}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showEditor && (
        <CoachEditor coach={editing} onSave={() => { setShowEditor(false); load(); }} onCancel={() => setShowEditor(false)} />
      )}
    </div>
  );
}
