import React, { useState, useEffect } from 'react';
import { getClassSessions, createClassSession, updateClassSession, cancelClassSession, duplicateClassSession, getClassBookings, updateBookingStatus } from '@/lib/adminData';

const CLASS_TYPES = ['XERT Foundation', 'XERT Strength', 'XERT Engine', 'XERT Hybrid', 'XERT Event Prep', 'XERT Team'];
const STATUSES = ['draft', 'published', 'full', 'cancelled', 'completed'];
const BOOKING_MODES = ['interest_only', 'request_to_book', 'instant_book'];
const INTENSITY = ['Low', 'Moderate', 'High', 'Very high'];
const BOOKING_STATUSES = ['requested', 'confirmed', 'waitlisted', 'cancelled', 'declined', 'attended', 'no_show'];

const STATUS_COLORS = {
  draft: 'text-xert-concrete/40 border-xert-steel/30',
  published: 'text-green-400 border-green-600/40',
  full: 'text-xert-orange border-xert-orange/40',
  cancelled: 'text-xert-red/50 border-xert-red/20',
  completed: 'text-xert-concrete/40 border-xert-steel/30',
};

function SessionEditor({ session, onSave, onCancel }) {
  const [form, setForm] = useState(session || {
    class_type: 'XERT Foundation', title: '', description: '', coach_name: '',
    start_time: '', end_time: '', duration_minutes: 60, capacity: 12,
    location_zone: 'Main floor', beginner_friendly: false,
    intensity_level: 'Moderate', status: 'draft', public_visible: false,
    booking_mode: 'request_to_book', notes: '',
  });
  const [saving, setSaving] = useState(false);

  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const handleSave = async () => {
    if (!form.title.trim()) { alert('Title required.'); return; }
    setSaving(true);
    try {
      if (session?.id) {
        await updateClassSession(session.id, form);
      } else {
        await createClassSession(form);
      }
      onSave();
    } catch (e) {
      alert('Save failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-4">
      <div className="bg-xert-ink border border-xert-steel/20 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-xert-steel/20">
          <h3 className="font-display text-xl text-xert-offwhite uppercase">{session?.id ? 'Edit Class' : 'New Class'}</h3>
          <button onClick={onCancel} className="text-xert-concrete/40 hover:text-xert-offwhite text-xl">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1">Class type</label>
              <select value={form.class_type} onChange={e => set('class_type', e.target.value)}
                className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red">
                {CLASS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)}
                className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red">
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1">Title *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Class title"
              className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red" />
          </div>
          <div>
            <label className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1">Description</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2}
              className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red resize-none" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1">Start time</label>
              <input type="datetime-local" value={form.start_time} onChange={e => set('start_time', e.target.value)}
                className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red" />
            </div>
            <div>
              <label className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1">End time</label>
              <input type="datetime-local" value={form.end_time} onChange={e => set('end_time', e.target.value)}
                className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red" />
            </div>
            <div>
              <label className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1">Duration (min)</label>
              <input type="number" value={form.duration_minutes} onChange={e => set('duration_minutes', +e.target.value)}
                className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1">Capacity</label>
              <input type="number" value={form.capacity} onChange={e => set('capacity', +e.target.value)}
                className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red" />
            </div>
            <div>
              <label className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1">Intensity</label>
              <select value={form.intensity_level} onChange={e => set('intensity_level', e.target.value)}
                className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red">
                {INTENSITY.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1">Booking mode</label>
              <select value={form.booking_mode} onChange={e => set('booking_mode', e.target.value)}
                className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red">
                {BOOKING_MODES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1">Coach name</label>
              <input value={form.coach_name} onChange={e => set('coach_name', e.target.value)}
                className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red" />
            </div>
            <div>
              <label className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1">Location / zone</label>
              <input value={form.location_zone} onChange={e => set('location_zone', e.target.value)}
                className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red" />
            </div>
          </div>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <div onClick={() => set('beginner_friendly', !form.beginner_friendly)}
                className={`w-5 h-5 border-2 flex items-center justify-center transition-all ${form.beginner_friendly ? 'border-xert-red bg-xert-red' : 'border-xert-steel/50'}`}>
                {form.beginner_friendly && <span className="text-white text-xs">✓</span>}
              </div>
              <span className="font-body text-sm text-xert-concrete/80">Beginner friendly</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <div onClick={() => set('public_visible', !form.public_visible)}
                className={`w-5 h-5 border-2 flex items-center justify-center transition-all ${form.public_visible ? 'border-green-500 bg-green-500' : 'border-xert-steel/50'}`}>
                {form.public_visible && <span className="text-white text-xs">✓</span>}
              </div>
              <span className="font-body text-sm text-xert-concrete/80">Public visible</span>
            </label>
          </div>
          <div>
            <label className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2}
              className="w-full bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red resize-none" />
          </div>
        </div>
        <div className="flex gap-3 p-6 border-t border-xert-steel/20">
          <button onClick={onCancel}
            className="flex-1 py-3 border border-xert-steel/40 font-display text-sm text-xert-concrete/70 uppercase hover:border-xert-steel transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-3 bg-xert-red text-white font-display text-sm uppercase hover:bg-xert-orange transition-colors disabled:opacity-50">
            {saving ? 'Saving...' : 'Save class'}
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

  const load = () => {
    setLoading(true);
    getClassSessions(false).then(data => {
      setSessions(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const loadBookings = (sessionId) => {
    if (expandedBookings === sessionId) { setExpandedBookings(null); return; }
    getClassBookings({ class_session_id: sessionId }).then(data => {
      setBookings(data);
      setExpandedBookings(sessionId);
    });
  };

  const handleDuplicate = async (session) => {
    try {
      await duplicateClassSession(session);
      load();
    } catch (e) { alert('Duplicate failed: ' + e.message); }
  };

  const handleCancel = async (id) => {
    if (!confirm('Cancel this class?')) return;
    try { await cancelClassSession(id); load(); } catch (e) { alert('Cancel failed: ' + e.message); }
  };

  const handleBookingStatus = async (id, status) => {
    try { await updateBookingStatus(id, status); loadBookings(expandedBookings); } catch (e) { alert('Update failed: ' + e.message); }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display text-lg text-xert-offwhite uppercase">Class Sessions</h2>
        <button onClick={() => { setEditingSession(null); setShowEditor(true); }}
          className="px-5 py-2.5 bg-xert-red text-white font-display text-sm uppercase hover:bg-xert-orange transition-colors">
          + New Class
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-20 bg-xert-ink animate-pulse" />)}</div>
      ) : sessions.length === 0 ? (
        <div className="py-16 text-center border border-xert-steel/20">
          <p className="font-display text-lg text-xert-offwhite uppercase mb-2">No classes yet</p>
          <p className="font-body text-sm text-xert-concrete/40 mb-6">Create your first class session.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map(s => (
            <div key={s.id} className="bg-xert-ink border border-xert-steel/20">
              <div className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`font-body text-xs border px-2 py-0.5 uppercase ${STATUS_COLORS[s.status] || 'text-xert-concrete/40 border-xert-steel/30'}`}>{s.status}</span>
                      {s.public_visible && <span className="font-body text-xs border border-green-600/40 text-green-400 px-2 py-0.5 uppercase">Public</span>}
                      {s.beginner_friendly && <span className="font-body text-xs text-xert-concrete/40 uppercase text-xs">Beginner friendly</span>}
                    </div>
                    <h3 className="font-display text-lg text-xert-offwhite uppercase">{s.title}</h3>
                    <p className="font-body text-xs text-xert-concrete/50">
                      {s.class_type} · {s.start_time ? new Date(s.start_time).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'No time set'}
                      {s.coach_name ? ` · ${s.coach_name}` : ''} · Cap: {s.capacity}
                    </p>
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
                    {s.status !== 'cancelled' && (
                      <button onClick={() => handleCancel(s.id)}
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
                          <select value={b.status} onChange={e => handleBookingStatus(b.id, e.target.value)}
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
          ))}
        </div>
      )}

      {showEditor && (
        <SessionEditor
          session={editingSession}
          onSave={() => { setShowEditor(false); load(); }}
          onCancel={() => setShowEditor(false)}
        />
      )}
    </div>
  );
}