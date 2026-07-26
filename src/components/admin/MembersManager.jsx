import React, { useEffect, useRef, useState } from 'react';
import { toast } from '@/components/ui/use-toast';
import { Activity, Archive, ArchiveRestore, BellRing, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Download, Loader2, Mail, MessageSquarePlus, Phone, Receipt, RefreshCw, Send, Ticket, UserRoundSearch, X } from 'lucide-react';
import { adminAddMemberNote, adminExportMembers, adminGrantCredits, adminListMemberActivationQueue, adminListMemberFollowUps, adminListMembersPage, adminMemberActivationOverview, adminMemberDetail, adminSendMemberNotice, adminSetMemberNoteArchived, adminSetRole, revealMemberEmergencyContact } from '@/lib/adminData';
import { describeTargetedMemberNoticePush } from '@/lib/memberAnnouncements';
import { useSupabaseAuth } from '@/lib/SupabaseAuthContext';
import { downloadCsv } from '@/lib/csv';
import { creditGrantValidationError } from '@/lib/memberAdmin';
import { createFollowUpCopy, createFollowUpLog } from '@/lib/memberFollowUp';
import { activationQueuePresentation, activationSnapshotPresentation } from '@/lib/memberActivation';
import { formatPackPrice } from '@/lib/products';
import AdminLoadError from '@/components/admin/AdminLoadError';
import AdminConfirmDialog from '@/components/admin/AdminConfirmDialog';

const NOOP = _dirty => {};

function fmtDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

const BOOKING_BADGE = {
  confirmed: { color: '#7BA7BC', label: 'Confirmed' },
  attended: { color: '#7ec98f', label: 'Attended' },
  no_show: { color: '#e0b36a', label: 'No show' },
  cancelled: { color: 'rgba(209,221,230,0.4)', label: 'Cancelled' },
};
const PAGE_SIZE = 50;
const emptyNoticeDraft = () => ({ title: '', body: '', tone: 'info', action: 'none', expiryDays: '30' });

function MemberDrawer({ member, onClose, onGrant, onNotesChanged, onDirtyChange = NOOP }) {
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState('');
  const [noteCategory, setNoteCategory] = useState('general');
  const [noteBody, setNoteBody] = useState('');
  const [noteError, setNoteError] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [showArchivedNotes, setShowArchivedNotes] = useState(false);
  const [noteToArchive, setNoteToArchive] = useState(null);
  const [noticeDraft, setNoticeDraft] = useState(emptyNoticeDraft);
  const [noticeSaving, setNoticeSaving] = useState(false);
  const [noticeError, setNoticeError] = useState('');
  const [discardNoticeOpen, setDiscardNoticeOpen] = useState(false);
  const [emergencyReveal, setEmergencyReveal] = useState(null);
  const [revealingEmergency, setRevealingEmergency] = useState(false);
  const detailGenerationRef = useRef(0);
  const emergencyRevealRequestRef = useRef(0);
  // admin_send_member_notice is not idempotent — same-paint double submit mints
  // two private notices and two APNs deliveries before `noticeSaving` re-renders.
  const noticeLockRef = useRef(false);
  const noteLockRef = useRef(false);
  const noticeDirty = Boolean(noticeDraft.title.trim() || noticeDraft.body.trim());

  useEffect(() => {
    onDirtyChange(noticeDirty);
  }, [noticeDirty, onDirtyChange]);

  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const loadDetail = () => {
    // Generation guard covers the effect path and every mutation refresh so a
    // late response for member A cannot paint under member B's header.
    const generation = ++detailGenerationRef.current;
    const memberId = member.id;
    setDetail(null);
    setDetailError('');
    // Privacy: clear any prior emergency reveal when the subject changes or
    // the drawer reloads — matches iOS clearRevealedMemberEmergencyContact.
    emergencyRevealRequestRef.current += 1;
    setEmergencyReveal(null);
    setRevealingEmergency(false);
    adminMemberDetail(memberId)
      .then(result => {
        if (detailGenerationRef.current !== generation) return;
        setDetail(result);
      })
      .catch(error => {
        if (detailGenerationRef.current !== generation) return;
        setDetailError(error.message || 'Check member detail permissions.');
      });
  };

  useEffect(() => {
    loadDetail();
    return () => { detailGenerationRef.current += 1; };
  }, [member.id]);

  const revealEmergencyContact = async () => {
    if (revealingEmergency) return;
    const memberId = member.id;
    const requestId = ++emergencyRevealRequestRef.current;
    setRevealingEmergency(true);
    try {
      const result = await revealMemberEmergencyContact(memberId);
      if (requestId !== emergencyRevealRequestRef.current || memberId !== member.id) return;
      setEmergencyReveal(result);
      if (result?.available === false || !result?.emergency_contact) {
        toast({ title: 'No emergency contact', description: 'This member has not completed Member Readiness emergency contact details.' });
      }
    } catch (error) {
      if (requestId !== emergencyRevealRequestRef.current || memberId !== member.id) return;
      toast({ title: 'Reveal failed', description: error.message, variant: 'destructive' });
    } finally {
      if (requestId === emergencyRevealRequestRef.current) setRevealingEmergency(false);
    }
  };

  const handleAddNote = async event => {
    event.preventDefault();
    if (noteLockRef.current || noteSaving) return;
    noteLockRef.current = true;
    setNoteSaving(true);
    setNoteError('');
    try {
      await adminAddMemberNote(member.id, noteCategory, noteBody);
      setNoteBody('');
      toast({ title: 'Staff note added' });
      onNotesChanged?.();
      loadDetail();
    } catch (error) {
      setNoteError(error.message || 'Could not add the staff note.');
    } finally {
      setNoteSaving(false);
      noteLockRef.current = false;
    }
  };

  const handleNoteArchive = async note => {
    if (noteLockRef.current || noteSaving) return;
    const shouldArchive = !note.archived_at;
    noteLockRef.current = true;
    setNoteSaving(true);
    setNoteError('');
    try {
      await adminSetMemberNoteArchived(note.id, shouldArchive);
      toast({ title: shouldArchive ? 'Staff note archived' : 'Staff note restored' });
      loadDetail();
    } catch (error) {
      setNoteError(error.message || 'Could not update the staff note.');
    } finally {
      setNoteSaving(false);
      noteLockRef.current = false;
    }
  };

  const requestClose = () => {
    if (noticeDirty && !noticeSaving) {
      setDiscardNoticeOpen(true);
      return;
    }
    onClose();
  };

  const handleSendNotice = async event => {
    event.preventDefault();
    if (noticeLockRef.current || noticeSaving) return;
    noticeLockRef.current = true;
    setNoticeSaving(true);
    setNoticeError('');
    try {
      const result = await adminSendMemberNotice(member.id, noticeDraft);
      const description = result.warning || describeTargetedMemberNoticePush(result.push);
      toast({ title: 'Private notice sent', description });
      setNoticeDraft(emptyNoticeDraft());
      loadDetail();
    } catch (error) {
      setNoticeError(error.message || 'Could not send the private member notice.');
    } finally {
      setNoticeSaving(false);
      noticeLockRef.current = false;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/70" onClick={requestClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="member-detail-title" className="relative w-full max-w-md h-full overflow-y-auto animate-slide-up sm:animate-none"
        style={{ backgroundColor: '#0e161e', borderLeft: '1px solid rgba(123,167,188,0.2)' }}>
        {/* Header */}
        <div className="sticky top-0 p-5 flex items-start justify-between gap-4"
          style={{ backgroundColor: '#0e161e', borderBottom: '1px solid rgba(123,167,188,0.14)' }}>
          <div>
            <h3 id="member-detail-title" className="font-display text-2xl uppercase leading-none text-xert-offwhite">{member.full_name || '(no name)'}</h3>
            <p className="font-body text-xs mt-1.5" style={{ color: 'rgba(209,221,230,0.45)' }}>
              {member.email}{member.phone ? ` · ${member.phone}` : ''}
            </p>
            <p className="font-body text-[11px] mt-0.5" style={{ color: 'rgba(123,167,188,0.5)' }}>
              Member since {fmtDate(member.joined_at)}{member.role === 'admin' ? ' · Admin' : ''}
            </p>
          </div>
          <button type="button" onClick={requestClose} title="Close member detail" aria-label="Close member detail" className="p-1 shrink-0" style={{ color: 'rgba(209,221,230,0.5)' }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {detailError ? (
          <div className="p-5"><AdminLoadError message={detailError} onRetry={loadDetail} /></div>
        ) : !detail ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#7BA7BC' }} />
          </div>
        ) : (
          <div className="p-5 space-y-7">
            {/* Member readiness — completion only until a deliberate reveal */}
            <section>
              <h4 className="flex items-center gap-2 font-display text-xs uppercase tracking-[0.2em] mb-3" style={{ color: 'rgba(123,167,188,0.7)' }}>
                <Phone className="w-3.5 h-3.5" /> Member readiness
              </h4>
              {!detail.onboardingAvailable ? (
                <p className="font-body text-xs" style={{ color: '#e0b36a' }}>
                  Member readiness is paused until member_onboarding_foundation is applied.
                </p>
              ) : (
                <>
                  <ul className="space-y-1.5 font-body text-xs text-xert-concrete/60">
                    <li>Profile details: {detail.onboarding?.profile_complete ? 'Complete' : 'Incomplete'}</li>
                    <li>Emergency contact: {detail.onboarding?.emergency_contact_complete ? 'Complete' : 'Incomplete'}</li>
                    <li>Required acknowledgements: {detail.onboarding?.documents_complete ? 'Complete' : 'Incomplete'}</li>
                  </ul>
                  {detail.onboarding?.emergency_contact_complete ? (
                    <div className="mt-3">
                      {emergencyReveal?.emergency_contact ? (
                        <div className="p-3 space-y-1" style={{ backgroundColor: 'rgba(16,24,32,0.6)', border: '1px solid rgba(123,167,188,0.12)' }}>
                          <p className="font-body text-sm text-xert-offwhite">{emergencyReveal.emergency_contact.name}</p>
                          <p className="font-body text-sm text-xert-offwhite">
                            <a href={`tel:${emergencyReveal.emergency_contact.phone}`} className="hover:text-xert-steel">{emergencyReveal.emergency_contact.phone}</a>
                          </p>
                          <p className="font-body text-xs text-xert-concrete/50">{emergencyReveal.emergency_contact.relationship}</p>
                          {emergencyReveal.revealed_at && (
                            <p className="font-body text-[10px] text-xert-concrete/35 mt-2">
                              Revealed {fmtDateTime(emergencyReveal.revealed_at)}. Every reveal is recorded.
                            </p>
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={revealingEmergency}
                          onClick={() => void revealEmergencyContact()}
                          className="mt-1 min-h-11 px-3 py-2 border border-xert-steel/40 font-body text-xs uppercase tracking-wider text-xert-concrete/70 hover:border-xert-steel disabled:opacity-50"
                        >
                          {revealingEmergency ? 'Revealing...' : 'Reveal emergency contact'}
                        </button>
                      )}
                      <p className="font-body text-[11px] text-xert-concrete/40 mt-2 leading-relaxed">
                        Emergency-contact details stay out of lists and CSV exports. Reveal only when you need them for safe follow-up.
                      </p>
                    </div>
                  ) : (
                    <p className="font-body text-xs text-xert-concrete/45 mt-2">
                      No emergency contact on file until the member finishes Member Readiness.
                    </p>
                  )}
                </>
              )}
            </section>

            {/* Private member notices */}
            <section>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h4 className="flex items-center gap-2 font-display text-xs uppercase tracking-[0.2em]" style={{ color: 'rgba(123,167,188,0.7)' }}>
                    <BellRing className="w-3.5 h-3.5" /> Private notices
                  </h4>
                  <p className="font-body text-[11px] leading-relaxed mt-1" style={{ color: 'rgba(209,221,230,0.4)' }}>
                    Send an account-only message with optional iOS push delivery.
                  </p>
                </div>
              </div>

              {!detail.memberNoticesAvailable ? (
                <p className="font-body text-xs" style={{ color: '#e0b36a' }}>
                  Private notices are paused until targeted_member_notices_upgrade.sql is applied.
                </p>
              ) : (
                <>
                  <form onSubmit={handleSendNotice} className="space-y-2">
                    <label htmlFor="member-notice-title" className="sr-only">Private notice title</label>
                    <input
                      id="member-notice-title"
                      value={noticeDraft.title}
                      onChange={event => setNoticeDraft(current => ({ ...current, title: event.target.value }))}
                      disabled={noticeSaving}
                      minLength={3}
                      maxLength={120}
                      required
                      placeholder="Notice title"
                      className={`${inputCls} w-full min-h-11`}
                    />
                    <label htmlFor="member-notice-body" className="sr-only">Private notice message</label>
                    <textarea
                      id="member-notice-body"
                      value={noticeDraft.body}
                      onChange={event => setNoticeDraft(current => ({ ...current, body: event.target.value }))}
                      disabled={noticeSaving}
                      minLength={3}
                      maxLength={2000}
                      rows={4}
                      required
                      placeholder="What does this member need to know?"
                      className={`${inputCls} w-full resize-y`}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <label className="font-body text-[10px] uppercase tracking-wider text-xert-concrete/50">
                        Priority
                        <select value={noticeDraft.tone} onChange={event => setNoticeDraft(current => ({ ...current, tone: event.target.value }))} disabled={noticeSaving} className={`${inputCls} w-full min-h-11 mt-1`}>
                          <option value="info">Information</option>
                          <option value="action">Action needed</option>
                          <option value="urgent">Urgent</option>
                        </select>
                      </label>
                      <label className="font-body text-[10px] uppercase tracking-wider text-xert-concrete/50">
                        Action
                        <select value={noticeDraft.action} onChange={event => setNoticeDraft(current => ({ ...current, action: event.target.value }))} disabled={noticeSaving} className={`${inputCls} w-full min-h-11 mt-1`}>
                          <option value="none">No action</option>
                          <option value="booking">Book a class</option>
                          <option value="account">View account</option>
                          <option value="events">View events</option>
                        </select>
                      </label>
                      <label className="font-body text-[10px] uppercase tracking-wider text-xert-concrete/50">
                        Expires
                        <select value={noticeDraft.expiryDays} onChange={event => setNoticeDraft(current => ({ ...current, expiryDays: event.target.value }))} disabled={noticeSaving} className={`${inputCls} w-full min-h-11 mt-1`}>
                          <option value="7">7 days</option>
                          <option value="30">30 days</option>
                          <option value="90">90 days</option>
                        </select>
                      </label>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-body text-[10px] leading-relaxed" style={{ color: 'rgba(209,221,230,0.35)' }}>
                        The member sees this privately in XERT. Sending and receipt activity remain in this record.
                      </p>
                      <button type="submit" disabled={noticeSaving || noticeDraft.title.trim().length < 3 || noticeDraft.body.trim().length < 3}
                        className="min-h-11 shrink-0 inline-flex items-center gap-2 px-3 bg-xert-steel font-display text-sm uppercase text-xert-navy transition-colors hover:bg-xert-pale disabled:opacity-40">
                        {noticeSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        {noticeSaving ? 'Sending' : 'Send privately'}
                      </button>
                    </div>
                  </form>
                  {noticeError && <p role="alert" className="font-body text-xs text-xert-red mt-2">{noticeError}</p>}

                  <div className="mt-4 space-y-2">
                    {detail.notices.length === 0 ? (
                      <p className="font-body text-sm" style={{ color: 'rgba(209,221,230,0.4)' }}>No private notices yet.</p>
                    ) : detail.notices.map(notice => (
                      <article key={notice.id} className="p-3" style={{ backgroundColor: 'rgba(16,24,32,0.6)', border: '1px solid rgba(123,167,188,0.12)' }}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-display text-sm uppercase text-xert-offwhite break-words">{notice.title}</p>
                            <p className="font-body text-xs whitespace-pre-wrap break-words mt-1 text-xert-concrete/60">{notice.body}</p>
                          </div>
                          <span className="shrink-0 font-body text-[9px] uppercase tracking-wider px-2 py-1 border border-xert-steel/25 text-xert-steel">
                            {notice.source_kind === 'class_cancellation' ? 'Automatic' : notice.tone}
                          </span>
                        </div>
                        <p className="font-body text-[10px] mt-2 text-xert-concrete/35">
                          {fmtDateTime(notice.published_at)} · {notice.dismissed_at ? 'Dismissed' : notice.read_at ? 'Read in app' : 'Awaiting app open'}
                          {Number(notice.push_delivered) > 0 ? ' · Push delivered' : Number(notice.push_attempted) > 0 ? ' · Push failed' : ' · No push device'}
                        </p>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </section>

            {/* Staff notes */}
            <section>
              <div className="flex items-center justify-between gap-3 mb-3">
                <h4 className="flex items-center gap-2 font-display text-xs uppercase tracking-[0.2em]" style={{ color: 'rgba(123,167,188,0.6)' }}>
                  <MessageSquarePlus className="w-3.5 h-3.5" /> Staff notes
                </h4>
                {detail.notes.some(note => note.archived_at) && (
                  <label className="inline-flex min-h-11 items-center gap-2 font-body text-[10px] uppercase tracking-wider" style={{ color: 'rgba(209,221,230,0.55)' }}>
                    <input type="checkbox" checked={showArchivedNotes} onChange={event => setShowArchivedNotes(event.target.checked)} className="accent-xert-steel" />
                    Show archived
                  </label>
                )}
              </div>

              {!detail.memberNotesAvailable ? (
                <p className="font-body text-xs" style={{ color: '#e0b36a' }}>
                  Staff notes are paused until admin_member_notes_upgrade.sql is applied.
                </p>
              ) : (
                <>
                  <form onSubmit={handleAddNote} className="space-y-2">
                    <label htmlFor="member-note-category" className="sr-only">Staff note category</label>
                    <select id="member-note-category" value={noteCategory} onChange={event => setNoteCategory(event.target.value)} disabled={noteSaving}
                      className="w-full min-h-11 bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-steel">
                      <option value="general">General</option>
                      <option value="coaching">Coaching</option>
                      <option value="follow_up">Follow-up</option>
                      <option value="billing">Billing</option>
                    </select>
                    <label htmlFor="member-note-body" className="sr-only">Staff note</label>
                    <textarea id="member-note-body" value={noteBody} onChange={event => setNoteBody(event.target.value)} disabled={noteSaving}
                      minLength={3} maxLength={1000} rows={3} required placeholder="Add operational context for staff"
                      className="w-full resize-y bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite placeholder:text-xert-concrete/30 focus:outline-none focus:border-xert-steel" />
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-body text-[10px] leading-relaxed" style={{ color: 'rgba(209,221,230,0.35)' }}>
                        Use factual operational or coaching context. Avoid unnecessary clinical or sensitive personal information.
                      </p>
                      <button type="submit" disabled={noteSaving || noteBody.trim().length < 3}
                        className="min-h-11 shrink-0 px-3 border border-xert-steel/40 font-body text-xs text-xert-steel transition-colors hover:border-xert-steel disabled:opacity-40">
                        {noteSaving ? 'Saving...' : 'Add note'}
                      </button>
                    </div>
                  </form>
                  {noteError && <p role="alert" className="font-body text-xs text-xert-red mt-2">{noteError}</p>}

                  <div className="mt-4 space-y-2">
                    {detail.notes.filter(note => showArchivedNotes || !note.archived_at).length === 0 ? (
                      <p className="font-body text-sm" style={{ color: 'rgba(209,221,230,0.4)' }}>No staff notes yet.</p>
                    ) : detail.notes.filter(note => showArchivedNotes || !note.archived_at).map(note => (
                      <article key={note.id} className="p-3" style={{ backgroundColor: 'rgba(16,24,32,0.6)', border: '1px solid rgba(123,167,188,0.12)', opacity: note.archived_at ? 0.55 : 1 }}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-body text-[10px] uppercase tracking-wider" style={{ color: '#7BA7BC' }}>{String(note.category || 'general').replace('_', '-')}</p>
                            <p className="font-body text-sm whitespace-pre-wrap break-words mt-1" style={{ color: '#D1DDE6' }}>{note.body}</p>
                          </div>
                          <button type="button" disabled={noteSaving} onClick={() => note.archived_at ? void handleNoteArchive(note) : setNoteToArchive(note)}
                            title={note.archived_at ? 'Restore staff note' : 'Archive staff note'} aria-label={note.archived_at ? 'Restore staff note' : 'Archive staff note'}
                            className="min-h-11 min-w-11 inline-flex shrink-0 items-center justify-center border border-xert-steel/20 text-xert-steel transition-colors hover:border-xert-steel disabled:opacity-40">
                            {note.archived_at ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                          </button>
                        </div>
                        <p className="font-body text-[10px] mt-2" style={{ color: 'rgba(209,221,230,0.35)' }}>
                          {note.author_name || 'Former admin'} · {fmtDateTime(note.created_at)}{note.archived_at ? ' · Archived' : ''}
                        </p>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </section>

            {/* Credits */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h4 className="flex items-center gap-2 font-display text-xs uppercase tracking-[0.2em]" style={{ color: 'rgba(123,167,188,0.6)' }}>
                  <Ticket className="w-3.5 h-3.5" /> Credits
                </h4>
                <button type="button" disabled={!detail.creditAuditAvailable} onClick={onGrant}
                  className="min-h-11 px-2.5 py-2 border font-body text-[10px] uppercase tracking-wider transition-colors"
                  style={{ borderColor: 'rgba(123,167,188,0.3)', color: '#7BA7BC', opacity: detail.creditAuditAvailable ? 1 : 0.4 }}>
                  + Grant
                </button>
              </div>
              {detail.credits.length === 0 ? (
                <p className="font-body text-sm" style={{ color: 'rgba(209,221,230,0.4)' }}>No credit packs yet.</p>
              ) : (
                <div className="space-y-2">
                  {detail.credits.map(c => {
                    const expired = c.expires_at && new Date(c.expires_at) <= new Date();
                    const active = c.remaining > 0 && !expired;
                    const grant = detail.grants.find(item => item.credit_batch_id === c.id);
                    return (
                      <div key={c.id} className="flex items-center gap-3 p-3"
                        style={{ backgroundColor: 'rgba(16,24,32,0.6)', border: '1px solid rgba(123,167,188,0.12)', opacity: active ? 1 : 0.55 }}>
                        <p className="font-display text-xl tabular-nums" style={{ color: active ? '#7BA7BC' : 'rgba(209,221,230,0.4)' }}>
                          {c.remaining}<span className="text-sm" style={{ color: 'rgba(209,221,230,0.35)' }}>/{c.total}</span>
                        </p>
                        <div className="flex-1">
                          <p className="font-body text-xs" style={{ color: 'rgba(209,221,230,0.6)' }}>
                            {expired ? 'Expired' : c.expires_at ? `Expires ${fmtDate(c.expires_at)}` : 'No expiry'}
                          </p>
                          <p className="font-body text-[10px]" style={{ color: 'rgba(209,221,230,0.3)' }}>
                            Added {fmtDate(c.created_at)}{c.order_id ? '' : ' · manual grant'}
                          </p>
                          {grant && <p className="font-body text-[11px] mt-1" style={{ color: 'rgba(123,167,188,0.72)' }}>Reason: {grant.note}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {!detail.creditAuditAvailable && (
                <p className="font-body text-xs mt-3" style={{ color: '#e0b36a' }}>Credit audit migration is not installed; new manual grants are paused.</p>
              )}
            </section>

            {/* Bookings */}
            <section>
              <h4 className="flex items-center gap-2 font-display text-xs uppercase tracking-[0.2em] mb-3" style={{ color: 'rgba(123,167,188,0.6)' }}>
                <CalendarDays className="w-3.5 h-3.5" /> Bookings
              </h4>
              {detail.bookings.length === 0 ? (
                <p className="font-body text-sm" style={{ color: 'rgba(209,221,230,0.4)' }}>No class bookings yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {detail.bookings.map(b => {
                    const badge = BOOKING_BADGE[b.status] || BOOKING_BADGE.confirmed;
                    return (
                      <div key={b.id} className="flex items-center gap-3 py-2 px-3"
                        style={{ backgroundColor: 'rgba(16,24,32,0.6)', border: '1px solid rgba(123,167,188,0.1)' }}>
                        <div className="flex-1 min-w-0">
                          <p className="font-body text-sm truncate" style={{ color: '#D1DDE6' }}>
                            {b.class_sessions?.title || b.class_sessions?.class_type || 'Class'}
                          </p>
                          <p className="font-body text-[11px]" style={{ color: 'rgba(209,221,230,0.35)' }}>
                            {fmtDateTime(b.class_sessions?.start_time)}
                          </p>
                        </div>
                        <span className="font-body text-[10px] uppercase tracking-wider shrink-0" style={{ color: badge.color }}>
                          {badge.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Purchases */}
            <section>
              <h4 className="flex items-center gap-2 font-display text-xs uppercase tracking-[0.2em] mb-3" style={{ color: 'rgba(123,167,188,0.6)' }}>
                <Receipt className="w-3.5 h-3.5" /> Purchases
              </h4>
              {detail.orders.length === 0 ? (
                <p className="font-body text-sm" style={{ color: 'rgba(209,221,230,0.4)' }}>No purchases yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {detail.orders.map(o => (
                    <div key={o.id} className="flex items-center gap-3 py-2 px-3"
                      style={{ backgroundColor: 'rgba(16,24,32,0.6)', border: '1px solid rgba(123,167,188,0.1)' }}>
                      <p className="font-body text-sm flex-1 truncate" style={{ color: '#D1DDE6' }}>{o.products?.name || 'Session pack'}</p>
                      <p className="font-body text-[11px] shrink-0" style={{ color: 'rgba(209,221,230,0.35)' }}>{fmtDate(o.paid_at || o.created_at)}</p>
                      <p className="font-display text-sm tabular-nums shrink-0" style={{ color: '#7BA7BC' }}>
                        {formatPackPrice(o.amount_cents, o.currency)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
        <AdminConfirmDialog
          open={Boolean(noteToArchive)}
          onOpenChange={open => !open && setNoteToArchive(null)}
          title="Archive staff note?"
          description="This note will leave the active member record and move into archived history."
          warning="Archived notes remain available to administrators and can be restored later."
          confirmLabel="Archive note"
          onConfirm={() => {
            const note = noteToArchive;
            setNoteToArchive(null);
            if (note) void handleNoteArchive(note);
          }}
          busy={noteSaving}
        />
        <AdminConfirmDialog
          open={discardNoticeOpen}
          onOpenChange={setDiscardNoticeOpen}
          title="Discard private notice draft?"
          description="This member notice has not been sent."
          warning="The title and message you entered will be permanently discarded."
          cancelLabel="Keep writing"
          confirmLabel="Discard draft"
          onConfirm={() => {
            setDiscardNoticeOpen(false);
            setNoticeDraft(emptyNoticeDraft());
            onClose();
          }}
          busy={noticeSaving}
        />
      </div>
    </div>
  );
}

const inputCls = 'bg-xert-charcoal border border-xert-steel/40 px-3 py-2 font-body text-sm text-xert-offwhite focus:outline-none focus:border-xert-red';

const FOLLOW_UP_LABELS = {
  no_first_booking: 'No first booking',
  credits_expiring: 'Credits expiring',
  idle_credits: 'Credits inactive',
  renewal_due: 'Renewal due'
};

function followUpDetail(member) {
  if (member.reason === 'no_first_booking') return `Joined ${fmtDate(member.joined_at)}`;
  if (member.reason === 'credits_expiring') {
    const count = Number(member.credits_expiring);
    return `${count} credit${count === 1 ? '' : 's'} expire ${fmtDate(member.next_credit_expiry)}`;
  }
  return `${Number(member.credits_remaining)} credit${Number(member.credits_remaining) === 1 ? '' : 's'} · ${member.last_attended_at ? `Last class ${fmtDate(member.last_attended_at)}` : 'No attended class'}`;
}

function ActivationCockpit({
  overview,
  overviewAvailable,
  overviewError,
  overviewLoading,
  queue,
  queueAvailable,
  queueError,
  queueLoading,
  onRetry,
  onView,
  onLog,
}) {
  const presentation = overview ? activationSnapshotPresentation(overview) : null;
  const actionRows = activationQueuePresentation(queue, 12);
  const outreachAllowed = !queueError && !queueLoading;
  const hasSnapshotWarning = Boolean(overviewError || presentation?.partial || presentation?.inconsistent || presentation?.stale);

  return (
    <section aria-labelledby="member-activation-title" className="mb-6 border border-xert-steel/20 bg-xert-ink/45 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="member-activation-title" className="flex items-center gap-2 font-display text-base uppercase text-xert-offwhite">
            <Activity className="h-4 w-4 shrink-0 text-xert-steel" aria-hidden="true" /> Member activation
          </h3>
          <p className="mt-1 max-w-2xl font-body text-xs leading-relaxed text-xert-concrete/50">
            Authoritative 30-day account cohort. Each step comes from current setup, training access, booking and recorded attendance — not page views.
          </p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          disabled={overviewLoading || queueLoading}
          className="inline-flex min-h-11 items-center gap-2 border border-xert-steel/30 px-3 font-body text-xs uppercase tracking-wider text-xert-steel disabled:opacity-40"
        >
          <RefreshCw className={`h-4 w-4 ${(overviewLoading || queueLoading) ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {!overview && overviewLoading ? (
        <div className="mt-4 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" aria-label="Loading member activation funnel">
          {[1, 2, 3, 4, 5, 6].map(item => <div key={item} className="h-24 animate-pulse bg-xert-charcoal" />)}
        </div>
      ) : !overviewAvailable ? (
        <p className="mt-4 border border-[#e0b36a]/35 bg-[#e0b36a]/10 p-3 font-body text-xs text-[#e0b36a]" role="status">
          Activation reporting is paused until the member activation upgrade is applied.
        </p>
      ) : !overview ? (
        <div className="mt-4">
          <AdminLoadError message={overviewError || 'Member activation reporting is unavailable.'} onRetry={onRetry} />
        </div>
      ) : (
        <>
          {hasSnapshotWarning && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-[#e0b36a]/35 bg-[#e0b36a]/10 p-3">
              <p role="status" className="font-body text-xs leading-relaxed text-[#e0b36a]">
                {overviewError
                  ? 'Showing the last successful activation snapshot. Refresh before making outreach decisions.'
                  : presentation.inconsistent
                    ? 'Activation stages do not form a valid funnel. Treat this snapshot as unavailable and retry.'
                    : presentation.partial
                      ? 'Some activation stages are unavailable. Known counts remain visible.'
                      : 'This activation snapshot is stale. Refresh before making outreach decisions.'}
              </p>
              {presentation.asOf && (
                <span className="font-body text-[10px] uppercase tracking-wider text-xert-concrete/50">
                  As of {fmtDateTime(presentation.asOf)}
                </span>
              )}
            </div>
          )}

          {overviewLoading && (
            <p className="mt-3 font-body text-xs text-xert-concrete/45" role="status">Refreshing the last activation snapshot…</p>
          )}

          <div className="mt-4 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {presentation.stages.map(stage => (
              <article
                key={stage.key}
                className="min-w-0 border border-xert-steel/15 bg-xert-charcoal/65 p-3"
                aria-label={`${stage.label}: ${stage.countLabel}. ${stage.rateLabel}. ${stage.detail}.`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-display text-3xl leading-none tabular-nums text-xert-offwhite">{stage.countLabel}</p>
                    <h4 className="mt-2 font-display text-xs uppercase tracking-wider text-xert-steel">{stage.label}</h4>
                  </div>
                  <span className="shrink-0 font-body text-[10px] tabular-nums text-xert-concrete/50">{stage.rate === null ? '—' : `${stage.rate}%`}</span>
                </div>
                <div className="mt-3 h-1 overflow-hidden bg-xert-navy" aria-hidden="true">
                  <div className="h-full bg-xert-steel" style={{ width: `${stage.rate ?? 0}%` }} />
                </div>
                <p className="mt-2 font-body text-[10px] leading-relaxed text-xert-concrete/40">{stage.detail}</p>
              </article>
            ))}
          </div>
        </>
      )}

      <div className="mt-5 border-t border-xert-steel/15 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="font-display text-sm uppercase text-xert-offwhite">Activation actions</h4>
            <p className="mt-1 font-body text-[11px] text-xert-concrete/45">Bounded to the 12 highest-priority members. Outreach remains manual.</p>
          </div>
          {!queueLoading && queueAvailable && !queueError && (
            <span className="font-body text-xs tabular-nums text-xert-concrete/40">{actionRows.length} due</span>
          )}
        </div>

        {queueLoading && actionRows.length === 0 ? (
          <div className="mt-3 h-14 animate-pulse bg-xert-charcoal" aria-label="Loading activation actions" />
        ) : !queueAvailable ? (
          <p className="mt-3 font-body text-xs text-[#e0b36a]" role="status">Activation actions are paused until the member activation upgrade is applied.</p>
        ) : queueError && actionRows.length === 0 ? (
          <div className="mt-3"><AdminLoadError message={queueError} onRetry={onRetry} /></div>
        ) : actionRows.length === 0 ? (
          <p className="mt-3 font-body text-sm text-xert-concrete/45">No activation follow-ups are due.</p>
        ) : (
          <>
            {queueError && (
              <p className="mt-3 font-body text-xs text-[#e0b36a]" role="status">Showing the last successful action queue. Refresh before contacting members.</p>
            )}
            <div className="mt-3 divide-y divide-xert-steel/10 border-t border-xert-steel/10">
              {actionRows.map(member => {
                const contact = createFollowUpCopy(member, window.location.origin);
                const name = member.full_name || member.email || 'Member';
                return (
                  <div key={member.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-[12rem] flex-1">
                      <p className="font-display text-sm uppercase text-xert-offwhite">{name}</p>
                      <p className="mt-0.5 font-body text-[11px] text-xert-concrete/45">
                        {member.activationReasonLabel}{member.joined_at ? ` · Joined ${fmtDate(member.joined_at)}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {member.email && (outreachAllowed ? (
                        <a href={contact.mailto} title={`Draft email to ${name}`} aria-label={`Draft activation email to ${name}`} className="inline-flex min-h-11 min-w-11 items-center justify-center border border-xert-steel/30 text-xert-steel hover:border-xert-steel">
                          <Mail className="h-4 w-4" aria-hidden="true" />
                        </a>
                      ) : (
                        <span aria-disabled="true" title="Refresh activation actions before emailing" className="inline-flex min-h-11 min-w-11 items-center justify-center border border-xert-steel/20 text-xert-concrete/30">
                          <Mail className="h-4 w-4" aria-hidden="true" />
                          <span className="sr-only">Email unavailable until activation actions refresh</span>
                        </span>
                      ))}
                      {member.phone && (outreachAllowed ? (
                        <a href={`tel:${member.phone}`} title={`Call ${name}`} aria-label={`Call ${name} about activation`} className="inline-flex min-h-11 min-w-11 items-center justify-center border border-xert-steel/30 text-xert-steel hover:border-xert-steel">
                          <Phone className="h-4 w-4" aria-hidden="true" />
                        </a>
                      ) : (
                        <span aria-disabled="true" title="Refresh activation actions before calling" className="inline-flex min-h-11 min-w-11 items-center justify-center border border-xert-steel/20 text-xert-concrete/30">
                          <Phone className="h-4 w-4" aria-hidden="true" />
                          <span className="sr-only">Call unavailable until activation actions refresh</span>
                        </span>
                      ))}
                      <button type="button" onClick={() => onLog(member)} disabled={!outreachAllowed} title={outreachAllowed ? `Log activation follow-up with ${name}` : 'Refresh activation actions before logging outreach'} className="inline-flex min-h-11 items-center gap-1.5 border border-xert-steel/30 px-3 font-body text-xs text-xert-steel hover:border-xert-steel disabled:cursor-not-allowed disabled:opacity-35">
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Log
                      </button>
                      <button type="button" onClick={() => onView(member)} className="min-h-11 border border-xert-steel/30 px-3 font-body text-xs text-xert-concrete/60 hover:border-xert-steel">View</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function FollowUpQueue({ rows, available, error, loading, onRetry, onView, onLog }) {
  return (
    <section aria-labelledby="member-follow-up-title" className="mb-6 border-y border-xert-steel/20 py-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 id="member-follow-up-title" className="flex items-center gap-2 font-display text-sm text-xert-offwhite uppercase">
          <UserRoundSearch className="w-4 h-4 text-xert-steel" /> Follow-up queue
          {!loading && available && <span className="font-body text-xs text-xert-concrete/40">({rows.length})</span>}
        </h3>
      </div>
      {loading ? (
        <div className="h-12 bg-xert-ink animate-pulse" />
      ) : error ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p role="alert" className="font-body text-xs text-xert-red">{error}</p>
          <button type="button" onClick={onRetry} className="min-h-11 px-3 border border-xert-steel/30 font-body text-xs text-xert-steel hover:border-xert-steel">Retry</button>
        </div>
      ) : !available ? (
        <p className="font-body text-xs" style={{ color: '#e0b36a' }}>Follow-ups are paused until admin_member_follow_up_upgrade.sql is applied.</p>
      ) : rows.length === 0 ? (
        <p className="font-body text-sm text-xert-concrete/40">No follow-ups due.</p>
      ) : (
        <div className="divide-y divide-xert-steel/10 border-t border-xert-steel/10">
          {rows.map(member => {
            const contact = createFollowUpCopy(member, window.location.origin);
            return (
              <div key={member.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-[12rem] flex-1">
                  <p className="font-display text-sm text-xert-offwhite uppercase">{member.full_name || member.email}</p>
                  <p className="font-body text-[11px] text-xert-concrete/45">
                    {FOLLOW_UP_LABELS[member.reason] || 'Follow-up'} · {followUpDetail(member)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <a href={contact.mailto} title={`Draft email to ${member.full_name || member.email}`} aria-label={`Draft email to ${member.full_name || member.email}`} className="min-h-11 min-w-11 inline-flex items-center justify-center border border-xert-steel/30 text-xert-steel hover:border-xert-steel">
                    <Mail className="w-4 h-4" />
                  </a>
                  {member.phone && (
                    <a href={`tel:${member.phone}`} title={`Call ${member.full_name || member.email}`} aria-label={`Call ${member.full_name || member.email}`} className="min-h-11 min-w-11 inline-flex items-center justify-center border border-xert-steel/30 text-xert-steel hover:border-xert-steel">
                      <Phone className="w-4 h-4" />
                    </a>
                  )}
                  <button type="button" onClick={() => onLog(member)} title={`Log follow-up with ${member.full_name || member.email}`} className="min-h-11 inline-flex items-center gap-1.5 px-3 border border-xert-steel/30 font-body text-xs text-xert-steel hover:border-xert-steel">
                    <CheckCircle2 className="w-4 h-4" /> Log
                  </button>
                  <button type="button" onClick={() => onView(member)} className="min-h-11 px-3 border border-xert-steel/30 font-body text-xs text-xert-concrete/60 hover:border-xert-steel">View</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function FollowUpModal({ member, onDone, onCancel }) {
  const [channel, setChannel] = useState('email');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Double Mark Contacted before re-render inserts two follow-up notes.
  const saveLockRef = useRef(false);

  const handleSubmit = async event => {
    event.preventDefault();
    if (saveLockRef.current || saving) return;
    saveLockRef.current = true;
    setSaving(true);
    setError('');
    try {
      const body = createFollowUpLog(member, channel, note);
      await adminAddMemberNote(member.id, 'follow_up', body);
      toast({ title: 'Follow-up recorded', description: `${member.full_name || member.email} will leave the queue for seven days.` });
      onDone();
    } catch (submitError) {
      setError(submitError.message || 'Could not record this follow-up.');
      setSaving(false);
      saveLockRef.current = false;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <form onSubmit={handleSubmit} role="dialog" aria-modal="true" aria-labelledby="follow-up-log-title" className="bg-xert-ink border border-xert-steel/20 w-full max-w-md">
        <div className="p-6 border-b border-xert-steel/20">
          <h3 id="follow-up-log-title" className="font-display text-xl text-xert-offwhite uppercase">Log Follow-up</h3>
          <p className="font-body text-xs text-xert-concrete/50 mt-1">{member.full_name || member.email}</p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label htmlFor="follow-up-channel" className="block font-body text-xs text-xert-concrete/50 uppercase tracking-wider mb-1">Contact method</label>
            <select id="follow-up-channel" value={channel} onChange={event => setChannel(event.target.value)} disabled={saving} className={`${inputCls} w-full min-h-11`}>
              <option value="email">Email</option>
              <option value="phone">Phone call</option>
              <option value="sms">SMS</option>
              <option value="in_person">In person</option>
            </select>
          </div>
          <div>
            <label htmlFor="follow-up-context" className="block font-body text-xs text-xert-concrete/50 uppercase tracking-wider mb-1">Context (optional)</label>
            <textarea id="follow-up-context" value={note} onChange={event => setNote(event.target.value)} disabled={saving} maxLength={500} rows={3} placeholder="Outcome, callback requested, or anything staff should know" className={`${inputCls} w-full resize-y`} />
            <p className="mt-1 font-body text-[10px] text-xert-concrete/35 text-right">{note.length}/500</p>
          </div>
          <p className="font-body text-xs leading-relaxed text-xert-concrete/45">This adds a dated staff note and removes the member from the follow-up queue for seven days.</p>
          {error && <p role="alert" className="font-body text-xs text-xert-red">{error}</p>}
        </div>
        <div className="flex gap-3 p-6 border-t border-xert-steel/20">
          <button type="button" onClick={onCancel} disabled={saving} className="flex-1 min-h-11 border border-xert-steel/40 font-display text-sm text-xert-concrete/70 uppercase disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={saving} className="flex-1 min-h-11 bg-xert-steel text-xert-navy font-display text-sm uppercase disabled:opacity-50">
            {saving ? 'Saving...' : 'Mark Contacted'}
          </button>
        </div>
      </form>
    </div>
  );
}

function GrantCreditsModal({ member, onDone, onCancel }) {
  const [sessions, setSessions] = useState(1);
  const [validityDays, setValidityDays] = useState(28);
  const [note, setNote] = useState('');
  const [requestId] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // RPC is idempotent per requestId, but same-paint double-click still doubles
  // the success toast / onDone refresh before `saving` re-renders.
  const grantLockRef = useRef(false);

  const validationError = creditGrantValidationError({ sessions, validityDays, note });

  const handleGrant = async () => {
    if (grantLockRef.current || saving) return;
    if (validationError) {
      setError(validationError);
      return;
    }
    grantLockRef.current = true;
    setSaving(true);
    setError('');
    try {
      await adminGrantCredits(member.id, sessions, validityDays > 0 ? validityDays : null, requestId, note.trim());
      toast({ title: 'Credits granted', description: `${sessions} credit${sessions === 1 ? '' : 's'} added to ${member.full_name || member.email}.` });
      onDone();
    } catch (e) {
      setError(e.message);
      setSaving(false);
      grantLockRef.current = false;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="grant-credits-title" className="bg-xert-ink border border-xert-steel/20 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-xert-steel/20">
          <h3 id="grant-credits-title" className="font-display text-xl text-xert-offwhite uppercase">Grant Credits</h3>
          <p className="font-body text-xs text-xert-concrete/50 mt-1">{member.full_name || member.email}</p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label htmlFor="grant-credit-count" className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1">Class credits</label>
            <input id="grant-credit-count" type="number" min="1" max="100" value={sessions} onChange={e => setSessions(+e.target.value)} className={`${inputCls} w-full`} />
            <div className="flex gap-2 mt-2">{[1, 4, 10].map(value => <button type="button" key={value} onClick={() => setSessions(value)} className="px-2.5 py-1 border border-xert-steel/30 font-body text-xs text-xert-steel">{value}</button>)}</div>
          </div>
          <div>
            <label htmlFor="grant-validity-days" className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1">Validity (days, 0 = never expires)</label>
            <input id="grant-validity-days" type="number" min="0" value={validityDays} onChange={e => setValidityDays(+e.target.value)} className={`${inputCls} w-full`} />
            <div className="flex flex-wrap gap-2 mt-2">{[{ label: '14 days', value: 14 }, { label: '28 days', value: 28 }, { label: '56 days', value: 56 }, { label: 'No expiry', value: 0 }].map(option => <button type="button" key={option.value} onClick={() => setValidityDays(option.value)} className="px-2.5 py-1 border border-xert-steel/30 font-body text-xs text-xert-steel">{option.label}</button>)}</div>
          </div>
          <div>
            <label htmlFor="grant-credit-reason" className="block font-body text-xs text-xert-concrete/40 uppercase tracking-wider mb-1">Grant reason</label>
            <textarea id="grant-credit-reason" value={note} onChange={event => setNote(event.target.value)} maxLength={500} rows={3} placeholder="e.g. Cash sale, service recovery, competition prize" className={`${inputCls} w-full resize-none`} />
            <p className="font-body text-[10px] text-xert-concrete/30 mt-1">Required for the permanent admin audit trail.</p>
          </div>
          <p className="font-body text-xs text-xert-concrete/40">
            Use for comps, refunds or manual/cash sales. Credits appear instantly in the member&rsquo;s account.
          </p>
          {error && <p role="alert" className="font-body text-xs text-xert-red">{error}</p>}
        </div>
        <div className="flex gap-3 p-6 border-t border-xert-steel/20">
          <button type="button" disabled={saving} onClick={onCancel} className="flex-1 py-3 border border-xert-steel/40 font-display text-sm text-xert-concrete/70 uppercase hover:border-xert-steel transition-colors disabled:opacity-50">Cancel</button>
          <button type="button" onClick={handleGrant} disabled={saving}
            className="flex-1 py-3 bg-xert-steel text-xert-navy font-display text-sm uppercase hover:bg-xert-pale transition-colors disabled:opacity-50">
            {saving ? 'Granting…' : `Grant ${sessions}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MembersManager({ initialMemberId, onIntentHandled, onDirtyChange = NOOP }) {
  const { user } = useSupabaseAuth();
  const [members, setMembers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [granting, setGranting] = useState(null);
  const [loggingFollowUp, setLoggingFollowUp] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [noticeDirty, setNoticeDirty] = useState(false);
  const [pendingSubjectSwitch, setPendingSubjectSwitch] = useState(null);
  const noticeDirtyRef = useRef(false);
  const viewingRef = useRef(null);
  const [loadError, setLoadError] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [creditFilter, setCreditFilter] = useState('all');
  const [roleChangingId, setRoleChangingId] = useState(null);
  const [page, setPage] = useState(1);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [exporting, setExporting] = useState(false);
  // Member directory CSV is PII — refuse same-paint double download and export
  // while a list load is still in flight (LeadTable / CampaignStats parity).
  const exportLockRef = useRef(false);
  const [followUps, setFollowUps] = useState([]);
  const [followUpsAvailable, setFollowUpsAvailable] = useState(true);
  const [followUpsLoading, setFollowUpsLoading] = useState(true);
  const [followUpsError, setFollowUpsError] = useState('');
  const [activationOverview, setActivationOverview] = useState(null);
  const [activationOverviewAvailable, setActivationOverviewAvailable] = useState(true);
  const [activationOverviewLoading, setActivationOverviewLoading] = useState(true);
  const [activationOverviewError, setActivationOverviewError] = useState('');
  const [activationQueue, setActivationQueue] = useState([]);
  const [activationQueueAvailable, setActivationQueueAvailable] = useState(true);
  const [activationQueueLoading, setActivationQueueLoading] = useState(true);
  const [activationQueueError, setActivationQueueError] = useState('');
  const [pendingRoleChange, setPendingRoleChange] = useState(null);

  useEffect(() => {
    noticeDirtyRef.current = noticeDirty;
    onDirtyChange(noticeDirty);
  }, [noticeDirty, onDirtyChange]);

  useEffect(() => {
    viewingRef.current = viewing;
  }, [viewing]);

  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const applyMemberSelection = next => {
    setPendingSubjectSwitch(null);
    setNoticeDirty(false);
    noticeDirtyRef.current = false;
    setViewing(next ?? null);
  };

  const selectMember = next => {
    // Block subject switches (view another member, close, filter clear, deep
    // link) while a private notice draft is dirty unless the operator confirms.
    // The drawer close path calls applyMemberSelection directly after its own
    // discard prompt so it does not re-enter this guard.
    const current = viewingRef.current;
    if (noticeDirtyRef.current && current && next?.id !== current.id) {
      setPendingSubjectSwitch({ next: next ?? null });
      return;
    }
    applyMemberSelection(next);
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timeoutId);
  }, [search]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    adminListMembersPage({
      search: debouncedSearch,
      role: roleFilter,
      credit: creditFilter,
      page,
      pageSize: PAGE_SIZE
    }).then(result => {
      if (!active) return;
      setMembers(result.rows);
      setTotal(result.total);
    }).catch(error => {
      if (!active) return;
      setMembers([]);
      setTotal(0);
      setLoadError(error.message || 'Check the member admin RPC and permissions.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [creditFilter, debouncedSearch, page, refreshVersion, roleFilter]);

  useEffect(() => {
    let active = true;
    setFollowUpsLoading(true);
    setFollowUpsError('');
    adminListMemberFollowUps(20)
      .then(result => {
        if (!active) return;
        setFollowUps(result.rows);
        setFollowUpsAvailable(result.available);
      })
      .catch(error => {
        if (!active) return;
        setFollowUps([]);
        setFollowUpsError(error.message || 'Check the follow-up queue permissions.');
      })
      .finally(() => { if (active) setFollowUpsLoading(false); });
    return () => { active = false; };
  }, [refreshVersion]);

  useEffect(() => {
    let active = true;
    setActivationOverviewLoading(true);
    setActivationOverviewError('');
    adminMemberActivationOverview(30)
      .then(result => {
        if (!active) return;
        setActivationOverviewAvailable(result?.available !== false);
        if (result?.available !== false) {
          setActivationOverview(result?.overview ?? result?.data ?? result);
        }
      })
      .catch(error => {
        if (!active) return;
        setActivationOverviewError(error.message || 'Check the member activation reporting permissions.');
      })
      .finally(() => { if (active) setActivationOverviewLoading(false); });

    return () => { active = false; };
  }, [refreshVersion]);

  useEffect(() => {
    let active = true;
    setActivationQueueLoading(true);
    setActivationQueueError('');
    adminListMemberActivationQueue(12)
      .then(result => {
        if (!active) return;
        setActivationQueueAvailable(result?.available !== false);
        if (result?.available !== false) setActivationQueue(result?.rows ?? []);
      })
      .catch(error => {
        if (!active) return;
        setActivationQueueError(error.message || 'Check the member activation queue permissions.');
      })
      .finally(() => { if (active) setActivationQueueLoading(false); });

    return () => { active = false; };
  }, [refreshVersion]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstResult = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastResult = Math.min((page - 1) * PAGE_SIZE + members.length, total);
  const hasFilters = Boolean(debouncedSearch) || roleFilter !== 'all' || creditFilter !== 'all';
  const searchPending = search.trim() !== debouncedSearch;
  const refresh = () => setRefreshVersion(version => version + 1);

  useEffect(() => {
    setPage(1);
    setGranting(null);
    setLoggingFollowUp(null);
    if (!viewingRef.current) return;
    selectMember(null);
  }, [creditFilter, debouncedSearch, roleFilter]);

  useEffect(() => {
    if (!initialMemberId) return undefined;
    let active = true;
    adminListMembersPage({ memberId: initialMemberId, pageSize: 1 })
      .then(result => {
        if (!active) return;
        if (result.rows[0]) selectMember(result.rows[0]);
        else toast({ title: 'Member not found', description: 'This member may have been removed or is no longer accessible.', variant: 'destructive' });
      })
      .catch(error => {
        if (active) toast({ title: 'Member unavailable', description: error.message, variant: 'destructive' });
      })
      .finally(() => { if (active) onIntentHandled?.(); });
    return () => { active = false; };
  }, [initialMemberId, onIntentHandled]);

  const handleExport = async () => {
    if (exportLockRef.current || exporting || loading || searchPending) return;
    exportLockRef.current = true;
    setExporting(true);
    try {
      const rows = await adminExportMembers({ search: debouncedSearch, role: roleFilter, credit: creditFilter });
      downloadCsv(`xert-members-${new Date().toISOString().slice(0, 10)}.csv`, rows.map(member => ({ ...member, total_spent: (Number(member.total_spent_cents) / 100).toFixed(2) })), [
        { key: 'full_name', label: 'Name' }, { key: 'email', label: 'Email' },
        { key: 'phone', label: 'Phone' }, { key: 'role', label: 'Role' },
        { key: 'credits_remaining', label: 'Credits' }, { key: 'bookings_count', label: 'Bookings' },
        { key: 'total_spent', label: 'Spent (AUD)' }, { key: 'joined_at', label: 'Joined' },
      ]);
    } catch (error) {
      toast({ title: 'Export failed', description: error.message, variant: 'destructive' });
    } finally {
      setExporting(false);
      exportLockRef.current = false;
    }
  };

  const requestRoleChange = (m, role) => {
    const verb = role === 'admin' ? 'Promote' : 'Remove admin from';
    const consequence = role === 'admin'
      ? 'This grants access to member data, bookings, sales, content, and staff controls.'
      : 'This removes access to all administrative tools.';
    setPendingRoleChange({ member: m, role, verb, consequence });
  };

  const applyRoleChange = async () => {
    const pending = pendingRoleChange;
    if (!pending) return;
    const { member: m, role } = pending;
    setPendingRoleChange(null);
    setRoleChangingId(m.id);
    try {
      await adminSetRole(m.id, role);
      toast({ title: 'Role updated', description: `${m.full_name || m.email} is now ${role}.` });
      setPage(1);
      refresh();
    } catch (e) { toast({ title: 'Failed', description: e.message, variant: 'destructive' }); }
    finally { setRoleChangingId(null); }
  };

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h2 className="font-display text-lg text-xert-offwhite uppercase">Members ({total})</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input value={search} onChange={e => setSearch(e.target.value)} aria-label="Search members" placeholder="Search name, email or phone…"
            className={`${inputCls} w-64`} />
          <select value={roleFilter} onChange={event => setRoleFilter(event.target.value)} aria-label="Filter members by role" className={inputCls}><option value="all">All roles</option><option value="member">Members</option><option value="admin">Admins</option></select>
          <select value={creditFilter} onChange={event => setCreditFilter(event.target.value)} aria-label="Filter members by credits" className={inputCls}><option value="all">All credits</option><option value="available">Has credits</option><option value="none">No credits</option></select>
          <button type="button" onClick={refresh} disabled={loading} title="Refresh members" aria-label="Refresh members" className="min-h-11 min-w-11 inline-flex items-center justify-center border border-xert-steel/30 text-xert-steel disabled:opacity-40"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
          <button
            onClick={() => void handleExport()}
            disabled={total === 0 || exporting || loading || searchPending}
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-xert-steel/30 font-body text-xs text-xert-concrete/60 uppercase tracking-wider hover:border-xert-steel transition-colors disabled:opacity-40">
            <Download className="w-3.5 h-3.5" /> {exporting ? 'Exporting…' : 'CSV'}
          </button>
        </div>
      </div>

      <ActivationCockpit
        overview={activationOverview}
        overviewAvailable={activationOverviewAvailable}
        overviewError={activationOverviewError}
        overviewLoading={activationOverviewLoading}
        queue={activationQueue}
        queueAvailable={activationQueueAvailable}
        queueError={activationQueueError}
        queueLoading={activationQueueLoading}
        onRetry={refresh}
        onView={selectMember}
        onLog={setLoggingFollowUp}
      />

      <FollowUpQueue rows={followUps} available={followUpsAvailable} error={followUpsError} loading={followUpsLoading} onRetry={refresh} onView={selectMember} onLog={setLoggingFollowUp} />

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-xert-ink animate-pulse" />)}</div>
      ) : loadError ? (
        <AdminLoadError message={loadError} onRetry={refresh} />
      ) : total === 0 ? (
        <div className="py-16 text-center border border-xert-steel/20">
          <p className="font-display text-lg text-xert-offwhite uppercase mb-2">
            {hasFilters ? 'No matches' : 'No members yet'}
          </p>
          <p className="font-body text-sm text-xert-concrete/40">
            {hasFilters ? 'Try a different search or filter.' : 'Members appear here as soon as they create an account on the site.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {members.map(m => (
            <div key={m.id} className="bg-xert-ink border border-xert-steel/20 p-4 flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[14rem]">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-display text-base text-xert-offwhite uppercase">{m.full_name || '(no name)'}</h3>
                  {m.role === 'admin' && (
                    <span className="font-body text-xs border border-xert-orange/40 text-xert-orange px-2 py-0.5 uppercase">Admin</span>
                  )}
                </div>
                <p className="font-body text-xs text-xert-concrete/50">
                  <a href={`mailto:${m.email}`} className="hover:text-xert-steel">{m.email}</a>{m.phone ? <> · <a href={`tel:${m.phone}`} className="hover:text-xert-steel">{m.phone}</a></> : ''} · joined {new Date(m.joined_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <div className="flex items-center gap-5 font-body text-xs text-xert-concrete/60 shrink-0">
                <div className="text-center">
                  <p className="font-display text-lg text-xert-offwhite tabular-nums">{m.credits_remaining}</p>
                  <p className="uppercase tracking-wider text-[10px]">Credits</p>
                </div>
                <div className="text-center">
                  <p className="font-display text-lg text-xert-offwhite tabular-nums">{m.bookings_count}</p>
                  <p className="uppercase tracking-wider text-[10px]">Bookings</p>
                </div>
                <div className="text-center">
                  <p className="font-display text-lg text-xert-offwhite tabular-nums">{formatPackPrice(m.total_spent_cents, 'aud')}</p>
                  <p className="uppercase tracking-wider text-[10px]">Spent</p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button type="button" onClick={() => selectMember(m)}
                  className="min-h-11 px-3 py-2.5 border border-xert-steel/30 font-body text-xs text-xert-concrete/60 hover:border-xert-steel transition-colors">
                  View
                </button>
                <button type="button" onClick={() => setGranting(m)}
                  className="min-h-11 px-3 py-2.5 border border-xert-steel/30 font-body text-xs text-xert-concrete/60 hover:border-xert-steel transition-colors">
                  + Credits
                </button>
                {m.role === 'admin' ? (
                  m.id !== user?.id && (
                    <button disabled={roleChangingId !== null} onClick={() => requestRoleChange(m, 'member')}
                      className="min-h-11 px-3 py-2.5 border border-xert-red/30 font-body text-xs text-xert-red/60 hover:border-xert-red/60 transition-colors">
                      Remove admin
                    </button>
                  )
                ) : (
                  <button disabled={roleChangingId !== null} onClick={() => requestRoleChange(m, 'admin')}
                    className="min-h-11 px-3 py-2.5 border border-xert-steel/30 font-body text-xs text-xert-concrete/60 hover:border-xert-steel transition-colors">
                    Make admin
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p role="status" aria-live="polite" className="font-body text-xs text-xert-concrete/40">
          {total === 0 ? '0 results' : `${firstResult}-${lastResult} of ${total} matching members`}
        </p>
        {pageCount > 1 && (
          <nav aria-label="Member result pages" className="flex items-center gap-2">
            <button type="button" onClick={() => { selectMember(null); setPage(current => Math.max(1, current - 1)); }} disabled={page <= 1} title="Previous page" aria-label="Previous member page" className="min-h-11 min-w-11 inline-flex items-center justify-center border border-xert-steel/40 text-xert-steel disabled:opacity-30">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-body text-xs text-xert-concrete/60 tabular-nums">Page {page} of {pageCount}</span>
            <button type="button" onClick={() => { selectMember(null); setPage(current => Math.min(pageCount, current + 1)); }} disabled={page >= pageCount} title="Next page" aria-label="Next member page" className="min-h-11 min-w-11 inline-flex items-center justify-center border border-xert-steel/40 text-xert-steel disabled:opacity-30">
              <ChevronRight className="w-4 h-4" />
            </button>
          </nav>
        )}
      </div>

      {viewing && (
        <MemberDrawer
          key={viewing.id}
          member={viewing}
          onClose={() => applyMemberSelection(null)}
          onGrant={() => setGranting(viewing)}
          onNotesChanged={refresh}
          onDirtyChange={setNoticeDirty}
        />
      )}

      {granting && (
        <GrantCreditsModal member={granting} onDone={() => { setGranting(null); applyMemberSelection(null); refresh(); }} onCancel={() => setGranting(null)} />
      )}

      {loggingFollowUp && (
        <FollowUpModal member={loggingFollowUp} onDone={() => { setLoggingFollowUp(null); refresh(); }} onCancel={() => setLoggingFollowUp(null)} />
      )}
      <AdminConfirmDialog
        open={Boolean(pendingRoleChange)}
        onOpenChange={open => !open && setPendingRoleChange(null)}
        title={pendingRoleChange?.role === 'admin' ? 'Grant administrator access?' : 'Remove administrator access?'}
        description={pendingRoleChange ? `${pendingRoleChange.verb} ${pendingRoleChange.member.full_name || pendingRoleChange.member.email}?` : ''}
        warning={pendingRoleChange?.consequence}
        confirmLabel={pendingRoleChange?.role === 'admin' ? 'Make admin' : 'Remove admin'}
        onConfirm={() => void applyRoleChange()}
        busy={roleChangingId !== null}
      />
      <AdminConfirmDialog
        open={Boolean(pendingSubjectSwitch)}
        onOpenChange={open => !open && setPendingSubjectSwitch(null)}
        title="Discard private notice draft?"
        description="This member notice has not been sent."
        warning="Switching members permanently discards the title and message you entered."
        cancelLabel="Keep writing"
        confirmLabel="Discard draft"
        onConfirm={() => applyMemberSelection(pendingSubjectSwitch?.next ?? null)}
      />
    </div>
  );
}
