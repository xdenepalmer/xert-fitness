import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BellRing, CalendarClock, Eye, EyeOff, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import {
  createMemberAnnouncement,
  deleteMemberAnnouncement,
  getAllMemberAnnouncements,
  updateMemberAnnouncement,
} from '@/lib/adminData';
import { announcementState, ANNOUNCEMENT_TONES, normalizeAnnouncementInput } from '@/lib/memberAnnouncements';

const EMPTY_FORM = { title: '', body: '', tone: 'info', expires_at: '' };
const TONE_LABELS = { info: 'Information', action: 'Action requested', urgent: 'Urgent' };
const STATE_STYLES = {
  live: 'border-green-500/40 text-green-300',
  scheduled: 'border-xert-steel/50 text-xert-steel',
  draft: 'border-xert-pale/25 text-xert-pale/60',
  expired: 'border-xert-pale/15 text-xert-pale/35',
};
const inputClass = 'w-full min-h-11 bg-xert-charcoal border border-xert-steel/40 px-3 py-2.5 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-steel disabled:opacity-50';

function localDateTimeValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatDateTime(value) {
  return value
    ? new Date(value).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '';
}

export default function AnnouncementsManager({ initialAction, onIntentHandled }) {
  const { toast } = useToast();
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(async ({ quiet = false } = {}) => {
    quiet ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      setAnnouncements(await getAllMemberAnnouncements());
    } catch (loadError) {
      setError(loadError.message || 'Announcements could not be loaded.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => announcements.reduce((result, item) => {
    const state = announcementState(item);
    result[state] = (result[state] || 0) + 1;
    return result;
  }, {}), [announcements]);

  const openCreate = () => {
    setEditing({ id: null, published_at: null });
    setForm(EMPTY_FORM);
  };

  useEffect(() => {
    if (initialAction !== 'create') return;
    setEditing({ id: null, published_at: null });
    setForm(EMPTY_FORM);
    onIntentHandled?.();
  }, [initialAction, onIntentHandled]);

  const openEdit = item => {
    setEditing(item);
    setForm({
      title: item.title,
      body: item.body,
      tone: item.tone,
      expires_at: localDateTimeValue(item.expires_at),
    });
  };

  const closeEditor = () => {
    if (saving) return;
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  const persist = async ({ publish = false } = {}) => {
    setSaving(true);
    try {
      const payload = normalizeAnnouncementInput(form);
      if (publish && payload.expires_at && new Date(payload.expires_at) <= new Date()) {
        throw new Error('Choose an expiry time in the future before publishing.');
      }
      const publishFields = publish
        ? { published_at: editing?.published_at || new Date().toISOString() }
        : {};
      if (editing?.id) {
        await updateMemberAnnouncement(editing.id, { ...payload, ...publishFields });
      } else {
        await createMemberAnnouncement({ ...payload, ...publishFields });
      }
      toast({
        title: publish ? 'Announcement published' : editing?.id ? 'Announcement saved' : 'Draft created',
        description: publish ? 'Signed-in members can now see this notice.' : 'The notice remains hidden until you publish it.',
      });
      setEditing(null);
      setForm(EMPTY_FORM);
      await load({ quiet: true });
    } catch (saveError) {
      toast({ title: 'Announcement not saved', description: saveError.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const setPublished = async (item, publish) => {
    setSaving(true);
    try {
      if (publish && item.expires_at && new Date(item.expires_at) <= new Date()) {
        throw new Error('Edit this notice and choose a future expiry before publishing it again.');
      }
      await updateMemberAnnouncement(item.id, { published_at: publish ? new Date().toISOString() : null });
      toast({ title: publish ? 'Announcement published' : 'Announcement unpublished' });
      await load({ quiet: true });
    } catch (publishError) {
      toast({ title: 'Status not changed', description: publishError.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async item => {
    setSaving(true);
    try {
      await deleteMemberAnnouncement(item.id);
      setConfirmDelete(null);
      toast({ title: 'Announcement deleted' });
      await load({ quiet: true });
    } catch (deleteError) {
      toast({ title: 'Announcement not deleted', description: deleteError.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xert-steel">
            <BellRing className="w-5 h-5" aria-hidden="true" />
            <h2 className="font-display text-xl uppercase text-xert-offwhite">Member Announcements</h2>
          </div>
          <p className="mt-2 max-w-2xl font-body text-sm text-xert-pale/60">
            Publish operational notices to signed-in members on the website and in the XERT iOS app.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load({ quiet: true })} disabled={loading || refreshing} title="Refresh announcements" aria-label="Refresh announcements" className="min-w-11 min-h-11 inline-flex items-center justify-center border border-xert-steel/40 text-xert-steel disabled:opacity-40">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button type="button" onClick={openCreate} className="min-h-11 inline-flex items-center gap-2 bg-xert-steel px-4 font-display text-sm uppercase text-xert-navy">
            <Plus className="w-4 h-4" /> New Notice
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" aria-label="Announcement totals">
        {['live', 'draft', 'scheduled', 'expired'].map(state => (
          <div key={state} className="border border-xert-steel/20 bg-xert-ink p-4">
            <p className="font-display text-2xl text-xert-offwhite tabular-nums">{counts[state] || 0}</p>
            <p className="mt-1 font-body text-xs uppercase text-xert-pale/45">{state}</p>
          </div>
        ))}
      </div>

      {error && <p role="alert" className="border border-xert-red/40 bg-xert-red/5 p-4 font-body text-sm text-xert-red">{error}</p>}

      {loading ? (
        <div role="status" className="h-40 animate-pulse bg-xert-ink border border-xert-steel/20" />
      ) : announcements.length === 0 ? (
        <div className="border border-xert-steel/20 py-14 text-center">
          <BellRing className="mx-auto h-7 w-7 text-xert-steel/40" />
          <p className="mt-3 font-display text-lg uppercase text-xert-offwhite">No member notices yet</p>
          <p className="mt-1 font-body text-sm text-xert-pale/50">Create a draft when members need a timely update.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map(item => {
            const state = announcementState(item);
            return (
              <article key={item.id} className="border border-xert-steel/20 bg-xert-ink p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`border px-2 py-0.5 font-body text-[10px] uppercase ${STATE_STYLES[state]}`}>{state}</span>
                      <span className="font-body text-[10px] uppercase text-xert-steel">{TONE_LABELS[item.tone] || item.tone}</span>
                    </div>
                    <h3 className="mt-3 font-display text-xl uppercase text-xert-offwhite">{item.title}</h3>
                    <p className="mt-2 whitespace-pre-wrap font-body text-sm leading-relaxed text-xert-pale/70">{item.body}</p>
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-body text-xs text-xert-pale/40">
                      {item.published_at && <span>Published {formatDateTime(item.published_at)}</span>}
                      {item.expires_at && <span className="inline-flex items-center gap-1"><CalendarClock className="w-3 h-3" /> Expires {formatDateTime(item.expires_at)}</span>}
                      {item.published_at && <span>Seen by {item.read_count || 0} member{item.read_count === 1 ? '' : 's'} · {item.dismissed_count || 0} dismissed</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button type="button" onClick={() => openEdit(item)} disabled={saving} title="Edit announcement" aria-label={`Edit ${item.title}`} className="min-w-11 min-h-11 inline-flex items-center justify-center border border-xert-steel/30 text-xert-steel disabled:opacity-40"><Pencil className="w-4 h-4" /></button>
                    {state === 'live' || state === 'scheduled' ? (
                      <button type="button" onClick={() => void setPublished(item, false)} disabled={saving} title="Unpublish announcement" aria-label={`Unpublish ${item.title}`} className="min-w-11 min-h-11 inline-flex items-center justify-center border border-xert-steel/30 text-xert-pale disabled:opacity-40"><EyeOff className="w-4 h-4" /></button>
                    ) : (
                      <button type="button" onClick={() => void setPublished(item, true)} disabled={saving} title="Publish announcement" aria-label={`Publish ${item.title}`} className="min-w-11 min-h-11 inline-flex items-center justify-center border border-green-500/40 text-green-300 disabled:opacity-40"><Eye className="w-4 h-4" /></button>
                    )}
                    <button type="button" onClick={() => setConfirmDelete(item)} disabled={saving} title="Delete announcement" aria-label={`Delete ${item.title}`} className="min-w-11 min-h-11 inline-flex items-center justify-center border border-xert-red/30 text-xert-red disabled:opacity-40"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onMouseDown={event => { if (event.target === event.currentTarget) closeEditor(); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="announcement-editor-title" className="w-full max-w-xl max-h-[90vh] overflow-y-auto border border-xert-steel/30 bg-xert-ink">
            <header className="sticky top-0 flex items-center justify-between gap-4 border-b border-xert-steel/20 bg-xert-ink p-5">
              <h3 id="announcement-editor-title" className="font-display text-xl uppercase text-xert-offwhite">{editing.id ? 'Edit Notice' : 'New Notice'}</h3>
              <button type="button" onClick={closeEditor} disabled={saving} title="Close editor" aria-label="Close announcement editor" className="min-w-11 min-h-11 inline-flex items-center justify-center text-xert-pale/60 disabled:opacity-40"><X className="w-5 h-5" /></button>
            </header>
            <div className="space-y-5 p-5">
              <div><label htmlFor="announcement-title" className="mb-1 block font-body text-xs uppercase text-xert-pale/50">Title</label><input id="announcement-title" value={form.title} maxLength={120} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} className={inputClass} /></div>
              <div><label htmlFor="announcement-body" className="mb-1 block font-body text-xs uppercase text-xert-pale/50">Message</label><textarea id="announcement-body" value={form.body} maxLength={2000} rows={6} onChange={event => setForm(current => ({ ...current, body: event.target.value }))} className={`${inputClass} resize-y`} /><p className="mt-1 text-right font-body text-[10px] text-xert-pale/35">{form.body.length}/2000</p></div>
              <fieldset><legend className="mb-2 font-body text-xs uppercase text-xert-pale/50">Priority</legend><div className="grid grid-cols-1 sm:grid-cols-3 gap-2">{ANNOUNCEMENT_TONES.map(tone => <label key={tone} className={`min-h-11 flex cursor-pointer items-center gap-2 border px-3 font-body text-sm ${form.tone === tone ? 'border-xert-steel text-xert-offwhite' : 'border-xert-steel/25 text-xert-pale/55'}`}><input type="radio" name="tone" value={tone} checked={form.tone === tone} onChange={() => setForm(current => ({ ...current, tone }))} className="accent-xert-steel" />{TONE_LABELS[tone]}</label>)}</div></fieldset>
              <div><label htmlFor="announcement-expiry" className="mb-1 block font-body text-xs uppercase text-xert-pale/50">Expiry (optional)</label><input id="announcement-expiry" type="datetime-local" value={form.expires_at} onChange={event => setForm(current => ({ ...current, expires_at: event.target.value }))} className={inputClass} /><p className="mt-1 font-body text-xs text-xert-pale/40">After this time the notice disappears automatically from member accounts.</p></div>
            </div>
            <footer className="flex flex-col-reverse gap-2 border-t border-xert-steel/20 p-5 sm:flex-row sm:justify-end">
              <button type="button" onClick={closeEditor} disabled={saving} className="min-h-11 border border-xert-steel/30 px-5 font-display text-sm uppercase text-xert-pale/70 disabled:opacity-40">Cancel</button>
              <button type="button" onClick={() => void persist()} disabled={saving} className="min-h-11 border border-xert-steel/50 px-5 font-display text-sm uppercase text-xert-steel disabled:opacity-40">{saving ? 'Saving...' : editing.id ? 'Save Changes' : 'Save Draft'}</button>
              {(!editing.published_at || announcementState(editing) !== 'live') && <button type="button" onClick={() => void persist({ publish: true })} disabled={saving} className="min-h-11 bg-xert-steel px-5 font-display text-sm uppercase text-xert-navy disabled:opacity-40">Publish Now</button>}
            </footer>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div role="alertdialog" aria-modal="true" aria-labelledby="delete-announcement-title" className="w-full max-w-md border border-xert-red/40 bg-xert-ink p-6">
            <h3 id="delete-announcement-title" className="font-display text-xl uppercase text-xert-offwhite">Delete this notice?</h3>
            <p className="mt-3 font-body text-sm text-xert-pale/65">“{confirmDelete.title}” will be permanently removed.</p>
            <div className="mt-6 flex gap-3"><button type="button" onClick={() => setConfirmDelete(null)} disabled={saving} className="min-h-11 flex-1 border border-xert-steel/30 font-display text-sm uppercase text-xert-pale/70">Cancel</button><button type="button" onClick={() => void remove(confirmDelete)} disabled={saving} className="min-h-11 flex-1 bg-xert-red font-display text-sm uppercase text-white disabled:opacity-40">{saving ? 'Deleting...' : 'Delete'}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
