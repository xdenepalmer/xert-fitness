import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BellRing, CheckCheck, ClipboardCheck, Copy, Download, Mail, Phone, RotateCcw, UserCheck, UserMinus, X } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { getClassSessions, createClassSession, createClassSessions, updateClassSession, cancelClassSession, notifyClassCancellation, duplicateClassSession, getClassBookings, updateBookingStatus, adminSessionRoster, adminWaitlistOverview, adminSetBookingStatus, adminPromoteNextWaitlisted, adminSkipWaitlistedHead, adminRecordSessionAttendance, getBlackoutPeriods } from '@/lib/adminData';
import { downloadCsv } from '@/lib/csv';
import { blackoutsOverlappingSession, classSessionValidationError, repeatedClassSessionCopies, toDateTimeLocalInput } from '@/lib/scheduling';
import { buildClassCancellationMailto, buildClassCancellationMessage, collectClassCancellationContacts } from '@/lib/classCommunications';
import { blankAttendanceDraft, createAttendanceDraft, markAllAttendance, summarizeAttendanceDraft } from '@/lib/attendanceDraft';
import { describeClassCancellationPush, describeTargetedMemberNoticePush } from '@/lib/memberAnnouncements';
import AdminConfirmDialog from '@/components/admin/AdminConfirmDialog';

const CLASS_TYPES = ['XERT Foundation', 'XERT Strength', 'XERT Engine', 'XERT Hybrid', 'XERT Event Prep', 'XERT Team'];
const BOOKING_MODES = ['interest_only', 'request_to_book', 'instant_book'];
const INTENSITY = ['Low', 'Moderate', 'High', 'Very high'];
const BOOKING_STATUSES = ['requested', 'confirmed', 'waitlisted', 'cancelled', 'declined', 'attended', 'no_show'];
const NOOP = _dirty => {};
const EMPTY_SESSION = {
  class_type: 'XERT Foundation', title: '', description: '', coach_name: '',
  start_time: '', end_time: '', duration_minutes: 60, capacity: 8,
  location_zone: 'Main floor', beginner_friendly: false,
  intensity_level: 'Moderate', status: 'draft', public_visible: false,
  booking_mode: 'request_to_book', notes: '',
};

function sessionEditorForm(session) {
  if (!session?.id) return { ...EMPTY_SESSION };
  return {
    class_type: session.class_type || EMPTY_SESSION.class_type,
    title: session.title || '',
    description: session.description || '',
    coach_name: session.coach_name || '',
    start_time: toDateTimeLocalInput(session.start_time),
    end_time: toDateTimeLocalInput(session.end_time),
    duration_minutes: session.duration_minutes ?? 60,
    capacity: session.capacity,
    location_zone: session.location_zone || '',
    beginner_friendly: Boolean(session.beginner_friendly),
    intensity_level: session.intensity_level || 'Moderate',
    status: session.status || 'draft',
    public_visible: Boolean(session.public_visible),
    booking_mode: session.booking_mode || 'request_to_book',
    notes: session.notes || '',
  };
}

function classEditorStatuses(session) {
  if (!session?.id) return ['draft', 'published'];
  if (session.status === 'full') return ['full', 'published'];
  if (['cancelled', 'completed'].includes(session.status)) return [session.status];
  return ['draft', 'published'];
}

function rosterStatusOptions(status, sessionStatus, hasWaitlist = false) {
  if (sessionStatus !== 'published') return [status];
  if (status === 'requested') return ['requested', 'confirmed', 'waitlisted', 'declined', 'cancelled'];
  if (status === 'waitlisted') return ['waitlisted', 'cancelled'];
  if (['declined', 'cancelled'].includes(status)) {
    if (hasWaitlist) return [status];
    return [status, 'requested', 'confirmed'];
  }
  return ['confirmed', 'attended', 'no_show', 'cancelled'];
}

function WaitlistDesk({
  rows, available, error, loading, promotingSessionId, skippingSessionId, onRetry, onOpen, onPromote, onSkip,
}) {
  const deskBusy = Boolean(promotingSessionId || skippingSessionId);
  return (
    <section aria-labelledby="waitlist-desk-title" className="mb-6 border-y border-xert-steel/20 py-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h3 id="waitlist-desk-title" className="flex items-center gap-2 font-display text-sm text-xert-offwhite uppercase">
            <UserCheck className="w-4 h-4 text-xert-steel" /> Waitlist desk
            {!loading && available && <span className="font-body text-xs text-xert-concrete/40">({rows.length})</span>}
          </h3>
          <p className="font-body text-xs text-xert-concrete/40 mt-1">Future class queues, ordered with open places first.</p>
        </div>
      </div>
      {loading ? (
        <div className="h-16 bg-xert-ink animate-pulse" />
      ) : error ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p role="alert" className="font-body text-xs text-xert-red">{error}</p>
          <button type="button" onClick={onRetry} className="min-h-11 px-3 border border-xert-steel/30 font-body text-xs text-xert-steel hover:border-xert-steel">Retry</button>
        </div>
      ) : !available ? (
        <p className="font-body text-xs" style={{ color: '#e0b36a' }}>The waitlist desk becomes available after waitlist_fifo_promotion_upgrade.sql is applied.</p>
      ) : rows.length === 0 ? (
        <p className="font-body text-sm text-xert-concrete/40">No upcoming class waitlists.</p>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {rows.map(item => {
            const credits = Number(item.next_available_credits || 0);
            const capacityLabel = item.capacity == null ? `${item.active_count}/unlimited` : `${item.active_count}/${item.capacity}`;
            const nextMember = item.next_full_name || item.next_email || 'Member';
            return (
              <article key={item.session_id} className="border border-xert-steel/15 bg-xert-ink p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-[12rem] flex-1">
                    <p className="font-display text-base text-xert-offwhite uppercase">{item.title}</p>
                    <p className="font-body text-xs text-xert-concrete/50 mt-1">
                      {new Date(item.start_time).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                    </p>
                    <p className="font-body text-[11px] text-xert-concrete/45 mt-2">
                      {Number(item.waitlist_count)} waiting · {capacityLabel} active
                    </p>
                    <p className="font-body text-xs text-xert-concrete/65 mt-2">
                      Next: {nextMember} · {credits} credit{credits === 1 ? '' : 's'}
                    </p>
                  </div>
                  <span className="font-body text-[10px] uppercase tracking-wider px-2 py-1" style={{ color: item.can_promote ? '#101820' : '#D1DDE6', backgroundColor: item.can_promote ? '#7BA7BC' : 'rgba(123,167,188,0.14)' }}>
                    {item.can_promote ? 'Place open' : 'Class full'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-4">
                  <button type="button" onClick={() => onOpen(item.session_id)} className="min-h-11 px-3 border border-xert-steel/30 font-body text-xs text-xert-concrete/65 hover:border-xert-steel">
                    Open roster
                  </button>
                  {item.can_promote && credits > 0 && (
                    <button type="button" onClick={() => onPromote(item)} disabled={deskBusy} className="inline-flex min-h-11 items-center gap-1.5 px-3 border border-xert-steel/40 font-body text-xs text-xert-steel hover:border-xert-steel disabled:opacity-40">
                      <UserCheck className="w-3.5 h-3.5" />
                      {promotingSessionId === item.session_id ? 'Promoting...' : 'Promote next'}
                    </button>
                  )}
                  {item.can_promote && credits === 0 && (
                    <>
                      <span className="font-body text-xs" style={{ color: '#e0b36a' }}>Next member needs a credit</span>
                      <button
                        type="button"
                        onClick={() => onSkip(item)}
                        disabled={deskBusy || !item.next_booking_id}
                        className="inline-flex min-h-11 items-center gap-1.5 px-3 border border-xert-orange/40 font-body text-xs text-xert-orange hover:border-xert-orange disabled:opacity-40"
                      >
                        <UserMinus className="w-3.5 h-3.5" />
                        {skippingSessionId === item.session_id ? 'Removing...' : 'Skip — no credits'}
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function rosterExportFilename(session) {
  const className = (session.title || 'class')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const date = session.start_time?.slice(0, 10) || 'undated';
  return `xert-roster-${className || 'class'}-${date}.csv`;
}

function CancellationFollowUpDialog({ followUp, onClose }) {
  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(followUp.message.body);
      toast({ title: 'Cancellation message copied' });
    } catch {
      toast({ title: 'Could not copy the message', description: 'Select the message text and copy it manually.', variant: 'destructive' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-0 sm:items-center sm:p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="cancellation-follow-up-title"
        className="flex max-h-[92vh] w-full max-w-xl flex-col border border-xert-steel/30 bg-xert-ink">
        <div className="flex items-start justify-between gap-4 border-b border-xert-steel/20 p-5 sm:p-6">
          <div>
            <p className="font-body text-[10px] uppercase tracking-[0.22em] text-xert-steel">Class cancelled</p>
            <h3 id="cancellation-follow-up-title" className="mt-1 font-display text-2xl uppercase text-xert-offwhite">Notify affected members</h3>
            <p className="mt-2 font-body text-sm text-xert-concrete/65">
              {followUp.affectedBookings} active {followUp.affectedBookings === 1 ? 'booking was' : 'bookings were'} cancelled and refunded.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close cancellation follow-up" title="Close"
            className="inline-flex min-h-11 min-w-11 items-center justify-center text-xert-concrete/60 hover:text-xert-offwhite">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 sm:p-6">
          {followUp.notification ? (
            <div className="mb-4 flex gap-3 border border-xert-steel/30 bg-xert-steel/10 p-3">
              <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-xert-steel" aria-hidden="true" />
              <div>
                <p className="font-body text-xs font-semibold text-xert-offwhite">
                  Private in-app notice created for {followUp.notification.recipients} member {followUp.notification.recipients === 1 ? 'account' : 'accounts'}.
                </p>
                <p className="mt-1 font-body text-xs leading-relaxed text-xert-concrete/65">
                  {describeClassCancellationPush(followUp.notification.push)}
                </p>
              </div>
            </div>
          ) : followUp.notificationError ? (
            <p role="alert" className="mb-4 border border-xert-orange/30 bg-xert-orange/10 p-3 font-body text-xs leading-relaxed text-xert-concrete/80">
              {followUp.notificationError} Use the contact fallback below so no affected member is missed.
            </p>
          ) : null}
          {followUp.contactLookupIncomplete && (
            <p role="alert" className="mb-4 border border-xert-orange/30 bg-xert-orange/10 p-3 font-body text-xs leading-relaxed text-xert-concrete/80">
              One booking source could not be checked. Review the class bookings queue before considering follow-up complete.
            </p>
          )}
          {followUp.contacts.length === 0 ? (
            <p className="mb-5 font-body text-sm text-xert-concrete/60">No email address or mobile number was available for the affected bookings.</p>
          ) : (
            <div className="mb-5 space-y-2" aria-label="Affected member contacts">
              {followUp.contacts.map(contact => (
                <div key={`${contact.email}:${contact.phoneDialable}`} className="flex flex-wrap items-center justify-between gap-3 border border-xert-steel/15 bg-xert-charcoal p-3">
                  <div className="min-w-0">
                    <p className="truncate font-body text-sm text-xert-offwhite">{contact.name || contact.email || contact.phone}</p>
                    <p className="truncate font-body text-xs text-xert-concrete/50">{[contact.email, contact.phone].filter(Boolean).join(' · ')}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {contact.email && <a href={`mailto:${contact.email}`} aria-label={`Email ${contact.name || contact.email}`} title="Email member" className="inline-flex min-h-11 min-w-11 items-center justify-center text-xert-steel"><Mail className="h-4 w-4" /></a>}
                    {contact.phoneDialable && <a href={`tel:${contact.phoneDialable}`} aria-label={`Call ${contact.name || contact.phone}`} title="Call member" className="inline-flex min-h-11 min-w-11 items-center justify-center text-xert-steel"><Phone className="h-4 w-4" /></a>}
                  </div>
                </div>
              ))}
            </div>
          )}

          <label htmlFor="cancellation-message" className="block font-body text-xs uppercase tracking-wider text-xert-concrete/50">Ready-to-send message</label>
          <textarea id="cancellation-message" readOnly value={followUp.message.body} rows={9}
            className="mt-2 w-full resize-y border border-xert-steel/25 bg-xert-charcoal p-3 font-body text-sm leading-relaxed text-xert-offwhite focus:outline-none focus:border-xert-steel" />
          {followUp.mailto.omittedCount > 0 && (
            <p className="mt-2 font-body text-xs text-xert-orange">{followUp.mailto.omittedCount} additional email recipients were omitted from the bounded BCC link. Contact them individually.</p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-xert-steel/20 p-5 sm:flex-row sm:justify-end sm:p-6">
          <button type="button" onClick={onClose} className="min-h-11 border border-xert-steel/40 px-5 font-display text-xs uppercase text-xert-concrete/70">Done</button>
          <button type="button" onClick={copyMessage} className="inline-flex min-h-11 items-center justify-center gap-2 border border-xert-steel/40 px-5 font-display text-xs uppercase text-xert-steel">
            <Copy className="h-4 w-4" /> Copy message
          </button>
          {followUp.mailto.url && (
            <a href={followUp.mailto.url} className="inline-flex min-h-11 items-center justify-center gap-2 bg-xert-steel px-5 font-display text-xs uppercase text-xert-navy">
              <Mail className="h-4 w-4" /> Email {followUp.mailto.recipientCount} via BCC
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

const STATUS_COLORS = {
  draft: 'text-xert-concrete/40 border-xert-steel/30',
  published: 'text-green-400 border-green-600/40',
  full: 'text-xert-orange border-xert-orange/40',
  cancelled: 'text-xert-red/50 border-xert-red/20',
  completed: 'text-xert-concrete/40 border-xert-steel/30',
};

function SessionEditor({ session, blackouts, onSave, onCancel, onDirtyChange }) {
  const baseline = useMemo(() => sessionEditorForm(session), [session]);
  const [form, setForm] = useState(baseline);
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // Same-paint Save can create two classes before `saving` re-renders.
  const saveLockRef = useRef(false);

  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));
  const overlappingBlackouts = blackoutsOverlappingSession(form, blackouts);
  const dirty = Object.keys(EMPTY_SESSION).some(key => form[key] !== baseline[key]);

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
    const closeOnEscape = event => {
      if (event.key === 'Escape') requestCancel();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [requestCancel]);

  const handleSave = async () => {
    if (saveLockRef.current || saving) return;
    const validationError = classSessionValidationError(form);
    if (validationError) {
      toast({ title: validationError, variant: 'destructive' });
      return;
    }
    saveLockRef.current = true;
    setSaving(true);
    try {
      if (session?.id) {
        await updateClassSession(session.id, form, session.updated_at);
      } else {
        await createClassSession(form);
      }
      onSave();
    } catch (e) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
      saveLockRef.current = false;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-4" onMouseDown={event => { if (event.target === event.currentTarget) requestCancel(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="class-editor-title" className="bg-xert-ink border border-xert-steel/20 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-xert-steel/20">
          <div>
            <h3 id="class-editor-title" className="font-display text-xl text-xert-offwhite uppercase">{session?.id ? 'Edit Class' : 'New Class'}</h3>
            {dirty && <p role="status" className="mt-1 font-body text-xs text-xert-steel">Unsaved changes</p>}
          </div>
          <button type="button" onClick={requestCancel} disabled={saving} aria-label="Close class editor" title="Close" className="min-w-11 min-h-11 text-xert-concrete/40 hover:text-xert-offwhite text-xl disabled:opacity-40">&#10005;</button>
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
                {classEditorStatuses(session).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {session?.id && ['cancelled', 'completed'].includes(session.status) && (
                <p className="mt-1 font-body text-[11px] leading-relaxed text-xert-concrete/45">
                  Terminal class status is locked. Create a new class rather than reopening it.
                </p>
              )}
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
              <span aria-hidden="true" className="w-5 h-5 border-2 border-xert-steel/50 flex items-center justify-center peer-checked:border-xert-red peer-checked:bg-xert-steel peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-xert-offwhite">{form.beginner_friendly && <span className="text-xert-navy text-xs">&#10003;</span>}</span>
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
          <button type="button" onClick={requestCancel} disabled={saving}
            className="flex-1 py-3 border border-xert-steel/40 font-display text-sm text-xert-concrete/70 uppercase hover:border-xert-steel transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="flex-1 py-3 bg-xert-steel text-xert-navy font-display text-sm uppercase hover:bg-xert-pale transition-colors disabled:opacity-50">
            {saving ? 'Saving...' : 'Save class'}
          </button>
        </div>
      </div>
      <AdminConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard class changes?"
        description="This class session has edits that have not been saved."
        warning="Closing now permanently discards the changes in this editor."
        cancelLabel="Keep editing"
        confirmLabel="Discard changes"
        onConfirm={onCancel}
        busy={saving}
      />
    </div>
  );
}

function RepeatModal({ session, onDone, onCancel }) {
  const [intervalDays, setIntervalDays] = useState(8); // 4-on/4-off cycle
  const [count, setCount] = useState(4);
  const [keepPublished, setKeepPublished] = useState(session.status === 'published');
  const [saving, setSaving] = useState(false);
  // Same-paint double-click must not mint two copy batches (e.g. 8 classes for "4").
  const repeatLockRef = useRef(false);

  const handleRepeat = async () => {
    if (repeatLockRef.current || saving) return;
    if (!session.start_time) { toast({ title: 'This class needs a start time before it can be repeated.', variant: 'destructive' }); return; }
    repeatLockRef.current = true;
    setSaving(true);
    try {
      const copies = repeatedClassSessionCopies(session, { intervalDays, count, keepPublished });
      await createClassSessions(copies);
      onDone(copies.length);
    } catch (e) {
      toast({ title: 'Repeat failed', description: e.message, variant: 'destructive' });
      setSaving(false);
      repeatLockRef.current = false;
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
            className="flex-1 py-3 bg-xert-steel text-xert-navy font-display text-sm uppercase hover:bg-xert-pale transition-colors disabled:opacity-50">
            {saving ? 'Creating…' : `Create ${count} copies`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ClassCalendarAdmin({ initialAction, initialSessionId, onIntentHandled, onDirtyChange = NOOP }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editingSession, setEditingSession] = useState(null);
  const [expandedBookings, setExpandedBookings] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [roster, setRoster] = useState([]);
  const [loadedRosterSessionId, setLoadedRosterSessionId] = useState(null);
  const bookingsRefreshGenerationRef = useRef(0);
  const waitlistOverviewGenerationRef = useRef(0);
  const [waitlistOverview, setWaitlistOverview] = useState([]);
  const [waitlistOverviewAvailable, setWaitlistOverviewAvailable] = useState(true);
  const [waitlistOverviewError, setWaitlistOverviewError] = useState('');
  const [waitlistOverviewLoading, setWaitlistOverviewLoading] = useState(true);
  const [blackouts, setBlackouts] = useState([]);
  const [repeating, setRepeating] = useState(null);
  const [timeFilter, setTimeFilter] = useState('upcoming');
  const [updatingBookingId, setUpdatingBookingId] = useState(null);
  // Roster / class-request status calls admin_set_booking_status_with_notice with a
  // fresh request_id each click — same-paint double change (or a second row while
  // the first is still mounting busy) can mint two notices / credit moves
  // (Booking Operations updateLockRef parity).
  const bookingStatusLockRef = useRef(false);
  const [promotingSessionId, setPromotingSessionId] = useState(null);
  const [promotionCandidate, setPromotionCandidate] = useState(null);
  const [skippingSessionId, setSkippingSessionId] = useState(null);
  const [skipCandidate, setSkipCandidate] = useState(null);
  const [sessionToCancel, setSessionToCancel] = useState(null);
  const [isCancellingSession, setIsCancellingSession] = useState(false);
  // Custom cancel dialog (not AdminConfirmDialog) — same-paint double Confirm
  // races two admin_cancel_class_session + notify paths before React paints busy.
  const cancelClassLockRef = useRef(false);
  const [cancellationFollowUp, setCancellationFollowUp] = useState(null);
  const [duplicatingSessionId, setDuplicatingSessionId] = useState(null);
  // Same-paint Dupe can mint two draft classes before `duplicatingSessionId` re-renders.
  const duplicateLockRef = useRef(false);
  // Class roster CSV is PII — refuse same-paint double download (LeadTable parity).
  const rosterExportLockRef = useRef(false);
  const [exportingRosterSessionId, setExportingRosterSessionId] = useState(null);
  const [attendanceSession, setAttendanceSession] = useState(null);
  const [attendanceDraft, setAttendanceDraft] = useState({});
  const [isSavingAttendance, setIsSavingAttendance] = useState(false);
  const attendanceSaveLockRef = useRef(false);

  // Generation-scoped: a late mount/retry response must not repaint a desk that
  // already reflects a newer promote/skip. Quiet mode keeps the current rows
  // visible after a mutation instead of wiping the desk to a skeleton.
  const refreshWaitlistOverview = async ({ quiet = false } = {}) => {
    const generation = ++waitlistOverviewGenerationRef.current;
    if (!quiet) setWaitlistOverviewLoading(true);
    setWaitlistOverviewError('');
    try {
      const result = await adminWaitlistOverview(20);
      if (generation !== waitlistOverviewGenerationRef.current) {
        return { applied: false, ok: false };
      }
      setWaitlistOverview(result.rows);
      setWaitlistOverviewAvailable(result.available);
      return { applied: true, ok: true, available: result.available };
    } catch (error) {
      if (generation !== waitlistOverviewGenerationRef.current) {
        return { applied: false, ok: false };
      }
      setWaitlistOverview([]);
      setWaitlistOverviewAvailable(true);
      setWaitlistOverviewError(error.message || 'Check the waitlist overview permissions.');
      return { applied: true, ok: false, error };
    } finally {
      if (generation === waitlistOverviewGenerationRef.current) {
        setWaitlistOverviewLoading(false);
      }
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const [loadedSessions, loadedBlackouts] = await Promise.all([
        getClassSessions(false),
        getBlackoutPeriods().catch(error => {
          toast({ title: 'Blackout checks unavailable', description: error.message, variant: 'destructive' });
          return [];
        }),
        refreshWaitlistOverview(),
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

  useEffect(() => {
    if (initialAction !== 'create') return;
    // Refuse to discard an editor the operator already has open (e.g. the
    // command palette firing "new class" mid-edit). Clobbering session here
    // while keeping the edited form would re-tag the record as a fresh insert
    // and silently duplicate the published class.
    if (showEditor) {
      onIntentHandled?.();
      return;
    }
    setEditingSession(null);
    setShowEditor(true);
    onIntentHandled?.();
  }, [initialAction, onIntentHandled, showEditor]);

  const clearRosterState = () => {
    bookingsRefreshGenerationRef.current += 1;
    setBookings([]);
    setRoster([]);
    setLoadedRosterSessionId(null);
  };

  const refreshBookings = async (sessionId) => {
    // Generation + session scoping: a late response for class A must not paint
    // over class B's roster, booking requests, roll call, or CSV export.
    const generation = ++bookingsRefreshGenerationRef.current;
    const [requests, members] = await Promise.all([
      getClassBookings({ class_session_id: sessionId }),
      adminSessionRoster(sessionId).catch(() => []),
    ]);
    if (generation !== bookingsRefreshGenerationRef.current) {
      return { requests, members, applied: false };
    }
    setBookings(requests);
    setRoster(members);
    setLoadedRosterSessionId(sessionId);
    return { requests, members, applied: true };
  };

  useEffect(() => {
    if (loading || !initialSessionId || !['roster', 'attendance'].includes(initialAction)) return;
    const target = sessions.find(session => session.id === initialSessionId);
    if (!target) {
      toast({ title: 'Class not found', description: 'That class is no longer available in the calendar.', variant: 'destructive' });
      onIntentHandled?.();
      return;
    }

    let active = true;
    const openIntent = async () => {
      try {
        const { members, applied } = await refreshBookings(target.id);
        if (!active || !applied) return;
        setTimeFilter(new Date(target.start_time).getTime() < Date.now() ? 'past' : 'upcoming');
        setExpandedBookings(target.id);
        if (initialAction === 'attendance') {
          const eligible = members.some(member => ['confirmed', 'attended', 'no_show'].includes(member.status));
          if (new Date(target.start_time).getTime() <= Date.now() && eligible) {
            setAttendanceDraft(createAttendanceDraft(members));
            setAttendanceSession(target);
          } else {
            toast({ title: 'Roll call is not ready', description: 'The roster is open so you can review this class.' });
          }
        }
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
          document.getElementById(`class-session-${target.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }));
      } catch (error) {
        if (active) toast({ title: 'Could not load class roster', description: error.message, variant: 'destructive' });
      } finally {
        if (active) onIntentHandled?.();
      }
    };
    void openIntent();
    return () => { active = false; };
  }, [initialAction, initialSessionId, loading, onIntentHandled, sessions]);

  const loadBookings = async (sessionId) => {
    if (expandedBookings === sessionId) {
      setExpandedBookings(null);
      clearRosterState();
      return;
    }
    try {
      const result = await refreshBookings(sessionId);
      if (result.applied) setExpandedBookings(sessionId);
    } catch (e) {
      toast({ title: 'Could not load class bookings', description: e.message, variant: 'destructive' });
    }
  };

  const openWaitlistRoster = async sessionId => {
    setTimeFilter('upcoming');
    try {
      const result = await refreshBookings(sessionId);
      if (!result.applied) return;
      setExpandedBookings(sessionId);
      window.requestAnimationFrame(() => document.getElementById(`class-session-${sessionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (error) {
      toast({ title: 'Could not load class roster', description: error.message, variant: 'destructive' });
    }
  };

  const handleRosterStatus = async (bookingId, status) => {
    const sessionId = expandedBookings;
    if (!sessionId || bookingStatusLockRef.current || updatingBookingId) return;
    const session = sessions.find(item => item.id === sessionId);
    if (session?.status !== 'published') {
      toast({ title: 'Class is not open for booking', description: 'Publish the class before reopening a member booking.', variant: 'destructive' });
      return;
    }
    bookingStatusLockRef.current = true;
    setUpdatingBookingId(bookingId);
    try {
      const result = await adminSetBookingStatus(bookingId, status);
      // If the operator opened another class while this mutation was in flight,
      // refreshing the original session would steal loadedRosterSessionId and
      // blank the roster they are looking at.
      if (expandedBookings !== sessionId) return;
      await refreshBookings(sessionId);
      if (result?.notice_created) {
        toast({
          title: 'Booking updated and member notified',
          description: result.warning || describeTargetedMemberNoticePush(result.push),
        });
      }
    } catch (e) {
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' });
    } finally {
      setUpdatingBookingId(null);
      bookingStatusLockRef.current = false;
    }
  };

  const handlePromoteNext = async candidate => {
    if (promotingSessionId || skippingSessionId) return;
    setPromotingSessionId(candidate.session_id);
    try {
      // Promote + notice (+ push) must stay the success signal. A later desk
      // refresh failure must not report "Promotion paused" after the member
      // already holds the place and was notified — that lie triggers a second
      // promote attempt against a queue that has already moved.
      const result = await adminPromoteNextWaitlisted(candidate.session_id, candidate.next_booking_id);
      const delivery = result.warning
        || `Their credit is reserved. ${describeTargetedMemberNoticePush(result.push)}`;
      toast({ title: 'Member promoted and notified', description: delivery });
      try {
        const [overviewResult] = await Promise.all([
          refreshWaitlistOverview({ quiet: true }),
          ...(expandedBookings === candidate.session_id ? [refreshBookings(candidate.session_id)] : []),
        ]);
        if (overviewResult?.ok === false) {
          toast({
            title: 'Waitlist refresh needed',
            description: overviewResult.error?.message || 'The member was promoted. Reload the waitlist desk before the next action.',
            variant: 'destructive',
          });
        }
      } catch (refreshError) {
        toast({
          title: 'Waitlist refresh needed',
          description: refreshError.message || 'The member was promoted. Reload the waitlist desk before the next action.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({ title: 'Promotion paused', description: error.message, variant: 'destructive' });
    } finally {
      setPromotingSessionId(null);
      setPromotionCandidate(null);
    }
  };

  const handleSkipWaitlistHead = async candidate => {
    if (promotingSessionId || skippingSessionId || !candidate?.next_booking_id) return;
    setSkippingSessionId(candidate.session_id);
    try {
      // Same concurrency contract as Promote: expected id must still be waitlisted FIFO head.
      // Skip + notice (+ push) must stay the success signal. A later desk refresh
      // failure must not report "Could not remove" after the member is already gone.
      const result = await adminSkipWaitlistedHead(candidate.session_id, candidate.next_booking_id);
      toast({
        title: 'Removed from waitlist',
        description: result?.notice_created
          ? (result.warning
            || `${describeTargetedMemberNoticePush(result.push)} Promote the next credited member when ready.`)
          : 'No credit was charged or refunded. Promote the next credited member when ready.',
      });
      try {
        const [overviewResult] = await Promise.all([
          refreshWaitlistOverview({ quiet: true }),
          ...(expandedBookings === candidate.session_id ? [refreshBookings(candidate.session_id)] : []),
        ]);
        if (overviewResult?.ok === false) {
          toast({
            title: 'Waitlist refresh needed',
            description: overviewResult.error?.message || 'The member was removed. Reload the waitlist desk before the next action.',
            variant: 'destructive',
          });
        }
      } catch (refreshError) {
        toast({
          title: 'Waitlist refresh needed',
          description: refreshError.message || 'The member was removed. Reload the waitlist desk before the next action.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      try {
        await refreshWaitlistOverview({ quiet: true });
      } catch {
        // Keep the skip error primary; desk refresh is best-effort after a race.
      }
      toast({ title: 'Could not remove waitlisted member', description: error.message, variant: 'destructive' });
    } finally {
      setSkippingSessionId(null);
      setSkipCandidate(null);
    }
  };

  const handleDuplicate = async (session) => {
    if (duplicateLockRef.current || duplicatingSessionId) return;
    duplicateLockRef.current = true;
    setDuplicatingSessionId(session.id);
    try {
      await duplicateClassSession(session);
      await load();
    } catch (e) { toast({ title: 'Duplicate failed', description: e.message, variant: 'destructive' }); }
    finally {
      setDuplicatingSessionId(null);
      duplicateLockRef.current = false;
    }
  };

  const handleCancel = async () => {
    const session = sessionToCancel;
    if (!session || cancelClassLockRef.current || isCancellingSession) return;
    cancelClassLockRef.current = true;
    setIsCancellingSession(true);
    try {
      const contactResults = await Promise.allSettled([
        adminSessionRoster(session.id),
        getClassBookings({ class_session_id: session.id }),
      ]);
      const contacts = collectClassCancellationContacts(
        contactResults[0].status === 'fulfilled' ? contactResults[0].value : [],
        contactResults[1].status === 'fulfilled' ? contactResults[1].value : []
      );
      const message = buildClassCancellationMessage(session);
      const affectedBookings = await cancelClassSession(session.id);
      if (affectedBookings > 0) {
        let notification = null;
        let notificationError = '';
        try {
          notification = await notifyClassCancellation(session.id);
        } catch (error) {
          notificationError = error.message || 'Push delivery status could not be confirmed.';
        }
        setCancellationFollowUp({
          session,
          affectedBookings,
          contacts,
          message,
          mailto: buildClassCancellationMailto(contacts, message.subject, message.body),
          contactLookupIncomplete: contactResults.some(result => result.status === 'rejected'),
          notification,
          notificationError,
        });
      }
      const noun = affectedBookings === 1 ? 'booking' : 'bookings';
      toast({
        title: 'Class cancelled',
        description: affectedBookings
          ? `${affectedBookings} ${noun} cancelled. Reserved member credits were returned.`
          : 'No active bookings needed to be cancelled.',
      });
      if (expandedBookings === session.id) {
        setExpandedBookings(null);
        clearRosterState();
      }
      setSessionToCancel(null);
      await load();
    } catch (e) {
      toast({ title: 'Cancel failed', description: e.message, variant: 'destructive' });
    } finally {
      setIsCancellingSession(false);
      cancelClassLockRef.current = false;
    }
  };

  const handleBookingStatus = async (id, status) => {
    const sessionId = expandedBookings;
    if (!sessionId || bookingStatusLockRef.current || updatingBookingId) return;
    bookingStatusLockRef.current = true;
    setUpdatingBookingId(id);
    try {
      await updateBookingStatus(id, status);
      if (expandedBookings !== sessionId) return;
      await refreshBookings(sessionId);
    } catch (e) {
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' });
    } finally {
      setUpdatingBookingId(null);
      bookingStatusLockRef.current = false;
    }
  };

  const scopedRosterFor = sessionId => (loadedRosterSessionId === sessionId ? roster : []);
  const scopedBookingsFor = sessionId => (loadedRosterSessionId === sessionId ? bookings : []);
  const attendanceRoster = attendanceSession ? scopedRosterFor(attendanceSession.id) : [];

  const exportRoster = (session) => {
    if (rosterExportLockRef.current || exportingRosterSessionId) return;
    const scopedRoster = scopedRosterFor(session.id);
    if (loadedRosterSessionId !== session.id) {
      toast({ title: 'Roster not ready', description: 'Open this class roster again before exporting.', variant: 'destructive' });
      return;
    }
    rosterExportLockRef.current = true;
    setExportingRosterSessionId(session.id);
    try {
      downloadCsv(
        rosterExportFilename(session),
        scopedRoster.map(member => ({
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
        ],
      );
    } finally {
      setExportingRosterSessionId(null);
      rosterExportLockRef.current = false;
    }
  };

  const openAttendance = (session) => {
    const scopedRoster = scopedRosterFor(session.id);
    if (loadedRosterSessionId !== session.id) {
      toast({ title: 'Roster not ready', description: 'Open this class roster again before taking attendance.', variant: 'destructive' });
      return;
    }
    setAttendanceDraft(createAttendanceDraft(scopedRoster));
    setAttendanceSession(session);
  };

  const saveAttendance = async () => {
    if (!attendanceSession || attendanceSaveLockRef.current || isSavingAttendance) return;
    const sessionId = attendanceSession.id;
    if (loadedRosterSessionId !== sessionId) {
      toast({ title: 'Roster changed', description: 'Reload this class roster before saving attendance.', variant: 'destructive' });
      return;
    }
    const summary = summarizeAttendanceDraft(attendanceRoster, attendanceDraft);
    if (!summary.complete) {
      toast({
        title: 'Roll call is incomplete',
        description: `Mark the remaining ${summary.unmarked} ${summary.unmarked === 1 ? 'member' : 'members'} as present or no show.`,
        variant: 'destructive',
      });
      return;
    }
    // Lock before the await so a double-click cannot submit two roll calls —
    // the second would re-complete an already-completed class and re-release
    // any pending request credits that the first call already refunded.
    attendanceSaveLockRef.current = true;
    setIsSavingAttendance(true);
    try {
      const updated = await adminRecordSessionAttendance(sessionId, summary.entries);
      toast({
        title: 'Attendance recorded',
        description: `${updated} ${updated === 1 ? 'member' : 'members'} marked and class completed.`,
      });
      setAttendanceSession(null);
      try {
        await refreshBookings(sessionId);
        await load();
      } catch (refreshError) {
        toast({
          title: 'Attendance saved — refresh needed',
          description: refreshError.message || 'Reload the class calendar to see the updated roster.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({ title: 'Roll call failed', description: error.message, variant: 'destructive' });
    } finally {
      attendanceSaveLockRef.current = false;
      setIsSavingAttendance(false);
    }
  };

  const now = Date.now();
  const filtered = sessions.filter(s => {
    if (timeFilter === 'all') return true;
    const isPast = s.start_time && new Date(s.start_time).getTime() < now;
    return timeFilter === 'past' ? isPast : !isPast;
  });
  const upcomingCount = sessions.filter(s => !s.start_time || new Date(s.start_time).getTime() >= now).length;
  const attendanceSummary = summarizeAttendanceDraft(attendanceRoster, attendanceDraft);

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
          className="px-5 py-2.5 bg-xert-steel text-xert-navy font-display text-sm uppercase hover:bg-xert-pale transition-colors">
          + New Class
        </button>
      </div>

      <WaitlistDesk
        rows={waitlistOverview}
        available={waitlistOverviewAvailable}
        error={waitlistOverviewError}
        loading={waitlistOverviewLoading}
        promotingSessionId={promotingSessionId}
        skippingSessionId={skippingSessionId}
        onRetry={refreshWaitlistOverview}
        onOpen={openWaitlistRoster}
        onPromote={setPromotionCandidate}
        onSkip={setSkipCandidate}
      />

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
            const sessionRoster = scopedRosterFor(s.id);
            const sessionBookings = scopedBookingsFor(s.id);
            const activeRosterCount = sessionRoster.filter(member => ['requested', 'confirmed'].includes(member.status)).length;
            const waitlistedRoster = sessionRoster.filter(member => member.status === 'waitlisted');
            const promotionItem = waitlistOverview.find(item => item.session_id === s.id) || null;
            const hasOpenPlace = s.capacity == null || activeRosterCount < s.capacity;
            return (
            <div id={`class-session-${s.id}`} key={s.id} className="bg-xert-ink border border-xert-steel/20 scroll-mt-20">
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
                    <button onClick={() => handleDuplicate(s)} disabled={Boolean(duplicatingSessionId)}
                      className="px-3 py-1.5 border border-xert-steel/30 font-body text-xs text-xert-concrete/60 hover:border-xert-steel transition-colors disabled:opacity-50">
                      {duplicatingSessionId === s.id ? 'Duping…' : 'Dupe'}
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
                      Class roster ({activeRosterCount}{s.capacity ? `/${s.capacity}` : ''})
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {s.status === 'published' && new Date(s.start_time).getTime() > now && hasOpenPlace && waitlistedRoster.length > 0 && promotionItem && (
                        <button type="button" onClick={() => setPromotionCandidate(promotionItem)} disabled={Boolean(promotingSessionId)}
                          className="inline-flex min-h-11 items-center gap-1.5 px-3 py-2 border border-xert-steel/40 font-body text-[11px] uppercase tracking-wider text-xert-steel hover:border-xert-steel transition-colors disabled:opacity-40">
                          <UserCheck className="w-3.5 h-3.5" />
                          {promotingSessionId === s.id ? 'Promoting...' : `Promote next (${waitlistedRoster.length})`}
                        </button>
                      )}
                      {s.start_time && new Date(s.start_time).getTime() <= now
                        && ['published', 'full', 'completed'].includes(s.status)
                        && sessionRoster.some(member => ['confirmed', 'attended', 'no_show'].includes(member.status)) && (
                        <button type="button" onClick={() => openAttendance(s)}
                          className="inline-flex min-h-11 items-center gap-1.5 px-3 py-2 border border-green-600/40 font-body text-[11px] uppercase tracking-wider text-green-400 hover:bg-green-900/20 transition-colors">
                          <ClipboardCheck className="w-3.5 h-3.5" />
                          Take attendance
                        </button>
                      )}
                      <button
                        onClick={() => exportRoster(s)}
                        disabled={sessionRoster.length === 0 || Boolean(exportingRosterSessionId)}
                        className="inline-flex min-h-11 items-center gap-1.5 px-3 py-2 border border-xert-steel/30 font-body text-[11px] uppercase tracking-wider text-xert-concrete/60 hover:border-xert-steel transition-colors disabled:opacity-40"
                      >
                        <Download className="w-3.5 h-3.5" />
                        {exportingRosterSessionId === s.id ? 'Exporting…' : 'Export roster'}
                      </button>
                    </div>
                  </div>
                  {sessionRoster.length === 0 ? (
                    <p className="font-body text-sm text-xert-concrete/40 mb-4">No member bookings yet.</p>
                  ) : (
                    <div className="space-y-2 mb-5">
                      {sessionRoster.map(r => {
                        const waitlistPosition = r.status === 'waitlisted'
                          ? waitlistedRoster.findIndex(member => member.booking_id === r.booking_id) + 1
                          : null;
                        return (
                        <div key={r.booking_id} className="flex items-center justify-between gap-4 bg-xert-ink p-3">
                          <div>
                            <p className="font-body text-sm text-xert-offwhite">{r.full_name || r.email || 'Member'}</p>
                            <p className="font-body text-xs text-xert-concrete/50">{r.email}{r.phone ? ` · ${r.phone}` : ''}</p>
                            {waitlistPosition && <p className="font-body text-[11px] text-xert-steel mt-1">Waitlist position {waitlistPosition}</p>}
                          </div>
                          <select value={r.status} onChange={e => handleRosterStatus(r.booking_id, e.target.value)} disabled={Boolean(updatingBookingId) || s.status !== 'published'}
                            aria-label={`Roster status for ${r.full_name || r.email || 'member'}`}
                            className="bg-xert-charcoal border border-xert-steel/40 px-2 py-1 font-body text-xs text-xert-offwhite focus:outline-none focus:border-xert-red">
                            {rosterStatusOptions(r.status, s.status, waitlistedRoster.length > 0).map(st => <option key={st} value={st}>{st}</option>)}
                          </select>
                        </div>
                        );
                      })}
                      <p className="font-body text-xs text-xert-concrete/40">Waitlisting, declining, or cancelling a request returns its reserved credit.</p>
                    </div>
                  )}

                  <h4 className="font-display text-sm text-xert-concrete/60 uppercase mb-3">Booking requests ({sessionBookings.length})</h4>
                  {sessionBookings.length === 0 ? (
                    <p className="font-body text-sm text-xert-concrete/40">No bookings yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {sessionBookings.map(b => (
                        <div key={b.id} className="flex items-center justify-between gap-4 bg-xert-ink p-3">
                          <div>
                            <p className="font-body text-sm text-xert-offwhite">{b.full_name}</p>
                            <p className="font-body text-xs text-xert-concrete/50">{b.email} · {b.training_level}</p>
                          </div>
                          <select value={b.status} onChange={e => handleBookingStatus(b.id, e.target.value)} disabled={Boolean(updatingBookingId)}
                            aria-label={`Booking request status for ${b.full_name || b.email || 'member'}`}
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
          key={editingSession?.id ?? 'new'}
          session={editingSession}
          blackouts={blackouts}
          onSave={() => { setShowEditor(false); load(); }}
          onCancel={() => setShowEditor(false)}
          onDirtyChange={onDirtyChange}
        />
      )}

      {repeating && (
        <RepeatModal
          session={repeating}
          onDone={() => { setRepeating(null); load(); }}
          onCancel={() => setRepeating(null)}
        />
      )}

      {attendanceSession && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-0 sm:items-center sm:p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="attendance-title"
            className="flex max-h-[92vh] w-full max-w-2xl flex-col border border-xert-steel/30 bg-xert-ink">
            <div className="flex items-start justify-between gap-4 border-b border-xert-steel/20 p-5 sm:p-6">
              <div>
                <p className="font-body text-[10px] uppercase tracking-[0.22em] text-xert-steel">Class roll call</p>
                <h3 id="attendance-title" className="mt-1 font-display text-2xl uppercase text-xert-offwhite">{attendanceSession.title}</h3>
                <p className="mt-1 font-body text-xs text-xert-concrete/55">
                  {new Date(attendanceSession.start_time).toLocaleString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <button type="button" onClick={() => setAttendanceSession(null)} disabled={isSavingAttendance}
                aria-label="Close attendance roll call" title="Close"
                className="inline-flex min-h-11 min-w-11 items-center justify-center text-xert-concrete/60 disabled:opacity-40">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto p-5 sm:p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-5 font-body text-xs text-xert-concrete/60" aria-live="polite">
                  <span><strong className="text-xert-offwhite">{attendanceSummary.marked}/{attendanceSummary.total}</strong> marked</span>
                  <span><strong className="text-green-400">{attendanceSummary.attended}</strong> present</span>
                  <span><strong className="text-xert-orange">{attendanceSummary.noShow}</strong> no show</span>
                  {attendanceSummary.unmarked > 0 && <span><strong className="text-xert-steel">{attendanceSummary.unmarked}</strong> unmarked</span>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setAttendanceDraft(markAllAttendance(attendanceRoster))} disabled={isSavingAttendance}
                    className="inline-flex min-h-11 items-center gap-2 border border-green-600/40 px-3 font-body text-xs text-green-400 disabled:opacity-40">
                    <CheckCheck className="h-4 w-4" /> Mark all present
                  </button>
                  <button type="button" onClick={() => setAttendanceDraft(blankAttendanceDraft(attendanceRoster))} disabled={isSavingAttendance || attendanceSummary.marked === 0}
                    className="inline-flex min-h-11 items-center gap-2 border border-xert-steel/30 px-3 font-body text-xs text-xert-concrete/60 disabled:opacity-40">
                    <RotateCcw className="h-4 w-4" /> Clear marks
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {attendanceSummary.members.map(member => (
                  <div key={member.booking_id} className="flex flex-col gap-3 border border-xert-steel/20 bg-xert-charcoal p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-body text-sm text-xert-offwhite">{member.full_name || member.email || 'Member'}</p>
                      <p className="truncate font-body text-xs text-xert-concrete/45">{member.email}</p>
                    </div>
                    <div className="grid grid-cols-2" role="group" aria-label={`Attendance for ${member.full_name || member.email || 'member'}`}>
                      <button type="button" onClick={() => setAttendanceDraft(current => ({ ...current, [member.booking_id]: 'attended' }))}
                        aria-pressed={attendanceDraft[member.booking_id] === 'attended'}
                        className={`min-h-11 px-4 font-body text-xs transition-colors ${attendanceDraft[member.booking_id] === 'attended' ? 'bg-green-700 text-white' : 'border border-xert-steel/30 text-xert-concrete/60'}`}>
                        Present
                      </button>
                      <button type="button" onClick={() => setAttendanceDraft(current => ({ ...current, [member.booking_id]: 'no_show' }))}
                        aria-pressed={attendanceDraft[member.booking_id] === 'no_show'}
                        className={`min-h-11 px-4 font-body text-xs transition-colors ${attendanceDraft[member.booking_id] === 'no_show' ? 'bg-xert-orange text-xert-ink' : 'border border-l-0 border-xert-steel/30 text-xert-concrete/60'}`}>
                        No show
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-xert-steel/20 p-5 sm:flex-row sm:justify-end sm:p-6">
              <button type="button" onClick={() => setAttendanceSession(null)} disabled={isSavingAttendance}
                className="min-h-11 border border-xert-steel/40 px-5 font-display text-xs uppercase text-xert-concrete/70 disabled:opacity-40">Cancel</button>
              <button type="button" onClick={() => void saveAttendance()} disabled={isSavingAttendance || !attendanceSummary.complete}
                title={attendanceSummary.complete ? 'Save complete roll call' : 'Mark every member before saving'}
                className="min-h-11 bg-green-700 px-5 font-display text-xs uppercase text-white transition-colors hover:bg-green-600 disabled:opacity-40">
                {isSavingAttendance ? 'Saving roll call...' : 'Save attendance'}
              </button>
            </div>
          </div>
        </div>
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
                className="bg-xert-steel px-4 py-2.5 font-display text-xs uppercase text-xert-navy transition-colors hover:bg-xert-pale disabled:opacity-50"
              >
                {isCancellingSession ? 'Cancelling...' : 'Cancel class'}
              </button>
            </div>
          </div>
        </div>
      )}

      {cancellationFollowUp && (
        <CancellationFollowUpDialog followUp={cancellationFollowUp} onClose={() => setCancellationFollowUp(null)} />
      )}

      <AdminConfirmDialog
        open={Boolean(promotionCandidate)}
        title="Confirm and notify this member?"
        description={promotionCandidate
          ? `${promotionCandidate.next_full_name || promotionCandidate.next_email || 'The next member'} will be confirmed into ${promotionCandidate.title}. Their earliest-expiring credit will be reserved and a private member notice will be created.`
          : ''}
        warning="This is FIFO protected. If the queue changes before confirmation, the promotion stops for review."
        confirmLabel={promotingSessionId ? 'Promoting…' : 'Promote and notify'}
        busy={Boolean(promotingSessionId)}
        onOpenChange={open => { if (!open) setPromotionCandidate(null); }}
        onConfirm={() => promotionCandidate && void handlePromoteNext(promotionCandidate)}
      />

      <AdminConfirmDialog
        open={Boolean(skipCandidate)}
        title="Remove from waitlist?"
        description={skipCandidate
          ? `${skipCandidate.next_full_name || skipCandidate.next_email || 'This member'} is first in the queue for ${skipCandidate.title} but has no available credit. Removing them frees the open place for the next waitlisted member.`
          : ''}
        warning="Waitlisted members do not hold a credit. This cancels their waitlist place only — nothing is charged or refunded."
        confirmLabel={skippingSessionId ? 'Removing…' : 'Skip — no credits'}
        busy={Boolean(skippingSessionId)}
        onOpenChange={open => { if (!open) setSkipCandidate(null); }}
        onConfirm={() => skipCandidate && void handleSkipWaitlistHead(skipCandidate)}
      />
    </div>
  );
}
