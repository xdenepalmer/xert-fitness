import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@/components/ui/use-toast';
import { Archive, ArchiveRestore, BellRing, CalendarDays, Loader2, MessageSquarePlus, Receipt, RefreshCw, Send, Ticket } from 'lucide-react';
import { adminAddMemberNote, adminMemberDetail, adminSendMemberNotice, adminSetMemberNoteArchived } from '@/lib/adminData';
import { formatPackPrice } from '@/lib/products';
import AdminLoadError from '@/components/admin/AdminLoadError';
import MemberConfirmation from './MemberConfirmation';
import FitboxMemberPanel from '@/components/admin/FitboxMemberPanel';
import { ADMIN_BUTTON, AdminDrawer, AdminBadge, AdminSkeleton, AdminFormField } from '@/components/admin/ui';

function fmtDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

const BOOKING_LABELS = {confirmed:'Confirmed', attended:'Attended', no_show:'No show', cancelled:'Cancelled'};
const emptyNoticeDraft = () => ({ title: '', body: '', tone: 'info', action: 'none', expiryDays: '30' });

export default function MemberDrawer({ member, onClose, onGrant, onNotesChanged, onDirtyChange, operationOpen = false, grantVersion = 0 }) {
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(true);
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
  const detailRequestIdRef = useRef(0);
  const lastGrantVersion = useRef(grantVersion);
  const mutationRef = useRef(false);
  const noticeDirty = Object.entries(emptyNoticeDraft()).some(([key, value]) => noticeDraft[key] !== value);
  const noteDirty = Boolean(noteBody || noteCategory !== 'general');
  const dirty = noticeDirty || noteDirty;
  const detailMutationsAllowed = Boolean(detail && !detailLoading && !detailError);
  const busy = noteSaving || noticeSaving || operationOpen;
  useEffect(() => { onDirtyChange?.(dirty || busy); }, [dirty, busy, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const loadDetail = useCallback(({ preserve = false } = {}) => {
    const expectedMemberId = member.id;
    const requestId = ++detailRequestIdRef.current;
    if (!preserve) setDetail(null);
    setDetailLoading(true);
    setDetailError('');
    adminMemberDetail(expectedMemberId)
      .then(nextDetail => {
        if (
          requestId !== detailRequestIdRef.current
          || nextDetail.memberId !== expectedMemberId
        ) return;
        setDetail(nextDetail);
      })
      .catch(error => {
        if (requestId !== detailRequestIdRef.current) return;
        setDetailError(error.message || 'Check member detail permissions.');
      })
      .finally(() => {
        if (requestId === detailRequestIdRef.current) setDetailLoading(false);
      });
  }, [member.id]);

  useEffect(() => {
    setNoteCategory('general');
    setNoteBody('');
    setNoteError('');
    setShowArchivedNotes(false);
    setNoteToArchive(null);
    setNoticeDraft(emptyNoticeDraft());
    setNoticeError('');
    setDiscardNoticeOpen(false);
    loadDetail();
    return () => {
      detailRequestIdRef.current += 1;
    };
  }, [loadDetail]);

  useEffect(() => {
    if (grantVersion !== lastGrantVersion.current) {
      lastGrantVersion.current = grantVersion;
      loadDetail({preserve:true});
    }
  }, [grantVersion, loadDetail]);

  const handleAddNote = async event => {
    event.preventDefault();
    if (!detailMutationsAllowed || mutationRef.current || operationOpen) return;
    mutationRef.current = true;
    setNoteSaving(true);
    setNoteError('');
    try {
      await adminAddMemberNote(member.id, noteCategory, noteBody);
      setNoteBody('');
      setNoteCategory('general');
      toast({ title: 'Staff note added' });
      onNotesChanged?.();
      loadDetail({ preserve: true });
    } catch (error) {
      setNoteError(error.message || 'Could not add the staff note.');
    } finally {
      mutationRef.current = false;
      setNoteSaving(false);
    }
  };

  const handleNoteArchive = async note => {
    if (!detailMutationsAllowed || mutationRef.current || operationOpen) return;
    mutationRef.current = true;
    const shouldArchive = !note.archived_at;
    setNoteSaving(true);
    setNoteError('');
    try {
      await adminSetMemberNoteArchived(note.id, shouldArchive);
      toast({ title: shouldArchive ? 'Staff note archived' : 'Staff note restored' });
      loadDetail({ preserve: true });
    } catch (error) {
      setNoteError(error.message || 'Could not update the staff note.');
    } finally {
      mutationRef.current = false;
      setNoteSaving(false);
    }
  };

  const requestClose = () => {
    if (busy) return;
    if (dirty) {
      setDiscardNoticeOpen(true);
      return;
    }
    onClose();
  };

  const handleSendNotice = async event => {
    event.preventDefault();
    if (!detailMutationsAllowed || mutationRef.current || operationOpen) return;
    mutationRef.current = true;
    setNoticeSaving(true);
    setNoticeError('');
    try {
      const result = await adminSendMemberNotice(member.id, noticeDraft);
      const push = result.push;
      const description = result.warning
        || (!push?.configured
          ? 'It is available in the member app. APNs push is not configured.'
          : push.delivered > 0
            ? 'It is available in the member app and the push notification was delivered.'
            : 'It is available in the member app. No active device received a push.');
      toast({ title: 'Private notice sent', description });
      setNoticeDraft(emptyNoticeDraft());
      loadDetail({ preserve: true });
    } catch (error) {
      setNoticeError(error.message || 'Could not send the private member notice.');
    } finally {
      mutationRef.current = false;
      setNoticeSaving(false);
    }
  };

  return (
    <AdminDrawer open onOpenChange={open => !open && requestClose()} title={member.full_name || '(no name)'} closeLabel="Close member detail" closeDisabled={busy}>
      <div className="members-workspace members-detail admin-kit-container">
        <div className="members-stack">
          <p>{member.email}{member.phone ? ` · ${member.phone}` : ''}</p>
          <p className="members-secondary">Member since {fmtDate(member.joined_at)}{member.role === 'admin' ? ' · Admin' : ''}</p>
            <button type="button" onClick={() => loadDetail({ preserve: true })} disabled={detailLoading || busy}
              title="Refresh member record" aria-label={`Refresh ${member.full_name || member.email || 'member'} record`}
              className="admin-kit-button">
              <RefreshCw className={`h-4 w-4 ${detailLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
              Refresh member record
            </button>
        </div>

        {detailError && !detail ? (
          <div className="p-5"><AdminLoadError message={detailError} onRetry={() => loadDetail()} /></div>
        ) : !detail ? (
          <div className="members-stack" role="status" aria-label={`Loading ${member.full_name || member.email || 'member'} record`}>
            {[0,1,2].map(index => <section key={index} aria-hidden="true" data-member-placeholder="detail" className="members-card members-stack"><AdminSkeleton decorative size="title" /><AdminSkeleton decorative /><AdminSkeleton decorative variant="control" /><AdminSkeleton decorative variant="editor" /><div className="members-form-grid"><AdminSkeleton decorative variant="control" /><AdminSkeleton decorative variant="control" /></div></section>)}
          </div>
        ) : (
          <div className="space-y-7 px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            {detailError && (
              <div className="border border-state-warning/35 bg-state-warning/10 p-3">
                <p role="alert" className="members-error">{detailError}</p>
                <p role="status" className="font-body text-sm text-state-warning">
                  Showing the last loaded record. Refresh before making changes.
                </p>
                <button type="button" onClick={() => loadDetail({ preserve: true })} disabled={detailLoading}
                  className="admin-kit-button">
                  <RefreshCw className={`h-4 w-4 ${detailLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
                  Retry member record
                </button>
              </div>
            )}
            {detailLoading && (
              <p role="status" className="flex flex-wrap items-center gap-2 font-body text-sm text-text-secondary">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-text-secondary" aria-hidden="true" />
                Refreshing this member record…
              </p>
            )}
            {/* Private member notices */}
            <section>
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div>
                  <h4 className="admin-kit-section-heading flex flex-wrap items-center gap-2 font-display text-sm uppercase text-text-secondary" >
                    <BellRing className="w-3.5 h-3.5" /> Private notices
                  </h4>
                  <p className="font-body text-sm leading-relaxed mt-1 text-text-secondary" >
                    Send an account-only message with optional iOS push delivery.
                  </p>
                </div>
              </div>

              {!detail.memberNoticesAvailable ? (
                <p className="font-body text-sm text-state-warning" >
                  Private notices are paused until targeted_member_notices_upgrade.sql is applied.
                </p>
              ) : (
                <>
                  <form onSubmit={handleSendNotice} className="space-y-2">
                    <AdminFormField label="Private notice title">
                    <input
                      id="member-notice-title"
                      value={noticeDraft.title}
                      onChange={event => setNoticeDraft(current => ({ ...current, title: event.target.value }))}
                      disabled={busy || !detailMutationsAllowed}
                      minLength={3}
                      maxLength={120}
                      required
                      placeholder="Notice title"
                      className="admin-kit-input"
                    />
                    </AdminFormField>
                    <AdminFormField label="Private notice message">
                    <textarea
                      id="member-notice-body"
                      value={noticeDraft.body}
                      onChange={event => setNoticeDraft(current => ({ ...current, body: event.target.value }))}
                      disabled={busy || !detailMutationsAllowed}
                      minLength={3}
                      maxLength={2000}
                      rows={4}
                      required
                      placeholder="What does this member need to know?"
                      className="admin-kit-input"
                    />
                    </AdminFormField>
                    <div className="members-form-grid">
                      <label className="font-body text-sm uppercase tracking-wider text-text-secondary">
                        Priority
                        <select value={noticeDraft.tone} onChange={event => setNoticeDraft(current => ({ ...current, tone: event.target.value }))} disabled={busy || !detailMutationsAllowed} className="admin-kit-input">
                          <option value="info">Information</option>
                          <option value="action">Action needed</option>
                          <option value="urgent">Urgent</option>
                        </select>
                      </label>
                      <label className="font-body text-sm uppercase tracking-wider text-text-secondary">
                        Action
                        <select value={noticeDraft.action} onChange={event => setNoticeDraft(current => ({ ...current, action: event.target.value }))} disabled={busy || !detailMutationsAllowed} className="admin-kit-input">
                          <option value="none">No action</option>
                          <option value="booking">Book a class</option>
                          <option value="account">View account</option>
                          <option value="events">View events</option>
                        </select>
                      </label>
                      <label className="font-body text-sm uppercase tracking-wider text-text-secondary">
                        Expires
                        <select value={noticeDraft.expiryDays} onChange={event => setNoticeDraft(current => ({ ...current, expiryDays: event.target.value }))} disabled={busy || !detailMutationsAllowed} className="admin-kit-input">
                          <option value="7">7 days</option>
                          <option value="30">30 days</option>
                          <option value="90">90 days</option>
                        </select>
                      </label>
                    </div>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <p className="font-body text-sm leading-relaxed text-text-secondary" >
                        The member sees this privately in XERT. Sending and receipt activity remain in this record.
                      </p>
                      <button type="submit" disabled={!detailMutationsAllowed || noticeSaving || busy || noticeDraft.title.trim().length < 3 || noticeDraft.body.trim().length < 3}
                        className={`admin-kit-button ${ADMIN_BUTTON.primary}`}>
                        {noticeSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        {noticeSaving ? 'Sending' : 'Send privately'}
                      </button>
                    </div>
                  </form>
                  {noticeError && <p role="alert" className="font-body text-sm text-state-danger mt-2">{noticeError}</p>}

                  <div className="mt-4 space-y-2">
                    {detail.notices.length === 0 ? (
                      <p className="font-body text-sm text-text-secondary" >No private notices yet.</p>
                    ) : detail.notices.map(notice => (
                      <article key={notice.id} className="members-card">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-display text-sm uppercase text-text-primary break-words">{notice.title}</p>
                            <p className="font-body text-sm whitespace-pre-wrap break-words mt-1 text-text-secondary">{notice.body}</p>
                          </div>
                          <AdminBadge status={notice.tone}>{notice.source_kind === 'class_cancellation' ? 'Automatic' : notice.tone}</AdminBadge>
                        </div>
                        <p className="font-body text-sm mt-2 text-text-secondary">
                          {fmtDateTime(notice.published_at)} · {notice.dismissed_at ? 'Dismissed' : notice.read_at ? 'Read in app' : 'Awaiting app open'}
                          {Number(notice.push_delivered) > 0 ? ' · Push delivered' : Number(notice.push_attempted) > 0 ? ' · Push failed' : ' · No push device'}
                        </p>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </section>

            <FitboxMemberPanel member={member} disabled={busy} />

            {/* Staff notes */}
            <section>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <h4 className="admin-kit-section-heading flex flex-wrap items-center gap-2 font-display text-sm uppercase text-text-secondary" >
                  <MessageSquarePlus className="w-3.5 h-3.5" /> Staff notes
                </h4>
                {detail.notes.some(note => note.archived_at) && (
                  <label className="inline-flex min-h-11 items-center gap-2 font-body text-sm uppercase tracking-wider text-text-secondary" >
                    <input type="checkbox" checked={showArchivedNotes} onChange={event => setShowArchivedNotes(event.target.checked)} className="accent-xert-steel" />
                    Show archived
                  </label>
                )}
              </div>

              {!detail.memberNotesAvailable ? (
                <p className="font-body text-sm text-state-warning" >
                  Staff notes are paused until admin_member_notes_upgrade.sql is applied.
                </p>
              ) : (
                <>
                  <form onSubmit={handleAddNote} className="space-y-2">
                    <AdminFormField label="Staff note category">
                    <select id="member-note-category" value={noteCategory} onChange={event => setNoteCategory(event.target.value)} disabled={busy || !detailMutationsAllowed}
                      className="admin-kit-input">
                      <option value="general">General</option>
                      <option value="coaching">Coaching</option>
                      <option value="follow_up">Follow-up</option>
                      <option value="billing">Billing</option>
                    </select>
                    </AdminFormField>
                    <AdminFormField label="Staff note">
                    <textarea id="member-note-body" value={noteBody} onChange={event => setNoteBody(event.target.value)} disabled={busy || !detailMutationsAllowed}
                      minLength={3} maxLength={1000} rows={3} required placeholder="Add operational context for staff"
                      className="admin-kit-input" />
                    </AdminFormField>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <p className="font-body text-sm leading-relaxed text-text-secondary" >
                        Use factual operational or coaching context. Avoid unnecessary clinical or sensitive personal information.
                      </p>
                      <button type="submit" disabled={!detailMutationsAllowed || noteSaving || busy || noteBody.trim().length < 3}
                        className={`admin-kit-button ${ADMIN_BUTTON.primary}`}>
                        {noteSaving ? 'Saving...' : 'Add note'}
                      </button>
                    </div>
                  </form>
                  {noteError && <p role="alert" className="font-body text-sm text-state-danger mt-2">{noteError}</p>}

                  <div className="mt-4 space-y-2">
                    {detail.notes.filter(note => showArchivedNotes || !note.archived_at).length === 0 ? (
                      <p className="font-body text-sm text-text-secondary" >No staff notes yet.</p>
                    ) : detail.notes.filter(note => showArchivedNotes || !note.archived_at).map(note => (
                      <article key={note.id} className="members-card">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-body text-sm uppercase tracking-wider text-text-secondary" >{String(note.category || 'general').replace('_', '-')}</p>
                            <p className="font-body text-sm whitespace-pre-wrap break-words mt-1 text-text-secondary" >{note.body}</p>
                          </div>
                          <button type="button" disabled={busy || !detailMutationsAllowed} onClick={() => note.archived_at ? void handleNoteArchive(note) : setNoteToArchive(note)}
                            title={note.archived_at ? 'Restore staff note' : 'Archive staff note'} aria-label={note.archived_at ? 'Restore staff note' : 'Archive staff note'}
                            className="admin-kit-button">
                            {note.archived_at ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                          </button>
                        </div>
                        <p className="font-body text-sm mt-2 text-text-secondary" >
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
              <div className="flex flex-wrap items-center justify-between mb-3">
                <h4 className="admin-kit-section-heading flex flex-wrap items-center gap-2 font-display text-sm uppercase text-text-secondary" >
                  <Ticket className="w-3.5 h-3.5" /> Credits
                </h4>
                <button type="button" disabled={!detail.creditAuditAvailable || !detailMutationsAllowed || busy} onClick={onGrant}
                  className="admin-kit-button">
                  + Grant
                </button>
              </div>
              {detail.credits.length === 0 ? (
                <p className="font-body text-sm text-text-secondary" >No credit packs yet.</p>
              ) : (
                <div className="space-y-2">
                  {detail.credits.map(c => {
                    const expired = c.expires_at && new Date(c.expires_at) <= new Date();
                    const active = c.remaining > 0 && !expired;
                    const grant = detail.grants.find(item => item.credit_batch_id === c.id);
                    return (
                      <div key={c.id} className="members-card members-actions">
                        <p className={`font-display text-xl tabular-nums ${active ? 'text-text-secondary' : 'text-text-secondary'}`}>
                          {c.remaining}<span className="text-sm text-text-secondary" >/{c.total}</span>
                        </p>
                        <div className="flex-1">
                          <p className="font-body text-sm text-text-secondary" >
                            {expired ? 'Expired' : c.expires_at ? `Expires ${fmtDate(c.expires_at)}` : 'No expiry'}
                          </p>
                          <p className="font-body text-sm text-text-secondary" >
                            Added {fmtDate(c.created_at)}{c.order_id ? '' : ' · manual grant'}
                          </p>
                          {grant && <p className="font-body text-sm mt-1 text-text-secondary" >Reason: {grant.note}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {!detail.creditAuditAvailable && (
                <p className="font-body text-sm mt-3 text-state-warning" >Credit audit migration is not installed; new manual grants are paused.</p>
              )}
            </section>

            {/* Bookings */}
            <section>
              <h4 className="admin-kit-section-heading flex flex-wrap items-center gap-2 font-display text-sm uppercase mb-3 text-text-secondary" >
                <CalendarDays className="w-3.5 h-3.5" /> Bookings
              </h4>
              {detail.bookings.length === 0 ? (
                <p className="font-body text-sm text-text-secondary" >No class bookings yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {detail.bookings.map(b => {
                    const bookingLabel = BOOKING_LABELS[b.status] || b.status || 'Unknown';
                    return (
                      <div key={b.id} className="members-card members-actions"
>
                        <div className="flex-1 min-w-0">
                          <p className="font-body text-sm break-words text-text-secondary" >
                            {b.class_sessions?.title || b.class_sessions?.class_type || 'Class'}
                          </p>
                          <p className="font-body text-sm text-text-secondary" >
                            {fmtDateTime(b.class_sessions?.start_time)}
                          </p>
                        </div>
                        <AdminBadge status={b.status}>{bookingLabel}</AdminBadge>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Purchases */}
            <section>
              <h4 className="admin-kit-section-heading flex flex-wrap items-center gap-2 font-display text-sm uppercase mb-3 text-text-secondary" >
                <Receipt className="w-3.5 h-3.5" /> Purchases
              </h4>
              {detail.orders.length === 0 ? (
                <p className="font-body text-sm text-text-secondary" >No purchases yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {detail.orders.map(o => (
                    <div key={o.id} className="members-card members-actions"
>
                      <p className="font-body text-sm flex-1 break-words text-text-secondary" >{o.products?.name || 'Session pack'}</p>
                      <p className="font-body text-sm shrink-0 text-text-secondary" >{fmtDate(o.paid_at || o.created_at)}</p>
                      <p className="font-display text-sm tabular-nums shrink-0 text-text-secondary" >
                        {formatPackPrice(o.amount_cents, o.currency)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
        <MemberConfirmation
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
        <MemberConfirmation
          open={discardNoticeOpen}
          onOpenChange={setDiscardNoticeOpen}
          title={noteDirty ? 'Discard member drafts?' : 'Discard private notice draft?'}
          description="Your changed member fields have not been saved."
          warning="Unsaved staff notes and private notice changes will be discarded."
          cancelLabel="Keep writing"
          confirmLabel="Discard draft"
          onConfirm={() => {
            setDiscardNoticeOpen(false);
            setNoticeDraft(emptyNoticeDraft());
            setNoteBody('');
            setNoteCategory('general');
            onClose();
          }}
          busy={noticeSaving}
        />
      </div>
    </AdminDrawer>
  );
}
