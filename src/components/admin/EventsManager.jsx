import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Mail, Phone, Target, X } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { getAllEvents, createEvent, updateEvent, deleteEvent, getEventGoalCounts, getEventGoalMembers, seedXertEventCalendar } from '@/lib/adminData';
import AdminLoadError from '@/components/admin/AdminLoadError';
import AdminConfirmDialog from '@/components/admin/AdminConfirmDialog';
import { normalizeEventInput } from '@/lib/eventAdmin';
import { downloadCsv } from '@/lib/csv';

const CATEGORIES = ['run', 'marathon', 'triathlon', 'ironman', 'ultra', 'trail', 'cycling', 'fitness', 'hyrox', 'crossfit', 'functional', 'swim', 'spartan', 'adventure', 'games', 'community', 'sport', 'xert', 'other'];

const inputCls = 'w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red';
const labelCls = 'block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1';
const NOOP = _dirty => {};
const EMPTY_EVENT = {
  name: '', category: 'run', event_date: '', end_date: '', location: '',
  region: 'South East Queensland', url: '', published: true, sort_order: 0,
};

function eventEditorForm(event) {
  if (!event?.id) return EMPTY_EVENT;
  return {
    name: event.name || '',
    category: event.category || 'other',
    event_date: event.event_date || '',
    end_date: event.end_date || '',
    location: event.location || '',
    region: event.region || '',
    url: event.url || '',
    published: Boolean(event.published),
    sort_order: event.sort_order ?? 0,
  };
}

function EventEditor({ event, onSave, onCancel, onDirtyChange }) {
  const baseline = useMemo(() => eventEditorForm(event), [event]);
  const [form, setForm] = useState(baseline);
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));
  const dirty = Object.keys(EMPTY_EVENT).some(key => form[key] !== baseline[key]);

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const requestCancel = useCallback(() => {
    if (saving) return;
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    onCancel();
  }, [dirty, onCancel, saving]);

  useEffect(() => {
    const closeOnEscape = keyboardEvent => {
      if (keyboardEvent.key === 'Escape') requestCancel();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [requestCancel]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = normalizeEventInput(form);
      if (event?.id) await updateEvent(event.id, payload, event.updated_at);
      else await createEvent(payload);
      onSave();
    } catch (e) {
      toast({
        title: 'Save failed',
        description: e.message,
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-4" onMouseDown={mouseEvent => { if (mouseEvent.target === mouseEvent.currentTarget) requestCancel(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="event-editor-title" className="bg-xert-ink border border-xert-steel/20 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-xert-steel/20">
          <div>
            <h3 id="event-editor-title" className="font-display text-xl text-xert-offwhite uppercase">{event?.id ? 'Edit' : 'New'} Event</h3>
            {dirty && <p role="status" className="mt-1 font-body text-xs text-xert-steel">Unsaved changes</p>}
          </div>
          <button type="button" onClick={requestCancel} disabled={saving} aria-label="Close event editor" title="Close" className="min-w-11 min-h-11 p-2 text-xert-concrete/40 hover:text-xert-offwhite transition-colors disabled:opacity-40">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label htmlFor="event-name" className={labelCls}>Event name *</label>
            <input id="event-name" required autoFocus value={form.name} onChange={e => set('name', e.target.value)} className={inputCls} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="event-category" className={labelCls}>Category</label>
              <select id="event-category" value={form.category || 'other'} onChange={e => set('category', e.target.value)} className={inputCls}>
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="event-start-date" className={labelCls}>Start date</label>
              <input id="event-start-date" type="date" value={form.event_date || ''} onChange={e => set('event_date', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label htmlFor="event-end-date" className={labelCls}>End date (optional)</label>
              <input id="event-end-date" type="date" min={form.event_date || undefined} value={form.end_date || ''} onChange={e => set('end_date', e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="event-location" className={labelCls}>Location</label>
              <input id="event-location" value={form.location || ''} onChange={e => set('location', e.target.value)} placeholder="e.g. Sunshine Coast" className={inputCls} />
            </div>
            <div>
              <label htmlFor="event-region" className={labelCls}>Region</label>
              <input id="event-region" value={form.region || ''} onChange={e => set('region', e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label htmlFor="event-url" className={labelCls}>Official website link</label>
            <input id="event-url" type="url" value={form.url || ''} onChange={e => set('url', e.target.value)} placeholder="https://…" className={inputCls} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
            <div>
              <label htmlFor="event-sort-order" className={labelCls}>Sort order</label>
              <input id="event-sort-order" type="number" min="0" step="1" value={form.sort_order ?? 0} onChange={e => set('sort_order', +e.target.value)} className={inputCls} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer pb-2">
              <input type="checkbox" checked={Boolean(form.published)} onChange={event => set('published', event.target.checked)} className="w-5 h-5 accent-[#7BA7BC]" />
              <span className="font-body text-sm text-xert-concrete/80">Published (visible on site)</span>
            </label>
          </div>
        </div>
        <div className="flex gap-3 p-6 border-t border-xert-steel/20">
          <button type="button" onClick={requestCancel} disabled={saving} className="flex-1 min-h-11 py-3 border border-xert-steel/40 font-display text-sm text-xert-concrete/70 uppercase hover:border-xert-steel transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving} className="flex-1 min-h-11 py-3 bg-xert-steel text-xert-navy font-display text-sm uppercase hover:bg-xert-pale transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
      <AdminConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard event changes?"
        description="This calendar event has edits that have not been saved."
        warning="Closing now permanently discards the changes in this editor."
        cancelLabel="Keep editing"
        confirmLabel="Discard changes"
        onConfirm={onCancel}
        busy={saving}
      />
    </div>
  );
}

function TrainingRosterDialog({ event, members, loading, error, onClose }) {
  useEffect(() => {
    const closeOnEscape = keyboardEvent => {
      if (keyboardEvent.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const exportRoster = () => {
    const eventSlug = event.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'event';
    downloadCsv(
      `xert-${eventSlug}-training-group.csv`,
      members.map(member => ({
        name: member.full_name || '',
        email: member.email || '',
        phone: member.phone || '',
        selected_at: member.selected_at || '',
      })),
      [
        { key: 'name', label: 'Member' },
        { key: 'email', label: 'Email' },
        { key: 'phone', label: 'Phone' },
        { key: 'selected_at', label: 'Joined training group' },
      ],
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/80" onClick={onClose} aria-label="Close training group" />
      <section role="dialog" aria-modal="true" aria-labelledby="training-roster-title" className="relative w-full max-w-xl max-h-[85vh] overflow-y-auto bg-xert-ink border border-xert-steel/20">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 p-5 bg-xert-ink border-b border-xert-steel/20">
          <div>
            <p className="font-body text-[10px] uppercase tracking-wider text-xert-steel">Event training group</p>
            <h3 id="training-roster-title" className="mt-1 font-display text-xl uppercase text-xert-offwhite">{event.name}</h3>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!loading && !error && members.length > 0 && (
              <button type="button" onClick={exportRoster} className="inline-flex min-h-11 items-center gap-2 border border-xert-steel/30 px-3 font-body text-xs uppercase text-xert-steel transition-colors hover:border-xert-steel">
                <Download className="h-3.5 w-3.5" /> CSV
              </button>
            )}
            <button type="button" onClick={onClose} autoFocus aria-label="Close training group" title="Close" className="inline-flex min-h-11 min-w-11 items-center justify-center text-xert-concrete/40 transition-colors hover:text-xert-offwhite">
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        <div className="p-5">
          {loading ? (
            <div className="py-12 flex items-center justify-center" role="status">
              <Loader2 className="w-5 h-5 animate-spin text-xert-steel" />
              <span className="sr-only">Loading training group</span>
            </div>
          ) : error ? (
            <div className="border border-xert-red/30 bg-xert-steel/5 p-4">
              <p className="font-body text-sm text-xert-red">{error}</p>
            </div>
          ) : members.length === 0 ? (
            <div className="py-12 text-center border border-xert-steel/20">
              <Target className="w-6 h-6 mx-auto mb-3 text-xert-steel/50" />
              <p className="font-display text-lg uppercase text-xert-offwhite">No members yet</p>
              <p className="mt-1 font-body text-sm text-xert-concrete/45">This event does not have a training group yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {members.map(member => (
                <article key={member.user_id} className="border border-xert-steel/20 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="font-display text-base uppercase text-xert-offwhite">{member.full_name || member.email || 'XERT member'}</h4>
                      <p className="mt-1 font-body text-[11px] text-xert-concrete/40">
                        Joined group {new Date(member.selected_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {member.email && (
                        <a href={`mailto:${member.email}`} className="inline-flex min-h-11 items-center gap-1.5 px-3 py-2 border border-xert-steel/30 font-body text-xs text-xert-steel hover:border-xert-steel transition-colors">
                          <Mail className="w-3.5 h-3.5" /> Email
                        </a>
                      )}
                      {member.phone && (
                        <a href={`tel:${member.phone}`} className="inline-flex min-h-11 items-center gap-1.5 px-3 py-2 border border-xert-steel/30 font-body text-xs text-xert-steel hover:border-xert-steel transition-colors">
                          <Phone className="w-3.5 h-3.5" /> Call
                        </a>
                      )}
                    </div>
                  </div>
                  {(member.email || member.phone) && <p className="mt-3 font-body text-xs text-xert-concrete/55 break-all">{[member.email, member.phone].filter(Boolean).join(' · ')}</p>}
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default function EventsManager({ initialAction, onIntentHandled, onDirtyChange = NOOP }) {
  const [events, setEvents] = useState([]);
  const [goalCounts, setGoalCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [goalLoadError, setGoalLoadError] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [seeding, setSeeding] = useState(false);
  const [rosterEvent, setRosterEvent] = useState(null);
  const [rosterMembers, setRosterMembers] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  useEffect(() => {
    if (!rosterEvent) return undefined;
    let active = true;
    setRosterMembers([]);
    setRosterError('');
    setRosterLoading(true);
    getEventGoalMembers(rosterEvent.id)
      .then(members => {
        if (active) setRosterMembers(members);
      })
      .catch(error => {
        if (active) setRosterError(error.message || 'Could not load this training group.');
      })
      .finally(() => {
        if (active) setRosterLoading(false);
      });
    return () => {
      active = false;
    };
  }, [rosterEvent]);

  const load = async () => {
    setLoading(true);
    setLoadError('');
    setGoalLoadError('');
    try {
      const [eventsResult, goalsResult] = await Promise.allSettled([getAllEvents(), getEventGoalCounts()]);
      if (eventsResult.status === 'rejected') throw eventsResult.reason;
      setEvents(eventsResult.value);
      if (goalsResult.status === 'fulfilled') {
        setGoalCounts(goalsResult.value);
      } else {
        setGoalCounts({});
        setGoalLoadError('Training-goal counts are unavailable until event_goals_upgrade.sql is applied in Supabase.');
      }
    } catch (error) {
      setLoadError(error.message || 'Check the events table and admin permissions.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (initialAction !== 'create' || showEditor) return;
    setEditing(null);
    setShowEditor(true);
    onIntentHandled?.();
  }, [initialAction, onIntentHandled, showEditor]);

  const handleDelete = async () => {
    const event = pendingDelete;
    if (!event) return;
    setPendingDelete(null);
    setDeletingId(event.id);
    try {
      await deleteEvent(event.id, event.updated_at);
      toast({ title: 'Event deleted', description: `${event.name} was removed from the calendar.` });
      await load();
    } catch (e) {
      toast({
        title: 'Delete failed',
        description: e.message,
        variant: 'destructive'
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const result = await seedXertEventCalendar();
      toast({
        title: result.inserted ? 'Calendar loaded' : 'Calendar already loaded',
        description: result.inserted ? `${result.inserted} XERT 2026 event${result.inserted === 1 ? '' : 's'} added.` : 'No missing XERT 2026 events were found.'
      });
      load();
    } catch (e) {
      toast({
        title: 'Calendar load failed',
        description: e.message,
        variant: 'destructive'
      });
    } finally {
      setSeeding(false);
    }
  };

  const usedCategories = ['all', ...Array.from(new Set(events.map(e => e.category).filter(Boolean))).sort()];
  const filtered = events.filter(ev => {
    if (catFilter !== 'all' && ev.category !== catFilter) return false;
    const q = search.trim().toLowerCase();
    if (q && !`${ev.name} ${ev.location || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h2 className="font-display text-lg text-xert-offwhite uppercase">SE QLD Event Calendar</h2>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
          <input value={search} onChange={e => setSearch(e.target.value)} aria-label="Search events" placeholder="Search events…" className="col-span-2 min-h-11 w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red sm:col-span-1 sm:w-48" />
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)} aria-label="Filter events by category" className="min-h-11 bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red">
            {usedCategories.map(c => (
              <option key={c} value={c}>
                {c === 'all' ? 'All categories' : c}
              </option>
            ))}
          </select>
          <button onClick={handleSeed} disabled={seeding || deletingId !== null} className="min-h-11 px-4 py-2.5 border border-xert-steel/40 text-xert-concrete font-display text-sm uppercase hover:border-xert-steel transition-colors disabled:opacity-50">
            {seeding ? 'Loading...' : 'Load 2026 Calendar'}
          </button>
          <button
            onClick={() => {
              setEditing(null);
              setShowEditor(true);
            }}
            disabled={deletingId !== null}
            className="min-h-11 px-5 py-2.5 bg-xert-steel text-xert-navy font-display text-sm uppercase hover:bg-xert-pale transition-colors disabled:opacity-50"
          >
            + Add Event
          </button>
        </div>
      </div>

      {goalLoadError && <p className="mb-4 font-body text-xs text-xert-concrete/50">{goalLoadError}</p>}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-14 bg-xert-ink animate-pulse" />
          ))}
        </div>
      ) : loadError ? (
        <AdminLoadError message={loadError} onRetry={load} />
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center border border-xert-steel/20">
          <p className="font-display text-lg text-xert-offwhite uppercase mb-2">{events.length === 0 ? 'No events yet' : 'No matches'}</p>
          <p className="font-body text-sm text-xert-concrete/40">{events.length === 0 ? 'Add events to the public 2026 calendar.' : 'Try a different search or category.'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(ev => (
            <div key={ev.id} className="flex flex-col gap-4 bg-xert-ink border border-xert-steel/20 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-body text-xs border border-xert-steel/30 text-xert-concrete/60 px-2 py-0.5 uppercase">{ev.category || 'other'}</span>
                  {!ev.published && <span className="font-body text-xs border border-xert-steel/30 text-xert-concrete/40 px-2 py-0.5 uppercase">Hidden</span>}
                  {ev.url && <span className="font-body text-xs border border-green-600/40 text-green-400 px-2 py-0.5 uppercase">Link</span>}
                  <button type="button" onClick={() => setRosterEvent(ev)} disabled={Boolean(goalLoadError)} title={goalLoadError || 'View training group'} className="inline-flex min-h-11 items-center gap-1 font-body text-xs border border-xert-red/40 text-xert-red px-2 py-2.5 uppercase disabled:opacity-40">
                      <Target className="w-3 h-3" />
                      {goalCounts[ev.id] || 0} training
                  </button>
                </div>
                <h3 className="font-display text-base text-xert-offwhite uppercase">{ev.name}</h3>
                <p className="font-body text-xs text-xert-concrete/50">
                  {ev.event_date
                    ? new Date(`${ev.event_date}T00:00:00`).toLocaleDateString('en-AU', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      })
                    : 'No date'}
                  {ev.location ? ` · ${ev.location}` : ''}
                </p>
              </div>
              <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:shrink-0">
                <button
                  onClick={() => {
                    setEditing(ev);
                    setShowEditor(true);
                  }}
                  disabled={deletingId !== null}
                  className="min-h-11 px-3 py-2.5 border border-xert-steel/30 font-body text-xs text-xert-concrete/60 hover:border-xert-steel transition-colors disabled:opacity-50"
                >
                  Edit
                </button>
                <button onClick={() => setPendingDelete(ev)} disabled={deletingId !== null} className="min-h-11 px-3 py-2.5 border border-xert-red/30 font-body text-xs text-xert-red/60 hover:border-xert-red/60 transition-colors disabled:opacity-50">
                  {deletingId === ev.id ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showEditor && (
        <EventEditor
          key={editing?.id ?? 'new'}
          event={editing}
          onSave={() => {
            setShowEditor(false);
            load();
          }}
          onCancel={() => setShowEditor(false)}
          onDirtyChange={onDirtyChange}
        />
      )}

      {rosterEvent && (
        <TrainingRosterDialog
          event={rosterEvent}
          members={rosterMembers}
          loading={rosterLoading}
          error={rosterError}
          onClose={() => setRosterEvent(null)}
        />
      )}
      <AdminConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={open => !open && setPendingDelete(null)}
        title="Delete calendar event?"
        description={pendingDelete ? `Delete ${pendingDelete.name} from the public event calendar?` : ''}
        warning={pendingDelete
          ? (goalCounts[pendingDelete.id]
              ? `${goalCounts[pendingDelete.id]} member training goal${goalCounts[pendingDelete.id] === 1 ? '' : 's'} will also be removed. This cannot be undone.`
              : 'This cannot be undone.')
          : ''}
        confirmLabel="Delete event"
        onConfirm={() => void handleDelete()}
        busy={deletingId !== null}
      />
    </div>
  );
}
