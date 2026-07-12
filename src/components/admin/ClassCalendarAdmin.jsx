import React, { useState, useEffect } from 'react';
import { AlertTriangle, Download } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { getClassSessions, createClassSession, createClassSessions, updateClassSession, cancelClassSession, duplicateClassSession, getClassBookings, updateBookingStatus, adminSessionRoster, adminSetBookingStatus, getBlackoutPeriods } from '@/lib/adminData';
import { downloadCsv } from '@/lib/csv';
import { blackoutsOverlappingSession, classSessionValidationError, repeatedClassSessionCopies } from '@/lib/scheduling';

const CLASS_TYPES = ['XERT Foundation', 'XERT Strength', 'XERT Engine', 'XERT Hybrid', 'XERT Event Prep', 'XERT Team'];
const STATUSES = ['draft', 'published', 'full', 'cancelled', 'completed'];
const BOOKING_MODES = ['interest_only', 'request_to_book', 'instant_book'];
const INTENSITY = ['Low', 'Moderate', 'High', 'Very high'];
const BOOKING_STATUSES = ['requested', 'confirmed', 'waitlisted', 'cancelled', 'declined', 'attended', 'no_show'];

function rosterStatusOptions(status, sessionStatus) {
  if (sessionStatus !== 'published') return [status];
  if (status === 'requested') return ['requested', 'confirmed', 'waitlisted', 'declined', 'cancelled'];
  if (['waitlisted', 'declined', 'cancelled'].includes(status)) {
    return [status, 'requested', 'confirmed'];
  }
  return ['confirmed', 'attended', 'no_show', 'cancelled'];
}

function rosterExportFilename(session) {
  const className = (session.title || 'class')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const date = session.start_time?.slice(0, 10) || 'undated';
  return `xert-roster-${className || 'class'}-${date}.csv`;
}

const STATUS_COLORS = {
  draft: 'text-xert-concrete/40 border-xert-steel/30',
  published: 'text-green-400 border-green-600/40',
  full: 'text-xert-orange border-xert-orange/40',
  cancelled: 'text-xert-red/50 border-xert-red/20',
  completed: 'text-xert-concrete/40 border-xert-steel/30',
};

function SessionEditor({ session, blackouts, onSave, onCancel }) {
  const [form, setForm] = useState(session || {
    class_type: 'XERT Foundation', title: '', description: '', coach_name: '',
    start_time: '', end_time: '', duration_minutes: 60, capacity: 8,
    location_zone: 'Main floor', beginner_friendly: false,
    intensity_level: 'Moderate', status: 'draft', public_visible: false,
    booking_mode: 'request_to_book', notes: '',
  });
  const [saving, setSaving] = useState(false);

  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));
  const overlappingBlackouts = blackoutsOverlappingSession(form, blackouts);

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
      onSave();
    } catch (e) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="class-editor-title" className="bg-xert-ink border border-xert-steel/20 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-xert-steel/20">
          <h3 id="class-editor-title" className="font-display text-xl text-xert-offwhite uppercase">{session?.id ? 'Edit Class' : 'New Class'}</h3>
          <button type="button" onClick={onCancel} aria-label="Close class editor" title="Close" className="min-w-11 min-h-11 text-xert-concrete/40 hover:text-xert-offwhite text-xl">&#10005;</button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="class-type" className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1">Class type</label>
              <select id="class-type" value={form.class_type} onChange={e => set('class_type', e.target.value)}
                className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red">
                {CLASS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="class-status" className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1">Status</label>
              <select id="class-status" value={form.status} onChange={e => set('status', e.target.value)}
                className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red">
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="class-title" className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1">Title *</label>
            <input id="class-title" required value={form.title} onChange={e => set('title', e.target.value)} placeholder="Class title"
              className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red" />
          </div>
          <div>
            <label htmlFor="class-description" className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1">Description</label>
            <textarea id="class-description" value={form.description} onChange={e => set('description', e.target.value)} rows={2}
              className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red resize-none" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="class-start" className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1">Start time</label>
              <input id="class-start" type="datetime-local" value={form.start_time} onChange={e => set('start_time', e.target.value)}
                className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red" />
            </div>
            <div>
              <label htmlFor="class-end" className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1">End time</label>
              <input id="class-end" type="datetime-local" value={form.end_time} onChange={e => set('end_time', e.target.value)}
                className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red" />
            </div>
            <div>
              <label htmlFor="class-duration" className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1">Duration (min)</label>
              <input id="class-duration" type="number" min="1" step="1" value={form.duration_minutes} onChange={e => set('duration_minutes', +e.target.value)}
                className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="class-capacity" className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1">Capacity</label>
              <input id="class-capacity" type="number" min="1" step="1" value={form.capacity} onChange={e => set('capacity', +e.target.value)}
                className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red" />
            </div>
            <div>
              <label htmlFor="class-intensity" className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1">Intensity</label>
              <select id="class-intensity" value={form.intensity_level} onChange={e => set('intensity_level', e.target.value)}
                className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red">
                {INTENSITY.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="class-booking-mode" className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1">Booking mode</label>
              <select id="class-booking-mode" value={form.booking_mode} onChange={e => set('booking_mode', e.target.value)}
                className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red">
                {BOOKING_MODES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          {overlappingBlackouts.length > 0 && (
            <div role="alert" className="border border-xert-orange/40 bg-xert-orange/10 p-3 flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-xert-orange" />
              <p className="font-body text-xs leading-relaxed text-xert-concrete/80">
                This class overlaps a blackout: {overlappingBlackouts.map(blackout => blackout.reason).join(', ')}.
              </p>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="class-coach" className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1">Coach name</label>
              <input id="class-coach" value={form.coach_name} onChange={e => set('coach_name', e.target.value)}
                className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red" />
            </div>
            <div>
              <label htmlFor="class-location" className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1">Location / zone</label>
              <input id="class-location" value={form.location_zone} onChange={e => set('location_zone', e.target.value)}
                className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red" />
            </div>
          </div>
          <div className="flex gap-6">
            <label className="flex min-h-11 items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.beginner_friendly} onChange={e => set('beginner_friendly', e.target.checked)} className="peer sr-only" />
              <span aria-hidden="true" className="w-5 h-5 border-2 border-xert-steel/50 flex items-center justify-center peer-checked:border-xert-red peer-checked:bg-xert-red peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-xert-offwhite">{form.beginner_friendly && <span className="text-white text-xs">&#10003;</span>}</span>
              <span className="font-body text-sm text-xert-concrete/80">Beginner friendly</span>
            </label>
            <label className="flex min-h-11 items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.public_visible} onChange={e => set('public_visible', e.target.checked)} className="peer sr-only" />
              <span aria-hidden="true" className="w-5 h-5 border-2 border-xert-steel/50 flex items-center justify-center peer-checked:border-green-500 peer-checked:bg-green-500 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-xert-offwhite">{form.public_visible && <span className="text-white text-xs">&#10003;</span>}</span>
              <span className="font-body text-sm text-xert-concrete/80">Public visible</span>
            </label>
          </div>
          <div>
            <label htmlFor="class-notes" className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1">Notes</label>
            <textarea id="class-notes" value={form.notes} onChange={e => set('notes', e.target.value)} rows={2}
              className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red resize-none" />
          </div>
        </div>
        <div className="flex gap-3 p-6 border-t border-xert-steel/20">
          <button type="button" onClick={onCancel} disabled={saving}
            className="flex-1 py-3 border border-xert-steel/40 font-display text-sm text-xert-concrete/70 uppercase hover:border-xert-steel transition-colors">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="flex-1 py-3 bg-xert-red text-white font-display text-sm uppercase hover:bg-xert-orange transition-colors disabled:opacity-50">
            {saving ? 'Saving...' : 'Save class'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RepeatModal({ session, onDone, onCancel }) {
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
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="repeat-class-title" className="bg-xert-ink border border-xert-steel/20 w-full max-w-md">
        <div className="p-6 border-b border-xert-steel/20">
          <h3 id="repeat-class-title" className="font-display text-xl text-xert-offwhite uppercase">Repeat Class</h3>
          <p className="font-body text-xs text-xert-concrete/50 mt-1">{session.title}</p>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="repeat-interval" className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1">Every ... days</label>
              <select id="repeat-interval" value={intervalDays} onChange={e => setIntervalDays(+e.target.value)}
                className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red">
                <option value={1}>1 (daily)</option>
                <option value={2}>2</option>
                <option value={7}>7 (weekly)</option>
                <option value={8}>8 (4-on / 4-off cycle)</option>
                <option value={14}>14 (fortnightly)</option>
              </select>
            </div>
            <div>
              <label htmlFor="repeat-count" className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1">Copies</label>
              <input id="repeat-count" type="number" min="1" max="26" value={count} onChange={e => setCount(Math.max(1, Math.min(26, +e.target.value)))}
                className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red" />
            </div>
          </div>
          {preview.length > 0 && (
            <p className="font-body text-xs text-xert-concrete/40">
              Next dates: {preview.join(', ')}{count > 3 ? '…' : ''}
            </p>
          )}
          <label className="flex min-h-11 items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={keepPublished} onChange={e => setKeepPublished(e.target.checked)} className="peer sr-only" />
            <span aria-hidden="true" className="w-5 h-5 border-2 border-xert-steel/50 flex items-center justify-center peer-checked:border-green-500 peer-checked:bg-green-500 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-xert-offwhite">{keepPublished && <span className="text-white text-xs">&#10003;</span>}</span>
            <span className="font-body text-sm text-xert-concrete/80">Copies keep this class&rsquo;s publish status</span>
          </label>
        </div>
        <div className="flex gap-3 p-6 border-t border-xert-steel/20">
          <button type="button" onClick={onCancel} disabled={saving} className="flex-1 py-3 border border-xert-steel/40 font-display text-sm text-xert-concrete/70 uppercase hover:border-xert-steel transition-colors disabled:opacity-50">Cancel</button>
          <button type="button" onClick={handleRepeat} disabled={saving}
            className="flex-1 py-3 bg-xert-red text-white font-display text-sm uppercase hover:bg-xert-orange transition-colors disabled:opacity-50">
            {saving ? 'Creating…' : `Create ${count} copies`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ClassCalendarAdmin() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editingSession, setEditingSession] = useState(null);
  const [expandedBookings, setExpandedBookings] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [roster, setRoster] = useState([]);
  const [blackouts, setBlackouts] = useState([]);
  const [repeating, setRepeating] = useState(null);
  const [timeFilter, setTimeFilter] = useState('upcoming');
  const [updatingBookingId, setUpdatingBookingId] = useState(null);
  const [sessionToCancel, setSessionToCancel] = useState(null);
  const [isCancellingSession, setIsCancellingSession] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [loadedSessions, loadedBlackouts] = await Promise.all([
        getClassSessions(false),
        getBlackoutPeriods().catch(error => {
          toast({ title: 'Blackout checks unavailable', description: error.message, variant: 'destructive' });
          return [];
        }),
      ]);
      setSessions(loadedSessions);
      setBlackouts(loadedBlackouts);
    } catch (error) {
      toast({ title: 'Could not load class sessions', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const refreshBookings = async (sessionId) => {
    const [requests, members] = await Promise.all([
      getClassBookings({ class_session_id: sessionId }),
      adminSessionRoster(sessionId).catch(() => []),
    ]);
    setBookings(requests);
    setRoster(members);
  };

  const loadBookings = async (sessionId) => {
    if (expandedBookings === sessionId) {
      setExpandedBookings(null);
      setBookings([]);
      setRoster([]);
      return;
    }
    try {
      await refreshBookings(sessionId);
      setExpandedBookings(sessionId);
    } catch (e) {
      toast({ title: 'Could not load class bookings', description: e.message, variant: 'destructive' });
    }
  };

  const handleRosterStatus = async (bookingId, status) => {
    const sessionId = expandedBookings;
    if (!sessionId) return;
    const session = sessions.find(item => item.id === sessionId);
    if (session?.status !== 'published') {
      toast({ title: 'Class is not open for booking', description: 'Publish the class before reopening a member booking.', variant: 'destructive' });
      return;
    }
    setUpdatingBookingId(bookingId);
    try {
      await adminSetBookingStatus(bookingId, status);
      await refreshBookings(sessionId);
    } catch (e) {
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' });
    } finally {
      setUpdatingBookingId(null);
    }
  };

  const handleDuplicate = async (session) => {
    try {
      await duplicateClassSession(session);
      load();
    } catch (e) { toast({ title: 'Duplicate failed', description: e.message, variant: 'destructive' }); }
  };

  const handleCancel = async () => {
    const session = sessionToCancel;
    if (!session) return;
    setIsCancellingSession(true);
    try {
      const affectedBookings = await cancelClassSession(session.id);
      const noun = affectedBookings === 1 ? 'booking' : 'bookings';
      toast({
        title: 'Class cancelled',
        description: affectedBookings
          ? `${affectedBookings} ${noun} cancelled. Reserved member credits were returned.`
          : 'No active bookings needed to be cancelled.',
      });
      if (expandedBookings === session.id) {
        setExpandedBookings(null);
        setBookings([]);
        setRoster([]);
      }
      setSessionToCancel(null);
      load();
    } catch (e) {
      toast({ title: 'Cancel failed', description: e.message, variant: 'destructive' });
    } finally {
      setIsCancellingSession(false);
    }
  };

  const handleBookingStatus = async (id, status) => {
    const sessionId = expandedBookings;
    if (!sessionId) return;
    setUpdatingBookingId(id);
    try {
      await updateBookingStatus(id, status);
      await refreshBookings(sessionId);
    } catch (e) {
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' });
    } finally {
      setUpdatingBookingId(null);
    }
  };

  const exportRoster = (session) => {
    downloadCsv(
      rosterExportFilename(session),
      roster.map(member => ({
        class_title: session.title || 'XERT class',
        class_starts_at: session.start_time ? new Date(session.start_time).toLocaleString('en-AU') : '',
        name: member.full_name || '',
        email: member.email || '',
        phone: member.phone || '',
        status: member.status,
        booked_at: member.booked_at ? new Date(member.booked_at).toLocaleString('en-AU') : '',
      })),
      [
        { key: 'class_title', label: 'Class' },
        { key: 'class_starts_at', label: 'Class starts' },
        { key: 'name', label: 'Member' },
        { key: 'email', label: 'Email' },
        { key: 'phone', label: 'Mobile' },
        { key: 'status', label: 'Booking status' },
        { key: 'booked_at', label: 'Booked at' },
      ]
    );
  };

  const now = Date.now();
  const filtered = sessions.filter(s => {
    if (timeFilter === 'all') return true;
    const isPast = s.start_time && new Date(s.start_time).getTime() < now;
    return timeFilter === 'past' ? isPast : !isPast;
  });
  const upcomingCount = sessions.filter(s => !s.start_time || new Date(s.start_time).getTime() >= now).length;

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <h2 className="font-display text-lg text-xert-offwhite uppercase">Class Sessions</h2>
          <div className="flex">
            {[
              { key: 'upcoming', label: `Upcoming (${upcomingCount})` },
              { key: 'past', label: `Past (${sessions.length - upcomingCount})` },
              { key: 'all', label: 'All' },
            ].map(t => (
              <button key={t.key} onClick={() => setTimeFilter(t.key)}
                className="px-3 py-1.5 font-body text-xs uppercase tracking-wider border transition-colors"
                style={{
                  borderColor: timeFilter === t.key ? '#7BA7BC' : 'rgba(123,167,188,0.2)',
                  backgroundColor: timeFilter === t.key ? 'rgba(123,167,188,0.12)' : 'transparent',
                  color: timeFilter === t.key ? '#F1F3F4' : 'rgba(209,221,230,0.5)',
                  marginLeft: '-1px',
                }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => { setEditingSession(null); setShowEditor(true); }}
          className="px-5 py-2.5 bg-xert-red text-white font-display text-sm uppercase hover:bg-xert-orange transition-colors">
          + New Class
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-20 bg-xert-ink animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center border border-xert-steel/20">
          <p className="font-display text-lg text-xert-offwhite uppercase mb-2">
            {sessions.length === 0 ? 'No classes yet' : `No ${timeFilter === 'all' ? '' : timeFilter} classes`}
          </p>
          <p className="font-body text-sm text-xert-concrete/40 mb-6">
            {sessions.length === 0 ? 'Create your first class session.' : 'Try another filter or create a new class.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(s => {
            const sessionBlackouts = blackoutsOverlappingSession(s, blackouts);
            return (
            <div key={s.id} className="bg-xert-ink border border-xert-steel/20">
              <div className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`font-body text-xs border px-2 py-0.5 uppercase ${STATUS_COLORS[s.status] || 'text-xert-concrete/40 border-xert-steel/30'}`}>{s.status}</span>
                      {s.public_visible && <span className="font-body text-xs border border-green-600/40 text-green-400 px-2 py-0.5 uppercase">Public</span>}
                      {s.beginner_friendly && <span className="font-body text-xs text-xert-concrete/40 uppercase text-xs">Beginner friendly</span>}
                      {s.booking_mode && <span className="font-body text-xs text-xert-concrete/40 uppercase">{s.booking_mode.replaceAll('_', ' ')}</span>}
                    </div>
                    <h3 className="font-display text-lg text-xert-offwhite uppercase">{s.title}</h3>
                    <p className="font-body text-xs text-xert-concrete/50">
                      {s.class_type} · {s.start_time ? new Date(s.start_time).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'No time set'}
                      {s.coach_name ? ` · ${s.coach_name}` : ''} · Cap: {s.capacity}
                    </p>
                    {sessionBlackouts.length > 0 && (
                      <p className="mt-2 inline-flex items-center gap-1.5 font-body text-xs text-xert-orange">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Blackout overlap: {sessionBlackouts.map(blackout => blackout.reason).join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                    <button onClick={() => loadBookings(s.id)}
                      className="px-3 py-1.5 border border-xert-steel/30 font-body text-xs text-xert-concrete/60 hover:border-xert-steel transition-colors">
                      Bookings
                    </button>
                    <button onClick={() => { setEditingSession(s); setShowEditor(true); }}
                      className="px-3 py-1.5 border border-xert-steel/30 font-body text-xs text-xert-concrete/60 hover:border-xert-steel transition-colors">
                      Edit
                    </button>
                    <button onClick={() => handleDuplicate(s)}
                      className="px-3 py-1.5 border border-xert-steel/30 font-body text-xs text-xert-concrete/60 hover:border-xert-steel transition-colors">
                      Dupe
                    </button>
                    <button onClick={() => setRepeating(s)}
                      className="px-3 py-1.5 border border-xert-steel/30 font-body text-xs text-xert-concrete/60 hover:border-xert-steel transition-colors">
                      Repeat…
                    </button>
                    {s.status !== 'cancelled' && (
                      <button onClick={() => setSessionToCancel(s)}
                        className="px-3 py-1.5 border border-xert-red/30 font-body text-xs text-xert-red/60 hover:border-xert-red/60 transition-colors">
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Bookings panel */}
              {expandedBookings === s.id && (
                <div className="border-t border-xert-steel/20 p-4 bg-xert-charcoal">
                  {/* Credit-based member roster */}
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <h4 className="font-display text-sm text-xert-concrete/60 uppercase">
                      Class roster ({roster.filter(r => ['requested', 'confirmed'].includes(r.status)).length}{s.capacity ? `/${s.capacity}` : ''})
                    </h4>
                    <button onClick={() => exportRoster(s)} disabled={roster.length === 0}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-xert-steel/30 font-body text-[11px] uppercase tracking-wider text-xert-concrete/60 hover:border-xert-steel transition-colors disabled:opacity-40">
                      <Download className="w-3.5 h-3.5" />
                      Export roster
                    </button>
                  </div>
                  {roster.length === 0 ? (
                    <p className="font-body text-sm text-xert-concrete/40 mb-4">No member bookings yet.</p>
                  ) : (
                    <div className="space-y-2 mb-5">
                      {roster.map(r => (
                        <div key={r.booking_id} className="flex items-center justify-between gap-4 bg-xert-ink p-3">
                          <div>
                            <p className="font-body text-sm text-xert-offwhite">{r.full_name || r.email || 'Member'}</p>
                            <p className="font-body text-xs text-xert-concrete/50">{r.email}{r.phone ? ` · ${r.phone}` : ''}</p>
                          </div>
                          <select value={r.status} onChange={e => handleRosterStatus(r.booking_id, e.target.value)} disabled={updatingBookingId === r.booking_id || s.status !== 'published'}
                            className="bg-xert-charcoal border border-xert-steel/40 px-2 py-1 font-body text-xs text-xert-offwhite focus:outline-none focus:border-xert-red">
                            {rosterStatusOptions(r.status, s.status).map(st => <option key={st} value={st}>{st}</option>)}
                          </select>
                        </div>
                      ))}
                      <p className="font-body text-xs text-xert-concrete/40">Waitlisting, declining, or cancelling a request returns its reserved credit.</p>
                    </div>
                  )}

                  <h4 className="font-display text-sm text-xert-concrete/60 uppercase mb-3">Booking requests ({bookings.length})</h4>
                  {bookings.length === 0 ? (
                    <p className="font-body text-sm text-xert-concrete/40">No bookings yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {bookings.map(b => (
                        <div key={b.id} className="flex items-center justify-between gap-4 bg-xert-ink p-3">
                          <div>
                            <p className="font-body text-sm text-xert-offwhite">{b.full_name}</p>
                            <p className="font-body text-xs text-xert-concrete/50">{b.email} · {b.training_level}</p>
                          </div>
                          <select value={b.status} onChange={e => handleBookingStatus(b.id, e.target.value)} disabled={updatingBookingId === b.id}
                            className="bg-xert-charcoal border border-xert-steel/40 px-2 py-1 font-body text-xs text-xert-offwhite focus:outline-none focus:border-xert-red">
                            {BOOKING_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}

      {showEditor && (
        <SessionEditor
          session={editingSession}
          blackouts={blackouts}
          onSave={() => { setShowEditor(false); load(); }}
          onCancel={() => setShowEditor(false)}
        />
      )}

      {repeating && (
        <RepeatModal
          session={repeating}
          onDone={() => { setRepeating(null); load(); }}
          onCancel={() => setRepeating(null)}
        />
      )}

      {sessionToCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" role="presentation">
          <div
            className="w-full max-w-md border border-xert-steel/30 bg-xert-ink p-6 text-xert-offwhite"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="cancel-class-title"
            aria-describedby="cancel-class-description"
          >
            <h3 id="cancel-class-title" className="font-display text-xl uppercase text-xert-offwhite">Cancel this class?</h3>
            <p id="cancel-class-description" className="mt-3 font-body text-sm leading-relaxed text-xert-concrete/70">
              {sessionToCancel.title} will be removed from the timetable. All active bookings will be cancelled and any reserved class credits returned.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={isCancellingSession}
                onClick={() => setSessionToCancel(null)}
                className="border border-xert-steel/40 px-4 py-2.5 font-display text-xs uppercase text-xert-concrete/70 transition-colors hover:bg-xert-charcoal hover:text-xert-offwhite disabled:opacity-50"
              >
                Keep class
              </button>
              <button
                type="button"
                disabled={isCancellingSession}
                onClick={handleCancel}
                className="bg-xert-red px-4 py-2.5 font-display text-xs uppercase text-white transition-colors hover:bg-xert-orange disabled:opacity-50"
              >
                {isCancellingSession ? 'Cancelling...' : 'Cancel class'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
